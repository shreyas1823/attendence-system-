# Phase 5 Device API

## Scope and safety boundary

Phase 5 adds and locally tests an authenticated device-facing API. It does not modify or connect the ESP8266, Apps Script, Google Sheets, Meta, staging infrastructure, or production. The frozen Phase 1 path remains operational and is not redirected to this API.

The stable API base is `/api/v1/device`. The backend database—not a client-supplied student ID—is authoritative.

## Architecture

```text
HTTP request
  -> per-route rate limit
  -> device authentication
  -> Zod request validation
  -> fingerprint enrollment/student resolution
  -> attendance service transaction
  -> attendance + receipt + outbox commit
```

Routes contain transport mapping only. Authentication, provisioning, attendance policy, and database operations remain separate services/repositories.

## Endpoints

| Method | Path | Authentication | Purpose |
| --- | --- | --- | --- |
| POST | `/api/v1/device/attendance` | Device identifier + bearer credential | Record/replay one attendance event |
| POST | `/api/v1/device/heartbeat` | Device identifier + bearer credential | Update authenticated device `last_seen_at` |
| GET | `/openapi.json` | None | OpenAPI 3.1 contract generated from runtime Zod schemas |

Provisioning is deliberately not exposed as an HTTP endpoint.

## Authentication model

Each request supplies:

- `x-device-id`: stable public device identifier.
- `Authorization: Bearer <opaque credential>`: secret device credential.

Only an `ACTIVE` device with a non-revoked Argon2id credential hash authenticates. Plaintext credentials are never stored in PostgreSQL. Successful use updates `device_credentials.last_used_at`. Unknown, inactive, revoked, credential-less, and incorrectly authenticated devices all receive the same HTTP 401 response so existence is not disclosed.

The lifecycle is:

- `ACTIVE`: authentication and device calls allowed.
- `INACTIVE`: authentication denied; an administrator may later reactivate it.
- `REVOKED`: authentication denied; intended as terminal disablement.

The API never accepts a client-selected lifecycle status.

## Controlled provisioning and rotation

`DeviceProvisioningService` is an internal service. It creates cryptographically random 256-bit credentials, persists only Argon2id hashes, supports rotation by revoking prior active credentials in the same transaction, and supports explicit credential revocation.

For local development only:

```powershell
pnpm device:provision -- --device-id DEV-ESP-LOCAL-001 --name "Local Attendance Device" --output dev-esp.json
```

The command refuses `NODE_ENV=production`, never prints the credential, refuses to overwrite an existing output file, and writes the one-time value under ignored `backend/.device-credentials/`. A future administrator must deliver the provisioned credential to firmware through an approved secure staging process; that process is deferred to Phase 6.

## Attendance request

```json
{
  "eventId": "device-generated-stable-event-id",
  "fingerprintId": 17,
  "occurredAt": "2026-09-20T09:05:00+05:30",
  "eventType": "ATTENDANCE"
}
```

Rules:

- `eventId`: non-empty, maximum 128 characters, stable across retries.
- `fingerprintId`: integer from 1 through 127.
- `occurredAt`: ISO 8601 timestamp with an explicit offset.
- `eventType`: exactly `ATTENDANCE` in API v1.
- Unknown properties and arbitrary student IDs are rejected.
- `attendance_date` is derived by the backend from `occurredAt` using configured `TIME_ZONE` (default `Asia/Kolkata`). The device cannot select the attendance date directly.

## Attendance responses

Recorded first or second event — HTTP 201:

```json
{
  "status": "recorded_first_scan",
  "attendanceRecordId": "00000000-0000-0000-0000-000000000000",
  "duplicate": false
}
```

`status` is `recorded_second_scan` for the second accepted event.

Previously processed event — HTTP 200:

```json
{
  "status": "attendance_event_replayed",
  "attendanceRecordId": "00000000-0000-0000-0000-000000000000",
  "duplicate": true
}
```

Daily limit reached — HTTP 409:

```json
{
  "status": "daily_limit_reached",
  "attendanceRecordId": null,
  "duplicate": false
}
```

A retry of the rejected third event returns the same status with `duplicate: true`.

## Idempotency and concurrency

Identity is `(authenticated device UUID, eventId)`, never a timestamp. The first accepted request creates attendance, an accepted receipt, and one outbox job in a single transaction. Replays read the receipt and create nothing. A unique database constraint protects concurrent duplicates; a losing transaction rolls back and returns the stored winner’s deterministic result. Tests submit concurrent duplicates and verify one attendance record.

## Two-attendance policy

For the resolved student and backend-derived local date:

- zero active records: accept as `recorded_first_scan`;
- one active record: accept as `recorded_second_scan`;
- two active records: create a rejection receipt but no attendance/outbox, then return `daily_limit_reached`.

Individual PostgreSQL attendance rows remain immutable. The later `09:05, 14:03` Sheets cell is only a projection concern.

## Fingerprint resolution

