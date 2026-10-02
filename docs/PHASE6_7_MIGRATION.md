# Phase 6/7 controlled migration

> **Live staging update, 2026-09-28:** The new isolated VPS now runs PostgreSQL,
> Fastify, and a scheduled Sheets outbox worker. Live synthetic Device API and
> staging Sheet checks passed. The historical 2026-09-20 blocked-gate account
> below describes the state *at that time*; see
> [the current deployment checkpoint](PHASE6_7_NEW_VPS_STAGING_CHECKPOINT.md)
> for the authoritative current status. HTTPS and hardware upload remain blocked
> pending a newly controlled hostname, TLS verification, a fresh firmware build,
> and explicit hardware-upload approval.

Date: 2026-09-20 (Asia/Kolkata)

## Result

**SOFTWARE PASS; HARDWARE UPLOAD GATE BLOCKED.** The firmware transport and server-side Sheets mirror are implemented and locally validated. No firmware was uploaded because the required deployed staging API, real database, provisioned device credential, and live TLS/API/Sheets checks are not available or verified. Production and the physical ESP were untouched.

## Architecture transition

```text
Attendance:  ESP8266 --verified HTTPS--> Device API v1 --> PostgreSQL
                                                       --> transactional outbox
                                                       --> one-shot Sheets worker
                                                       --> staging Apps Script --> staging Sheet

Registration (temporary compatibility path):
             ESP8266 --> existing staging Apps Script --> staging Sheet
```

PostgreSQL is authoritative. A Sheets failure cannot roll back committed attendance. The existing Apps Script deployment remains available for registration compatibility and rollback; it was not changed or deployed in this milestone.

## Firmware migration

- Attendance uses `POST /api/v1/device/attendance` with the Phase 5 payload: stable `eventId`, `fingerprintId`, offset-bearing `occurredAt`, and `eventType: ATTENDANCE`.
- Authentication uses `x-device-id` and `Authorization: Bearer ...`. Values come from ignored `Attendance/device_secrets.h`; the tracked example contains placeholders only.
- The Device API path requires HTTPS and a configured CA trust anchor. Disabling verified TLS is a compile-time error. Credentials and response bodies are not logged.
- Registration retains the existing staging Apps Script transport. Its staging-only legacy TLS compatibility setting remains isolated and is not approved as the final attendance transport.
- LittleFS student records, two fingerprints per student, optional second fingerprint, two local attendance events per day, stable queued event IDs, LCD/buzzer behavior, enrollment flow, and locked GPIO mappings remain intact.
- Locked mapping: fingerprint D5/D6, LCD D2/D1 at `0x27`, buzzer D0.

### Response and retry classification

| Result | Firmware action |
| --- | --- |
| 201 first/second attendance | definitive success; dequeue |
| 200 idempotent replay | definitive success; dequeue |
| 409 daily limit | definitive logical result; dequeue |
| 404 unknown fingerprint | permanent failure; archive to dead letter |
| 401 authentication failure | permanent failure; archive to dead letter |
| 429, 5xx, network error, malformed success | retry; retain queue record |
| Other 4xx | permanent failure; archive to dead letter |

Time must be synchronized before a new attendance event is transmitted. Queued records preserve their original event ID across reboot and retry. Permanent errors are retained in a dead-letter file instead of being silently discarded or retried forever.

## Device configuration

Tracked configuration contains no live identity or credential. A hardware candidate requires an ignored `Attendance/device_secrets.h` containing a staging HTTPS endpoint, stable device identifier, one-time provisioned device credential, and the endpoint certificate's validating root CA. The current file is absent, so the produced binary uses placeholders and **must not be uploaded**.

## Transactional outbox and Sheets adapter

