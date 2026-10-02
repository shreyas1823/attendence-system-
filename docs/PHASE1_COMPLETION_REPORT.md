# Phase 1 completion report

## Status

Phase 1 is complete in source and offline verification only. It is not active in production. No firmware was uploaded, no Apps Script deployment was changed, no trigger was changed, and no live spreadsheet was read or modified.

## 1. Files changed

- `Attendance/Attendance.ino`: registration sync, structured POST client, persistent retry outbox, duplicate-scan suppression, safer persistence and recovery, bounded waits, and explicit error states. Hardware assignments remain unchanged.
- `Attendance/config.h`: non-secret timeouts, retry limits, device/timezone labels, and an explicit temporary legacy TLS compatibility switch.
- `Attendance/README.md`: Phase 1 behavior, dependencies, commands, and compile evidence.
- `integrations/google-apps-script/Code.gs`: request routing, validation, locking, registration and attendance contracts, structured responses, settings use, and absence handling.
- `integrations/google-apps-script/README.md`: current source/deployment distinction.
- `README.md`: repository state and Phase 1 boundary.

## 2. Files created

- `tests/apps-script.test.js`: mocked Apps Script contract tests.
- `tests/firmware-static.test.ps1`: locked hardware, secret-boundary, transport, and source-integrity checks.
- `docs/PHASE1_LEGACY_CONTRACT.md`: request, response, data, compatibility, and outbox contract.
- `docs/PHASE1_DEPLOYMENT_AND_ROLLBACK.md`: staged activation and recovery procedure.
- `docs/PHASE1_COMPLETION_REPORT.md`: this evidence and approval record.

## 3. Firmware changes

- Preserves D5/D6 fingerprint serial at 57600 baud, D2/D1 LCD at address `0x27`, D0 buzzer, and 115200 debug serial.
- Preserves `/students.txt` compatibility and normalizes historical `whatsapp:`-prefixed phone records when loaded.
- Rejects oversized or delimiter-containing registration values instead of silently truncating them.
- Checks duplicate Student IDs locally and handles transient fingerprint-sensor communication errors separately from a free template slot.
- Rolls back a newly enrolled sensor template if the local student database cannot be committed.
- Writes local database and outbox updates through temporary/backup files and attempts recovery from backup.
- Sends form-encoded POST requests and interprets JSON response codes instead of treating every HTTP success as attendance success.
- Stores stable event IDs with registration/attendance records in a bounded persistent outbox and dead-letters exhausted or permanently rejected events.
- Avoids duplicate boot-time registration queue entries already pending for the same Student ID/fingerprint pair.
- Requires finger removal before another scan, preventing a held finger from producing repeated requests.
- Shows distinct recorded, already-present, offline/pending, authentication, unknown-student, and rejection outcomes.
- Continues in a limited state after storage or fingerprint-sensor initialization failure; it does not auto-format LittleFS.

## 4. Apps Script changes

- Loads `SPREADSHEET_ID` and `SECRET_KEY` from Script Properties.
- Supports `register`, `attendance`, and `health`, with legacy requests lacking `action` retained during migration.
- Returns a consistent JSON envelope with `ok`, `code`, `message`, `requestId`, `retryable`, and `data`.
- Serializes sheet mutation through `LockService`.
- Validates fingerprint ID, Student ID, name, and E.164 phone values.
- Enforces unique Student ID and fingerprint mappings; an identical mapping is idempotent and may refresh name/mobile.
- Keeps registration out of Attendance and uses Students as canonical identity/mobile data during explicit attendance.
- Preserves the first timestamp in a date column and returns `already_present` on repeats.
- Uses the Settings timezone for attendance and absence processing, with `Asia/Kolkata` as the fallback.
- Retains the existing Attendance, Students, and Settings sheet names and column layouts.
- Does not expose raw exception details in client responses.

## 5. Data contract

The authoritative Phase 1 contract is `docs/PHASE1_LEGACY_CONTRACT.md`. Student identity remains fingerprint ID, Student ID, name, and E.164 mobile. Registration writes Students only. Attendance copies canonical student fields to Attendance, sets status, and writes only the first time for the Apps Script-derived local date.

## 6. Security changes

