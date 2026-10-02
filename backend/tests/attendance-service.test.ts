import { count, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  attendanceRecords,
  deviceEventReceipts,
  devices,
  fingerprintEnrollments,
  outboxJobs,
  students
} from "../src/db/schema.js";
import { AttendanceRepository } from "../src/repositories/attendance-repository.js";
import { AttendanceService } from "../src/services/attendance-service.js";
import { createTestDatabase } from "./helpers/database.js";

describe("attendance transaction", () => {
  async function fixture() {
    const database = await createTestDatabase();
    const [student] = await database.db.insert(students).values({
      studentId: "ATT001",
      name: "Attendance Test Student",
      mobileNumber: "+919000000101"
    }).returning();
    const [device] = await database.db.insert(devices).values({
      deviceIdentifier: "ATT-DEVICE",
      name: "Attendance Device"
    }).returning();
    await database.db.insert(fingerprintEnrollments).values([
      { studentId: student!.id, fingerprintId: 31, slotNumber: 1 },
      { studentId: student!.id, fingerprintId: 32, slotNumber: 2 }
    ]);
    return { ...database, student: student!, device: device! };
  }

  it("accepts two scans for either enrolled finger, rejects the third, and replays idempotently", async () => {
    const database = await fixture();
    try {
      const service = new AttendanceService(new AttendanceRepository(database.db));
      const base = { deviceId: database.device.id, attendanceDate: "2026-09-20" };
      const first = await service.record({
        ...base, eventId: "event-1", fingerprintId: 31, occurredAt: new Date("2026-09-20T03:30:00Z")
      });
      const second = await service.record({
        ...base, eventId: "event-2", fingerprintId: 32, occurredAt: new Date("2026-09-20T08:30:00Z")
      });
      const replay = await service.record({
        ...base, eventId: "event-1", fingerprintId: 31, occurredAt: new Date("2026-09-20T03:30:00Z")
      });
      const third = await service.record({
        ...base, eventId: "event-3", fingerprintId: 31, occurredAt: new Date("2026-09-20T09:30:00Z")
      });
      const thirdReplay = await service.record({
        ...base, eventId: "event-3", fingerprintId: 31, occurredAt: new Date("2026-09-20T09:30:00Z")
      });

      expect(first.code).toBe("recorded_first_scan");
      expect(second.code).toBe("recorded_second_scan");
      expect(replay).toMatchObject({ code: "attendance_event_replayed", duplicate: true });
      expect(third).toMatchObject({ code: "daily_limit_reached", duplicate: false });
      expect(thirdReplay).toMatchObject({ code: "daily_limit_reached", duplicate: true });

      const [attendanceCount] = await database.db.select({ value: count() }).from(attendanceRecords);
      const [receiptCount] = await database.db.select({ value: count() }).from(deviceEventReceipts);
      const [outboxCount] = await database.db.select({ value: count() }).from(outboxJobs);
      const storedAttendance = await database.db.select().from(attendanceRecords);
      expect(attendanceCount!.value).toBe(2);
      expect(receiptCount!.value).toBe(3);
      expect(outboxCount!.value).toBe(2);
      expect(storedAttendance.every((row) => row.studentId === database.student.id)).toBe(true);
    } finally {
      await database.close();
    }
  });

  it("rolls back attendance and receipt when outbox creation fails", async () => {
    const database = await fixture();
    try {
      const service = new AttendanceService(
        new AttendanceRepository(database.db),
        () => { throw new Error("simulated outbox payload failure"); }
      );
      await expect(service.record({
        deviceId: database.device.id,
        eventId: "rollback-event",
        fingerprintId: 31,
        occurredAt: new Date("2026-09-20T03:30:00Z"),
        attendanceDate: "2026-09-20"
      })).rejects.toThrow("simulated outbox payload failure");

      const attendance = await database.db.select().from(attendanceRecords)
        .where(eq(attendanceRecords.eventId, "rollback-event"));
      const receipts = await database.db.select().from(deviceEventReceipts)
        .where(eq(deviceEventReceipts.eventId, "rollback-event"));
      expect(attendance).toHaveLength(0);
      expect(receipts).toHaveLength(0);
    } finally {
      await database.close();
    }
  });
});
