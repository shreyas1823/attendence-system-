# Phase 1 controlled staging and physical test procedure

## Stop conditions and scope

This procedure prepares a human-operated staging test. It does not authorize a production Apps Script deployment, live-sheet mutation, firmware upload, database work, Meta integration, or Phase 2.

Do not connect or flash the ESP until all preflight gates below pass. Use a staging spreadsheet and a separate staging Apps Script deployment only after those actions receive explicit approval. Use synthetic student identities and authorized lab-controlled phone numbers; do not use real student data.

## 1. Current firmware artifact

The exact artifact produced by the verified Phase 1 build is:

| Property | Value |
| --- | --- |
| File | `D:\IoT\build\phase1\Attendance.ino.bin` |
| Size | 458,448 bytes |
| SHA-256 | `73E86FDEDDDB2417609BFEDCC08E39D60BB9B1CFE971E90A8AE6C836B703B44D` |
| Built | 2026-09-19 21:34:47 +05:30 |

**Do not upload this artifact.** It was compiled with `secrets.example.h` placeholders because no ignored `Attendance/secrets.h` was present. It proves compilation only. Its machine-readable record is `docs/PHASE1_STAGING_ARTIFACT.json`.

The actual staging candidate must be rebuilt after an authorized operator creates ignored `Attendance/secrets.h` containing only the staging Wi-Fi SSID/password, staging Apps Script URL, and staging shared key. Never paste those values into logs, screenshots, documentation, chat, or Git.

After that build, record its path, byte size, timestamp, and SHA-256 in a new staging execution record. A different hash from the compile-verification artifact is expected.

## 2. Verified build configuration

| Item | Configuration |
| --- | --- |
| Board | NodeMCU 1.0 (ESP-12E Module) |
| FQBN | `esp8266:esp8266:nodemcuv2` |
| Arduino CLI | 1.5.1 (`01f3d4f2b`) |
| ESP8266 core | 3.1.2 |
| Adafruit Fingerprint Sensor Library | 2.1.4 |
| LiquidCrystal_I2C | 2.0.0 |
| Debug serial | 115200 baud |
| Fingerprint serial | D5 RX, D6 TX, 57600 baud |
| LCD | D2 SDA, D1 SCL, I2C address `0x27`, 16x2 |
| Buzzer | D0 |

The compile used the board defaults recorded by ESP8266 core 3.1.2:

- Upload speed: 115200
- CPU frequency: 80 MHz
- Flash size: 4 MB, FS 2 MB, OTA approximately 1019 KB
- Debug port: Disabled
- Debug level: None
- lwIP: v2 Lower Memory
- VTables: Flash
- C++ exceptions: Disabled
- Stack protection: Disabled
- Erase flash: Only Sketch
- SSL support: All SSL ciphers
- MMU: 32 KB cache + 32 KB IRAM
- Non-32-bit access: pgm_read macros/fast

Compile result: data RAM 38,332 bytes (47%), instruction RAM 63,963 bytes (97%), flash 414,452 bytes (39%). The 97% IRAM level is a release watch item; do not add firmware features during staging.

## 3. Arduino IDE settings for the eventual manual upload

In Arduino IDE, select:

1. Board package: ESP8266 by ESP8266 Community, version 3.1.2.
2. Board: **NodeMCU 1.0 (ESP-12E Module)**.
3. Apply every option listed under “board defaults” above.
4. Select the COM port that appears for the physically connected NodeMCU. Verify it by disconnecting/reconnecting; do not guess.
5. Open `D:\IoT\Attendance\Attendance.ino`.
6. Confirm ignored `D:\IoT\Attendance\secrets.h` exists and contains staging—not production—values.
7. Compile and record the new `.bin` SHA-256 before upload.
8. Close Serial Monitor before upload; reopen it afterward at **115200 baud**, newline line-ending.

Keep **Erase Flash: Only Sketch**. Do not choose “All Flash Contents,” because that would destroy LittleFS students and queued events. Do not upload a LittleFS image. Do not change any GPIO assignment.

## 4. Mandatory pre-upload gates