- Student creation writes `student.created` in the same database transaction as the student/fingerprint records.
- Attendance already writes `attendance.recorded` in the same transaction as attendance and its idempotency receipt.
- The bounded `pnpm worker:sheets` command claims eligible jobs with row locking and `SKIP LOCKED`, recovers stale processing leases, and records `PENDING`, `PROCESSING`, `COMPLETED`, or `FAILED` transitions.
- Retryable failures use bounded exponential backoff and a maximum attempt count. The Apps Script request has a configurable bounded timeout.
- Before attendance projection, the worker idempotently projects the student. This repairs ordering or missed student-sync cases because the existing Apps Script attendance contract requires the master row.
- The adapter reuses the existing authenticated form contract and preserves both fingerprint IDs, ten-digit visible mobile handling, `DD-MM-YYYY`, `HH:mm:ss` input, and event IDs used by Apps Script for cell-note idempotency.
- Successful projection updates `sheet_sync_state`. Network/429/5xx/invalid responses are retryable; rejected non-retryable responses become permanent failures. No secret is logged.
- The worker is one-shot and scheduler-ready; it has no uncontrolled polling loop.

Required server-only staging variables are `SHEETS_ADAPTER_URL`, `SHEETS_ADAPTER_SECRET`, `SHEETS_ADAPTER_TIMEOUT_MS`, and the documented worker batch/retry/lease settings. None are embedded in firmware or tracked with real values.

## Validation

| Check | Result |
| --- | --- |
| Backend lint | PASS |
| Backend TypeScript build | PASS |
| Backend tests | PASS — 6 files, 29 tests |
| Apps Script contract tests | PASS |
| Firmware static contract | PASS |
| Repository/secret/hardware-boundary checks | PASS |
| `git diff --check` | PASS |
| Arduino compile | PASS |
| Live PostgreSQL/API/Sheets integration | NOT RUN — staging services/credentials unavailable |
| Hardware functional matrix | NOT RUN — upload gate blocked |

Automated coverage includes authenticated Device API behavior, duplicate event replay, two daily attendances and third rejection, two fingerprint mappings, transactional outbox creation, worker state transitions, retry/permanent failure, adapter contract/idempotency, and proof that a Sheets outage does not undo attendance. PGlite is used for automated database integration; it is not evidence of a deployed PostgreSQL environment.

## Build artifact

| Item | Value |
| --- | --- |
| Binary | `D:\IoT\build\phase6-staging\Attendance.ino.bin` |
| Size | 467,424 bytes |
| SHA-256 | `030ACEACB46E0C7FD0F252D928EEFE795F29F1AED88F8992D25F3C02C6EEE1A4` |
| FQBN | `esp8266:esp8266:nodemcuv2` (NodeMCU 1.0 / ESP-12E) |
| Arduino CLI | 1.5.1 (`01f3d4f2b`) |
| ESP8266 core | 3.1.2 |
| Libraries | Adafruit Fingerprint 2.1.4; LiquidCrystal_I2C 2.0.0 |
| RAM | 39,408 / 80,192 bytes (49%) |
| IRAM | 63,963 / 65,536 bytes (97%) |
| Flash code | 422,380 / 1,048,576 bytes (40%) |
| Built | 2026-09-20 17:02:20 +05:30 |

The high 97% IRAM usage remains a constraint. The binary contains placeholder Device API configuration, is intentionally outside Git, and is not an upload candidate.

## Rollback and connection evidence

Both independent 4 MiB backups remain present outside Git and match SHA-256 `F05436390348437F90723F0EC0D7F1395417EEEA1E698099972E7FEE655FB0BE`. Their paths remain under `D:\IoT-private-backups\current-known-good-2026-09-19\run-1` and `run-2`.

Windows read-only enumeration identifies the Silicon Labs serial adapter as COM3. No chip probe was performed because entering the bootloader could reset the running ESP. Therefore the physical chip/board was not independently re-detected in this milestone; NodeMCU ESP-12E identity comes from the previously verified checkpoint.

Rollback after an approved failed test is: stop testing, preserve logs, restore the verified full 4 MiB image only under an explicit recovery approval, then verify boot, fingerprint/LCD/buzzer, the original Apps Script path, and attendance. Never clear LittleFS or issue the firmware clear command as an improvised recovery step.

