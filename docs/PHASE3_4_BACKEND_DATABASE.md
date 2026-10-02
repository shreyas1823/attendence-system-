# Phase 3/4 Backend and PostgreSQL Foundation

## 1. Scope and baseline

This milestone adds an isolated backend foundation without cutting over the frozen Phase 1 staging path. Work began from commit `e3edce2c7a4b8de0e399c0a0d4ebeab1666d544d` and tag `phase1-staging-final-2026-09-20`. The ESP8266 firmware, Apps Script integration, Google Sheets, deployments, staging system, and production system were not modified.

Pre-existing untracked paths were `UI_Reference/`, `docs/PHASE2_LIVE_PRODUCTION_RECONCILIATION.md`, and `docs/PHASE2_PRODUCTION_AUDIT.md`; they are not part of this milestone.

## 2. Selected stack

The runtime uses Node.js/TypeScript, Fastify, Zod, PostgreSQL, postgres.js, Drizzle ORM and migrations, Argon2id, and structured Fastify/Pino logging. Vitest and PGlite provide deterministic isolated PostgreSQL-compatible tests. PGlite is test-only; deployed runtime storage remains PostgreSQL through `DATABASE_URL`.

Pinned versions: Node.js 24.19.0 (host), TypeScript 7.0.2, Fastify 5.12.5, Zod 4.6.5, PostgreSQL image 17.7-alpine, postgres.js 3.4.9, Drizzle ORM 0.45.2, Drizzle Kit 0.31.10, Argon2 0.45.1, Vitest 5.0.1, and PGlite 0.5.8.

## 3. Architecture boundary

`src/modules` owns HTTP route boundaries; `src/services` owns business transactions; `src/repositories` owns persistence queries; `src/db` owns schema, client, migrations, and fake seed data; `src/config` validates environment configuration; `src/security` isolates credential hashing.

The frozen Apps Script remains the operational adapter during migration. No backend route currently claims production ownership.

## 4. Configuration and secrets

Runtime configuration comes only from environment variables. Required secrets are `DATABASE_URL` and `SESSION_SECRET`; allowed browser origins are explicit in `CORS_ORIGINS`. Real credentials are absent from source. `.env.example` files contain placeholders, while `.env` remains ignored by the repository policy.

## 5. Database entities

The migration creates exactly these core tables:

1. `students`
2. `fingerprint_enrollments`
3. `devices`
4. `device_credentials`
5. `attendance_records`
6. `device_event_receipts`
7. `attendance_corrections`
8. `notifications`
9. `notification_attempts`
10. `outbox_jobs`
11. `sheet_sync_state`
12. `absence_runs`
13. `settings`
14. `users`
15. `sessions`
16. `audit_events`

## 6. Student identity

The public student ID is unique and separate from the internal UUID. Names must be non-empty. Canonical mobile numbers are stored in E.164 form for future provider compatibility; presentation formatting remains an adapter concern. Status supports non-destructive deactivation.

## 7. Fingerprint model

Each enrollment maps a globally unique device fingerprint ID to one student and slot 1 or 2. A student may therefore own one or two fingerprints. Range checks preserve the current sensor ID range. Revocation is explicit rather than destructive.

## 8. Device identity and credentials

Devices have unique stable identifiers and lifecycle status. Device credentials are separate records containing only credential hashes, supporting rotation and revocation without embedding provider or database secrets in firmware.

## 9. Attendance model

Each scan is an immutable attendance record with event time, college-local attendance date, device, fingerprint enrollment, student, and status. Corrections are separate audited records. The maximum of two active scans per student per attendance date is intentionally enforced by the transactional service rather than a brittle database row-count constraint.

## 10. Idempotency model

`device_event_receipts` has a unique `(device_id, event_id)` key. Replays return the stored outcome and cannot create a second attendance row or outbox job. Rejected third scans are also receipted, so their retries are deterministic.

## 11. Attendance transaction

The service performs one database transaction: locate a prior receipt; resolve active fingerprint and student; lock the student row; count non-void records for the date; reject and receipt a third scan, or insert attendance, accepted receipt, and outbox job. Any error before commit rolls back every write. The student lock serializes competing scans for the same student/date.

## 12. Outbox and synchronization

Attendance and its `attendance.recorded` outbox job commit atomically. Future workers will claim pending jobs and synchronize Google Sheets or notifications. `sheet_sync_state` tracks external projection state without making Sheets authoritative. Worker implementation and live synchronization are deferred.

## 13. Authentication and authorization foundation

Users, roles, Argon2id password hashes, and hashed revocable sessions are represented. Device credentials use a separate trust boundary. Login endpoints, RBAC middleware, issuance policy, rate limiting, and account recovery are deferred until the authentication milestone.

