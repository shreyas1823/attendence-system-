# Phase 1 migration pre-upload readiness

## Decision

The rollback blocker is cleared. The next PRD-aligned action is controlled Phase 1 staging verification, not Phase 2 backend work and not a production upload.

The Phase 1 firmware and Apps Script source already contain the required migration changes: distinct registration and attendance operations, Students synchronization, canonical mobile data, first-scan preservation, structured responses, persistent retry events, and legacy request compatibility. Rewriting those changes before physical staging would add untested risk.

## Verified rollback evidence

Two independently read full-flash images exist outside Git:

| Property | Verified value |
| --- | --- |
| Image size | 4,194,304 bytes each |
| Run-1 SHA-256 | `F05436390348437F90723F0EC0D7F1395417EEEA1E698099972E7FEE655FB0BE` |
| Run-2 SHA-256 | `F05436390348437F90723F0EC0D7F1395417EEEA1E698099972E7FEE655FB0BE` |
| Byte comparison | Identical |
| Storage | Protected `D:\IoT-private-backups\current-known-good-2026-09-19\run-1\` and `run-2\` |

The images contain credentials and student data. Do not commit, attach, inspect casually, or copy them into the repository. Restoring one overwrites the device flash and requires separate explicit approval.

## Current source state

- Firmware: `Attendance/Attendance.ino`, Phase 1 source complete.
- Board: NodeMCU 1.0 ESP-12E, FQBN `esp8266:esp8266:nodemcuv2`.
- Locked hardware remains D5/D6 fingerprint serial at 57600, D2/D1 LCD at `0x27`, D0 buzzer, debug serial 115200.
- LittleFS `/students.txt` remains backward-compatible.
- Apps Script Phase 1 source exists but has not been deployed.
- No `Attendance/secrets.h` is present. The existing compiled binary therefore contains placeholders and is not uploadable.
- The repository has no commits yet. A reviewed baseline commit/tag or other immutable source snapshot is required before producing the staging release candidate.
- Latest placeholder compile: data RAM 47%, instruction RAM 97%, flash 39%. IRAM remains a watch item.
- TLS server verification remains disabled by the explicit `LEGACY_ALLOW_INSECURE_TLS` compatibility flag. This must be accepted as a staging limitation and tested against the real Google redirect chain; it is not final production security.

## Remaining gates before any upload

### Gate 1 — immutable source identity

Review all Phase 0/1 changes, ensure no unrelated files or secrets are included, then create an approved Git baseline commit/tag. Record the commit ID in the staging execution record. Do not build an upload candidate from an unrecorded moving worktree.

### Gate 2 — isolated staging Google environment

Explicit approval is required to create/use a non-production spreadsheet and a separate Apps Script deployment. It must have:

- Attendance, Students, and Settings contract-compatible sheets.
- Phase 1 `Code.gs` and the verified manifest.
- Staging-only `SPREADSHEET_ID` and `SECRET_KEY` Script Properties.
- No real student data.
- No production trigger changes.
- Scripted registration, first-attendance, duplicate-attendance, legacy-request, authentication, lock, and validation checks completed before hardware points at it.

Deploy Apps Script to staging first. Confirm the existing production endpoint and spreadsheet remain unchanged.

### Gate 3 — staging-only firmware secrets

Create ignored `Attendance/secrets.h` locally from `secrets.example.h` with only:

- Authorized staging Wi-Fi SSID/password.
- Separate staging Apps Script web-app URL.
- Staging shared key matching Script Properties.

Never print, commit, screenshot, or include these values in the staging record. Validation must check presence/non-placeholder form without echoing values. The production key and Wi-Fi password must not be used for the initial test candidate.

### Gate 4 — clean release-candidate compile

Compile from the recorded source identity using:

```text
Arduino CLI 1.5.1
ESP8266 core 3.1.2
FQBN esp8266:esp8266:nodemcuv2
Adafruit Fingerprint Sensor Library 2.1.4
LiquidCrystal_I2C 2.0.0
```

Use the documented board defaults, particularly 4 MB flash with 2 MB filesystem, 80 MHz CPU, 115200 upload speed, 32 KB cache + 32 KB IRAM, and Erase Flash = Only Sketch.

Run and record:

1. Apps Script syntax and mocked contract tests.
2. Firmware static locked-hardware/secret/logging checks.
3. Repository structure and manifest checks.
4. Clean firmware compilation with the staging configuration.
5. Final RAM/IRAM/flash report; fail if the binary no longer fits or IRAM increases unexpectedly.
6. SHA-256 and byte size of the staging-configured `.bin`.
7. Source commit ID, tool versions, and build timestamp.

The existing placeholder artifact hash is not the staging release-candidate hash and must never be uploaded.

### Gate 5 — upload-plan verification

Before connecting the board:

- Recheck both rollback files still exist and hash correctly.
- Close Serial Monitor and any COM-port consumer.
- Confirm the correct device/port by disconnect/reconnect observation.
- Confirm stable power and that no attendance or LittleFS write is in progress.
- Confirm upload setting **Erase Flash: Only Sketch**. Never choose full erase and never upload a filesystem image.
- Confirm the operator understands that existing `/students.txt` and fingerprint templates must be preserved.
- Have the full test matrix in `docs/PHASE1_STAGING_HARDWARE_TEST.md` open and ready.
- Obtain explicit approval for one test-device upload. Compilation approval does not authorize upload.

## Exact pre-upload validation sequence

Run these before requesting upload approval:

```powershell
Get-Content -Raw integrations/google-apps-script/Code.gs | node --check -
node tests/apps-script.test.js
powershell -NoProfile -ExecutionPolicy Bypass -File tests/firmware-static.test.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-repository.ps1
```

After `Attendance/secrets.h` exists locally, confirm Git ignores it without displaying contents:

```powershell
git check-ignore Attendance/secrets.h
```

Compile to a fresh staging build directory:

```powershell
& 'C:\Users\400ku\AppData\Local\Programs\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe' compile --fqbn esp8266:esp8266:nodemcuv2 --build-path build/phase1-staging Attendance
```

Hash the resulting candidate:

```powershell
Get-Item build/phase1-staging/Attendance.ino.bin | Select-Object FullName,Length,LastWriteTime
Get-FileHash -Algorithm SHA256 -LiteralPath build/phase1-staging/Attendance.ino.bin
```

Re-verify rollback material separately:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath `
  'D:\IoT-private-backups\current-known-good-2026-09-19\run-1\esp8266-full-4mb-run-1.bin', `
  'D:\IoT-private-backups\current-known-good-2026-09-19\run-2\esp8266-full-4mb-run-2.bin'
```

Both rollback hashes must still equal `F05436390348437F90723F0EC0D7F1395417EEEA1E698099972E7FEE655FB0BE`.

## First-upload boundary

The eventual first upload is authorized only for the controlled test device and staging endpoint. It must preserve LittleFS and use the exact candidate whose hash was reviewed. Immediately after upload, stop on any boot loop, sensor/LCD failure, missing local students, unexpected template count, credential disclosure, or filesystem error and evaluate rollback.

Production Apps Script, production Sheets, production credentials, Meta, PostgreSQL, backend, dashboard, and Phase 2 remain out of scope until Phase 1 physical staging passes.

## Current blockers

1. Approved immutable Git baseline does not exist.
2. Staging Apps Script/spreadsheet deployment has not been authorized or verified.
3. Staging-only firmware credentials are not configured.
4. A staging-configured candidate binary therefore does not yet exist.
5. Explicit test-device upload approval has not been granted.

No upload should occur until blockers 1–4 are cleared and blocker 5 is explicitly approved.
