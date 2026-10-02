# Phase 1 staging final checkpoint

Checkpoint date: 2026-09-20 (Asia/Kolkata)

## Result

**PASS — Phase 1 staging baseline verified.**

This checkpoint records the tested staging state only. It does not approve a production deployment or Phase 2 work.

## Immutable artifacts and deployment

| Item | Verified value |
| --- | --- |
| Firmware binary | `D:\IoT\build\phase1-staging-two-fingerprint\Attendance.ino.bin` |
| Firmware size | 460,048 bytes |
| Firmware SHA-256 | `47D7793CD2EC87540D7AA975CC77CA31F18393922F4C1B6508BCF48E39BA911E` |
| Board / core | NodeMCU 1.0 (ESP-12E), `esp8266:esp8266:nodemcuv2`, ESP8266 core 3.1.2 |
| Upload mode | 115200 baud, sketch only, `wipe=none`; no LittleFS image |
| Staging Apps Script | Existing staging web app, Version 4, deployed 2026-09-20 13:34 |
| Version 4 smoke test | Authenticated HTTP 200, `ok: true`, `code: healthy` |
| Rollback image size | 4,194,304 bytes each |
| Rollback SHA-256 | `F05436390348437F90723F0EC0D7F1395417EEEA1E698099972E7FEE655FB0BE` for both independent reads |
| Rollback location | `D:\IoT-private-backups\current-known-good-2026-09-19\run-1` and `run-2` (outside Git) |

Both rollback images were re-hashed at this checkpoint and still match exactly.

## Git state

- Branch: `master`
- Current baseline commit: `937efc6f392ea458227407a1a341581252d55442`
- Baseline subject: `chore: establish Phase 1 pre-upload baseline`
- The validated Phase 1 implementation remains intentionally uncommitted at this checkpoint.
- Modified tracked files before this document was created:
  - `Attendance/Attendance.ino`
  - `Attendance/README.md`
  - `integrations/google-apps-script/Code.gs`
  - `tests/apps-script.test.js`
  - `tests/firmware-static.test.ps1`

## Verified staging behavior

- One combined Attendance row is retained per student with stable `S.No.`.
- A student may have one required fingerprint and one optional second fingerprint.
- Both fingerprints resolve to the same student row.
- At most two attendance events are recorded per student per date.
- The two visible times share one date cell and remain chronologically ordered.
- Visible timestamps use `HH:MM` only. The observed staging value was `13:30, 13:31`.
- Event IDs remain in the cell note, separate from the visible value, preserving replay/idempotency protection.
- Registration accepts a 10-digit Indian mobile number; the sheet displays it as 10-digit text while internal API normalization remains compatible with E.164/WhatsApp use.
- The former Students data was migrated into the combined Attendance structure without deleting the Students tab.
- Existing student and attendance data survived migration.
- Registration and attendance retry/outbox paths remain present and are covered by static and contract tests.

## Completed physical and live checks

| Check | Result |
| --- | --- |
| Controlled firmware upload | PASS |
| Flash verification against the candidate | PASS — esptool digest matched |
| Normal boot at 115200 | PASS |
| Fingerprint sensor detected | PASS |
| LittleFS mount | PASS |
| Existing local student database after upload | PASS — two students loaded at upload verification |
| Wi-Fi connection | PASS |
| Serial `H` command | PASS; command list and preserved student count observed |
| Two fingerprints mapped per student | PASS — staging rows observed with fingerprint pairs `1/2` and `3/4` |
| Two attendance events in one date cell | PASS — `13:30, 13:31` observed |
| Version 4 authenticated health check | PASS — HTTP 200 / healthy |
| Unexpected smoke-test data writes | PASS — none observed |

No claim is added here for physical offline queue replay, held-finger suppression, or other matrix cases unless separately evidenced in the completed test record. Their source behavior remains covered only to the extent of the existing automated/static checks.

## Validation suite

Executed at this checkpoint:

- `node tests/apps-script.test.js` — PASS.
- `powershell -NoProfile -ExecutionPolicy Bypass -File tests/firmware-static.test.ps1` — PASS.
- Arduino CLI compile for `esp8266:esp8266:nodemcuv2` — PASS.
- Fresh checkpoint compile: 460,048 bytes, SHA-256 `47D7793CD2EC87540D7AA975CC77CA31F18393922F4C1B6508BCF48E39BA911E`; byte identity with the uploaded staging candidate confirmed by matching size and hash.

The LiquidCrystal_I2C architecture metadata warning remains non-fatal. Compilation succeeded for the ESP8266 target.

## Isolation and freeze status

- Production Apps Script, Sheets, configuration, and credentials were not modified.
- Staging Apps Script remains on Version 4.
- No deployment or spreadsheet mutation was performed while creating this checkpoint.
- No firmware upload, filesystem upload, ESP reset, clear command, enrollment, or attendance action was performed while creating this checkpoint.
- Hardware wiring and GPIO assignments remain unchanged: fingerprint D5/D6, LCD D2/D1, buzzer D0.
- The Students tab remains present.
- Secrets remain outside tracked source and were not printed or changed.

Any production migration, credential rotation, rollback, or Phase 2 work requires a separate explicit approval and a new pre-change verification gate.