## 14. HTTP foundation

`/health` reports process availability. `/ready` performs a database query and returns 503 without leaking connection details on failure. Empty versioned modules reserve coherent boundaries for auth, students, attendance, devices, reports, notifications, settings, and audit. OpenAPI route schemas and business endpoints remain deferred rather than publishing an unstable contract.

## 15. Security controls

Startup rejects missing or malformed required configuration. CORS is allow-list based. Helmet adds baseline headers. Authorization, cookies, and device-key headers are redacted from logs. Production error responses omit stack traces and database detail. Password hashing uses Argon2id. No default production credentials or Meta/Google credentials exist.

## 16. Local development

`infra/docker-compose.yml` supplies a local PostgreSQL 17 service and persistent named volume. It requires a local password from ignored `infra/.env`; it does not encode a real secret. Docker was not present on the audit host, so Compose was created but not executed. See `backend/README.md` for commands.

## 17. Seed policy

Seed data is synthetic (`DEV001`, `DEV002`, reserved example phone numbers, and a development device). Seeding refuses to run under `NODE_ENV=production`. No live student, phone, credential, or sheet data is copied.

## 18. Test strategy

Tests apply the committed migration to an isolated in-process PostgreSQL-compatible PGlite database. They verify schema constraints, foreign keys, one/two-fingerprint mapping, two daily attendance records, third-scan rejection, retry idempotency, transactional rollback, health/readiness responses, and safe errors. Type checking and build validation run independently.

## 19. Deployment requirements

A future environment needs managed PostgreSQL with TLS, secret-managed environment variables, migration execution as a controlled release step, a non-root Node runtime, HTTPS ingress, backups/PITR, observability, and separate staging/production databases and credentials. No cloud resource or deployment was created in this milestone.

## 20. Deferred work and hard stop

Deferred: Phase 5 ESP/API cutover, live Sheet synchronization worker, Google data migration, production reconciliation actions, complete authentication/RBAC endpoints, dashboard, Meta WhatsApp integration, reporting, cloud provisioning, and production deployment. Those require separate approval. This milestone stops at the tested backend/database foundation.

Recommended commit message: `feat: add isolated backend and postgres foundation`

## 21. Repository structure

- `backend/src/app` — Fastify composition and cross-cutting HTTP behavior
- `backend/src/config` — typed environment validation
- `backend/src/db` and `backend/drizzle` — schema, runtime client, migration runner, seed, and deterministic SQL migration
- `backend/src/modules` — versioned API boundaries without premature business endpoints
- `backend/src/services` — transaction and domain policy
- `backend/src/repositories` — database operations
- `backend/src/security` — Argon2id abstraction
- `backend/tests` — isolated integration and API tests
- `infra` — optional local PostgreSQL Compose setup

## 22. Relationships, indexes, and constraints

Students own fingerprint enrollments and attendance. Devices own credentials and receipts. Attendance references the student, device, and exact fingerprint enrollment. Receipts may reference the resulting attendance. Corrections reference both attendance and an acting user. Notifications reference students and optionally attendance; attempts belong to notifications. Sessions belong to users.

Unique keys protect student IDs, device identifiers, fingerprint IDs, student fingerprint slots, device/event receipts, user emails, session hashes, absence dates, and synchronization entities. Foreign keys use restrictive deletion for attendance history, cascading deletion only for dependent credentials/sessions/attempts, and nulling only for optional historical actors/references. Daily attendance and dispatch indexes cover the primary read/worker paths.

## 23. Migration instructions and reversibility

Generate locally with `pnpm db:generate`, inspect the SQL, then apply with `pnpm db:migrate` against an explicitly configured local `DATABASE_URL`. The initial migration is deterministic and needs no remote database. Drizzle does not generate a down migration here; rollback before production adoption is database disposal/restoration because this schema currently owns no production data. A reviewed forward/down plan and backup gate are required before any production migration.

## 24. Known limitations

Docker was unavailable on the implementation host, so the Compose service was not executed. Migration behavior and PostgreSQL constraints were instead exercised through isolated PGlite. No device authentication endpoint exists yet. No outbox worker, Google adapter, scheduler, dashboard login, OpenAPI publication, rate limiter, cloud monitoring, or production database exists. Event dates are accepted by the internal service and must later be derived/validated using the institution timezone and device trust policy at the Phase 5 API boundary.

## 25. Exact next milestone

The next separately approved milestone is **Phase 5 — Device API**: finalize device authentication and rotation, publish the validated attendance request/response contract with OpenAPI schemas, connect only a controlled staging device, and preserve the current Apps Script path until equivalence and rollback gates pass. No Phase 5 work is included here.
