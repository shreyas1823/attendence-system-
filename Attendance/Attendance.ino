// ============================================================
// AI ATTENDANCE SYSTEM
// ============================================================
//
// HARDWARE - DO NOT CHANGE
//
// Fingerprint : D5 (RX), D6 (TX)
// LCD I2C     : D2 (SDA), D1 (SCL), address 0x27
// Buzzer      : D0
//
// Serial commands:
// R = Register new student
// A = Attendance mode
// C = Clear ALL students + fingerprint templates
// H = Help
//
// Current online services:
// ESP8266 -> WiFi -> Google Apps Script -> Google Sheets
//
// WhatsApp:
// WhatsApp messaging is not active in this firmware yet.
// Official college Meta WhatsApp integration will be added later.
//
// ============================================================

#include <ESP8266WiFi.h>
#include <WiFiClientSecure.h>
#include <ESP8266HTTPClient.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <SoftwareSerial.h>
#include <Adafruit_Fingerprint.h>
#include <LittleFS.h>

#include "config.h"

#if __has_include("secrets.h")
#include "secrets.h"
#else
#include "secrets.example.h"
#warning "Using placeholder credentials. Copy secrets.example.h to secrets.h before uploading to hardware."
#endif

#if __has_include("device_secrets.h")
#include "device_secrets.h"
#else
#include "device_secrets.example.h"
#warning "Using placeholder Device API configuration. Copy device_secrets.example.h to device_secrets.h before hardware staging."
#endif

// ============================================================
// CONFIGURATION
// ============================================================
//
// Secrets are loaded from Attendance/secrets.h.
// Copy secrets.example.h to secrets.h and configure it locally.
// secrets.h is intentionally excluded from Git.
// ============================================================
// ============================================================
// META WHATSAPP - FUTURE PLACEHOLDERS ONLY
// ============================================================
//
// Keep these as comments for the future Meta integration.
// DO NOT put the real Meta access token in the ESP8266 firmware.
//
// Future values:
// PHONE NUMBER ID
// ACCESS TOKEN
// MESSAGE TEMPLATE NAME
// TEMPLATE LANGUAGE
//
// Example placeholders:
//
// const char* META_PHONE_NUMBER_ID = "YOUR_META_PHONE_NUMBER_ID";
// const char* META_ACCESS_TOKEN    = "YOUR_META_ACCESS_TOKEN";
// const char* META_TEMPLATE_NAME   = "YOUR_META_TEMPLATE_NAME";
// const char* META_LANGUAGE        = "en_US";
//
// Planned architecture:
//
// ESP8266 -> attendance system backend
//         -> Meta WhatsApp Cloud API
//         -> college WhatsApp Business
//         -> parent
//
// ============================================================

// ============================================================
// HARDWARE
// ============================================================

#define BUZZER_PIN D0

SoftwareSerial mySerial(D5, D6);
Adafruit_Fingerprint finger(&mySerial);

LiquidCrystal_I2C lcd(0x27, 16, 2);

// ============================================================
// DATABASE
// ============================================================

#define MAX_STUDENTS 30
#define DB_FILE "/students.txt"
#define DB_TEMP_FILE "/students.tmp"
#define DB_BACKUP_FILE "/students.bak"
#define OUTBOX_FILE "/attendance_outbox_v1.txt"
#define OUTBOX_TEMP_FILE "/attendance_outbox_v1.tmp"
#define OUTBOX_BACKUP_FILE "/attendance_outbox_v1.bak"
#define OUTBOX_DEAD_FILE "/attendance_outbox_dead_v1.txt"

struct Student {
  uint8_t fingerprintID;
  uint8_t fingerprintID2;
  char studentId[20];
  char studentName[40];
  char parentWhatsApp[32];
};

Student students[MAX_STUDENTS];

uint8_t studentCount = 0;

enum GoogleResult {
  GOOGLE_RECORDED,
  GOOGLE_ALREADY_PRESENT,
  GOOGLE_REGISTERED,
  GOOGLE_ALREADY_REGISTERED,
  GOOGLE_RETRYABLE_ERROR,
  GOOGLE_PERMANENT_ERROR,
  GOOGLE_AUTH_ERROR,
  GOOGLE_UNKNOWN_STUDENT
};

struct OutboxEvent {
  char operation;
  char eventId[48];
  uint8_t fingerprintID;
  uint8_t fingerprintID2;
  char studentId[20];
  char studentName[40];
  char parentWhatsApp[20];
  char attendanceDate[16];
  char attendanceTime[16];
  uint8_t attempts;
};

// ============================================================
// SYSTEM STATE
// ============================================================

bool wifiConnected = false;
bool timeSynced = false;
bool storageAvailable = false;
bool sensorAvailable = false;
bool waitingForFingerRemoval = false;
bool wifiReconnectInProgress = false;

unsigned long lastScanTime = 0;
unsigned long lastWiFiReconnectAttempt = 0;
unsigned long lastNtpRetry = 0;
unsigned long lastOutboxAttempt = 0;

const unsigned long SCAN_COOLDOWN_MS = 3000;

// ============================================================
// LCD
// ============================================================

void lcdMsg(const char* line1, const char* line2 = "") {

  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print(line1);

  lcd.setCursor(0, 1);
  lcd.print(line2);
}

void lcdIDMsg(const char* text, int id) {

  char line[17];

  snprintf(
    line,
    sizeof(line),
    "ID: %d",
    id
  );

  lcdMsg(text, line);
}

// ============================================================
// BUZZER
// ============================================================

void buzzSuccess() {

  tone(
    BUZZER_PIN,
    1500,
    150
  );

  delay(200);

  tone(
    BUZZER_PIN,
    2000,
    150
  );
}

void buzzFail() {

  tone(
    BUZZER_PIN,
    400,
    400
  );
}

// ============================================================
// SERIAL HELPERS
// ============================================================

void clearSerial() {

  while (Serial.available()) {
    Serial.read();
  }
}

String readLine(const char* prompt) {

  Serial.println(prompt);

  unsigned long start =
    millis();

  while (
    !Serial.available() &&
    millis() - start < 60000UL
  ) {
    delay(20);
  }

  if (!Serial.available()) {

    Serial.println(
      "Input timed out."
    );

    return "";
  }

  String value =
    Serial.readStringUntil('\n');

  value.trim();

  clearSerial();

  return value;
}

// ============================================================
// WHATSAPP NUMBER NORMALIZATION
// ============================================================
//
// Accepts:
//
// 9699490603
// 09699490603
// +919699490603
// 919699490603
// whatsapp:+919699490603
//
// Stores canonical E.164 without a provider-specific prefix:
//
// +919699490603
// ============================================================

String normalizeWhatsApp(String input) {

  input.trim();

  if (input.startsWith("whatsapp:")) {

    input =
      input.substring(9);
  }

  String cleaned = "";

  for (
    unsigned int i = 0;
    i < input.length();
    i++
  ) {

    char c =
      input.charAt(i);

    if (
      c >= '0' &&
      c <= '9'
    ) {

      cleaned += c;

    }
    else if (
      c == '+' &&
      cleaned.length() == 0
    ) {

      cleaned += c;
    }
  }

  if (cleaned.length() == 10) {

    cleaned =
      "+91" + cleaned;
  }

  else if (
    cleaned.length() == 11 &&
    cleaned.charAt(0) == '0'
  ) {

    cleaned =
      "+91" +
      cleaned.substring(1);
  }

  else if (
    cleaned.length() == 12 &&
    cleaned.startsWith("91")
  ) {

    cleaned =
      "+" + cleaned;
  }

  if (
    !cleaned.startsWith("+") ||
    cleaned.length() < 9 ||
    cleaned.length() > 16
  ) {

    return "";
  }

  for (
    unsigned int i = 1;
    i < cleaned.length();
    i++
  ) {

    if (!isDigit(cleaned.charAt(i))) {
      return "";
    }
  }

  return cleaned;
}

bool isTenDigitPhoneInput(const String& input) {

  if (input.length() != 10) {
    return false;
  }

  for (unsigned int i = 0; i < input.length(); i++) {
    if (!isDigit(input.charAt(i))) {
      return false;
    }
  }

  return true;
}

