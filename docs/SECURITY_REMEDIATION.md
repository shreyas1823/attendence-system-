# Security remediation baseline

## Confirmed exposures

The original firmware contained real-looking Wi-Fi configuration, a deployed Apps Script web-app URL, and a shared request key. The pasted Apps Script contained a spreadsheet identifier and shared request key. Values are intentionally not reproduced in this repository or document.

## Phase 0 containment

- Firmware secrets were removed from `Attendance.ino` and replaced by an ignored local `Attendance/secrets.h` mechanism.
- `Attendance/secrets.example.h` contains placeholders only.
- Apps Script source was changed only at its configuration boundary to read `SPREADSHEET_ID` and `SECRET_KEY` from Script Properties.
- `.gitignore` excludes local firmware secrets and common credential files.
- No Apps Script deployment was performed.
- No real credentials were committed by Phase 0.

## Required credential rotation

An authorized owner must change the exposed Wi-Fi password, generate a new Apps Script shared key, provision both only in their respective local/managed secret stores, and confirm the old values no longer work. Consider replacing the Apps Script deployment URL if its exposure creates operational risk.

## TLS verification issue

The firmware currently calls `client.setInsecure()`. HTTPS traffic is encrypted but server identity is not authenticated. This remains unchanged in Phase 0 to avoid an untested live-device change. Phase 1 must introduce a tested certificate-validation strategy and cover clock initialization, redirects, and certificate rotation on real hardware.

## Query-string secret and PII issue

The current GET request puts the shared key and student data in the URL. URLs can enter provider and infrastructure logs. Phase 1 should move state changes to POST, use an authenticated body, and avoid sensitive request logging.

The verified manifest allows anonymous web-app access and executes requests as the deploying user. This is required for the current unauthenticated ESP flow but increases the impact of a leaked shared key. Phase 1 must retain availability while adding stronger request authentication, replay controls, and rate/abuse protection.

## PII logging issue

The firmware prints the full parent WhatsApp value to Serial. Apps Script returns raw exception strings. Future logging must redact phone numbers, credentials, signatures, tokens, and sensitive bodies.

## Proposed replacement

Near term: structured POST requests, bounded timeouts, parsed response codes, rotated external secrets, TLS validation, and redacted logging.

Target: per-device revocable credentials, signed requests with replay protection, backend-managed provider secrets, RBAC, audit logs, and rate limiting.

## Verification gate

Do not deploy the tracked Apps Script until Script Properties are configured and a staging request succeeds. Do not upload firmware until a local `secrets.h` exists, placeholder detection passes, and the sketch compiles with the locked board configuration.