- Real Wi-Fi, request-key, spreadsheet, and deployment values remain outside tracked source.
- The shared key moves in the POST body rather than the URL for Phase 1 firmware requests, reducing URL/log exposure.
- Client-visible error responses are generic; request IDs support correlation without echoing secrets.
- Serial logging does not print credentials, full phone numbers, request payloads, or response bodies.
- Registration and attendance mutations require the shared key and acquire a script lock.

Remaining security debt: the anonymous web-app deployment and shared-secret authentication are legacy constraints, not the final security architecture. Firmware TLS verification also remains explicitly disabled behind `LEGACY_ALLOW_INSECURE_TLS` until the Google redirect chain is validated on the real ESP8266 and a maintained trust strategy is selected. Credentials previously exposed in source must be rotated before production activation.

## 7. Tests run

- Apps Script syntax was checked with Node.js after feeding `Code.gs` through standard input.
- `tests/apps-script.test.js` passed using mocked Spreadsheet, Properties, Lock, Content, Utilities, and Trigger services.
- `tests/firmware-static.test.ps1` passed for hardware mappings, data paths, transport expectations, forbidden logging/formatting patterns, and structural balance.
- `scripts/check-repository.ps1` passed repository structure, ignored-secret boundaries, and locked hardware checks.
- Arduino compilation passed for `esp8266:esp8266:nodemcuv2` with Arduino CLI 1.5.1, ESP8266 core 3.1.2, Adafruit Fingerprint 2.1.4, and LiquidCrystal_I2C 2.0.0. It used placeholders and performed no upload.

Latest compile resource report: 38,332 bytes data RAM (47%), 63,963 bytes instruction RAM (97%), and 414,452 bytes flash (39%).

## 8. Tests not possible offline

- Real fingerprint enrollment, matching, template deletion, and sensor communication recovery.
- LCD formatting/visibility and buzzer timing on the soldered device.
- LittleFS interruption/power-loss behavior and outbox replay across real resets.
- Wi-Fi loss/recovery and Google redirect/TLS behavior on ESP8266.
- Apps Script authorization, Project Properties, deployed redirect behavior, concurrent live invocations, quotas, and installed trigger state.
- Actual sheet formatting, locale behavior, existing production data variations, and absence execution.

## 9. Known limitations

- Instruction RAM is at 97%; further firmware growth needs close monitoring.
- TLS server identity is not verified in the current compatibility configuration.
- The anonymous Apps Script web app still relies on one shared application key and has no device-specific identity, key rotation protocol, nonce, or signature.
- Stable event IDs make retries traceable, while sheet idempotency is still defined by student/date and registration identity rather than a stored event ledger.
- The outbox is bounded to 40 records and 20 attempts; unresolved records require dead-letter reconciliation.
- The ESP remains limited to 30 local students even though the sensor supports more templates.
- `A` remains a compatibility command confirming that always-on scanning is active; it is not a separate operating state.

## 10. Deployment steps

Follow `docs/PHASE1_DEPLOYMENT_AND_ROLLBACK.md`. In summary: back up production, rotate exposed credentials, configure a staging spreadsheet/deployment, run scripted and real-device staging checks, deploy Apps Script first while legacy compatibility is present, verify old firmware, then upload one test device before any broader firmware activation.

## 11. Rollback

Restore the previous Apps Script deployment version and/or known-good firmware without formatting LittleFS. Preserve `/students.txt`, the retry outbox, dead letters, and partially synchronized Students rows for reconciliation. Existing first-scan attendance cells remain authoritative and must not be overwritten during rollback.

## 12. Exact production approvals required

Separate explicit approval is required before each of these actions:

1. Create or use a staging spreadsheet and Apps Script deployment.
2. Set or rotate Apps Script Project Properties.
3. Run any request against a deployed Apps Script or spreadsheet.
4. Recreate or change the installed absence trigger.
5. Update the production Apps Script deployment.
6. Create a local real-secret firmware configuration.
7. Upload firmware to a test ESP8266.
8. Upload firmware to any production ESP8266.
9. Correct, delete, or reconcile any live sheet or device data.

Phase 1 stops here pending approval for controlled staging or the next explicitly defined phase.