bool fitsStudentBuffers(
  const String& studentID,
  const String& studentName,
  const String& phone
) {

  return
    studentID.length() > 0 &&
    studentID.length() < sizeof(students[0].studentId) &&
    studentName.length() > 0 &&
    studentName.length() < sizeof(students[0].studentName) &&
    phone.length() > 0 &&
    phone.length() < sizeof(students[0].parentWhatsApp);
}

// ============================================================
// IDLE LCD SCREENS
// ============================================================

const char* idleMessages[][2] = {

  {
    "WELCOME!",
    "Scan Finger"
  },

  {
    "AI ATTENDANCE",
    "Ready to Scan"
  },

  {
    "HELLO THERE!",
    "Place Finger"
  },

  {
    "MARK ATTENDANCE",
    "Touch Sensor"
  }
};

const uint8_t IDLE_MESSAGE_COUNT =
  sizeof(idleMessages) /
  sizeof(idleMessages[0]);

unsigned long lastIdleScreenChange = 0;

uint8_t idleScreenIndex = 0;

void showIdleScreen(
  bool force = false
) {

  if (
    !force &&
    millis() -
    lastIdleScreenChange <
    3500
  ) {

    return;
  }

  lastIdleScreenChange =
    millis();

  lcdMsg(
    idleMessages[idleScreenIndex][0],
    idleMessages[idleScreenIndex][1]
  );

  idleScreenIndex++;

  if (
    idleScreenIndex >=
    IDLE_MESSAGE_COUNT
  ) {

    idleScreenIndex = 0;
  }
}

// ============================================================
// DATABASE - MEMORY
// ============================================================

void clearStudentsMemory() {

  memset(
    students,
    0,
    sizeof(students)
  );

  studentCount = 0;
}

// ============================================================
// DATABASE - FIND STUDENT
// ============================================================

int findStudentIndexByFingerprint(
  int fingerprintID
) {

  for (
    int i = 0;
    i < studentCount;
    i++
  ) {

    if (
      students[i].fingerprintID ==
      fingerprintID ||
      students[i].fingerprintID2 ==
      fingerprintID
    ) {

      return i;
    }
  }

  return -1;
}

int findStudentIndexByStudentId(
  const String& studentID
) {

  for (
    int i = 0;
    i < studentCount;
    i++
  ) {

    if (
      studentID.equalsIgnoreCase(
        String(students[i].studentId)
      )
    ) {

      return i;
    }
  }

  return -1;
}

// ============================================================
// FIND NEXT FINGERPRINT ID
// ============================================================

int findNextFingerprintID() {

  for (
    int id = 1;
    id <= 127;
    id++
  ) {

    if (
      findStudentIndexByFingerprint(id)
      >= 0
    ) {

      continue;
    }

    // Check sensor too.
    //
    // This prevents an orphaned fingerprint
    // template from being overwritten.

    uint8_t loadResult =
      FINGERPRINT_PACKETRECIEVEERR;

    for (
      uint8_t attempt = 0;
      attempt < 3;
      attempt++
    ) {

      loadResult =
        finger.loadModel(id);

      if (
        loadResult !=
        FINGERPRINT_PACKETRECIEVEERR
      ) {

        break;
      }

      delay(50);
    }

    if (
      loadResult ==
      FINGERPRINT_PACKETRECIEVEERR
    ) {

      Serial.println(
        "Fingerprint communication error while allocating ID."
      );

      return -2;
    }

    if (
      loadResult !=
      FINGERPRINT_OK
    ) {

      return id;
    }
  }

  return -1;
}

// ============================================================
// DATABASE - SAVE
// ============================================================

bool saveDatabase() {

  File file =
    LittleFS.open(
      DB_TEMP_FILE,
      "w"
    );

  if (!file) {

    Serial.println(
      "ERROR: Could not open database for writing."
    );

    return false;
  }

  for (
    int i = 0;
    i < studentCount;
    i++
  ) {

    file.print(
      students[i].fingerprintID
    );

    if (students[i].fingerprintID2) {
      file.print(",");
      file.print(students[i].fingerprintID2);
    }

    file.print("|");

    file.print(
      students[i].studentId
    );

    file.print("|");

    file.print(
      students[i].studentName
    );

    file.print("|");

    file.println(
      students[i].parentWhatsApp
    );
  }

  file.flush();
  file.close();

  if (
    LittleFS.exists(
      DB_BACKUP_FILE
    )
  ) {

    LittleFS.remove(
      DB_BACKUP_FILE
    );
  }

  if (
    LittleFS.exists(DB_FILE) &&
    !LittleFS.rename(
      DB_FILE,
      DB_BACKUP_FILE
    )
  ) {

    LittleFS.remove(
      DB_TEMP_FILE
    );

    Serial.println(
      "ERROR: Could not protect existing database."
    );

    return false;
  }

  if (
    !LittleFS.rename(
      DB_TEMP_FILE,
      DB_FILE
    )
  ) {

    if (
      LittleFS.exists(
        DB_BACKUP_FILE
      )
    ) {

      LittleFS.rename(
        DB_BACKUP_FILE,
        DB_FILE
      );
    }

    Serial.println(
      "ERROR: Database replacement failed."
    );

    return false;
  }

  if (
    LittleFS.exists(
      DB_BACKUP_FILE
    )
  ) {

    LittleFS.remove(
      DB_BACKUP_FILE
    );
  }

  return true;
}

// ============================================================
// DATABASE - LOAD
// ============================================================

bool loadDatabase() {

  clearStudentsMemory();

  if (
    !LittleFS.exists(DB_FILE) &&
    LittleFS.exists(
      DB_BACKUP_FILE
    )
  ) {

    LittleFS.rename(
      DB_BACKUP_FILE,
      DB_FILE
    );
  }

  if (
    !LittleFS.exists(DB_FILE)
  ) {

    Serial.println(
      "Database is empty."
    );

    return true;
  }

  File file =
    LittleFS.open(
      DB_FILE,
      "r"
    );

  if (!file) {

    Serial.println(
      "ERROR: Could not open database."
    );

    return false;
  }

  bool databaseChanged = false;

  while (
    file.available() &&
    studentCount < MAX_STUDENTS
  ) {

    String line =
      file.readStringUntil('\n');

    line.trim();

    if (!line.length()) {
      continue;
    }

    int p1 =
      line.indexOf('|');

    int p2 =
      line.indexOf(
        '|',
        p1 + 1
      );

    int p3 =
      line.indexOf(
        '|',
        p2 + 1
      );

    if (
      p1 < 1 ||
      p2 < 0 ||
      p3 < 0
    ) {

      continue;
    }

    Student& student =
      students[studentCount];

    String fingerprintIds = line.substring(0, p1);
    int fingerprintSeparator = fingerprintIds.indexOf(',');

    student.fingerprintID = (uint8_t) (
      fingerprintSeparator >= 0
        ? fingerprintIds.substring(0, fingerprintSeparator)
        : fingerprintIds
    ).toInt();

    student.fingerprintID2 = (uint8_t) (
      fingerprintSeparator >= 0
        ? fingerprintIds.substring(fingerprintSeparator + 1).toInt()
        : 0
    );

    String studentId =
      line.substring(
        p1 + 1,
        p2
      );

    String studentName =
      line.substring(
        p2 + 1,
        p3
      );

    String phone =
      line.substring(
        p3 + 1
      );

    if (
      student.fingerprintID < 1 ||
      student.fingerprintID > 127 ||
      student.fingerprintID2 > 127 ||
      student.fingerprintID2 == student.fingerprintID ||
      !studentId.length() ||
      studentId.length() >=
        sizeof(student.studentId) ||
      !studentName.length() ||
      studentName.length() >=
        sizeof(student.studentName) ||
      phone.length() >=
        sizeof(student.parentWhatsApp)
    ) {

      Serial.println(
        "Skipped invalid local student record."
      );

      continue;
    }

    if (
      findStudentIndexByFingerprint(
        student.fingerprintID
      ) >= 0 ||
      (
        student.fingerprintID2 &&
        findStudentIndexByFingerprint(
          student.fingerprintID2
        ) >= 0
      ) ||
      findStudentIndexByStudentId(
        studentId
      ) >= 0
    ) {

      Serial.println(
        "Skipped duplicate local student record."
      );

      continue;
    }

    studentId.toCharArray(
      student.studentId,
      sizeof(student.studentId)
    );

    studentName.toCharArray(
      student.studentName,
      sizeof(student.studentName)
    );

    String normalizedPhone =
      normalizeWhatsApp(phone);

    if (
      normalizedPhone.length()
    ) {

      normalizedPhone.toCharArray(
        student.parentWhatsApp,
        sizeof(student.parentWhatsApp)
      );

      if (
        normalizedPhone != phone
      ) {

        databaseChanged = true;
      }

    } else {

      phone.toCharArray(
        student.parentWhatsApp,
        sizeof(student.parentWhatsApp)
      );
    }

    studentCount++;
  }

  file.close();

  if (databaseChanged) {

    saveDatabase();

    Serial.println(
      "Database phone numbers normalized."
    );
  }

  Serial.print(
    "Students loaded: "
  );

  Serial.println(
    studentCount
  );

  return true;
}