The authenticated device submits only a sensor fingerprint ID. The backend resolves the active globally unique enrollment and active student. One or two enrollment slots may point to the same student. Fingerprint ID is never treated as student ID. Unknown or inactive enrollment returns HTTP 404 after successful device authentication.

The Phase 5 schema reflects the current single-sensor/global-template namespace. Per-device sensor-template namespaces are deferred until multi-device hardware requirements are approved; the global uniqueness constraint prevents silent reassignment today.

## Heartbeat

Request:

```json
{ "eventType": "HEARTBEAT" }
```

Success — HTTP 200:

```json
{
  "status": "ok",
  "serverTime": "2026-09-20T03:35:00.000Z"
}
```

Only `last_seen_at` and `updated_at` of the authenticated active device are updated. The body cannot mutate status, name, credentials, or arbitrary fields.

## Error contract

```json
{
  "error": {
    "code": "validation_error",
    "message": "Request validation failed",
    "requestId": "req-1"
  }
}
```

| HTTP | Code | Meaning |
| --- | --- | --- |
| 400 | `validation_error` / `bad_request` | Schema, type, or JSON parsing failure |
| 401 | `authentication_failed` | Generic device authentication failure |
| 404 | `unknown_fingerprint` | Authenticated request has no active enrollment/student |
| 409 | attendance response `daily_limit_reached` | Two active records already exist for the date |
| 413 | `payload_too_large` | Configured body limit exceeded |
| 429 | `rate_limit_exceeded` | Per-IP endpoint limit exceeded |
| 500 | `internal_error` | Safe unexpected failure response |

Responses never include stack traces, database error details, or credential material.

## Rate limiting and request limits

Rate limiting occurs before authentication and is keyed by normalized source IP, protecting valid and invalid credential paths. Defaults are deliberately above expected single-device bursts:

- attendance: 120 requests per 60 seconds;
- heartbeat: 30 requests per 60 seconds;
- body size: 16 KiB.

Configure with `DEVICE_ATTENDANCE_RATE_LIMIT`, `DEVICE_HEARTBEAT_RATE_LIMIT`, `DEVICE_RATE_LIMIT_WINDOW_MS`, and `REQUEST_BODY_LIMIT_BYTES`. Multi-instance deployment will require a shared rate-limit store; the current in-memory store is appropriate only for this local milestone.

## Security decisions

- Argon2id hashes only; generated plaintext returned once at provisioning.
- Authorization, device identifier, cookies, and legacy device-key headers are redacted in structured logging.
- Authentication happens before request-body domain validation or attendance work.
- Drizzle parameterizes database access.
- Zod strict schemas reject unknown or mistyped fields.
- Helmet, explicit CORS, small body limits, safe centralized errors, and per-route rate limits are enabled.
- No public provisioning, production device, external integration, or real credential exists.

## Local manual testing

After configuring ignored `backend/.env`, applying migrations, and provisioning a synthetic device, load the ignored credential file locally:

```powershell
$device = Get-Content .device-credentials/dev-esp.json | ConvertFrom-Json
$headers = @{
  'x-device-id' = $device.deviceIdentifier
  Authorization = "Bearer $($device.credential)"
}
```

Heartbeat:

```powershell
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3000/api/v1/device/heartbeat' `
  -Headers $headers -ContentType 'application/json' -Body '{"eventType":"HEARTBEAT"}'
```

Attendance and retry (use a synthetic fingerprint created in the local database):

```powershell
$event = @{
  eventId = 'replace-with-one-stable-synthetic-event-id'
  fingerprintId = 17
  occurredAt = '2026-09-20T09:05:00+05:30'
  eventType = 'ATTENDANCE'
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3000/api/v1/device/attendance' `
  -Headers $headers -ContentType 'application/json' -Body $event

# Repeat the exact request to verify deterministic replay.
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3000/api/v1/device/attendance' `
  -Headers $headers -ContentType 'application/json' -Body $event
```

Create two different event IDs for the same student/date, then submit a third to verify HTTP 409. Replace the bearer value with a placeholder invalid value to verify HTTP 401; never paste a real credential into documentation or shell history intended for sharing.

## Automated testing

Run:

```text
pnpm lint
pnpm build
pnpm test
```

Tests use PGlite and synthetic students/devices. They cover valid, invalid, missing, revoked and disabled authentication; rotation; heartbeat mutation; one/two fingerprints; first/second/third attendance; replay and concurrent duplication; transaction/outbox behavior; malformed and oversized requests; rate limiting; OpenAPI; hashed storage; logging redaction; and previous Phase 3/4 behavior.

## Deferred work

- ESP firmware integration and secure device credential installation: Phase 6.
- Google Sheets outbox adapter: Phase 7.
- Meta WhatsApp, dashboard, production migration, cloud deployment, and public exposure: later separately approved milestones.

The eventual ESP request must send the two authentication headers plus `eventId`, `fingerprintId`, offset-aware `occurredAt`, and fixed `eventType`. It must retain the stable event ID during offline retries and interpret HTTP/status bodies without treating all HTTP success responses as equivalent. No firmware changes are included in Phase 5.
