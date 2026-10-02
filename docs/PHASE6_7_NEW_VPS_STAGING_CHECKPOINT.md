# New VPS staging checkpoint

Recorded: 2026-09-28 12:15 IST. Source commit: `1b96268`; focused deployment commit: `4e9a5fa4852b47dbeded24f0f952f5063bcded7a`. This is staging only, not production release or firmware-upload approval.

## Deployed state

- New, isolated Hostinger KVM 1 VPS: Ubuntu 24.04 LTS, approximately 1 vCPU, 4 GB RAM, 50 GB disk. The old VPS, domain, database, API, credentials, and production Apps Script/Sheet were not used.
- `aiattendance` has an independent public-key SSH login, a password-enabled account, and sudo-group membership. On 2026-09-28, a user-entered local password prompt successfully authenticated `sudo id` and `sudo true`; the VPS sudo audit showed root-effective sessions. Root SSH remains enabled as recovery access. The account is not in the Docker group.
- UFW allows inbound SSH, HTTP, and HTTPS only. Docker 29.8.1 / Compose 5.5.1 and security updates are installed. PostgreSQL 17.7 and Fastify containers are healthy. PostgreSQL is not published; Fastify is bound to `127.0.0.1:3000`. External TCP checks confirmed ports 3000 and 5432 are closed.
- PostgreSQL migrations applied; 16 public tables. The database and its credentials exist only on the new VPS. The staging environment file and device credential file are root-owned mode `0600`; their credential directory is mode `0700`.
- A single new staging device (`ATTENDANCE-STAGING-01`) is provisioned. Credential rotation was verified: the prior credential returned 401 and the replacement returned 200. Credential values were not logged or committed.
- A synthetic staging student (`STAGE001`, fingerprint IDs 101/102) was created. Authenticated live Device API tests passed for heartbeat, first and second attendance, idempotent replay, third-scan daily limit, invalid credentials, unknown fingerprint, malformed payload, and rate limiting. Database observation: two attendance records, three idempotency receipts, and corresponding outbox jobs.
- The Sheets adapter targets only the already-authorized Phase 1 staging Apps Script and spreadsheet. Its values live in root-only server configuration. Two bounded worker runs processed three jobs, then zero. `sheet_sync_state` contained three rows. Read-only Sheet verification confirmed the synthetic student, ten-digit mobile display, and a date cell with `09:05, 14:03`; the cell note retained both event IDs.
- A systemd timer runs the existing one-shot Sheets worker every five minutes. It is enabled and active; its first manual service execution returned success. The worker remains bounded and retry-safe. Its unit and installer are versioned under `infra/server/`.

## Local validation

Backend lint and TypeScript build passed. Seven backend test files / 31 tests passed. Apps Script contract tests, firmware static checks, repository secret/hardware-boundary checks, and `git diff --check` passed. The time-sensitive worker test was adjusted to use a current test clock instead of a date already in the past.

## Remaining gates

1. Obtain a **new hostname under owner-controlled DNS** for this staging VPS, create its DNS record, install a reverse proxy with trusted HTTPS, and verify the live certificate chain and `/health`, `/ready`, and device endpoint through that hostname. The Hostinger dashboard was not accessible through the available Chrome browser connection on 2026-09-28, so no domain ownership or DNS record was asserted. Do not use a provider hostname, legacy domain, or TLS material as a substitute. Port 80/443 firewall rules alone do not provide HTTPS.
2. Create the ignored staging device firmware configuration with the new HTTPS endpoint, trust anchor, and rotated staging credential; compile and hash a **fresh** binary. The prior placeholder binary is not uploadable.
3. Obtain explicit approval before any ESP access, reset, erase, upload, or physical test. Preserve the two verified 4 MiB rollback images (matching SHA-256 `F05436390348437F90723F0EC0D7F1395417EEEA1E698099972E7FEE655FB0BE`). No hardware operation was performed in this deployment.
4. Meta WhatsApp staging credentials were not supplied, so Meta was not configured. No dashboard or production cutover was attempted.

## Operational checks and rollback

- Compose deployment: `/opt/ai-attendance/infra/docker-compose.staging.yml`, using root-only `/opt/ai-attendance/infra/.env.staging`.
- Worker schedule: `systemctl status ai-attendance-sheets-worker.timer`; bounded run: `systemctl start ai-attendance-sheets-worker.service`. Disable the timer first if staging Sheets projection must pause. Database attendance remains authoritative during a Sheets outage.
- If a new deployment fails, keep the previous image and database volume, stop only the new staging service or timer, and inspect logs without printing environment values. Do not remove the volume or run destructive migration rollback automatically.
- Firmware rollback is separate and requires explicit recovery approval; no upload has occurred in this VPS milestone.

## Source and isolation

The live deployment uses the committed Phase 5–7 source tree and the focused new-VPS deployment configuration. `Attendance/secrets.h`, `Attendance/device_secrets.h`, build outputs, VPS `.env.staging`, and device credential JSON remain excluded from Git. Production spreadsheet writes: none. Production Apps Script writes/deployments: none. Old infrastructure touched: no. ESP accessed/uploaded: no.
