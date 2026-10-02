"use strict";

const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

class Range {
  constructor(sheet, row, column, rowCount = 1, columnCount = 1) {
    this.sheet = sheet;
    this.row = row;
    this.column = column;
    this.rowCount = rowCount;
    this.columnCount = columnCount;
  }

  setValues(values) {
    for (let r = 0; r < this.rowCount; r++) {
      for (let c = 0; c < this.columnCount; c++) {
        this.sheet.setCell(this.row + r, this.column + c, values[r][c]);
      }
    }
    return this;
  }

  setValue(value) {
    this.sheet.setCell(this.row, this.column, value);
    return this;
  }

  setNote(value) {
    this.sheet.setNote(this.row, this.column, value);
    return this;
  }

  getNote() {
    return this.sheet.getNote(this.row, this.column);
  }

  getDisplayValues() {
    const values = [];
    for (let r = 0; r < this.rowCount; r++) {
      const row = [];
      for (let c = 0; c < this.columnCount; c++) {
        row.push(String(this.sheet.getCell(this.row + r, this.column + c) || ""));
      }
      values.push(row);
    }
    return values;
  }

  getValues() {
    return this.getDisplayValues();
  }

  getDisplayValue() {
    return String(this.sheet.getCell(this.row, this.column) || "");
  }

  setFontWeight() {
    return this;
  }

  setNumberFormat(format) {
    this.sheet.setNumberFormat(this.row, this.column, format);
    return this;
  }

  sort(spec) {
    const start = this.row - 1;
    const selected = this.sheet.rows.splice(start, this.rowCount);
    selected.sort((left, right) =>
      String(left[spec.column - 1] || "")
        .localeCompare(String(right[spec.column - 1] || ""))
    );
    this.sheet.rows.splice(start, 0, ...selected);
    return this;
  }
}

class Sheet {
  constructor(name) {
    this.name = name;
    this.rows = [];
    this.numberFormats = new Map();
    this.notes = new Map();
  }

  getLastRow() {
    for (let i = this.rows.length - 1; i >= 0; i--) {
      if (this.rows[i].some(value => value !== "" && value !== undefined)) {
        return i + 1;
      }
    }
    return 0;
  }

  getLastColumn() {
    return this.rows.reduce((max, row) => Math.max(max, row.length), 0);
  }

  getRange(row, column, rowCount = 1, columnCount = 1) {
    return new Range(this, row, column, rowCount, columnCount);
  }

  setFrozenRows() {}

  appendRow(values) {
    this.rows.push(values.slice());
  }

  insertColumnBefore(column) {
    for (const row of this.rows) {
      row.splice(column - 1, 0, "");
    }

    const shiftedFormats = new Map();
    for (const [key, value] of this.numberFormats.entries()) {
      const [row, existingColumn] = key.split(":").map(Number);
      const shiftedColumn = existingColumn >= column
        ? existingColumn + 1
        : existingColumn;
      shiftedFormats.set(`${row}:${shiftedColumn}`, value);
    }
    this.numberFormats = shiftedFormats;

    const shiftedNotes = new Map();
    for (const [key, value] of this.notes.entries()) {
      const [row, existingColumn] = key.split(":").map(Number);
      const shiftedColumn = existingColumn >= column
        ? existingColumn + 1
        : existingColumn;
      shiftedNotes.set(`${row}:${shiftedColumn}`, value);
    }
    this.notes = shiftedNotes;
  }

  setCell(row, column, value) {
    while (this.rows.length < row) {
      this.rows.push([]);
    }
    while (this.rows[row - 1].length < column) {
      this.rows[row - 1].push("");
    }
    this.rows[row - 1][column - 1] = value;
  }

  getCell(row, column) {
    return (this.rows[row - 1] || [])[column - 1] || "";
  }

  setNumberFormat(row, column, format) {
    this.numberFormats.set(`${row}:${column}`, format);
  }

  getNumberFormat(row, column) {
    return this.numberFormats.get(`${row}:${column}`) || "";
  }

  setNote(row, column, value) {
    this.notes.set(`${row}:${column}`, value);
  }

  getNote(row, column) {
    return this.notes.get(`${row}:${column}`) || "";
  }
}

class Spreadsheet {
  constructor() {
    this.sheets = new Map();
  }

  getSheetByName(name) {
    return this.sheets.get(name) || null;
  }

  insertSheet(name) {
    const sheet = new Sheet(name);
    this.sheets.set(name, sheet);
    return sheet;
  }
}

const spreadsheet = new Spreadsheet();
let lockAvailable = true;
let lockCalls = 0;
let lastFormatTimezone = null;
const triggers = [];