- Obtain and verify a rollback image. No previous known-good `.bin` currently exists in this repository. Follow the reviewed, read-only proposal in `docs/PHASE1_ROLLBACK_ARTIFACT_PLAN.md`; do not execute it without explicit manual approval.
- Record the existing firmware version/source and its SHA-256, or make a full flash backup with an approved ESP8266 backup tool while the device is stopped.
- Record board/flash size and confirm the backup can be read back without errors.
- Back up the staging spreadsheet and Apps Script source/manifest.
- Use a new staging spreadsheet with Attendance, Students, and Settings headers matching the preserved contract.
- Use a separate staging Apps Script deployment with `SPREADSHEET_ID` and `SECRET_KEY` set as Script Properties.
- Confirm the staging key matches the local ignored firmware setting without displaying it.
- Capture the starting Students/Attendance row counts and sensor template count.
- Decide whether this is a clean test device or a preservation test. Never issue `C` on a device containing needed templates/data.
- Confirm stable power and USB; do not interrupt enrollment or a LittleFS write.

The rollback-image requirement was satisfied on 2026-09-20 by two byte-identical 4 MB images with SHA-256 `F05436390348437F90723F0EC0D7F1395417EEEA1E698099972E7FEE655FB0BE`. If a staging Apps Script deployment is not available, stop. Compilation and rollback coverage alone are not enough to flash safely.

## 5. Test identities and evidence format

Use four synthetic records:

| Alias | Student ID | Name | Phone |
| --- | --- | --- | --- |
| S1 | `STAGE-001` | `Stage Student 1` | `<AUTHORIZED_E164_1>` |
| S2 | `STAGE-002` | `Stage Student 2` | `<AUTHORIZED_E164_2>` |
| S3 | `STAGE-003` | `Stage Student 3` | `<AUTHORIZED_E164_3>` |
| S4 | `STAGE-004` | `Stage Student 4` | `<AUTHORIZED_E164_4>` |

Replace each phone placeholder locally with a valid E.164 lab-controlled number. Do not put real numbers in the evidence bundle; redact all but the last two digits in screenshots. Record actual assigned fingerprint IDs as `F1` through `F4`; they are the next free sensor IDs and are not guaranteed to be 1–4.

For every test capture: UTC/local time, firmware hash, test ID, precondition, exact input, relevant Serial lines, LCD lines, buzzer pattern, Students delta, Attendance delta, and pass/fail. Never capture secrets.

## 6. Expected boot baseline

Required Serial sequence, allowing dynamic values in angle brackets:

```text
Checking fingerprint sensor...
Fingerprint sensor found!
Sensor templates: <count>
Database is empty.
```

If records already exist, database output replaces `Database is empty.`. Wi-Fi then prints:

```text
================================
       CONNECTING TO WIFI
================================
Using configured WiFi network.
Connecting<zero-or-more-dots>
WIFI CONNECTED!
IP Address: <local-ip>
Signal: <rssi> dBm
```

It must never print SSID, Wi-Fi password, shared key, request body, response body, or full phone number. Readiness ends with:

```text
================================
          SYSTEM READY
================================
R = Register new student
A = Confirm attendance is active
C = Clear everything
H = Help
Place finger for attendance.
================================
```

LCD begins `Attendance / System Booting`, shows Wi-Fi connection state, then rotates idle messages. No startup failure tone is expected on a healthy boot.

## 7. Physical test matrix

### T01 — fingerprint enrollment and student 1 registration

With Wi-Fi connected, send `R`, then enter S1 fields. Follow the two-scan prompts using the same finger.

Expected Serial milestones:

```text
========== NEW STUDENT ==========
Enter Student ID:
Enter Student Name:
Parent WhatsApp (10 digits or +91):
Fingerprint will be assigned ID: <F1>
Place finger on sensor...
First scan captured.
Remove finger.
Place SAME finger again...
Second scan captured.
Google request result: HTTP <positive-code>
========== REGISTERED ==========
Student ID: STAGE-001
Name: Stage Student 1
Fingerprint ID: <F1>
Parent mobile saved and cloud registration confirmed.
================================
```

Expected LCD progression: `Place Finger / ID: <F1>`, `Remove Finger / Please wait`, `Same Finger / Scan again`, `Processing / Fingerprint...`, and `Student Saved / STAGE-001`. Expected buzzer: two short rising tones after sensor enrollment and again after cloud-confirmed registration.

Expected Sheets: Students gains exactly one row `[F1, STAGE-001, Stage Student 1, AUTHORIZED_E164_1]`. Attendance gains no row and no date value.

### T02–T04 — students 2, 3, and 4

Repeat T01 separately for S2, S3, and S4 using distinct fingers. Each test must show the same milestones with its own assigned ID. Do not batch the evidence.