// ============================================================
// SHOW DATABASE
// ============================================================

void showDatabase() {

  Serial.println();
  Serial.println(
    "========== STUDENTS =========="
  );

  if (!studentCount) {

    Serial.println(
      "Database empty."
    );
  }

  for (
    int i = 0;
    i < studentCount;
    i++
  ) {

    Serial.print(
      i + 1
    );

    Serial.print(". ");

    Serial.print(
      students[i].studentId
    );

    Serial.print(" | ");

    Serial.print(
      students[i].studentName
    );

    Serial.print(" | FP ");

    Serial.print(
      students[i].fingerprintID
    );

    if (students[i].fingerprintID2) {
      Serial.print(" / FP ");
      Serial.print(students[i].fingerprintID2);
    }

    Serial.println();
  }

  Serial.println(
    "=============================="
  );
}

// ============================================================
// URL ENCODING
// ============================================================

String urlEncode(
  const String& input
) {

  String output;

  char buffer[4];

  for (
    unsigned int i = 0;
    i < input.length();
    i++
  ) {

    char c =
      input.charAt(i);

    if (
      isalnum(
        (unsigned char)c
      ) ||
      c == '-' ||
      c == '_' ||
      c == '.' ||
      c == '~'
    ) {

      output += c;

    }

    else if (c == ' ') {

      output += "%20";

    }

    else {

      sprintf(
        buffer,
        "%%%02X",
        (unsigned char)c
      );

      output += buffer;
    }
  }

  return output;
}

// ============================================================
// WIFI
// ============================================================

bool connectWiFi() {

  Serial.println();
  Serial.println(
    "================================"
  );

  Serial.println(
    "       CONNECTING TO WIFI"
  );

  Serial.println(
    "================================"
  );

  Serial.println(
    "Using configured WiFi network."
  );

  lcdMsg(
    "Connecting",
    "WiFi..."
  );

  WiFi.mode(WIFI_STA);

  WiFi.setAutoReconnect(true);

  WiFi.begin(
    WIFI_SSID,
    WIFI_PASSWORD
  );

  Serial.print(
    "Connecting"
  );

  unsigned long start =
    millis();

  while (
    WiFi.status() != WL_CONNECTED &&
    millis() - start <
      WIFI_CONNECT_TIMEOUT_MS
  ) {

    delay(300);

    Serial.print(".");
  }

  Serial.println();

  if (
    WiFi.status() ==
    WL_CONNECTED
  ) {

    wifiConnected = true;

    Serial.println(
      "WIFI CONNECTED!"
    );

    Serial.print(
      "IP Address: "
    );

    Serial.println(
      WiFi.localIP()
    );

    Serial.print(
      "Signal: "
    );

    Serial.print(
      WiFi.RSSI()
    );

    Serial.println(
      " dBm"
    );

    return true;
  }

  wifiConnected = false;

  Serial.println(
    "WIFI CONNECTION FAILED."
  );

  Serial.print(
    "WiFi status code: "
  );

  Serial.println(
    WiFi.status()
  );

  lcdMsg(
    "WiFi Failed",
    "Check Network"
  );

  delay(1800);

  return false;
}

void maintainWiFi() {

  if (
    WiFi.status() ==
    WL_CONNECTED
  ) {

    if (!wifiConnected) {

      Serial.println(
        "WiFi reconnected."
      );
    }

    wifiConnected = true;
    wifiReconnectInProgress = false;
    return;
  }

  wifiConnected = false;

  if (
    wifiReconnectInProgress &&
    millis() -
      lastWiFiReconnectAttempt <
      WIFI_CONNECT_TIMEOUT_MS
  ) {

    return;
  }

  if (
    millis() -
      lastWiFiReconnectAttempt <
      WIFI_RECONNECT_INTERVAL_MS
  ) {

    return;
  }

  lastWiFiReconnectAttempt =
    millis();

  wifiReconnectInProgress = true;

  Serial.println(
    "Starting WiFi reconnect."
  );

  WiFi.disconnect();
  WiFi.begin(
    WIFI_SSID,
    WIFI_PASSWORD
  );
}

// ============================================================
// TIME / NTP
// ============================================================

const long GMT_OFFSET_SEC =
  19800;

const int DAYLIGHT_OFFSET_SEC =
  0;

bool setupTime() {

  if (!wifiConnected) {

    Serial.println(
      "NTP skipped: WiFi unavailable."
    );

    timeSynced = false;

    return false;
  }

  configTime(
    GMT_OFFSET_SEC,
    DAYLIGHT_OFFSET_SEC,
    "pool.ntp.org",
    "time.nist.gov"
  );

  lcdMsg(
    "Syncing time",
    "Please wait..."
  );

  Serial.print(
    "Waiting for NTP time sync"
  );

  unsigned long start =
    millis();

  time_t now =
    time(nullptr);

  while (
    now < 100000 &&
    millis() - start <
      NTP_SYNC_TIMEOUT_MS
  ) {

    delay(500);

    Serial.print(".");

    now =
      time(nullptr);
  }

  Serial.println();

  if (now < 100000) {

    Serial.println(
      "NTP sync FAILED."
    );

    timeSynced = false;

    return false;
  }

  Serial.println(
    "Time synchronized."
  );

  timeSynced = true;

  return true;
}

void maintainTime() {

  time_t now =
    time(nullptr);

  if (now >= 100000) {

    timeSynced = true;
    return;
  }

  timeSynced = false;

  if (
    !wifiConnected ||
    millis() - lastNtpRetry <
      NTP_RETRY_INTERVAL_MS
  ) {

    return;
  }

  lastNtpRetry =
    millis();

  configTime(
    GMT_OFFSET_SEC,
    DAYLIGHT_OFFSET_SEC,
    "pool.ntp.org",
    "time.nist.gov"
  );

  Serial.println(
    "Requested NTP resynchronization."
  );
}

// ============================================================
// GET DATE / TIME
// ============================================================

void getDateTimeStrings(
  char* dateStr,
  char* timeStr
) {

  if (!timeSynced) {

    strcpy(
      dateStr,
      "00-00-0000"
    );

    strcpy(
      timeStr,
      "00:00:00"
    );

    return;
  }

  time_t now =
    time(nullptr);

  struct tm* t =
    localtime(&now);

  sprintf(
    dateStr,
    "%02d-%02d-%04d",
    t->tm_mday,
    t->tm_mon + 1,
    t->tm_year + 1900
  );

  sprintf(
    timeStr,
    "%02d:%02d:%02d",
    t->tm_hour,
    t->tm_min,
    t->tm_sec
  );
}

// ============================================================
// GOOGLE SHEETS
// ============================================================

String jsonStringField(
  const String& json,
  const String& name
) {

  String marker =
    "\"" + name + "\":\"";

  int start =
    json.indexOf(marker);

  if (start < 0) {
    return "";
  }

  start += marker.length();

  int end =
    json.indexOf('"', start);

  if (end < 0) {
    return "";
  }

  return json.substring(
    start,
    end
  );
}

GoogleResult classifyGoogleResponse(
  int httpCode,
  const String& response
) {

  if (
    httpCode <= 0 ||
    httpCode >= 500
  ) {

    return GOOGLE_RETRYABLE_ERROR;
  }

  String code =
    jsonStringField(
      response,
      "code"
    );

  if (code == "recorded_first_scan") {
    return GOOGLE_RECORDED;
  }

  if (
    code == "recorded_second_scan" ||
    code == "attendance_event_replayed" ||
    code == "daily_limit_reached" ||
    code == "already_present"
  ) {
    return GOOGLE_ALREADY_PRESENT;
  }

  if (code == "registered") {
    return GOOGLE_REGISTERED;
  }

  if (code == "already_registered") {
    return GOOGLE_ALREADY_REGISTERED;
  }

  if (code == "authentication_failed") {
    return GOOGLE_AUTH_ERROR;
  }

  if (code == "unknown_student") {
    return GOOGLE_UNKNOWN_STUDENT;
  }

  if (
    code == "busy_retry" ||
    code == "server_error" ||
    code == "server_configuration_error"
  ) {

    return GOOGLE_RETRYABLE_ERROR;
  }

  return GOOGLE_PERMANENT_ERROR;
}

