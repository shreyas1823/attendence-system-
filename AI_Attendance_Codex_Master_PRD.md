# AI Fingerprint Attendance System - Master Product Requirements Document

Version 1.0 | 19 September 2026

Implementation blueprint for Codex covering firmware, Google Sheets, cloud storage, backend, Meta WhatsApp Business messaging, website, dashboard, reports, security, testing, and deployment.

## How to use this document

Give this document to Codex together with the actual repository/project files. Codex should inspect first, then implement in phases, test after every phase, and never invent credentials or change the locked hardware wiring.

## 1. Executive summary

Build a complete biometric attendance platform around the existing ESP8266 fingerprint device. Keep the soldered hardware stable, while evolving the working Google Apps Script + Google Sheets pipeline into a cloud-backed attendance system with a secure backend, Meta WhatsApp messaging, and a web-based admin dashboard.

Core separation: ESP8266 = edge device and biometric UX; backend = business rules, source of truth and integrations; cloud DB = durable records; website = administration; Google Sheets = operational/reporting mirror; Meta = outbound parent notifications.

## 2. Product vision and goals

The final experience is: enroll once -> scan fingerprint -> record first attendance of the day -> optionally notify parent through official college WhatsApp -> dashboard updates immediately -> absent students derived at cutoff -> reports available.

- Registration is master data, not attendance.
- First scan of the day is canonical and immutable unless an authorized correction is made.
- Students, attendance, devices, notifications, settings, and audit events persist in cloud storage.
- Google Sheets remains synchronized.
- Meta WhatsApp is backend-only.
- The website provides administration, reports and monitoring.
- The system is observable, idempotent and recoverable.

## 3. Non-goals and hard constraints

- Do not change the soldered hardware mapping.
- Do not introduce unrelated project code, URLs, APIs, databases, or names.
- Do not place Meta passwords/tokens or database admin credentials in firmware/frontend.
- Do not expose secrets in logs.
- Do not conflate registration with attendance.
- Use complete, reviewable file changes and test after each phase.

| Component | Locked configuration |
| --- | --- |
| Fingerprint | SoftwareSerial: D5 RX, D6 TX; sensor UART 57600 |
| LCD | 16x2 I2C at 0x27; Wire.begin(D2, D1) |
| Buzzer | D0 |
| Board | NodeMCU 1.0 ESP-12E |
| Arduino IDE | 2.3.10 |
| Serial | 115200 |

## 4. Current system: what already works

| Area | Baseline | Instruction |
| --- | --- | --- |
| Enrollment | R command, two scans, create/store model, local DB | Preserve; harden transient errors/timeouts |
| Local DB | LittleFS /students.txt, pipe-separated, MAX_STUDENTS 30 | Preserve/migrate safely |
| Attendance | Fingerprint ID -> student -> attendance payload | Make cloud/backend event canonical |
| Google | HTTP 302 from web app and sheet rows appear | Preserve working path during migration |
| Workbook | Attendance, Students, Settings | Keep as operational mirror |
| Wi-Fi | Works and receives IP | Use bounded connect/reconnect logic |

## 5. Locked firmware contract

- Local student fields: fingerprintID, studentId, studentName, parentWhatsApp.
- Commands: R registration, C + YES clear, H help, attendance as default.
- Registration #2/#3/#4 must coexist.
- Fingerprint packet error code 1 must not create infinite waits.
- Wi-Fi and HTTP must have bounded timeouts.
- Use stable event IDs for offline retries.

## 6. Current Google Sheets backend

| Sheet | Purpose |
| --- | --- |
| Attendance | Human-readable attendance register |
| Students | Master student database |
| Settings | Cutoff/timezone configuration mirror |

Attendance columns: Fingerprint ID | Student ID | Student Name | Mobile Number | Status | one date column per day.

- Current Apps Script validates a shared request key.
- It creates/gets the three sheets.
- It accepts optional parentWhatsApp.
- It creates rows for new students and prevents same-day duplicate timestamps.
- Known bug: current ESP logging call does not pass parentWhatsApp, so Mobile Number is blank.
- Known missing feature: successful ESP registrations are not yet synced into Students master data.

## 7. Target architecture

```text
ESP8266 -> HTTPS Backend API -> Cloud Database (source of truth)
                           -> Google Sheets sync
                           -> Meta WhatsApp Cloud API
                           -> Scheduler / absence jobs
                           -> Web Admin Dashboard
```

