# AI Fingerprint Attendance System

This repository contains the protected baseline and source-only Phase 1 hardening work for the college biometric attendance system. No Phase 1 source has been deployed to Apps Script, uploaded to hardware, or tested against the live spreadsheet.

## Current implementation

```text
Fingerprint sensor -> ESP8266 -> Google Apps Script -> Google Sheets
```

Preserved baseline capabilities:

- Fingerprint enrollment and matching
- Local student persistence in LittleFS
- LCD and buzzer feedback
- Direct attendance logging to Google Apps Script and Google Sheets
- Google Attendance, Students, and Settings sheet creation
- First-scan timestamp preservation in Apps Script
- A scheduled absence function, subject to the limitations documented in `docs/CURRENT_SYSTEM_CONTRACT.md`

Phase 1 source now adds, pending controlled staging and production approval:

- Registration synchronization into the Students sheet
- Structured registration, attendance, and health actions/responses
- First-scan duplicate protection under an Apps Script lock
- Canonical mobile-number synchronization
- A bounded, persistent ESP registration/attendance retry outbox
- Safer local persistence and explicit failure feedback

Still not implemented:

- Cloud application backend or database
- Website/dashboard, authentication, RBAC, or reports
- Meta WhatsApp integration

## Protected baseline

| Item | Value |
| --- | --- |
| Firmware | `Attendance/Attendance.ino` |
| Original audited firmware SHA-256 | `251A4FAE9B42EC6F65B7AE55316DDE8A368C38C2D6A431B9005C60345298A0BE` |
| Original firmware line count | 2321 |
| Board | NodeMCU 1.0 ESP-12E |
| Serial | 115200 |
| Local database | LittleFS `/students.txt` |
| Google endpoint configuration | Web-app URL plus shared request key; values are local secrets |

The hash above identifies the firmware before Phase 0 externalized its credentials. It must remain in the migration record even though the tracked file now loads credentials from an ignored local header.

## Repository layout

```text
Attendance/                         ESP8266 firmware and local setup guide
integrations/google-apps-script/   Recovered Apps Script source
docs/                              Current contract, security, and migration baseline
scripts/                           Read-only repository checks
```

## Secret handling

- Firmware secrets belong in ignored `Attendance/secrets.h`.
- Apps Script secrets belong in Apps Script Project Properties.
- Never commit Wi-Fi passwords, request keys, tokens, spreadsheet identifiers, or deployment credentials.
- Existing embedded credentials must be rotated before production work proceeds.

## Phase boundary

Phase 1 deliberately does not build the planned backend, PostgreSQL database, dashboard, or Meta integration. Production activation requires the staged process and explicit approvals in `docs/PHASE1_DEPLOYMENT_AND_ROLLBACK.md`.