GoogleResult classifyDeviceApiResponse(
  int httpCode,
  const String& response
) {

  if (
    httpCode <= 0 ||
    httpCode == 408 ||
    httpCode == 425 ||
    httpCode == 429 ||
    httpCode >= 500
  ) {
    return GOOGLE_RETRYABLE_ERROR;
  }

  String status =
    jsonStringField(response, "status");

  String code =
    jsonStringField(response, "code");

  if (
    httpCode == 201 &&
    (
      status == "recorded_first_scan" ||
      status == "recorded_second_scan"
    )
  ) {
    return GOOGLE_RECORDED;
  }

  if (
    httpCode == 200 &&
    status == "attendance_event_replayed"
  ) {
    return GOOGLE_ALREADY_PRESENT;
  }

  if (
    httpCode == 409 &&
    status == "daily_limit_reached"
  ) {
    return GOOGLE_ALREADY_PRESENT;
  }

  if (httpCode == 401) {
    return GOOGLE_AUTH_ERROR;
  }

  if (
    httpCode == 404 &&
    code == "unknown_fingerprint"
  ) {
    return GOOGLE_UNKNOWN_STUDENT;
  }

  if (
    httpCode >= 400 &&
    httpCode < 500
  ) {
    return GOOGLE_PERMANENT_ERROR;
  }

  // An unexpected/malformed success response is safer to retry than discard.
  return GOOGLE_RETRYABLE_ERROR;
}

String makeEventId(
  char operation,
  uint8_t fingerprintID
) {

  char value[48];

  snprintf(
    value,
    sizeof(value),
    "%c-%06X-%u-%08X",
    operation,
    ESP.getChipId(),
    fingerprintID,
    ESP.getCycleCount() ^ micros()
  );

  return String(value);
}

GoogleResult sendGoogleEvent(
  const OutboxEvent& event
) {

  if (
    WiFi.status() !=
    WL_CONNECTED
  ) {

    wifiConnected = false;
    return GOOGLE_RETRYABLE_ERROR;
  }

  WiFiClientSecure client;

#if LEGACY_ALLOW_INSECURE_TLS
  // Temporary legacy compatibility. Phase 1 cannot select a trustworthy
  // Google redirect-chain anchor without a real-device certificate test.
  client.setInsecure();
#else
#error "Configure and hardware-test a TLS trust anchor before disabling legacy mode."
#endif

  client.setTimeout(
    HTTP_CONNECT_TIMEOUT_MS
  );

  HTTPClient https;

  https.setTimeout(
    HTTP_RESPONSE_TIMEOUT_MS
  );

  https.setFollowRedirects(
    HTTPC_FORCE_FOLLOW_REDIRECTS
  );

  if (
    !https.begin(
      client,
      String(SCRIPT_URL)
    )
  ) {

    Serial.println(
      "Google HTTPS initialization failed."
    );

    return GOOGLE_RETRYABLE_ERROR;
  }

  String secondFingerprint =
    event.fingerprintID2
      ? String(event.fingerprintID2)
      : "";

  String payload =
    "key=" +
    urlEncode(String(SECRET_KEY)) +
    "&action=" +
    String(
      event.operation == 'R'
        ? "register"
        : "attendance"
    ) +
    "&eventId=" +
    urlEncode(String(event.eventId)) +
    "&fingerprintId=" +
    String(event.fingerprintID) +
    "&fingerprintId2=" +
    secondFingerprint +
    "&studentId=" +
    urlEncode(String(event.studentId)) +
    "&studentName=" +
    urlEncode(String(event.studentName)) +
    "&parentWhatsApp=" +
    urlEncode(String(event.parentWhatsApp)) +
    "&attendanceDate=" +
    urlEncode(String(event.attendanceDate)) +
    "&attendanceTime=" +
    urlEncode(String(event.attendanceTime)) +
    "&status=Present";

  https.addHeader(
    "Content-Type",
    "application/x-www-form-urlencoded"
  );

  int httpCode =
    https.POST(payload);

  String response = "";

  if (httpCode > 0) {

    response =
      https.getString();
  }

  https.end();

  Serial.print(
    "Google request result: HTTP "
  );

  Serial.println(httpCode);

  return classifyGoogleResponse(
    httpCode,
    response
  );
}

String apiOccurredAt(
  const OutboxEvent& event
) {

  String date =
    String(event.attendanceDate);

  String timeValue =
    String(event.attendanceTime);

  if (
    date.length() != 10 ||
    timeValue.length() != 8 ||
    date == "00-00-0000" ||
    timeValue == "00:00:00"
  ) {
    return "";
  }

  return
    date.substring(6, 10) + "-" +
    date.substring(3, 5) + "-" +
    date.substring(0, 2) + "T" +
    timeValue + "+05:30";
}

GoogleResult sendDeviceApiEvent(
  const OutboxEvent& event
) {

  if (
    WiFi.status() != WL_CONNECTED
  ) {
    wifiConnected = false;
    return GOOGLE_RETRYABLE_ERROR;
  }

  String apiUrl =
    String(DEVICE_API_URL);

  String occurredAt =
    apiOccurredAt(event);

  if (
    !apiUrl.startsWith("https://") ||
    !String(DEVICE_IDENTIFIER).length() ||
    !String(DEVICE_CREDENTIAL).length() ||
    !occurredAt.length()
  ) {
    Serial.println(
      "Device API configuration/event timestamp is invalid."
    );
    return GOOGLE_PERMANENT_ERROR;
  }

#if !DEVICE_API_REQUIRE_VERIFIED_TLS
#error "Device API TLS verification must remain enabled."
#endif

  BearSSL::WiFiClientSecure client;
  BearSSL::X509List trustAnchor(
    DEVICE_API_ROOT_CA
  );
  client.setTrustAnchors(
    &trustAnchor
  );
  client.setTimeout(
    HTTP_CONNECT_TIMEOUT_MS
  );

  HTTPClient https;
  https.setTimeout(
    HTTP_RESPONSE_TIMEOUT_MS
  );

  if (
    !https.begin(client, apiUrl)
  ) {
    Serial.println(
      "Device API HTTPS initialization failed."
    );
    return GOOGLE_RETRYABLE_ERROR;
  }

  https.addHeader(
    "Content-Type",
    "application/json"
  );
  https.addHeader(
    "x-device-id",
    String(DEVICE_IDENTIFIER)
  );
  https.addHeader(
    "Authorization",
    "Bearer " + String(DEVICE_CREDENTIAL)
  );

  String payload =
    "{\"eventId\":\"" +
    String(event.eventId) +
    "\",\"fingerprintId\":" +
    String(event.fingerprintID) +
    ",\"occurredAt\":\"" +
    occurredAt +
    "\",\"eventType\":\"ATTENDANCE\"}";

  int httpCode =
    https.POST(payload);

  String response = "";

  if (httpCode > 0) {
    response = https.getString();
  }

  https.end();

  Serial.print(
    "Device API request result: HTTP "
  );
  Serial.println(httpCode);

  return classifyDeviceApiResponse(
    httpCode,
    response
  );
}

bool writeOutboxEvent(
  File& file,
  const OutboxEvent& event
) {

  if (!file) {
    return false;
  }

  file.print("v2|");
  file.print(event.operation);
  file.print("|");
  file.print(event.eventId);
  file.print("|");
  file.print(event.fingerprintID);
  file.print("|");
  file.print(event.fingerprintID2);
  file.print("|");
  file.print(event.studentId);
  file.print("|");
  file.print(event.studentName);
  file.print("|");
  file.print(event.parentWhatsApp);
  file.print("|");
  file.print(event.attendanceDate);
  file.print("|");
  file.print(event.attendanceTime);
  file.print("|");
  file.println(event.attempts);
  return true;
}

