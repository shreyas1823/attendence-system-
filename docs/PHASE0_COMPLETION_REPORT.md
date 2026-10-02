# Phase 0 completion report

## Outcome

Phase 0 recovered the deployed Apps Script source and real manifest, initialized an empty Git repository, added source-control safety rules, externalized embedded configuration secrets, documented the actual legacy contract, and added static repository checks. Phase 0 is fully unblocked and complete.

No backend, PostgreSQL database, website, dashboard, Meta integration, spreadsheet mutation, Apps Script deployment, or firmware upload was performed.

## Files created

- `.gitignore`
- `README.md`
- `Attendance/config.h`
- `Attendance/secrets.example.h`
- `Attendance/README.md`
- `integrations/google-apps-script/Code.gs`
- `integrations/google-apps-script/appsscript.json`
- `integrations/google-apps-script/README.md`
- `docs/CURRENT_SYSTEM_CONTRACT.md`
- `docs/SECURITY_REMEDIATION.md`
- `docs/MIGRATION_BASELINE.md`
- `docs/PHASE0_COMPLETION_REPORT.md`
- `scripts/check-repository.ps1`

## Files changed

- `Attendance/Attendance.ino`
  - Removed embedded credential declarations.
  - Added `config.h` and local `secrets.h` loading.
  - Falls back to placeholder-only `secrets.example.h` with a compile warning.
  - Hardware mappings and functional attendance/enrollment logic were not changed.

## Recovered Apps Script

The pasted 1,064-line script was recovered as `integrations/google-apps-script/Code.gs`. A normalized comparison confirms the tracked file matches the paste except for the deliberate configuration-boundary replacement:

- embedded spreadsheet identifier -> `SPREADSHEET_ID` Script Property
- embedded shared request key -> `SECRET_KEY` Script Property

All 12 original function declarations are present.

An unexpected root-level `Code.gs.txt` was verified as byte-identical to the retained attachment and removed because it contained the original embedded configuration. It remains recoverable from the attachment if needed, but must not be restored inside the repository without redaction.

## Files intentionally untouched

- `AI_Attendance_Codex_Master_PRD.md`
- `AI_Attendance_Codex_Master_PRD.docx`
- All GPIO assignments
- Fingerprint serial wiring and baud
- LCD wiring/address
- Buzzer wiring
- Enrollment, local database, attendance, and Google request logic except credential loading
- `client.setInsecure()` remains for Phase 1 hardware-tested remediation

## Baseline identifiers

| Artifact | SHA-256 |
| --- | --- |
| Original audited firmware | `251A4FAE9B42EC6F65B7AE55316DDE8A368C38C2D6A431B9005C60345298A0BE` |
| Phase 0 firmware | `FED9962E95A93E5FCF447533998E153AD1F1EF1806CE10BDC0548992470C32A0` |
| Phase 0 recovered Apps Script | `F521D0E68CD2D3A19C7557522064ECA2F9C4243AAE3BE9E21671A2291F30C58B` |

The firmware hash changed only because the source-controlled configuration boundary was introduced.

## Checks run

- Git repository initialization: passed.
- Repository structure check: passed.
- Locked hardware pattern check: passed.
- Firmware embedded-secret declaration check: passed.
- Apps Script hard-coded spreadsheet/shared-key check: passed.
- `.gitignore` protection for `Attendance/secrets.h`: passed.
- Apps Script normalized import comparison: passed.
- Apps Script function-list comparison: passed, 12 of 12 functions.
- Apps Script JavaScript syntax check through Node standard input: passed. (Direct `.gs` checking is unsupported by Node's extension loader.)
- Apps Script manifest JSON parsing: passed.
- Manifest/source timezone consistency: passed (`Asia/Kolkata`).
- Manifest runtime verification: passed (V8).
- Manifest exception logging verification: passed (Stackdriver).
- Manifest dependency verification: passed (no libraries).
- Manifest scopes verification: implicit/auto-detected; no explicit `oauthScopes` array.
- Manifest web-app baseline verified: executes as deploying user and allows anonymous access.
- PowerShell repository-check script parse: passed.
- Active non-placeholder sensitive assignment scan: passed, zero matches.

Firmware compilation was not run because Arduino CLI and PlatformIO are unavailable in the current environment. Real-device behavior was not tested during Phase 0.

Git was initialized on its default empty `master` branch. No files were staged or committed because the firmware has not yet been compiled, `appsscript.json` is still missing, and this Phase 0 result requires review before it should become the first baseline commit.

## Actual legacy mismatches confirmed

- Firmware registration never calls Apps Script.
- Apps Script has no registration operation.
- Students sheet is created but never populated by the request handler.
- Firmware does not send `parentWhatsApp`.
- Every accepted request is treated as attendance.
- Firmware ignores JSON status and accepts HTTP 200/302 as success.
- Script errors normally remain HTTP-success responses with JSON `status: error`.
- Duplicate protection has no `LockService` and can race.
- Date-column lookup starts at Status column E rather than first date column F.
- Settings sheet values are never read.
- Absence trigger hour is hard-coded and depends on an unverified project timezone.
- Historical absence is represented by a blank date cell plus one mutable row-level Status.
- No stable event ID, offline queue, device identity, replay protection, or audit exists.

## Remaining blockers

1. Record the deployed web-app deployment ID without committing secret material.
2. Export the installed trigger list and verify whether `markAbsenteesForToday` is scheduled.
3. Provide a sanitized workbook structure/sample so formulas, formats, duplicate rows, and historical date columns can be verified.
4. Capture exact installed Arduino library versions and make Arduino CLI available for reproducible compilation.
5. Create a local ignored `Attendance/secrets.h` before compiling for real hardware.
6. Rotate the previously exposed Wi-Fi password and Apps Script shared key.
7. Configure Apps Script Project Properties before any deployment of tracked `Code.gs`.

These are operational prerequisites for later implementation and deployment, not blockers to closing Phase 0.

## Exact next recommended phase

Do not start the new backend yet. Phase 1 should first harden and correct the legacy ESP-to-Apps-Script path in small tested changes:

1. Add explicit `action=register` and `action=attendance` contracts.
2. Synchronize registration to Students without creating attendance.
3. Send and validate the parent number.
4. Use structured result codes understood by firmware.
5. Add `LockService` around row/date/timestamp mutations.
6. Add bounded HTTP behavior and runtime Wi-Fi recovery.
7. Introduce stable event IDs and a small persistent retry queue.
8. Replace insecure TLS only with a verified real-device certificate strategy.
9. Compile and test four registrations, reboot persistence, duplicate attendance, and failure recovery.

Phase 1 requires explicit approval.
