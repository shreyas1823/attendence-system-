# Phase 1 legacy Google contract

## Scope

This is the migration-ready contract implemented in source during Phase 1. It is not active in production until the Apps Script is deployed and the firmware is deliberately uploaded after controlled testing.

## Transport

New firmware sends `application/x-www-form-urlencoded` POST requests to the existing Apps Script web-app URL. The legacy GET handler remains available for deployment-order compatibility.

Common fields:

| Field | Purpose |
| --- | --- |
| `key` | Existing shared request credential |
| `action` | `register`, `attendance`, or `health` |
| `eventId` | Stable identifier reused for offline retries |
| `fingerprintId` | Sensor template ID |
| `studentId` | Institutional Student ID |
| `studentName` | Student display name |
| `parentWhatsApp` | Canonical E.164 mobile number |
| `attendanceDate` | Device-observed date for diagnostics |
| `attendanceTime` | Device-observed time for diagnostics |
| `status` | Present for an attendance scan |

Apps Script remains authoritative for the attendance date/time and formats it in Asia/Kolkata. Device date/time is not trusted for canonical sheet placement.

## Response envelope

```json
{
  "ok": true,
  "code": "recorded_first_scan",
  "message": "Attendance recorded",
  "requestId": "stable-event-id",
  "retryable": false,
  "data": {}
}
```

Implemented codes:

- `registered`
- `already_registered`
- `recorded_first_scan`
- `already_present`
- `healthy`
- `authentication_failed`
- `invalid_action`
- `invalid_request`
- `invalid_fingerprint_id`
- `invalid_student_id`
- `invalid_student_name`
- `invalid_phone`
- `duplicate_student_id`
- `duplicate_fingerprint_id`
- `unknown_student`
- `student_fingerprint_mismatch`
- `busy_retry`
- `server_configuration_error`
- `server_error`

Because Apps Script ContentService does not provide the same status-code control as a conventional backend, firmware must inspect the JSON `code`; HTTP success alone is insufficient.

## Registration

`action=register` validates all four student fields, locks the script, and writes only the Students sheet. It never creates an Attendance row or date timestamp.

Student IDs and fingerprint IDs are unique. Replaying the same Student ID and fingerprint ID updates name/mobile master data and returns `already_registered`. The same Student ID with a different fingerprint returns `duplicate_student_id`.

## Attendance

`action=attendance` requires a matching Students record. Apps Script loads the canonical name/mobile from Students, updates or creates one Attendance row, and writes the first timestamp only when today's cell is blank.

The script lock serializes registration, date-column creation, student-row creation, and first-scan checks. Sequential or simultaneous repeat scans preserve the first time and return `already_present`.

## Legacy deployment compatibility

A request with no `action` is treated as a legacy attendance request. If its Student ID is not yet in Students, Apps Script may bootstrap a Students row from the legacy parameters before recording attendance. This prevents an Apps Script-first deployment from silently breaking the currently deployed firmware.

Explicit Phase 1 attendance requests never bootstrap missing students; they return `unknown_student` so registration remains a distinct operation.

## Offline queue

The firmware stores versioned records in `/attendance_outbox_v1.txt`. Registration and attendance operations retain their original event ID across retries. One event is retried per bounded interval. After the maximum retry count, or after a permanent rejection, the record moves to `/attendance_outbox_dead_v1.txt` for reconciliation.

The existing `/students.txt` format remains readable and is not replaced.

