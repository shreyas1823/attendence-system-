# Attendance system migration baseline

## What works today

- ESP8266 uses the locked sensor, LCD, and buzzer wiring.
- Fingerprints can be enrolled with two scans.
- Students persist locally in `/students.txt`.
- Fingerprints resolve to local student records.
- Attendance requests reach Google Apps Script.
- Attendance rows/date columns can be created.
- The first daily timestamp is preserved during ordinary sequential duplicate scans.
- LCD and buzzer provide operator feedback.

Live hardware, deployed manifest, trigger state, and workbook contents still require independent revalidation.

## What must remain unchanged

- D5/D6 fingerprint wiring
- D2/D1 LCD wiring and address `0x27`
- D0 buzzer
- Fingerprint baud 57600 and Serial 115200
- Existing fingerprint templates and `/students.txt` compatibility
- `R`, `C + YES`, and `H` workflows
- Google Sheets path until a tested equivalent exists
- First daily timestamp semantics

## What will eventually migrate

- Student master data to a cloud database
- Attendance authority to a transactional backend/database
- Google Sheets to an operational mirror
- Shared-key authentication to per-device credentials
- Absence to an idempotent scheduled record
- Notifications to a backend-only Meta worker
- Administration and reporting to an authenticated dashboard

## Tests before migration

Before legacy fixes: compile the config-only sketch, register four students, reboot and verify persistence, verify attendance and duplicate behavior, export the Apps Script manifest/trigger configuration, and back up the workbook.

Before backend cutover: test registration synchronization, concurrent duplicate attendance, offline replay, database migration/reconciliation, Google outage recovery, and staging hardware end to end.

Before Meta: test an approved template with an authorized recipient, failure/retry isolation, and webhook verification.

Before production: rotate credentials, capture backups and firmware binaries, run CI/migrations/security tests, and perform a recovery drill.

## Rollback strategy

- Preserve the original audited hash and a known-good device binary.
- Keep the legacy Apps Script deployment active during cutover.
- Never automatically send one event to both legacy and new endpoints.
- Back up PostgreSQL and Sheets before migration.
- If cutover fails, stop the new writer, restore the previous endpoint configuration, and reconcile queued events.
- Google or Meta failure must never invalidate canonical attendance.

## Phase boundaries

Phase 0 establishes source control, safe configuration boundaries, recovered source, and documentation. It does not deploy, alter spreadsheet data, build the backend, enable Meta, or implement dashboard behavior.