## Hardware upload gate

| Gate | Status |
| --- | --- |
| Rollback backup | PASS — two matching verified images |
| Firmware compile/hash | PASS, but placeholder/non-uploadable |
| Firmware static tests | PASS |
| COM port | COM3 enumerated read-only |
| Deployed staging API endpoint | BLOCKED — not provided/verified |
| Staging device ID and credential | BLOCKED — not provisioned into ignored config |
| TLS certificate validation | BLOCKED — CA and live handshake not verified |
| Staging backend running | BLOCKED — not verified |
| Real PostgreSQL running | BLOCKED — not verified |
| API health and attendance smoke test | BLOCKED — not run |
| Live staging Sheets adapter test | BLOCKED — server-side staging values unavailable/not used |

No upload is authorized while any gate is blocked. The eventual physical matrix must verify both fingerprints, first/second/third scans, idempotent replay, offline persistence/recovery, PostgreSQL/outbox/Sheets projection, LCD, buzzer, LittleFS preservation, and the registration compatibility path.

## Safety and unresolved work

- Production Apps Script/Sheets/deployments: untouched.
- Existing staging Apps Script/Sheet: untouched; no live request or deployment was made.
- ESP: not accessed, reset, erased, or uploaded.
- Rollback artifacts: read-only hash/size verification only.
- Secrets: none printed or committed; only placeholders are tracked.
- Git: no commit created.

To clear the gate, deploy an isolated HTTPS staging backend with PostgreSQL, provision a staging device using the Phase 5 workflow, install its values and correct CA only in ignored local configuration, configure the existing staging Apps Script adapter server-side, and pass authenticated API plus end-to-end outbox/Sheets smoke tests. Then rebuild and re-hash the real staging candidate before requesting explicit upload approval.

## Next milestone

Phase 6/7 is not fully complete until the blocked live and physical checks pass. After explicit approval and a successful controlled hardware test, the next milestone is **Phase 9 + Phase 10 — Web Dashboard Foundation + UI Implementation**. It was not started.

## New isolated staging infrastructure decision

The subsequent infrastructure directive requires completely new, AI Attendance-only staging infrastructure. No previous domain, VPS, PostgreSQL instance, API credential, environment file, or TLS material may be reused. In particular, the prohibited Onion/Cepa infrastructure must not be queried or referenced in runtime configuration.

Provisioning stopped before any external action because the repository and authorized tool context provide none of the following:

- a newly allocated VPS/container host or cloud project dedicated to AI Attendance;
- authorized administrative access to that new host/provider;
- a new hostname selected by the owner;
- control of the corresponding DNS zone;
- an approved deployment/runtime mechanism for the Fastify API and one-shot worker;
- staging Apps Script adapter values supplied through an approved server-side secret channel.

The repository contains only `infra/docker-compose.yml`, a localhost-bound PostgreSQL development service. It is not an internet-facing staging deployment and has not been started as one. No cloud infrastructure-as-code or remote deployment target exists.

To proceed safely, the owner must provide or authorize a newly created, dedicated host/cloud project and a new hostname under a controlled DNS zone. Once selected, DNS requires an `A` record pointing the hostname to the new host's public IPv4 address and, only if correctly configured on the host, an `AAAA` record for IPv6. TLS can then be issued for that exact hostname using a normal trusted ACME-capable certificate authority. Provider-specific firewall, reverse-proxy, service supervision, backup, and renewal configuration cannot be finalized until the host and hostname are known.

One repository compatibility item is also outstanding: backend environment validation currently accepts only `development`, `test`, and `production`; it does not yet accept the required `NODE_ENV=staging`. That source change must be made and tested as part of the deployment preparation after the infrastructure target is authorized.

No hostname was invented, no server/database/device was created, no DNS or TLS setting was changed, no credential was generated, and no staging or production endpoint was contacted during this reconciliation. The hardware upload gate therefore remains blocked.
