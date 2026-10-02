# Attendance Admin Dashboard

React 18 + Vite + TypeScript SPA for the biometric attendance system. Talks to the Fastify REST API (`/api/v1`).

## Run

```
npm install
cp .env.example .env     # VITE_USE_MOCK=true serves everything from an in-browser mock API
npm run dev              # http://localhost:5173
```

Mock logins: `admin@school.edu / admin123`, `operator@school.edu / operator123`, `viewer@school.edu / viewer123`.

Set `VITE_USE_MOCK=false` and `VITE_API_BASE_URL` to use the real backend. The backend's admin endpoints are not implemented yet; `src/api/services/index.ts` and `src/api/mock/adapter.ts` together define the contract it needs to satisfy.

## Scripts

`npm run lint` (tsc) · `npm test` (Vitest) · `npm run e2e` (Playwright, uses the mock API) · `npm run build`

## Layout

```
src/
  api/          axios client (token + 401 handling), services/, mock/ (in-memory backend)
  auth/         AuthContext, route guards (RequireAuth, RequirePermission, <Can>), permissions map (RBAC)
  hooks/        TanStack Query hooks + query-key factory (queries.ts)
  types/        types mirroring the Postgres schema and API envelopes
  components/   ui/ (Radix/shadcn-style primitives), layout/, dashboard/, common/
  features/     students/ (biometric status, enrollment), attendance/ (correction dialog)
  pages/        one lazy-loaded page per route
e2e/            Playwright specs
```

## Notes

- RBAC in the UI is a convenience; the API must enforce roles. The mock adapter enforces them to mimic that.
- Attendance corrections never edit in place: the dialog posts to `/attendance/:id/corrections`, which must write `attendance_corrections` and `audit_events` in one transaction.
- The Reports "PDF" button opens the browser print dialog (Save as PDF); CSV is generated client-side.
