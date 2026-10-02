# Phase 1 controlled deployment and rollback

## No deployment performed

Phase 1 changes are source-only. The live Apps Script, spreadsheet, trigger, and ESP8266 were not modified.

## Prerequisites

1. Back up the live spreadsheet and Apps Script deployment.
2. Export the current trigger list.
3. Rotate the previously exposed shared key and Wi-Fi password.
4. Put the new shared key in Apps Script Project Properties and local ignored `Attendance/secrets.h`.
5. Build with NodeMCU FQBN and real local secrets.
6. Use a staging copy of the spreadsheet and a staging Apps Script deployment first.
7. Run the complete registration, attendance, duplicate, offline, reboot, and held-finger hardware checklist.

## Safe order

1. Deploy the Phase 1 Apps Script to staging as a new version/deployment.
2. Verify registration and attendance with scripted requests.
3. Confirm a legacy request with no `action` still records attendance.
4. Point a test firmware configuration at staging and upload to one test device.
5. Verify all existing local students synchronize to Students.
6. Test offline queue replay and reboot persistence.
7. Only after approval, update the production Apps Script deployment.
8. Confirm the old firmware still works through the legacy fallback.
9. Only after approval, upload the new firmware.
10. Re-run reconciliation and the real-device checklist.

## Rollback

- Apps Script: restore the previous deployment version without deleting the spreadsheet.
- Firmware: flash the known-good pre-Phase-1 binary/configuration.
- Keep `/students.txt`; do not format LittleFS.
- Preserve the Phase 1 outbox before rollback. Reconcile its event IDs and sheet state manually before replaying or discarding records.
- If Students synchronization partially completed, do not delete rows blindly. Compare Student ID and fingerprint ID mappings first.
- If attendance replay is uncertain, the existing first-scan cell is authoritative; never overwrite it during rollback.

## Production approvals still required

- Apps Script deployment/update
- Script Property changes
- Shared-key and Wi-Fi credential rotation
- Trigger recreation using Settings cutoff
- Firmware upload
- Any live spreadsheet test or data correction