| Layer | Owns | Must not own |
| --- | --- | --- |
| ESP8266 | Fingerprint, local cache, device UX, event emission | Meta tokens, DB admin credentials, website rules |
| Backend | Auth, validation, business rules, idempotency, messaging, cloud writes | Physical sensor handling |
| Cloud DB | Students, attendance, devices, notifications, settings, audit | UI |
| Google Sheets | Operational mirror/export | Security-critical provider secrets |
| Website | Admin/operator UX | Direct secret storage |

## 8. Functional requirements

**FR-01 - Student registration:** Operator can create a student with fingerprint ID, Student ID, name, and parent WhatsApp number. Registration must not write an attendance timestamp.

**FR-02 - Duplicate student prevention:** Student ID must be unique. Fingerprint ID must be unique among active enrolled templates.

**FR-03 - Master sync:** A successful registration must be reflected in local cache and cloud Students data; if cloud sync fails, the system must mark the sync state and retry rather than claim success.

**FR-04 - Attendance scan:** A recognized fingerprint creates an attendance event for the current local/authoritative calendar day.

**FR-05 - Daily uniqueness:** Only the first valid attendance event for a student on a date becomes the canonical first-scan timestamp. Later scans do not overwrite it.

**FR-06 - Notification:** A first successful attendance event may trigger a WhatsApp notification if messaging is enabled and recipient/template configuration is valid.

**FR-07 - Notification logging:** Every send attempt has a status: queued, sent/accepted, failed, retrying, or permanently failed, plus provider response metadata without storing sensitive tokens.

**FR-08 - Absence:** At cutoff, active students with no attendance for the date are marked Absent.

**FR-09 - Dashboard:** Admin can view today's totals and history, filter by student/date/status, and inspect individual student history.

**FR-10 - Reports:** Admin can export attendance by date range, student, or class/group as CSV and PDF where practical.

**FR-11 - Device health:** Dashboard shows online/offline/last-seen/last-event status for registered attendance devices.

**FR-12 - Settings:** Admin can configure timezone, daily cutoff, notification enablement, template identifiers, and device display settings, subject to role permissions.

**FR-13 - Audit:** Important mutations are auditable: enrollment, student update, manual attendance correction, absence run, notification configuration change.

**FR-14 - Manual correction:** Authorized admin can correct attendance with a reason; the original event should remain auditable rather than being silently deleted.

**FR-15 - Offline resilience:** If backend is unavailable, the ESP may cache unsent events locally and retry safely; duplicate retries must not create duplicate attendance.

## 9. Data model

| Entity | Core fields |
| --- | --- |
| Students | studentId, fingerprintId, name, parentWhatsApp, active, createdAt, updatedAt |
| Attendance | eventId, studentId, fingerprintId, deviceId, attendanceDate, firstScanTime, status, receivedAt, deviceTimestamp, source, correctionReason |
| Notifications | notificationId, studentId, parentWhatsApp, type, templateId/name, variables, providerMessageId, status, errorCode/message, timestamps |
| Devices | deviceId, name, enabled, lastSeenAt, lastFingerprintAt, firmwareVersion, ipAddress, wifiRssi |
| Audit | actor, action, target, timestamp, before/after metadata |

## 10. APIs and integration contracts

```text
POST /api/v1/devices/registration
POST /api/v1/attendance/events
POST /api/v1/devices/heartbeat
GET/POST/PATCH /api/v1/students
GET /api/v1/attendance
GET /api/v1/notifications
GET /api/v1/devices
GET/PATCH /api/v1/settings
```

## 11. Registration flow

1. Enroll fingerprint using existing two-scan flow.
2. Write local student record.
3. Sync master student record to backend/cloud.
4. Upsert by Student ID with uniqueness constraints.
5. Mirror to Google Students.
6. Return success only after persistence is confirmed.
7. Never create attendance timestamp from registration.

## 12. Attendance flow

1. Fingerprint match.
2. Resolve student.
3. Send stable event ID to backend.
4. Backend authenticates device and validates student.
5. Check student/date uniqueness.
6. Create first-scan attendance if none exists.
7. Queue/dispatch WhatsApp if enabled.
8. Sync Google Sheets.
9. Return recorded_first_scan or already_present.

## 13. Absence and cutoff

1. At cutoff, select active students.
2. Find attendance for that date.
3. Leave Present intact.
4. Mark missing students Absent.
5. Mirror status to Google Sheets.
6. Make the job idempotent.