const context = {
  console: { log() {}, error() {} },
  Date,
  Math,
  Number,
  String,
  JSON,
  RegExp,
  Error,
  PropertiesService: {
    getScriptProperties() {
      return {
        getProperty(name) {
          return name === "SPREADSHEET_ID" ? "test-sheet" : "test-shared-key";
        }
      };
    }
  },
  SpreadsheetApp: {
    openById(id) {
      assert.strictEqual(id, "test-sheet");
      return spreadsheet;
    }
  },
  LockService: {
    getScriptLock() {
      return {
        tryLock() {
          lockCalls++;
          return lockAvailable;
        },
        releaseLock() {}
      };
    }
  },
  Utilities: {
    getUuid() {
      return "generated-request-id";
    },
    formatDate(_date, timezone, format) {
      lastFormatTimezone = timezone;
      return format === "dd/MM/yyyy" ? "19/09/2026" : "09:15";
    }
  },
  ContentService: {
    MimeType: { JSON: "application/json" },
    createTextOutput(content) {
      return {
        content,
        setMimeType() { return this; }
      };
    }
  },
  ScriptApp: {
    getProjectTriggers() { return triggers; },
    deleteTrigger() {},
    newTrigger(handler) {
      const builder = {
        handler,
        timeBased() { return this; },
        everyDays() { return this; },
        atHour(hour) { this.hour = hour; return this; },
        nearMinute(minute) { this.minute = minute; return this; },
        create() { triggers.push(this); return this; }
      };
      return builder;
    }
  }
};

vm.createContext(context);
vm.runInContext(
  fs.readFileSync("integrations/google-apps-script/Code.gs", "utf8"),
  context
);

const legacyStudents = spreadsheet.insertSheet("Students");
legacyStudents.appendRow([
  "Fingerprint ID",
  "Student ID",
  "Student Name",
  "Mobile Number"
]);
legacyStudents.appendRow(["50", "MIGRATED-50", "Migrated Student", "+919699490603"]);

const legacyAttendance = spreadsheet.insertSheet("Attendance");
legacyAttendance.appendRow([
  "Fingerprint ID",
  "Student ID",
  "Student Name",
  "Mobile Number",
  "Status",
  "19/09/2026"
]);
legacyAttendance.appendRow([
  "50",
  "MIGRATED-50",
  "Old Name",
  "+919699490603",
  "Present",
  "08:30:00"
]);

function request(parameter) {
  const output = context.handleRequest({ parameter });
  return JSON.parse(output.content);
}

function register(index, overrides = {}) {
  return request({
    key: "test-shared-key",
    action: "register",
    eventId: `registration-${index}`,
    fingerprintId: String(index),
    studentId: `STUDENT-${index}`,
    studentName: `Student ${index}`,
    parentWhatsApp: `+9190000000${String(index).padStart(2, "0")}`,
    ...overrides
  });
}

assert.strictEqual(request({
  key: "wrong",
  action: "health"
}).code, "authentication_failed");

assert.strictEqual(request({
  key: "test-shared-key",
  action: "health"
}).code, "healthy");

for (let i = 1; i <= 4; i++) {
  const result = register(i, i === 4 ? { fingerprintId2: "40" } : {});
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.code, "registered");
}

const attendance = spreadsheet.getSheetByName("Attendance");
const migratedRow = context.findStudentRow(attendance, "MIGRATED-50");
assert.strictEqual(legacyStudents.getLastRow(), 2, "Registration must not write Students");
assert.strictEqual(attendance.getLastRow(), 6, "Registration must create combined rows");
assert.deepStrictEqual(attendance.rows[0].slice(0, 8), [
  "S.No.",
  "Fingerprint ID 1",
  "Fingerprint ID 2",
  "Student ID",
  "Student Name",
  "Mobile Number",
  "Status",
  "19/09/2026"
]);
assert.strictEqual(attendance.getCell(migratedRow, 1), 1);
assert.strictEqual(attendance.getCell(migratedRow, 3), "");
assert.strictEqual(attendance.getCell(migratedRow, 5), "Migrated Student");
assert.strictEqual(attendance.getCell(migratedRow, 6), "9699490603");
assert.strictEqual(attendance.getCell(migratedRow, 8), "08:30:00");
const student1Row = context.findStudentRow(attendance, "STUDENT-1");
assert.strictEqual(attendance.getCell(student1Row, 1), 2);
assert.strictEqual(attendance.getCell(student1Row, 3), "");
assert.strictEqual(attendance.getCell(student1Row, 6), "9000000001");
assert.strictEqual(attendance.getNumberFormat(student1Row, 6), "@");
const student4Row = context.findStudentRow(attendance, "STUDENT-4");
assert.strictEqual(attendance.getCell(student4Row, 3), "40");
assert.strictEqual(context.findStudentRowByFingerprint(attendance, "4"), student4Row);
assert.strictEqual(context.findStudentRowByFingerprint(attendance, "40"), student4Row);
assert.strictEqual(context.normalizeE164("9000000001"), "+919000000001");
assert.strictEqual(context.phoneForSheet("+919699490603"), "9699490603");
assert.strictEqual(context.phoneForSheet("+919921901440"), "9921901440");
assert.strictEqual(context.phoneForSheet("919921901440"), "9921901440");
assert.deepStrictEqual(
  attendance.rows.slice(1).map(row => row[0]),
  [1, 2, 3, 4, 5],
  "Migrated and registered rows must receive sequential S.No. values"
);