Expected Sheets after T04: Students contains exactly one row for each S1–S4 with unique Student IDs and fingerprint IDs. Attendance is still unchanged. This explicitly verifies the original multi-registration concern.

### T05 — reboot persistence

Power-cycle normally after T04; do not erase flash.

Expected Serial: sensor template count is at least four above the starting count; the database listing reports four test students (plus any preserved baseline records), followed by `SYSTEM READY`. The firmware may issue one idempotent registration sync per local student after Wi-Fi becomes available; each successful retry prints `Google request result: HTTP <positive-code>`.

Expected Sheets: still one Students row per Student ID—no duplicate rows. Attendance unchanged. Scan S4 once only after T05 evidence is captured if required to prove its mapping.

### T06 — duplicate Student ID

Send `R`; enter `STAGE-001` with any name/valid test phone. The duplicate check occurs before fingerprint enrollment.

Expected Serial:

```text
Registration rejected: duplicate Student ID.
```

Expected LCD: `Duplicate ID / Not registered`. Expected buzzer: one 400 Hz failure tone for 400 ms. No fingerprint prompts follow, sensor template count does not increase, and neither sheet changes.

### T07 — first attendance scan

Place S1’s enrolled finger once, then remove it.

Expected Serial:

```text
Fingerprint matched! ID: <F1>
Confidence: <value>
========== ATTENDANCE ==========
Fingerprint ID: <F1>
Student ID: STAGE-001
Student Name: Stage Student 1
Parent mobile is configured.
================================
Google request result: HTTP <positive-code>
Finger removed; scanner re-armed.
```

Expected LCD: student name/ID briefly, then `Attendance OK / First scan saved`. Expected buzzer: one two-tone success pattern after the Google result.

Expected Sheets: Attendance gains or updates exactly one S1 row. Columns A–E contain F1, S1 ID, canonical Students name, canonical Students mobile, and `Present`. Today’s date column (from column F onward, Settings timezone) contains one `HH:mm:ss` first-scan time. Students does not change.

### T08 — duplicate same-day attendance

Record the T07 timestamp, remove the finger fully, and scan S1 again the same day.

Expected Serial is the T07 identity/result sequence with another positive HTTP result. Expected LCD: `Already Present / First time kept`. Expected buzzer: success two-tone. The date cell must remain byte-for-byte/display-identical to the T07 timestamp; no second row or date column is created.

### T09 — held finger

After re-arming, place S2’s finger and keep it continuously on the sensor for at least 10 seconds.

Expected: only one `Fingerprint matched! ID: <F2>` block and one Google request occur while held. There must be no `Finger removed; scanner re-armed.` until the finger is physically removed. After removal that exact line appears. Attendance contains only one S2 result for the day.

### T10 — LCD and buzzer acceptance

During T01–T09 verify every LCD message is legible on both 16-character lines, has no stale characters, and returns to the idle rotation. Verify success is two short rising tones (1500 Hz/150 ms, 200 ms separation, 2000 Hz/150 ms); failure is one low 400 Hz/400 ms tone. Offline queuing intentionally has no success tone because cloud recording is not yet confirmed.

### T11 — Wi-Fi disconnect and queued attendance

After S3 has no attendance for the current staging day, disable only the staging access point. Wait until the device starts reconnecting, then scan S3.

Expected reconnect Serial, no more frequently than the configured interval:

```text
Starting WiFi reconnect.
```

Expected scan Serial contains the normal S3 identity block followed by:

```text
Event stored for retry.
```

There is no `Google request result` for the offline attempt. Expected LCD: `Offline / Attendance queued`. No failure tone is expected when queue storage succeeds. Sheets remain unchanged while offline.

### T12 — Wi-Fi reconnect and queue replay

Restore the staging access point. Do not rescan S3. Expected Serial:

```text
WiFi reconnected.
Google request result: HTTP <positive-code>
```

Reconnect attempts occur at roughly 30-second intervals; outbox processing attempts one head event at roughly 15-second intervals. Allow at least 60 seconds under a stable connection.

Expected Sheets: exactly one S3 attendance row/date timestamp appears. Wait another 45 seconds: no duplicate row and no timestamp change. Power-cycle once more and wait 45 seconds: the S3 event must not transmit again or alter the sheet. This is the observable acceptance criterion that the successful queue record was removed.

### T13 — offline registration replay