Default timezone is Asia/Kolkata; current cutoff design is 12:00, but both must be configurable.

## 14. Meta WhatsApp Business plan

Human college/admin work is required for Meta Business/WABA/phone/template setup. Codex implements the software integration around the resulting identifiers; it must not invent credentials or embed them in firmware.

1. College admin prepares Meta Business portfolio and WhatsApp Business Account.
2. College admin completes the required business/phone setup and verification steps shown in Meta.
3. College admin prepares/gets approval for the attendance message template.
4. College admin supplies the backend-required identifiers and credential material through secure configuration.
5. Backend sends approved template messages.
6. Backend logs status, retries transient failures, and exposes notification history.

Before implementing provider request details, Codex must verify the current official Meta WhatsApp Cloud API documentation and account requirements instead of copying old tutorials.

## 15. Cloud data storage

Keep Google Sheets working as an operational mirror, but move durable source-of-truth state to a managed cloud database behind the backend.

1. Preserve current Apps Script.
2. Build backend + schema.
3. Migrate current Students/Attendance.
4. Add backend -> Sheets sync.
5. Reconcile counts.
6. Switch ESP to backend after tests.
7. Keep rollback path temporarily.

## 16. Website and dashboard

| Page | Required content |
| --- | --- |
| Login | Authentication/session |
| Dashboard | Today present/absent, active students, rate, recent scans, device health, notification summary |
| Students | Search/filter/add/edit/activate/deactivate, fingerprint ID, student ID, parent WhatsApp |
| Student detail | Profile + history + notifications + audit |
| Attendance | Daily/date-range filters, status filters, manual correction |
| Reports | CSV and PDF/print-friendly exports |
| Notifications | Status, failures, retry, test send/config metadata |
| Devices | Online/offline, last seen, firmware, IP, RSSI, last scan |
| Settings | Timezone, cutoff, notifications, templates, institution label |
| Audit | Who changed what and when |

Roles: Admin, Operator/Teacher, Viewer. RBAC must be enforced server-side.

## 17. Reports and analytics

- Daily attendance report.
- Monthly student grid.
- Student attendance history.
- Notification report.
- Device report.
- CSV export and PDF/print-friendly output.
- Dashboard cards and 7/30-day trend charts.

## 18. Security and secrets

Any real credential previously pasted/shared should be considered exposed and rotated/revoked before production. Use .env locally, managed secret stores in deployment, and placeholders in source control.

- No Meta passwords/tokens in firmware.
- No DB admin credentials in frontend.
- Use HTTPS.
- Per-device auth where practical.
- Rate limit APIs.
- Sanitize provider errors.
- Audit privileged changes.
- Never log secrets.

## 19. Reliability and idempotency

| Failure | Expected behavior |
| --- | --- |
| Sensor packet error | Retry/timeout, no infinite loop |
| Wi-Fi down | Offline state + bounded reconnect + optional local queue |
| Backend timeout/5xx | Retry stable event |
| Duplicate scan | already_present; preserve first time |
| Sheets down | Cloud record remains valid; sync later |
| Meta down | Attendance remains valid; notification marked failed/retry |
| Scheduler rerun | No duplicate/incorrect absence changes |

## 20. Testing and acceptance

- Register four students consecutively.
- Restart and verify local data.
- Scan attendance twice; first timestamp remains.
- Test Wi-Fi timeout/reconnect.
- Test sensor transient error.
- Test backend duplicate/replay.
- Test absence rerun.
- Test dashboard filters and reports.
- Test notification failure without rolling back attendance.
- Perform one real-device end-to-end test.

## 21. Deployment and DevOps

```text
APP_ENV=
PORT=
DATABASE_URL=
JWT_SECRET=
DEVICE_API_KEY_OR_SECRET=
GOOGLE_SHEETS_WEB_APP_URL=
GOOGLE_SHEETS_SHARED_KEY=
META_WABA_ID=
META_PHONE_NUMBER_ID=
META_ACCESS_TOKEN=
META_API_VERSION=
META_TEMPLATE_NAME=
META_TEMPLATE_LANGUAGE=
TIMEZONE=Asia/Kolkata
ATTENDANCE_CUTOFF=12:00
```

- Local, staging, production environments.
- CI lint/test/build.
- Firmware compile check.
- Migration checks.
- Protected production secrets.

## 22. Codex execution plan

