# AI Attendance Backend

This directory contains the isolated Phase 3/4 backend and PostgreSQL foundation. It does not replace the frozen ESP8266 → Apps Script → Google Sheets path yet.

## Requirements

- Node.js 22 or newer (validated with Node.js 24.19.0)
- pnpm 11.25.0
- PostgreSQL 17 for local runtime, or Docker Compose

## Local setup

1. Copy `infra/.env.example` to `infra/.env` and replace its local-only password.
2. Run `docker compose --env-file infra/.env -f infra/docker-compose.yml up -d` from the repository root.
3. Copy `backend/.env.example` to `backend/.env` and set a matching `DATABASE_URL` and a random session secret of at least 32 characters.
4. In `backend`, run `pnpm install`, `pnpm db:migrate`, and optionally `pnpm db:seed`.
5. Run `pnpm dev`.

Never commit either `.env` file. The seed command refuses to run when `NODE_ENV=production` and uses synthetic records only.

## Commands

- `pnpm build` — compile TypeScript
- `pnpm lint` — strict type check without output
- `pnpm test` — isolated database and API tests
- `pnpm db:generate` — generate a migration from the Drizzle schema
- `pnpm db:migrate` — apply committed migrations
- `pnpm db:seed` — insert fake local-development records
- `pnpm device:provision -- --device-id DEV-ESP-LOCAL-001 --name "Local Device" --output dev-device.json` — create a synthetic local device and write its one-time credential into ignored `.device-credentials/`
- `pnpm worker:sheets` — claim and process one bounded batch of Sheets outbox jobs using staging-only environment configuration

## API foundation

- `GET /health` reports process health.
- `GET /ready` verifies database connectivity and returns HTTP 503 when unavailable.
- Versioned route boundaries exist under `/api/v1` for auth, students, attendance, devices, reports, notifications, settings, and audit. Their externally callable business endpoints are intentionally deferred.
- `POST /api/v1/device/attendance` authenticates a device and records an idempotent attendance event.
- `POST /api/v1/device/heartbeat` authenticates a device and updates its last-seen time.
- `GET /openapi.json` publishes the device contract generated from the runtime Zod schemas.

Configuration is validated at startup. CORS uses only explicitly configured origins, sensitive headers are redacted, and unexpected errors return generic bodies without stack traces.

See `docs/PHASE5_DEVICE_API.md` for the complete contract, local placeholder-based examples, status codes, and security boundaries. The Phase 1 firmware is not connected to these endpoints yet.

The one-shot Sheets worker uses the existing Apps Script form contract as a
staging adapter. PostgreSQL commits attendance before the worker runs; transient
Sheets failure reschedules the outbox job and never rolls attendance back. See
`docs/PHASE6_7_MIGRATION.md` for the migration boundary and upload gates.