bool archiveDeadLetter(
  const OutboxEvent& event
) {

  if (!storageAvailable) {
    return false;
  }

  File dead =
    LittleFS.open(
      OUTBOX_DEAD_FILE,
      "a"
    );

  bool written =
    writeOutboxEvent(
      dead,
      event
    );

  if (dead) {
    dead.close();
  }

  return written;
}

bool parseOutboxEvent(
  const String& line,
  OutboxEvent& event
) {

  String fields[11];
  int fieldIndex = 0;
  int start = 0;

  for (
    unsigned int i = 0;
    i <= line.length();
    i++
  ) {

    if (
      i == line.length() ||
      line.charAt(i) == '|'
    ) {

      if (fieldIndex >= 11) {
        return false;
      }

      fields[fieldIndex++] =
        line.substring(start, i);

      start = i + 1;
    }
  }

  bool legacyV1 =
    fieldIndex == 10 &&
    fields[0] == "v1";

  if (
    (!legacyV1 && fieldIndex != 11) ||
    (!legacyV1 && fields[0] != "v2") ||
    fields[1].length() != 1
  ) {

    return false;
  }

  memset(
    &event,
    0,
    sizeof(event)
  );

  event.operation =
    fields[1].charAt(0);

  event.fingerprintID =
    (uint8_t)
    fields[3].toInt();

  event.fingerprintID2 = legacyV1
    ? 0
    : (uint8_t) fields[4].toInt();

  event.attempts =
    (uint8_t)
    fields[legacyV1 ? 9 : 10].toInt();

  if (
    event.operation != 'R' &&
    event.operation != 'A'
  ) {

    return false;
  }

  fields[2].toCharArray(
    event.eventId,
    sizeof(event.eventId)
  );

  fields[legacyV1 ? 4 : 5].toCharArray(
    event.studentId,
    sizeof(event.studentId)
  );

  fields[legacyV1 ? 5 : 6].toCharArray(
    event.studentName,
    sizeof(event.studentName)
  );

  fields[legacyV1 ? 6 : 7].toCharArray(
    event.parentWhatsApp,
    sizeof(event.parentWhatsApp)
  );

  fields[legacyV1 ? 7 : 8].toCharArray(
    event.attendanceDate,
    sizeof(event.attendanceDate)
  );

  fields[legacyV1 ? 8 : 9].toCharArray(
    event.attendanceTime,
    sizeof(event.attendanceTime)
  );

  return
    event.eventId[0] &&
    event.studentId[0] &&
    event.fingerprintID >= 1;
}

uint8_t countOutboxEvents() {

  if (
    !storageAvailable ||
    !LittleFS.exists(
      OUTBOX_FILE
    )
  ) {

    return 0;
  }

  File file =
    LittleFS.open(
      OUTBOX_FILE,
      "r"
    );

  if (!file) {
    return 0;
  }

  uint8_t count = 0;

  while (
    file.available() &&
    count < 255
  ) {

    String line =
      file.readStringUntil('\n');

    line.trim();

    if (line.length()) {
      count++;
    }
  }

  file.close();
  return count;
}

bool hasQueuedRegistration(
  const Student& student
) {

  if (
    !storageAvailable ||
    !LittleFS.exists(
      OUTBOX_FILE
    )
  ) {

    return false;
  }

  File file =
    LittleFS.open(
      OUTBOX_FILE,
      "r"
    );

  if (!file) {
    return false;
  }

  bool found = false;

  while (
    file.available() &&
    !found
  ) {

    String line =
      file.readStringUntil('\n');

    line.trim();

    if (!line.length()) {
      continue;
    }

    OutboxEvent queued;

    if (
      parseOutboxEvent(
        line,
        queued
      ) &&
      queued.operation == 'R' &&
      queued.fingerprintID ==
        student.fingerprintID &&
      queued.fingerprintID2 ==
        student.fingerprintID2 &&
      String(queued.studentId) ==
        String(student.studentId)
    ) {

      found = true;
    }
  }

  file.close();
  return found;
}

bool enqueueEvent(
  const OutboxEvent& event
) {

  if (
    !storageAvailable ||
    countOutboxEvents() >=
      OUTBOX_MAX_RECORDS
  ) {

    Serial.println(
      "Outbox unavailable or full."
    );

    return false;
  }

  File file =
    LittleFS.open(
      OUTBOX_FILE,
      "a"
    );

  bool ok =
    writeOutboxEvent(
      file,
      event
    );

  if (file) {
    file.flush();
    file.close();
  }

  if (ok) {

    Serial.println(
      "Event stored for retry."
    );
  }

  return ok;
}

bool replaceOutboxFromTemp() {

  if (
    LittleFS.exists(
      OUTBOX_BACKUP_FILE
    )
  ) {

    LittleFS.remove(
      OUTBOX_BACKUP_FILE
    );
  }

  if (
    LittleFS.exists(
      OUTBOX_FILE
    ) &&
    !LittleFS.rename(
      OUTBOX_FILE,
      OUTBOX_BACKUP_FILE
    )
  ) {

    return false;
  }

  if (
    !LittleFS.rename(
      OUTBOX_TEMP_FILE,
      OUTBOX_FILE
    )
  ) {

    if (
      LittleFS.exists(
        OUTBOX_BACKUP_FILE
      )
    ) {

      LittleFS.rename(
        OUTBOX_BACKUP_FILE,
        OUTBOX_FILE
      );
    }

    return false;
  }

  LittleFS.remove(
    OUTBOX_BACKUP_FILE
  );

  return true;
}

void processOutbox() {

  if (
    !storageAvailable ||
    !wifiConnected ||
    millis() - lastOutboxAttempt <
      OUTBOX_RETRY_INTERVAL_MS ||
    !LittleFS.exists(
      OUTBOX_FILE
    )
  ) {

    return;
  }

  lastOutboxAttempt =
    millis();

  File source =
    LittleFS.open(
      OUTBOX_FILE,
      "r"
    );

  if (!source) {
    return;
  }

  String firstLine = "";

  while (
    source.available() &&
    !firstLine.length()
  ) {

    firstLine =
      source.readStringUntil('\n');

    firstLine.trim();
  }

  if (!firstLine.length()) {

    source.close();
    LittleFS.remove(
      OUTBOX_FILE
    );
    return;
  }

  OutboxEvent event;

  if (
    !parseOutboxEvent(
      firstLine,
      event
    )
  ) {

    Serial.println(
      "Discarding malformed outbox record."
    );

    memset(
      &event,
      0,
      sizeof(event)
    );
  }

  GoogleResult result =
    event.eventId[0]
      ? (
        event.operation == 'R'
          ? sendGoogleEvent(event)
          : sendDeviceApiEvent(event)
      )
      : GOOGLE_PERMANENT_ERROR;

  bool retry =
    result == GOOGLE_RETRYABLE_ERROR;

  bool completed =
    result == GOOGLE_RECORDED ||
    result == GOOGLE_ALREADY_PRESENT ||
    result == GOOGLE_REGISTERED ||
    result == GOOGLE_ALREADY_REGISTERED;

  if (retry) {
    event.attempts++;
  }

  File target =
    LittleFS.open(
      OUTBOX_TEMP_FILE,
      "w"
    );

  if (!target) {

    source.close();
    return;
  }

  if (
    retry &&
    event.attempts <
      OUTBOX_MAX_ATTEMPTS
  ) {

    writeOutboxEvent(
      target,
      event
    );
  }

  if (
    (
      retry &&
      event.attempts >=
        OUTBOX_MAX_ATTEMPTS
    ) ||
    (
      !retry &&
      !completed
    )
  ) {

    archiveDeadLetter(event);

    Serial.println(
      "Unresolved event moved to dead-letter storage."
    );
  }

  while (source.available()) {

    String line =
      source.readStringUntil('\n');

    line.trim();

    if (line.length()) {
      target.println(line);
    }
  }

  source.close();
  target.flush();
  target.close();

  if (!replaceOutboxFromTemp()) {

    Serial.println(
      "Outbox update failed; original retained."
    );
  }
}