assert.strictEqual(register(1).code, "already_registered");
assert.strictEqual(register(9, {
  studentId: "STUDENT-1"
}).code, "duplicate_student_id");
assert.strictEqual(register(1, {
  studentId: "DIFFERENT-STUDENT"
}).code, "duplicate_fingerprint_id");
assert.strictEqual(register(7, {
  fingerprintId2: "40"
}).code, "duplicate_fingerprint_id");
assert.strictEqual(register(8, {
  fingerprintId2: "8"
}).code, "invalid_second_fingerprint_id");

assert.strictEqual(register(10, {
  studentId: "",
  parentWhatsApp: "invalid"
}).code, "invalid_student_id");

const attendanceRequest = {
  key: "test-shared-key",
  action: "attendance",
  eventId: "attendance-1",
  fingerprintId: "1",
  studentId: "STUDENT-1",
  studentName: "Untrusted Name",
  parentWhatsApp: "+910000000000",
  attendanceDate: "19-09-2026",
  attendanceTime: "09:15:30"
};

const settings = spreadsheet.getSheetByName("Settings");
settings.getRange(3, 2).setValue("Asia/Kolkata");

const firstAttendance = request(attendanceRequest);
assert.strictEqual(firstAttendance.code, "recorded_first_scan");
assert.deepStrictEqual(firstAttendance.data.attendanceTimes, ["09:15"]);

const serialBeforeDuplicate = attendance.getCell(student1Row, 1);
const rowCountBeforeDuplicate = attendance.getLastRow();
const firstTimestamp = attendance.getCell(student1Row, 8);
const duplicateAttendance = request({
  ...attendanceRequest,
  eventId: "attendance-1"
});
assert.strictEqual(duplicateAttendance.code, "attendance_event_replayed");
assert.strictEqual(attendance.getCell(student1Row, 8), firstTimestamp);
assert.strictEqual(attendance.getCell(student1Row, 1), serialBeforeDuplicate);
assert.strictEqual(attendance.getLastRow(), rowCountBeforeDuplicate);
assert.strictEqual(attendance.getCell(student1Row, 6), "9000000001");
assert.strictEqual(attendance.getNumberFormat(student1Row, 6), "@");

const secondAttendance = request({
  ...attendanceRequest,
  eventId: "attendance-1-second",
  attendanceTime: "14:03:00"
});
assert.strictEqual(secondAttendance.code, "recorded_second_scan");
assert.strictEqual(attendance.getCell(student1Row, 8), "09:15, 14:03");

const secondsDateColumn = context.getOrCreateDateColumn(attendance, "22/09/2026");
const secondsCell = attendance.getRange(student1Row, secondsDateColumn);
secondsCell.setValue("13:02:00").setNote("existing-seconds-event");
const sameMinuteAttendance = request({
  ...attendanceRequest,
  eventId: "same-minute-second-event",
  attendanceDate: "22-09-2026",
  attendanceTime: "13:02:59"
});
assert.strictEqual(sameMinuteAttendance.code, "recorded_second_scan");
assert.strictEqual(secondsCell.getDisplayValue(), "13:02, 13:02");
assert.strictEqual(
  secondsCell.getNote(),
  "existing-seconds-event\nsame-minute-second-event"
);

const replayedSecondAttendance = request({
  ...attendanceRequest,
  eventId: "attendance-1-second",
  attendanceTime: "14:03:00"
});
assert.strictEqual(replayedSecondAttendance.code, "attendance_event_replayed");
assert.strictEqual(attendance.getCell(student1Row, 8), "09:15, 14:03");

const thirdAttendance = request({
  ...attendanceRequest,
  eventId: "attendance-1-third",
  attendanceTime: "16:00:00"
});
assert.strictEqual(thirdAttendance.code, "daily_limit_reached");
assert.strictEqual(attendance.getCell(student1Row, 8), "09:15, 14:03");
assert.strictEqual(attendance.getLastRow(), rowCountBeforeDuplicate);

