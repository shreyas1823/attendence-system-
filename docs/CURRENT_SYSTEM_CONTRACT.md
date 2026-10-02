# Current ESP8266 Google Apps Script and Google Sheets contract

## Scope

This document records the actual source-level contract recovered during Phase 0. It describes the current tracked firmware and the pasted deployed Apps Script. It does not claim that the live deployment manifest, trigger state, permissions, or workbook contents have been independently exported.

## System flow

```text
Fingerprint sensor
  -> ESP8266 resolves fingerprint against /students.txt
  -> HTTPS GET to Google Apps Script
  -> Apps Script authenticates a shared query parameter
  -> Apps Script writes Attendance sheet
```

Both `doGet(e)` and `doPost(e)` call the same handler. The existing ESP uses GET. POST requests are read through `e.parameter`; JSON request bodies are not parsed.

## Authentication

The client supplies `key` as a query-string parameter. Apps Script compares it directly with a configured shared key. The source-controlled Apps Script now reads the value from Script Properties, but the deployed script must be configured manually before any future deployment.

This is a legacy shared-secret contract, not per-device authentication. It has no nonce, request signature, timestamp validation, device identity, or replay protection.

The verified manifest declares `webapp.access` as `ANYONE_ANONYMOUS` and `webapp.executeAs` as `USER_DEPLOYING`. The endpoint is therefore publicly reachable and performs spreadsheet operations with the deploying user's authority after the handler accepts the shared query key.

## Attendance request

The firmware sends these parameters:

| Parameter | Required by script | Sent by current firmware | Meaning |
| --- | --- | --- | --- |
| `key` | Yes | Yes | Shared request key |
| `fingerprintId` | Yes | Yes | Sensor template ID |
| `studentId` | Yes | Yes | Institutional student identifier |
| `studentName` | No; defaults to `Unknown` | Yes | Display name |
| `parentWhatsApp` | No | No | Optional parent number |

The current firmware does not send an action, event ID, device ID, attendance date, timestamp, status, or firmware version. Apps Script uses its own current time formatted for `Asia/Kolkata`.

## Registration request

There is no registration API or request behavior in the current Apps Script. Firmware registration writes only the fingerprint sensor and LittleFS. It does not call Apps Script.

Every accepted Apps Script request is treated as attendance. Attempting to reuse the current handler for registration would create or update an Attendance row and write today's timestamp, violating the PRD separation between registration and attendance.

## Attendance sheet

Apps Script creates `Attendance` if absent. Its fixed columns are:

| Column | Header |
| --- | --- |
| A | Fingerprint ID |
| B | Student ID |
| C | Student Name |
| D | Mobile Number |
| E | Status |
| F onward | One `dd/MM/yyyy` column per attendance date |

Rows are matched by case-insensitive Student ID. A new Student ID creates a new row with `Present`. Existing rows have fingerprint ID and name overwritten; mobile is overwritten only when a non-empty value is supplied.

Rows are sorted by Student ID after attendance changes.

## Duplicate attendance behavior

If today's date cell already has a displayed value, Apps Script leaves the first timestamp unchanged, sets the row-level Status to `Present`, and returns JSON status `already_present`.

If the cell is blank, Apps Script writes the current `HH:mm:ss`, sets row-level Status to `Present`, and returns JSON status `success`.

There is no `LockService` or transactional constraint. Concurrent requests can race while creating rows/date columns or checking/writing a timestamp. Duplicate protection is therefore best-effort, not concurrency-safe.

## Response and error behavior

All results are JSON produced by `ContentService`. The script does not deliberately set distinct HTTP status codes. Authentication, validation, and runtime failures therefore normally return a JSON error body while still appearing as an HTTP-successful web-app response.

The firmware ignores the JSON status and treats HTTP 200 or 302 as success. Consequently, it cannot distinguish recorded attendance, duplicate attendance, invalid authentication, validation failure, or an Apps Script exception.

The script returns raw `err.toString()` content on exceptions. This may expose implementation details.

## Students sheet

Apps Script creates `Students` with Fingerprint ID, Student ID, Student Name, and Mobile Number columns. No current request handler writes to this sheet. It is therefore not synchronized by registration or attendance code.

## Settings sheet

Apps Script creates `Settings` containing `Cutoff Time = 12:00` and `Timezone = Asia/Kolkata`. The script never reads these values. Runtime timezone and trigger hour are hard-coded separately.

## Date columns

Dates use `dd/MM/yyyy`. The script scans existing headers and adds a new rightmost column when today is absent. This operation is not protected by a script lock, so concurrent first requests of the day can create duplicate date columns.

The header search begins at column E even though date columns begin at F. This is currently harmless because column E contains `Status`, but it is an off-by-one contract defect.

## Absence behavior

`markAbsenteesForToday()` reads every non-empty Student ID from the Students sheet, ensures an Attendance row exists, and sets the single row-level Status to `Absent` when today's attendance cell is blank. It does not put an `Absent` marker in the date cell.

Limitations:

- Students is not populated by current registration, so never-scanned students are not automatically available.
- Historical per-day absence is represented only by a blank date cell, not an explicit dated status.
- Settings values are ignored.
- Trigger time is hard-coded with `.atHour(12)`.
- Actual trigger timezone depends on the missing Apps Script project manifest/settings.
- Holidays, weekends, leave, inactive students, and class schedules are unsupported.

`setupDailyAbsenceTrigger()` deletes existing triggers for the same handler and creates one daily trigger. Whether it has been run in the deployed project is not verifiable from the pasted source.

## Verified project manifest

- Runtime: V8, consistent with the script's `const`/`let` syntax
- Project timezone: `Asia/Kolkata`, consistent with the code constant
- Exception logging: Stackdriver
- Dependencies: none, consistent with the lack of library references
- OAuth scopes: implicit/auto-detected because no explicit `oauthScopes` array is present
- Web app: executes as the deploying user and permits anonymous access

The source uses `SpreadsheetApp`, `ScriptApp`, `PropertiesService`, `Utilities`, and `ContentService`; Apps Script will infer required scopes. Installed time-based triggers and deployment history remain external project state rather than manifest content.

## Confirmed mismatches with the PRD

- Registration is not a cloud master-data transaction.
- Students is not synchronized.
- Parent number is stored locally but omitted from requests.
- Response code `success` differs from required `recorded_first_scan`.
- No structured retryable/permanent error classification exists.
- No stable event ID or idempotency receipt exists.
- No device authentication or heartbeat exists.
- Duplicate handling is not concurrency-safe.
- Settings are display-only defaults rather than active configuration.
- Absence is incomplete and not historically normalized.
- Google Sheets remains the only remote record store.