OutboxEvent makeStudentEvent(
  char operation,
  const Student& student,
  uint8_t matchedFingerprintID = 0
) {

  OutboxEvent event;

  memset(
    &event,
    0,
    sizeof(event)
  );

  event.operation = operation;
  event.fingerprintID =
    matchedFingerprintID
      ? matchedFingerprintID
      : student.fingerprintID;
  event.fingerprintID2 =
    student.fingerprintID2;

  String eventId =
    makeEventId(
      operation,
      event.fingerprintID
    );

  eventId.toCharArray(
    event.eventId,
    sizeof(event.eventId)
  );

  strncpy(
    event.studentId,
    student.studentId,
    sizeof(event.studentId) - 1
  );

  strncpy(
    event.studentName,
    student.studentName,
    sizeof(event.studentName) - 1
  );

  strncpy(
    event.parentWhatsApp,
    student.parentWhatsApp,
    sizeof(event.parentWhatsApp) - 1
  );

  if (operation == 'A') {

    getDateTimeStrings(
      event.attendanceDate,
      event.attendanceTime
    );
  }

  return event;
}

void queueLocalStudentSync() {

  if (!storageAvailable) {
    return;
  }

  for (
    uint8_t i = 0;
    i < studentCount;
    i++
  ) {

    if (
      hasQueuedRegistration(
        students[i]
      )
    ) {

      continue;
    }

    OutboxEvent event =
      makeStudentEvent(
        'R',
        students[i]
      );

    enqueueEvent(event);
  }
}

// ============================================================
// META WHATSAPP
// ============================================================
//
// Not active in this firmware yet.
// No WhatsApp API is called from the ESP yet.
//
// The official college Meta WhatsApp integration will be added
// later through the attendance system backend.
//
// ============================================================

// ============================================================
// FINGERPRINT MATCHING
// ============================================================

int getFingerprintID() {

  uint8_t p =
    finger.getImage();

  if (
    p == FINGERPRINT_NOFINGER
  ) {

    return -1;
  }

  if (
    p != FINGERPRINT_OK
  ) {

    if (
      p != FINGERPRINT_PACKETRECIEVEERR
    ) {

      Serial.print(
        "getImage error: "
      );

      Serial.println(p);
    }

    return -1;
  }

  Serial.println(
    "Fingerprint image captured."
  );

  p =
    finger.image2Tz();

  if (
    p != FINGERPRINT_OK
  ) {

    Serial.print(
      "image2Tz error: "
    );

    Serial.println(p);

    return -1;
  }

  p =
    finger.fingerFastSearch();

  if (
    p != FINGERPRINT_OK
  ) {

    Serial.print(
      "Fingerprint search failed: "
    );

    Serial.println(p);

    return -1;
  }

  Serial.print(
    "Fingerprint matched! ID: "
  );

  Serial.println(
    finger.fingerID
  );

  Serial.print(
    "Confidence: "
  );

  Serial.println(
    finger.confidence
  );

  return finger.fingerID;
}

// ============================================================
// ENROLL FINGERPRINT
// ============================================================

bool enrollFingerprint(
  int id
) {

  uint8_t p;

  int timeout;

  // ----------------------------------------------------------
  // FIRST SCAN
  // ----------------------------------------------------------

  lcdIDMsg(
    "Place Finger",
    id
  );

  Serial.println(
    "Place finger on sensor..."
  );

  timeout = 0;

  while (
    (p = finger.getImage()) !=
    FINGERPRINT_OK
  ) {

    if (
      p != FINGERPRINT_NOFINGER &&
      p != FINGERPRINT_PACKETRECIEVEERR
    ) {

      Serial.print(
        "First scan error: "
      );

      Serial.println(p);

      buzzFail();

      return false;
    }

    delay(80);

    if (++timeout > 600) {

      Serial.println(
        "First scan timed out."
      );

      buzzFail();

      return false;
    }
  }

  p =
    finger.image2Tz(1);

  if (
    p != FINGERPRINT_OK
  ) {

    Serial.print(
      "First conversion failed: "
    );

    Serial.println(p);

    buzzFail();

    return false;
  }

  p = finger.fingerFastSearch();

  if (p == FINGERPRINT_OK) {
    Serial.println(
      "Fingerprint is already enrolled."
    );
    lcdMsg(
      "Duplicate Finger",
      "Use another"
    );
    buzzFail();
    delay(1500);
    return false;
  }

  if (p != FINGERPRINT_NOTFOUND) {
    Serial.print(
      "Fingerprint duplicate check failed: "
    );
    Serial.println(p);
    buzzFail();
    return false;
  }

  Serial.println(
    "First scan captured."
  );

  // ----------------------------------------------------------
  // REMOVE FINGER
  // ----------------------------------------------------------

  lcdMsg(
    "Remove Finger",
    "Please wait"
  );

  Serial.println(
    "Remove finger."
  );

  delay(800);

  timeout = 0;

  while (true) {

    p =
      finger.getImage();

    if (
      p == FINGERPRINT_NOFINGER
    ) {

      break;
    }

    delay(100);

    if (++timeout > 100) {

      Serial.println(
        "Remove finger timeout."
      );

      buzzFail();

      return false;
    }
  }

  // ----------------------------------------------------------
  // SECOND SCAN
  // ----------------------------------------------------------

  lcdMsg(
    "Same Finger",
    "Scan again"
  );

  Serial.println(
    "Place SAME finger again..."
  );

  timeout = 0;

  while (
    (p = finger.getImage()) !=
    FINGERPRINT_OK
  ) {

    if (
      p != FINGERPRINT_NOFINGER &&
      p != FINGERPRINT_PACKETRECIEVEERR
    ) {

      Serial.print(
        "Second scan error: "
      );

      Serial.println(p);

      buzzFail();

      return false;
    }

    delay(80);

    if (++timeout > 600) {

      Serial.println(
        "Second scan timed out."
      );

      buzzFail();

      return false;
    }
  }

  p =
    finger.image2Tz(2);

  if (
    p != FINGERPRINT_OK
  ) {

    Serial.print(
      "Second conversion failed: "
    );

    Serial.println(p);

    buzzFail();

    return false;
  }

  Serial.println(
    "Second scan captured."
  );

  // ----------------------------------------------------------
  // CREATE MODEL
  // ----------------------------------------------------------

  lcdMsg(
    "Processing",
    "Fingerprint..."
  );

  p =
    finger.createModel();

  if (
    p != FINGERPRINT_OK
  ) {

    Serial.print(
      "Finger mismatch. Code: "
    );

    Serial.println(p);

    lcdMsg(
      "Finger",
      "Mismatch"
    );

    buzzFail();

    delay(1500);

    return false;
  }

  // ----------------------------------------------------------
  // STORE MODEL
  // ----------------------------------------------------------

  p =
    finger.storeModel(id);

  if (
    p != FINGERPRINT_OK
  ) {

    Serial.print(
      "Store failed. Code: "
    );

    Serial.println(p);

    lcdMsg(
      "Registration",
      "FAILED"
    );

    buzzFail();

    delay(1500);

    return false;
  }

  Serial.println(
    "Fingerprint stored successfully."
  );

  lcdIDMsg(
    "Registered!",
    id
  );

  buzzSuccess();

  delay(1200);

  return true;
}

// ============================================================
// REGISTER STUDENT
// ============================================================