- Phase 0: backup and inventory.
- Phase 1: fix current ESP + Apps Script bugs.
- Phase 2: backend + cloud database + sync + absence.
- Phase 3: Meta WhatsApp integration.
- Phase 4: website/dashboard.
- Phase 5: hardening, reconciliation, deployment, handover.

Use small reviewable phases and test each phase. Codex is intended for complex refactors and end-to-end engineering work; use the real project files and keep human approval around production credentials/deployments.

## 23. Definition of done

- Four consecutive registrations work and sync to Students without attendance timestamps.
- One canonical attendance per student/day.
- Mobile number available to notification logic.
- Absence after cutoff.
- Meta notification service backend-only.
- Cloud database source of truth.
- Google Sheets synchronized.
- Dashboard complete.
- RBAC + audit.
- Secrets externalized.
- Firmware remains hardware-compatible.
- Automated + real-device tests pass.

## 24. Future extensions

- Multiple devices.
- Class/semester/group data.
- Late/half-day/leave rules.
- Parent preferences.
- More approved WhatsApp templates.
- Automated monthly reports.
- Device remote config/firmware strategy.
- Retention/archival policies.

## Appendix A - Master Codex prompt

```text
You are the lead engineer responsible for completing the AI Fingerprint Attendance System described in the attached Master PRD.

MISSION
Build the system end-to-end without breaking the currently working fingerprint attendance device. Work from the actual repository/files. Do not rely on screenshots when the source code can be inspected.

NON-NEGOTIABLE CONSTRAINTS
1. Preserve the locked hardware wiring:
   - Fingerprint: ESP D5 RX, D6 TX, SoftwareSerial, sensor 57600
   - LCD: 16x2 I2C address 0x27, Wire.begin(D2, D1)
   - Buzzer: D0
   - Board: NodeMCU 1.0 ESP-12E
2. Do not rewire hardware.
3. Do not introduce unrelated project code, URLs, APIs, databases, or names.
4. Do not put Meta/Facebook passwords, permanent Meta access tokens, database admin credentials, or other production secrets in ESP firmware or frontend bundles.
5. Use placeholders in examples and environment variables/secret stores for real credentials.
6. Do not expose secrets in logs.
7. Registration and attendance are separate transactions.
8. First attendance scan per student per calendar day is canonical. Duplicate scans must never overwrite the first timestamp.
9. Maintain backward compatibility with the current LittleFS /students.txt format or provide safe migration.
10. Preserve the working Google Apps Script + Google Sheets integration while implementing the new cloud/backend architecture.

CURRENT BASELINE TO PRESERVE
- Fingerprint enrollment via serial command R, including two scans and storeModel.
- Clear via C + YES.
- Help via H.
- LittleFS local student DB, MAX_STUDENTS 30.
- Wi-Fi and NTP with bounded timeouts; never infinite wait loops.
- LCD idle rotation and scan feedback.
- Google Apps Script currently returns HTTP 302 and the Attendance sheet receives rows.
- Google workbook contains Attendance, Students, and Settings sheets.

PHASE 1: FIX CURRENT CODE FIRST
A. Pass parentWhatsApp/mobile from ESP to Apps Script so Mobile Number is populated.
B. On successful registration, sync the new student to the cloud/Students master list.
C. Registration #2/#3/#4 must create independent student records; never overwrite earlier students.
D. Registration must never create an attendance timestamp.
E. Duplicate attendance same day must keep the first timestamp.
F. Make Wi-Fi, fingerprint and HTTP operations bounded, retryable, and non-blocking where practical.
G. Add structured response handling so the ESP distinguishes recorded_first_scan, already_present, unknown_student, retryable_error, and permanent_error.
H. Add tests for four registrations, duplicate attendance, reboot persistence, and transient sensor/network failures.

PHASE 2: BACKEND + CLOUD DATABASE
Choose a maintainable production-appropriate backend stack based on the repository and deployment environment. Prefer a boring, well-supported stack over unnecessary complexity.
Implement:
- authenticated device API
- student CRUD/master data
- attendance event API
- idempotency / unique date constraint
- device heartbeat
- scheduled absence job
- notification service abstraction
- Google Sheets synchronization
- audit log
- migrations/schema
- environment-driven configuration

DATA REQUIREMENTS
Students: studentId, fingerprintId, name, parentWhatsApp, active, createdAt, updatedAt.
Attendance: eventId, studentId, fingerprintId, deviceId, attendanceDate, firstScanTime, status, receivedAt, deviceTimestamp, source, correctionReason.
Notifications: notificationId, studentId, parentWhatsApp, type, templateName/templateId, variables, providerMessageId, status, errorCode/errorMessage, createdAt, sentAt.
Devices: deviceId, name, enabled, lastSeenAt, lastFingerprintAt, firmwareVersion, ipAddress, wifiRssi.
Audit: actor, action, target, timestamp, before/after metadata where appropriate.

PHASE 3: META WHATSAPP BUSINESS INTEGRATION
Before writing the provider request code, verify the current official Meta WhatsApp Cloud API documentation and the current API requirements for the college account.
Do NOT ask for or store a Facebook password.
Expect the human administrator to provide/configure the required business identifiers, WhatsApp phone number identifier, approved message template information, language, API version, and secret/token through secure environment configuration.
Implement:
- Meta client service
- approved template sending
- timeout/retry/backoff
- provider response parsing
- notification log
- safe test-send endpoint
- enable/disable setting
Never make attendance depend on WhatsApp success. Attendance is valid even if WhatsApp fails.

PHASE 4: WEBSITE + DASHBOARD
Build a responsive admin/operator dashboard with:
- login/logout
- RBAC: Admin, Operator/Teacher, Viewer
- dashboard overview
- student list/search/filter/create/edit/activate/deactivate
- student detail + history
- attendance daily and date-range view
- manual correction with required reason and audit
- reports + CSV/PDF-friendly output
- notification history and retry
- device health/status
- settings: timezone, cutoff, notification enablement, template configuration
- audit log

UI PRINCIPLES
Keep the UI clean and professional. Prioritize today's attendance, clear table data, search/filter, and operational status. Do not put secrets in client-side code.

PHASE 5: RELIABILITY
Implement safe offline/retry behavior on the ESP where feasible. Every queued event needs a stable ID. Backend must be idempotent. Google Sheets and Meta are downstream systems; their failures must not roll back the canonical attendance record.

TESTING
Run:
- firmware compile with locked Arduino/ESP8266 configuration
- backend unit/integration tests
- database migration checks
- API contract tests
- frontend build/type/lint tests
- end-to-end tests for registration -> Students -> attendance -> notification -> dashboard
- failure tests for duplicate, offline, provider error, sheet error, scheduler rerun

CODING RULES
- Inspect first. Plan second. Edit third.
- Prefer small, reviewable commits/patches.
- After each phase, run tests and report exactly what passed/failed.
- Do not silently change hardware pins or data formats.
- Do not delete working code just because a rewrite is easier.
- Preserve existing behavior where it is not in conflict with the PRD.

FINAL OUTPUT REQUIRED
1. List every file changed/created.
2. Explain the final architecture.
3. Provide exact run/build/test commands.
4. Provide environment-variable template with placeholders only.
5. Provide database migration/setup steps.
6. Provide Meta configuration steps that must be done by a human admin.
7. Provide firmware upload settings.
8. Provide an end-to-end verification checklist.
9. State any remaining manual steps or blockers.
10. Do not claim success for a component that was not actually tested.
```