If T11/T12 pass, use a fifth temporary synthetic student only if scope permits; otherwise repeat on a restored clean test baseline. Disable Wi-Fi before registration. Expected completion is local persistence plus:

```text
Event stored for retry.
Student saved locally; cloud synchronization pending.
```

LCD: `Saved Locally / Sync Pending`. After reconnect, expect `WiFi reconnected.` and a positive Google result. Students gains exactly one row; Attendance remains unchanged. Reboot must not create a duplicate Students row.

### T14 — Google structured response handling

Validate without exposing response bodies:

| Condition | Expected LCD | Buzzer | Sheet result |
| --- | --- | --- | --- |
| First accepted attendance | `Attendance OK / First scan saved` | Success | First time written |
| Same-day repeat | `Already Present / First time kept` | Success | First time unchanged |
| Transient network/server failure | `Offline / Attendance queued` | None if queued | No immediate mutation; later replay |
| Student missing in staging Students | `Sync Pending / Check console` when both events queue | Failure | Registration must precede eventual attendance |
| Wrong staging shared key | `Auth Failed / Check config` | Failure | No mutation |
| Permanent validation/mapping rejection | `Server Rejected / Not recorded` | Failure | No attendance mutation |

The wrong-key test requires a deliberate staging-only rebuild/configuration and separate approval. Never perform it against production and never print either key.

## 8. Sheet acceptance summary

At the end of the core S1–S4 run:

- Students: four unique test rows, correct fingerprint mapping, names, and normalized E.164 numbers; no attendance timestamps.
- Attendance: one row per student actually scanned, canonical identity/mobile copied from Students, status `Present`, one date column for today, and one preserved first-scan timestamp per scanned student.
- Settings: no structural changes; timezone remains the authorized staging value and cutoff remains unchanged unless separately tested.
- No duplicate Student IDs, fingerprint IDs, Attendance rows, or same-day timestamps.

Never rename sheets, reorder the fixed columns, or test by manually editing the live production spreadsheet.

## 9. Failure rules

Stop testing and preserve evidence if any of these occurs:

- Boot loop, watchdog reset, exception stack, corrupted LCD, or sensor disappearance.
- LittleFS mount failure or local database replacement failure.
- Existing student/template loss.
- Two requests while a finger remains held.
- Duplicate Students/Attendance rows or overwritten first timestamp.
- Queue fails to replay, replays repeatedly, or reaches dead-letter storage.
- Authentication failure with supposedly matching staging configuration.
- Any credential/full phone appears in Serial output.

Do not use `C`, reformat LittleFS, manually delete sheet rows, or repeatedly replay events while investigating.

## 10. Rollback to known-good firmware

Rollback is not ready until a verified previous image exists. The repository contains the original source hash record but no prior `.bin`; source identity alone is not a flashable rollback.

Before the first Phase 1 upload:

1. Acquire the exact prior known-good `.bin` from the last working build, or make an approved full-flash backup of the device.
2. Record its SHA-256, size, board/core settings, and source/config provenance without recording secrets.
3. Store it outside Git in controlled local backup storage.
4. Verify the backup is readable and appropriate for this exact board/flash layout.

If rollback is required:

1. Disconnect the staging network or disable the staging deployment to stop further sends.
2. Save Serial evidence and staging sheet snapshots; do not clear the sensor or LittleFS.
3. Preserve a copy of the Phase 1 outbox/dead-letter data if an approved filesystem extraction method is available.
4. In Arduino IDE select the same NodeMCU board, 115200 upload speed, 4 MB/2 MB FS layout, and **Erase Flash: Only Sketch**.
5. Flash the verified prior image manually. Do not select full erase and do not upload a filesystem image.
6. Reboot, verify the prior firmware hash/provenance, sensor template count, local student count, LCD/buzzer, and one staging attendance transaction.
7. Reconcile queued/partially written events by Student ID, fingerprint ID, date, and first timestamp before any retry or deletion.

If the prior firmware expects a different LittleFS schema or flash layout, stop and use the full-flash backup/recovery plan reviewed for that exact image. Never guess.

## 11. Completion evidence

Physical staging is accepted only when T01–T12 pass, T13/T14 applicable cases are documented, all sheet deltas match, the firmware candidate hash is recorded, and rollback evidence exists. Redact credentials and phone numbers from all shared Serial logs/screenshots. Return the completed matrix, relevant redacted Serial excerpts, LCD photos, and redacted Students/Attendance screenshots for engineering review before any production decision or Phase 2 work.