void registerStudent() {

  if (!storageAvailable) {

    Serial.println(
      "Registration unavailable: storage is offline."
    );

    lcdMsg(
      "Storage Error",
      "Cannot register"
    );

    buzzFail();
    return;
  }

  if (!sensorAvailable) {

    Serial.println(
      "Registration unavailable: fingerprint sensor is offline."
    );

    lcdMsg(
      "Sensor Error",
      "Cannot register"
    );

    buzzFail();
    return;
  }

  if (
    studentCount >= MAX_STUDENTS
  ) {

    Serial.println(
      "Database full."
    );

    lcdMsg(
      "Database Full",
      "Cannot register"
    );

    buzzFail();

    delay(1500);

    return;
  }

  int fingerprintID =
    findNextFingerprintID();

  if (
    fingerprintID == -2
  ) {

    lcdMsg(
      "Sensor Comm",
      "Try again"
    );

    buzzFail();
    return;
  }

  if (
    fingerprintID < 1
  ) {

    Serial.println(
      "No fingerprint IDs available."
    );

    return;
  }

  Serial.println();
  Serial.println(
    "========== NEW STUDENT =========="
  );

  String studentID =
    readLine(
      "Enter Student ID:"
    );

  String studentName =
    readLine(
      "Enter Student Name:"
    );

  String parentPhone =
    readLine(
      "Parent WhatsApp (10 digits):"
    );

  String fingerprintCountInput =
    readLine(
      "Fingerprint count (1 or 2):"
    );

  if (
    !studentID.length() ||
    !studentName.length() ||
    !parentPhone.length() ||
    !fingerprintCountInput.length()
  ) {

    Serial.println(
      "Registration cancelled: blank field."
    );

    lcdMsg(
      "Registration",
      "Cancelled"
    );

    buzzFail();

    delay(1500);

    return;
  }

  int fingerprintCount =
    fingerprintCountInput.toInt();

  if (
    (fingerprintCount != 1 && fingerprintCount != 2) ||
    fingerprintCountInput != String(fingerprintCount)
  ) {
    Serial.println(
      "Fingerprint count must be 1 or 2."
    );
    lcdMsg(
      "Invalid Count",
      "Enter 1 or 2"
    );
    buzzFail();
    delay(1500);
    return;
  }

  if (
    findStudentIndexByStudentId(
      studentID
    ) >= 0
  ) {

    Serial.println(
      "Registration rejected: duplicate Student ID."
    );

    lcdMsg(
      "Duplicate ID",
      "Not registered"
    );

    buzzFail();
    delay(1500);
    return;
  }

  if (
    studentID.indexOf('|') >= 0 ||
    studentName.indexOf('|') >= 0 ||
    parentPhone.indexOf('|') >= 0
  ) {

    Serial.println(
      "Do not use | character."
    );

    lcdMsg(
      "Invalid input",
      "Use no |"
    );

    buzzFail();

    delay(1500);

    return;
  }

  String normalizedPhone =
    isTenDigitPhoneInput(parentPhone)
      ? normalizeWhatsApp(parentPhone)
      : "";

  if (
    !normalizedPhone.length()
  ) {

    Serial.println(
      "Invalid Parent WhatsApp number."
    );

    lcdMsg(
      "Invalid WhatsApp",
      "Try again"
    );

    buzzFail();

    delay(1500);

    return;
  }

  if (
    !fitsStudentBuffers(
      studentID,
      studentName,
      normalizedPhone
    )
  ) {

    Serial.println(
      "Registration rejected: input exceeds storage capacity."
    );

    lcdMsg(
      "Input Too Long",
      "Not registered"
    );

    buzzFail();
    delay(1500);
    return;
  }

  Serial.print(
    "Fingerprint will be assigned ID: "
  );

  Serial.println(
    fingerprintID
  );

  if (
    !enrollFingerprint(
      fingerprintID
    )
  ) {

    Serial.println(
      "Student registration failed."
    );

    lcdMsg(
      "Registration",
      "Failed"
    );

    delay(1200);

    return;
  }

  int fingerprintID2 = 0;

  if (fingerprintCount == 2) {
    fingerprintID2 = findNextFingerprintID();

    if (fingerprintID2 < 1) {
      finger.deleteModel(fingerprintID);
      Serial.println(
        "Second fingerprint ID unavailable; first enrollment rolled back."
      );
      buzzFail();
      return;
    }

    Serial.print(
      "Second fingerprint will be assigned ID: "
    );
    Serial.println(fingerprintID2);
    Serial.println(
      "Use a DIFFERENT finger for the second fingerprint."
    );

    if (!enrollFingerprint(fingerprintID2)) {
      finger.deleteModel(fingerprintID);
      Serial.println(
        "Second enrollment failed; first enrollment rolled back."
      );
      lcdMsg(
        "Registration",
        "Rolled back"
      );
      delay(1500);
      return;
    }
  }

  Student& student =
    students[studentCount];

  student.fingerprintID =
    fingerprintID;
  student.fingerprintID2 =
    fingerprintID2;

  studentID.toCharArray(
    student.studentId,
    sizeof(student.studentId)
  );

  studentName.toCharArray(
    student.studentName,
    sizeof(student.studentName)
  );

  normalizedPhone.toCharArray(
    student.parentWhatsApp,
    sizeof(student.parentWhatsApp)
  );

  studentCount++;

  if (
    !saveDatabase()
  ) {

    studentCount--;

    memset(
      &students[studentCount],
      0,
      sizeof(Student)
    );

    uint8_t rollbackResult =
      finger.deleteModel(
        fingerprintID
      );

    if (fingerprintID2) {
      finger.deleteModel(fingerprintID2);
    }

    Serial.println(
      rollbackResult == FINGERPRINT_OK
        ? "Local save failed; fingerprint enrollment rolled back."
        : "CRITICAL: Local save failed and fingerprint rollback failed."
    );

    lcdMsg(
      "DB SAVE",
      "FAILED"
    );

    buzzFail();

    delay(2000);

    return;
  }

  OutboxEvent registrationEvent =
    makeStudentEvent(
      'R',
      student
    );

  GoogleResult registrationResult =
    sendGoogleEvent(
      registrationEvent
    );

  bool cloudConfirmed =
    registrationResult == GOOGLE_REGISTERED ||
    registrationResult == GOOGLE_ALREADY_REGISTERED;

  if (!cloudConfirmed) {

    if (
      registrationResult ==
      GOOGLE_RETRYABLE_ERROR
    ) {

      enqueueEvent(
        registrationEvent
      );

      lcdMsg(
        "Saved Locally",
        "Sync Pending"
      );

      Serial.println(
        "Student saved locally; cloud synchronization pending."
      );

      delay(1800);
      return;
    }

    Serial.println(
      "Cloud registration rejected; local enrollment requires reconciliation."
    );

    enqueueEvent(
      registrationEvent
    );

    lcdMsg(
      "Cloud Rejected",
      "Check console"
    );

    buzzFail();
    delay(2000);
    return;
  }

  Serial.println();
  Serial.println(
    "========== REGISTERED =========="
  );

  Serial.print(
    "Student ID: "
  );

  Serial.println(
    student.studentId
  );

  Serial.print(
    "Name: "
  );

  Serial.println(
    student.studentName
  );

  Serial.print(
    "Fingerprint ID: "
  );

  Serial.println(
    student.fingerprintID
  );

  if (student.fingerprintID2) {
    Serial.print(
      "Fingerprint ID 2: "
    );
    Serial.println(
      student.fingerprintID2
    );
  }

  Serial.println(
    "Parent mobile saved and cloud registration confirmed."
  );

  Serial.println(
    "================================"
  );

  lcdMsg(
    "Student Saved",
    student.studentId
  );

  buzzSuccess();

  delay(1800);

  showDatabase();
}

// ============================================================
// CLEAR EVERYTHING
// ============================================================

void clearEverything() {

  if (
    !storageAvailable ||
    !sensorAvailable
  ) {

    Serial.println(
      "Clear unavailable while storage or sensor is offline."
    );

    lcdMsg(
      "Clear Blocked",
      "Hardware error"
    );

    buzzFail();
    return;
  }

  Serial.println();

  Serial.println(
    "WARNING: This will DELETE:"
  );

  Serial.println(
    "1. Every fingerprint in the sensor"
  );

  Serial.println(
    "2. Every student record in the ESP database"
  );

  Serial.println();

  Serial.println(
    "Type YES to continue:"
  );

  String answer =
    readLine(">");

  if (
    answer != "YES"
  ) {

    Serial.println(
      "Clear cancelled."
    );

    lcdMsg(
      "Clear Cancelled",
      ""
    );

    delay(1200);

    return;
  }

  lcdMsg(
    "Clearing",
    "Please wait..."
  );

  Serial.println(
    "Clearing fingerprint sensor..."
  );

  uint8_t result =
    finger.emptyDatabase();

  if (
    result != FINGERPRINT_OK
  ) {

    Serial.print(
      "Fingerprint clear FAILED. Code: "
    );

    Serial.println(
      result
    );

    lcdMsg(
      "FP Clear",
      "FAILED"
    );

    buzzFail();

    delay(2000);

    return;
  }

  clearStudentsMemory();

  bool filesCleared = true;

  const char* filesToRemove[] = {
    DB_FILE,
    DB_TEMP_FILE,
    DB_BACKUP_FILE,
    OUTBOX_FILE,
    OUTBOX_TEMP_FILE,
    OUTBOX_BACKUP_FILE,
    OUTBOX_DEAD_FILE
  };

  for (
    uint8_t i = 0;
    i < sizeof(filesToRemove) /
      sizeof(filesToRemove[0]);
    i++
  ) {

    if (
      LittleFS.exists(
        filesToRemove[i]
      ) &&
      !LittleFS.remove(
        filesToRemove[i]
      )
    ) {

      filesCleared = false;
    }
  }

  if (!filesCleared) {

    Serial.println(
      "WARNING: Sensor cleared but local storage cleanup was incomplete."
    );

    lcdMsg(
      "Clear Partial",
      "Check storage"
    );

    buzzFail();
    delay(2000);
    return;
  }

  Serial.println(
    "EVERYTHING CLEARED."
  );

  lcdMsg(
    "Database Empty",
    "All cleared"
  );

  buzzSuccess();

  delay(1800);
}

