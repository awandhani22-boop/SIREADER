# SIREADER Unified Workspace — Local Integration Verification

Date: 2026-11-11 (Asia/Jakarta)

## Topology

- Browser / Vite: `http://127.0.0.1:3000`
- BFF: `127.0.0.1:3001`
- Python read-only API: `127.0.0.1:8000`
- Python workforce Command API: `127.0.0.1:8010`
- PostgreSQL 16 local QA database: `127.0.0.1:5432/sireader_disposable`
- OmniRoute local gateway: `127.0.0.1:20128`

The backend `DATABASE_URL` remains the existing Supabase pooler connection. The read-only API and command API use distinct local roles against the disposable local QA database. The workforce command database URL must never point to Supabase LIVE. Maintenance database URL remains intentionally empty.

## Configuration checks

- The frontend `.env` server-to-server `SIREADER_API_AUTH_TOKEN` matches backend `.env` exactly.
- The frontend `.env` `SIREADER_WORKFORCE_COMMAND_AUTH_TOKEN` matches backend `.env` exactly.
- `OPERATOR_PASSWORD_HASH` is present in the frontend `.env`; no password or hash was displayed or changed.
- The frontend does not need a database URL, database password, Anthropic key, or OmniRoute key.
- Backend `.env` remains Git-ignored. No secret values are stored in this report.

## Runtime acceptance

- Existing PostgreSQL 16 cluster was started from its existing data directory; no new cluster/database was created.
- Read-only API started successfully on `127.0.0.1:8000`.
- `GET /api/v1/system/status`, `/api/v1/workforce/runtime`, and `/api/v1/workforce/tasks` returned HTTP 200 when authenticated with the backend server token.
- System status returned `api_status=HEALTHY` and `database_status=CONNECTED`.
- Workforce Command API started successfully on `127.0.0.1:8010` and completed startup database privilege validation.
- Vite and BFF development launcher started successfully. Vite serves `127.0.0.1:3000`; BFF listens on `127.0.0.1:3001`.
- `GET /` through Vite returned HTTP 200.
- Unauthenticated `GET /api/auth/session` and `GET /api/v1/system/status` through Vite returned HTTP 401 `SESSION_REQUIRED` as intended.
- Unauthenticated BFF command POST was rejected with HTTP 401 `SESSION_REQUIRED`; direct Command API POST without its bearer token was rejected with HTTP 401. No command was accepted or written.

## Frontend verification

- `npm test`: 422 passed, 0 failed, 0 skipped.
- `npm run lint` (`tsc --noEmit`): passed.
- `npm run build`: passed.
- Non-blocking warnings remain: main JS chunk about 1.51 MB, React test `act(...)` warnings, and Three.js CommonJS deprecation.

## Boundaries and remaining owner check

- No operator password was read, guessed, reset, or changed. Authenticated browser dashboard verification remains pending until the owner signs in with the existing operator password.
- No workforce task was enqueued, cancelled, retried, or adjudicated.
- Worker runtime remains disabled; provider mode remains MOCK; live provider disabled; per-task USD cap remains zero.
- No paid model inference, Telegram listener/bot action, MT5/HFM operation, or trading execution occurred.
- No application migration, Supabase LIVE operation, Git commit, or Git push occurred.
- Existing backend/frontend working trees and all pre-existing uncommitted changes were preserved.

## Start / stop

From `C:\\SIREADER-UNIFIED\\virtual-office`, use `npm run dev` to start the BFF + Vite pair. Stop the launcher with Ctrl+C. The Python API, Command API, and PostgreSQL cluster are separate processes and must be stopped separately when the owner is finished testing.


## Authenticated browser dashboard review — 2026-11-11 05:24 Asia/Jakarta

The already-open Chromium tab `SIREADER Virtual Office` was read and showed an authenticated operator session, LIVE Backend/Observability panel, API HEALTHY, database CONNECTED, seven workers, and the seven-worker roster. This is browser-visible confirmation that the existing operator session and frontend LIVE view are active; the operator password was not read or changed.

### Critical source-of-truth qualification

The word `LIVE` in this local workspace means the browser is reading the currently running authenticated API/BFF rather than DEMO simulation state. It does **not** mean the data is coming from the production Supabase database. The current backend `.env` deliberately configures `SIREADER_API_DATABASE_URL` and `SIREADER_WORKFORCE_COMMAND_DATABASE_URL` to local `127.0.0.1:5432/sireader_disposable`. The core `DATABASE_URL` still points to the existing Supabase pooler, but the read-only workforce dashboard uses the dedicated local API URL instead.