## Appendix B - Suggested repository structure

```text
attendance-system/
├─ firmware/
├─ backend/
├─ web/
├─ integrations/google-apps-script/
├─ scripts/
├─ docs/
├─ .gitignore
├─ README.md
└─ PRD_AI_Attendance_Codex_Master.md
```

## Appendix C - Configuration checklist

| Item | Owner | Status |
| --- | --- | --- |
| Hardware/wiring | Developer | LOCKED |
| Firmware baseline | Developer/Codex | WORKING |
| Apps Script | Developer/Codex | WORKING |
| Google Sheets | Admin/Developer | READY |
| Cloud DB | Developer/Codex | TO BUILD |
| Backend host | Developer/Codex | TO BUILD |
| Meta Business/WABA | College admin | TO CONFIGURE |
| WhatsApp sender | College admin | TO CONFIGURE |
| Approved template | College admin | TO CONFIGURE |
| Meta secrets | Admin/Developer | TO CONFIGURE |
| Website domain | Admin/Developer | TO CONFIGURE |
| Admin accounts | Admin | TO CONFIGURE |

## Appendix D - Demo checklist

1. Register student.
2. Verify Students master row.
3. Scan -> Present.
4. Scan again -> Already Present.
5. Register a second student.
6. Open dashboard.
7. Show student detail/history.
8. Show notification status.
9. Show Google Sheets mirror.
10. Run/show absence logic.
11. Show device health.