// ============================================================
// SERIAL COMMANDS
// ============================================================

void showHelp() {

  Serial.println();

  Serial.println(
    "========== COMMANDS =========="
  );

  Serial.println(
    "R = Register new student"
  );

  Serial.println(
    "A = Confirm attendance is active"
  );

  Serial.println(
    "C = Clear EVERYTHING"
  );

  Serial.println(
    "H = Show help"
  );

  Serial.println(
    "=============================="
  );

  Serial.print(
    "Students registered: "
  );

  Serial.println(
    studentCount
  );
}

void handleSerialCommands() {

  if (
    !Serial.available()
  ) {

    return;
  }

  char command =
    Serial.read();

  clearSerial();

  if (
    command == 'R' ||
    command == 'r'
  ) {

    registerStudent();
  }

  else if (
    command == 'A' ||
    command == 'a'
  ) {

    lcdMsg(
      "Attendance Mode",
      "Place finger"
    );

    Serial.println(
      "Attendance is always active."
    );
  }

  else if (
    command == 'C' ||
    command == 'c'
  ) {

    clearEverything();
  }

  else if (
    command == 'H' ||
    command == 'h'
  ) {

    showHelp();
  }
}

// ============================================================
// ATTENDANCE
// ============================================================

void processAttendance(
  int fingerprintID
) {

  int index =
    findStudentIndexByFingerprint(
      fingerprintID
    );

  if (
    index < 0
  ) {

    Serial.println(
      "Fingerprint recognized, but no student record exists."
    );

    lcdMsg(
      "Unknown",
      "Fingerprint"
    );

    buzzFail();

    delay(1500);

    showIdleScreen(true);

    return;
  }

  Student& student =
    students[index];

  Serial.println();
  Serial.println(
    "========== ATTENDANCE =========="
  );

  Serial.print(
    "Fingerprint ID: "
  );

  Serial.println(
    fingerprintID
  );

  Serial.print(
    "Student ID: "
  );

  Serial.println(
    student.studentId
  );

  Serial.print(
    "Student Name: "
  );

  Serial.println(
    student.studentName
  );

  Serial.println(
    "Parent mobile is configured."
  );

  Serial.println(
    "================================"
  );

  lcdMsg(
    student.studentName,
    student.studentId
  );

  delay(500);

  OutboxEvent event =
    makeStudentEvent(
      'A',
      student,
      fingerprintID
    );

  if (!timeSynced) {

    lcdMsg(
      "Time unavailable",
      "Try again later"
    );

    buzzFail();
    delay(1500);
    return;
  }

  GoogleResult result =
    sendDeviceApiEvent(event);

  if (result == GOOGLE_RECORDED) {

    buzzSuccess();

    lcdMsg(
      "Attendance OK",
      "Scan recorded"
    );
  }
  else if (
    result ==
    GOOGLE_ALREADY_PRESENT
  ) {

    buzzSuccess();

    lcdMsg(
      "Already Present",
      "Daily limit/replay"
    );
  }
  else if (
    result ==
    GOOGLE_RETRYABLE_ERROR
  ) {

    bool queued =
      enqueueEvent(event);

    lcdMsg(
      queued
        ? "Offline"
        : "Not Recorded",
      queued
        ? "Attendance queued"
        : "Queue unavailable"
    );

    if (!queued) {
      buzzFail();
    }
  }
  else if (
    result ==
    GOOGLE_UNKNOWN_STUDENT
  ) {

    bool archived =
      archiveDeadLetter(event);

    lcdMsg(
      "Backend Missing",
      archived
        ? "Event archived"
        : "Check console"
    );

    buzzFail();
  }
  else if (
    result ==
    GOOGLE_AUTH_ERROR
  ) {

    archiveDeadLetter(event);

    lcdMsg(
      "Auth Failed",
      "Check config"
    );

    buzzFail();
  }
  else {

    archiveDeadLetter(event);

    lcdMsg(
      "Server Rejected",
      "Not recorded"
    );

    buzzFail();
  }

  delay(2200);

  showIdleScreen(true);
}

void maintainFingerRemoval() {

  if (!waitingForFingerRemoval) {
    return;
  }

  uint8_t result =
    finger.getImage();

  if (
    result ==
    FINGERPRINT_NOFINGER
  ) {

    waitingForFingerRemoval = false;

    Serial.println(
      "Finger removed; scanner re-armed."
    );

    showIdleScreen(true);
  }
}

// ============================================================
// SETUP
// ============================================================

void setup() {

  Serial.begin(
    115200
  );

  delay(500);

  // ----------------------------------------------------------
  // BUZZER
  // ----------------------------------------------------------

  pinMode(
    BUZZER_PIN,
    OUTPUT
  );

  // ----------------------------------------------------------
  // LCD
  // ----------------------------------------------------------

  Wire.begin(
    D2,
    D1
  );

  lcd.init();

  lcd.backlight();

  lcdMsg(
    "Attendance",
    "System Booting"
  );

  // ----------------------------------------------------------
  // FINGERPRINT
  // ----------------------------------------------------------

  mySerial.begin(
    57600
  );

  delay(1000);

  Serial.println();

  Serial.println(
    "Checking fingerprint sensor..."
  );

  if (
    !finger.verifyPassword()
  ) {

    Serial.println(
      "Fingerprint sensor NOT found!"
    );

    lcdMsg(
      "Sensor NOT",
      "found!"
    );

    sensorAvailable = false;
  }
  else {

    sensorAvailable = true;

    Serial.println(
      "Fingerprint sensor found!"
    );

    finger.getTemplateCount();

    Serial.print(
      "Sensor templates: "
    );

    Serial.println(
      finger.templateCount
    );
  }

  // ----------------------------------------------------------
  // LITTLEFS
  // ----------------------------------------------------------

  storageAvailable =
    LittleFS.begin();

  if (!storageAvailable) {

    Serial.println(
      "LittleFS mount failed. Automatic formatting is disabled."
    );

    lcdMsg(
      "Storage Error",
      "Data preserved"
    );

    delay(1800);
  }
  else {

    loadDatabase();
    queueLocalStudentSync();
  }

  // ----------------------------------------------------------
  // WIFI
  // ----------------------------------------------------------

  connectWiFi();

  // ----------------------------------------------------------
  // TIME
  // ----------------------------------------------------------

  setupTime();

  // ----------------------------------------------------------
  // READY
  // ----------------------------------------------------------

  Serial.println();

  Serial.println(
    "================================"
  );

  Serial.println(
    "          SYSTEM READY"
  );

  Serial.println(
    "================================"
  );

  Serial.println(
    "R = Register new student"
  );

  Serial.println(
    "A = Confirm attendance is active"
  );

  Serial.println(
    "C = Clear everything"
  );

  Serial.println(
    "H = Help"
  );

  Serial.println(
    "Place finger for attendance."
  );

  Serial.println(
    "================================"
  );

  showIdleScreen(true);
}

// ============================================================
// LOOP
// ============================================================

void loop() {

  // ----------------------------------------------------------
  // SERIAL COMMANDS
  // ----------------------------------------------------------

  handleSerialCommands();

  maintainWiFi();
  maintainTime();
  processOutbox();

  // ----------------------------------------------------------
  // IDLE LCD
  // ----------------------------------------------------------

  showIdleScreen();

  if (!sensorAvailable) {

    delay(100);
    return;
  }

  if (waitingForFingerRemoval) {

    maintainFingerRemoval();
    delay(50);
    return;
  }

  // ----------------------------------------------------------
  // FINGERPRINT
  // ----------------------------------------------------------

  int fingerprintID =
    getFingerprintID();

  if (
    fingerprintID >= 0 &&
    millis() - lastScanTime >
      SCAN_COOLDOWN_MS
  ) {

    lastScanTime =
      millis();

    processAttendance(
      fingerprintID
    );

    waitingForFingerRemoval = true;
  }

  delay(50);
}