Observed records from the local disposable database are old QA/acceptance records, not production account metrics:

- Workforce tasks: 21 total; 11 COMPLETED, 8 CANCELLED, and 2 FAILED. Titles include explicit QA labels such as `Expiration Test`, `Retention Shield Test`, `Atomic Review Quarantine Test`, `Archival Direct Release Test`, and `Single retry test`.
- Workforce runtime: 7 configured; 0 READY, 3 STALE, 4 OFFLINE; 0 active worker tasks; no worker process was running.
- Legacy pipeline: one PROCESSING record is `IN_FLIGHT_UNCONFIRMED`, created 2026-11-09 and over 31 hours old; one queue item is PENDING with reason `BLOCKED_HARD_BUDGET` and has not been updated since 2026-11-09. This must not be interpreted as a currently executing analysis or worker heartbeat.
- Market watch: one XAUUSD watch `WAITING_FOR_SPREAD`, stored spread 5.00000 pips; its recorded next-check timestamp is from 2026-11-09. This is not a live broker quote or current spread.
- AI telemetry contains one local `ci-model` record, IDR 100 actual + IDR 20 reserved. It is test/QA telemetry and not a real OmniRoute/Anthropic usage bill.
- Pending workforce and governance reviews: 0.
- Historical decision audit: one APPROVED entry from 2026-11-09.

No data was edited, cleared, retried, enqueued, adjudicated, or purged during this review.

### Production-data gate

Do not redirect the read-only API to Supabase merely by changing `.env`. The existing Supabase LIVE project was previously provisioned for Phase 3.1 read-only observability, while the workforce Phase 4/5 schema, views, command boundaries, review controls, and later Phase 7 release-boundary migration have only been verified against disposable/local PostgreSQL in this workspace. Before the dashboard can display real production workforce data, perform a migration/security deployment review, provision distinct least-privilege production identities and credentials, apply only separately approved additive migrations, then validate the API against that exact deployed schema. Keep the workforce Command API local-only unless a separate production architecture/security review authorizes otherwise. Do not point any test migration at Supabase LIVE.


## Effective database-target correction — 2026-11-11 (supersedes runtime portion above)

The integration and authenticated browser records above are historical observations from an earlier local API configuration. A later read-only parse of the current effective environment found `SIREADER_API_DATABASE_URL` is now a remote/pooler connection to database `postgres` using a `sireader_api_ro.*` identity; it is not currently pointed at `127.0.0.1:5432/sireader_disposable`. The Command API URL remains loopback `sireader_disposable` with `sireader_workforce_cmd`. The main `DATABASE_URL` remains the separate remote core/pooler connection.

This is a sanitized classification only; no connection URL, hostname, project reference, or password is reproduced. The production backup/staging record says the production snapshot initially contained only six Phase 3.1 views, whereas the current API startup privilege check requires all fourteen approved views. Workforce migrations were tested on isolated PG17.11 staging and are not evidenced as applied to Supabase LIVE. Do not start the API against the remote URL or weaken the startup audit until a separate production migration/cutover is approved and verified.

The ordinary worker now also requires a separate `WORKER_DATABASE_URL` with the dedicated `sireader_worker_runtime` identity for live mode; the active `.env` does not configure it. See `backend/docs/PRODUCTION_WORKER_DATABASE_IDENTITY_DESIGN_2026-11-11.md`.


## Final worker-DB safety note — 2026-11-11

Final source hardening blocks every worker mode from inheriting the current remote core `DATABASE_URL`. Only deterministic MOCK may use the core session factory, and only if the URL is loopback and targets an explicit disposable/test DB. Live or non-MOCK modes require a dedicated `WORKER_DATABASE_URL` using `sireader_worker_runtime` plus TLS and strict URL parsing. The environment has no worker URL and no production writer role has been provisioned.

Final post-hardening full backend suite: 702 passed, 1 skipped on disposable PostgreSQL 16.6; 42 focused DB-guard/runtime tests passed. Temporary PG server/data removed. Production role/RLS/maintenance/result-release design remains in `backend/docs/PRODUCTION_WORKER_DATABASE_IDENTITY_DESIGN_2026-11-11.md`.