assert.strictEqual(request({
  ...attendanceRequest,
  eventId: "attendance-1-new-date",
  attendanceDate: "20-09-2026",
  attendanceTime: "08:55:00"
}).code, "recorded_first_scan");
assert.strictEqual(
  attendance.rows[0].filter(value => value === "20/09/2026").length,
  1
);

const student4RowCount = attendance.getLastRow();
assert.strictEqual(request({
  key: "test-shared-key",
  action: "attendance",
  eventId: "student-4-first",
  fingerprintId: "4",
  studentId: "STUDENT-4",
  attendanceDate: "21-09-2026",
  attendanceTime: "14:03:00"
}).code, "recorded_first_scan");
assert.strictEqual(request({
  key: "test-shared-key",
  action: "attendance",
  eventId: "student-4-second",
  fingerprintId: "40",
  studentId: "STUDENT-4",
  attendanceDate: "21-09-2026",
  attendanceTime: "09:05:00"
}).code, "recorded_second_scan");
const student4DateColumn = attendance.rows[0].indexOf("21/09/2026") + 1;
assert.strictEqual(
  attendance.getCell(student4Row, student4DateColumn),
  "09:05, 14:03"
);
assert.strictEqual(attendance.getLastRow(), student4RowCount);
assert.strictEqual(attendance.getCell(student4Row, 1), 5);

assert.strictEqual(request({
  ...attendanceRequest,
  fingerprintId: "99",
  studentId: "UNKNOWN"
}).code, "unknown_student");

const legacyAttendanceResult = request({
  key: "test-shared-key",
  fingerprintId: "20",
  studentId: "LEGACY-20",
  studentName: "Legacy Student"
});
assert.strictEqual(legacyAttendanceResult.code, "recorded_first_scan");
assert.notStrictEqual(
  context.findStudentRow(attendance, "LEGACY-20"),
  -1,
  "Legacy requests must remain compatible during deployment order transition"
);

const legacySync = request({
  key: "test-shared-key",
  action: "register",
  eventId: "legacy-registration-20",
  fingerprintId: "20",
  studentId: "LEGACY-20",
  studentName: "Legacy Student Updated",
  parentWhatsApp: "+919111111111"
});
assert.strictEqual(legacySync.code, "already_registered");
const legacyAttendanceRow = context.findStudentRow(attendance, "LEGACY-20");
assert.strictEqual(attendance.getCell(legacyAttendanceRow, 6), "9111111111");
assert.strictEqual(attendance.getNumberFormat(legacyAttendanceRow, 6), "@");

assert.strictEqual(request({
  key: "test-shared-key",
  action: "attendance",
  fingerprintId: "",
  studentId: ""
}).code, "invalid_request");

lockAvailable = false;
assert.strictEqual(register(5).code, "busy_retry");
lockAvailable = true;

spreadsheet.sheets.delete("Students");
const settingsBefore = JSON.stringify(settings.rows);
assert.strictEqual(register(6).code, "registered");
const student6Row = context.findStudentRow(attendance, "STUDENT-6");
assert.strictEqual(attendance.getCell(student6Row, 1), 7);
assert.strictEqual(request({
  key: "test-shared-key",
  action: "attendance",
  eventId: "attendance-6",
  fingerprintId: "6",
  studentId: "STUDENT-6"
}).code, "recorded_first_scan");
assert.strictEqual(spreadsheet.getSheetByName("Students"), null);

context.markAbsenteesForToday();
const statusByStudent = new Map(
  attendance.rows.slice(1).map(row => [row[3], row[6]])
);
assert.strictEqual(statusByStudent.get("STUDENT-1"), "Present");
assert.strictEqual(statusByStudent.get("STUDENT-2"), "Absent");
assert.ok(lockCalls > 0, "Mutating operations must acquire the script lock");
assert.strictEqual(JSON.stringify(settings.rows), settingsBefore);

const conflictAttendance = new Sheet("Attendance");
conflictAttendance.appendRow([
  "S.No.", "Fingerprint ID 1", "Fingerprint ID 2", "Student ID",
  "Student Name", "Mobile Number", "Status"
]);
conflictAttendance.appendRow([1, "60", "", "CONFLICT", "Existing", "9000000000", ""]);
const conflictStudents = new Sheet("Students");
conflictStudents.appendRow(["Fingerprint ID", "Student ID", "Student Name", "Mobile Number"]);
conflictStudents.appendRow(["61", "CONFLICT", "Incoming", "9000000000"]);
assert.throws(
  () => context.migrateStudentsIntoAttendance(conflictAttendance, conflictStudents),
  /fingerprint mappings conflict/
);

context.setupDailyAbsenceTrigger();
assert.strictEqual(triggers.length, 1);
assert.strictEqual(triggers[0].hour, 12);
assert.strictEqual(triggers[0].minute, 0);

console.log("Apps Script contract tests passed.");
