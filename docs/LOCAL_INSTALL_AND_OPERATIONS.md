# SIREADER Virtual Office — Local Install & Operations

**Supported deployment:** one user, one Windows workstation, loopback-only services. This is a personal local application runbook, not an enterprise or public deployment guide.

## 1. Local service map

| Component | Address | Purpose |
|---|---|---|
| Virtual Office / Vite | http://127.0.0.1:3000 | Browser UI |
| BFF | http://127.0.0.1:3001 | Same-origin proxy and operator session |
| Python observability API | http://127.0.0.1:8000 | Read-only LIVE snapshots |
| Workforce command API | http://127.0.0.1:8010 | Authenticated non-trading task commands |
| PostgreSQL | 127.0.0.1:5432 | Existing local database |

The expected frontend repository is `C:\Users\ASUS\.gemini\antigravity\scratch\SIREADER`; the backend repository is `C:\Users\ASUS\.gemini\antigravity\scratch\SIREADER-Python-Backend`.

**Do not expose these services to a LAN or the public internet.** Vite, BFF, and Python APIs are intended to bind to 127.0.0.1. Remote/multi-user access is outside this release scope.

## 2. Validated local toolchain

The workstation has been verified with:
- Windows PowerShell.
- Bun 1.4.4 and Node.js (current installed Node release).
- Python 3.12 at `C:\SIREADER\.venv\Scripts\python.exe`.
- PostgreSQL 16.6 at `127.0.0.1:5432`.
- Existing local application database: `sireader_disposable`.

Reuse that PostgreSQL instance and Python environment. **Do not reinstall PostgreSQL, create a second application database, drop/reset the existing database, or point test fixtures at it.** PostgreSQL integration tests must use a newly created disposable test cluster/database.

## 3. First-time setup

Open PowerShell.

### Frontend

```powershell
Set-Location 'C:\Users\ASUS\.gemini\antigravity\scratch\SIREADER'
bun install --frozen-lockfile
bun run lint
bun run build
```

### Backend

```powershell
Set-Location 'C:\Users\ASUS\.gemini\antigravity\scratch\SIREADER-Python-Backend'
& 'C:\SIREADER\.venv\Scripts\python.exe' -m pip install -r .\requirements.txt
& 'C:\SIREADER\.venv\Scripts\python.exe' -m pip check
```

Do not copy backend credentials into the frontend repo or any `VITE_*` variable. Keep local `.env` files ignored by Git and set secret values only in the intended local environment. Use the existing setup references `docs/OPERATOR_AUTH_SETUP.md` (frontend) and `docs/PHASE_3_1_API_GATEWAY_RUNBOOK.md` / `docs/PHASE_5_LOCAL_COMMAND_API_RUNBOOK.md` (backend) for configuration details. Never paste secret values into chat, terminal transcripts, or issue logs.

## 4. Start the local application

Start each component in its own PowerShell window. The following commands use the already provisioned local configuration; no credentials are shown.

**Window 1 — read-only Python API (port 8000):**

```powershell
Set-Location 'C:\Users\ASUS\.gemini\antigravity\scratch\SIREADER-Python-Backend'
& 'C:\SIREADER\.venv\Scripts\python.exe' -m app.api.server
```

**Window 2 — workforce command API (port 8010):**

```powershell
Set-Location 'C:\Users\ASUS\.gemini\antigravity\scratch\SIREADER-Python-Backend'
& 'C:\SIREADER\.venv\Scripts\python.exe' -m app.command_api.process
```

**Window 3 — Vite + BFF (ports 3000 and 3001):**

```powershell
Set-Location 'C:\Users\ASUS\.gemini\antigravity\scratch\SIREADER'
bun run dev
```

Open http://127.0.0.1:3000 in the browser. Stop each manually started process with Ctrl+C in its own window. Do not terminate processes by PID unless you have verified they are SIREADER-owned and the owner has asked you to stop them.

The legacy `python -m app.main` entrypoint is not used for these APIs; it belongs to the separate legacy Telegram application. Do not start it as part of Virtual Office operations.

## 5. Production-like local check

Stop only the development frontend/BFF from its own terminal with Ctrl+C. Keep the Python APIs and PostgreSQL available.

```powershell
Set-Location 'C:\Users\ASUS\.gemini\antigravity\scratch\SIREADER'
bun run test
bun run lint
bun run build
bun run start:production
```

The production BFF serves `dist/` on 127.0.0.1:3000. The production launcher expects the build to exist and fails closed if `dist/index.html` is missing. Do not run the development frontend and production BFF on the same port at the same time. Stop the production launcher with Ctrl+C.

## 6. Local diagnostics

Run from the frontend repo:

```powershell
.\scripts\check-local.ps1
```

The check reports whether the five expected loopback ports are listening and whether the browser UI responds. It does not read credentials, call worker commands, mutate the database, start/stop processes, or make provider requests.

Expected ports: 3000, 3001, 8000, 8010, 5432. A missing port means that component is not currently running; start only that component using section 4. A browser UI HTTP 200 does not by itself prove that the backend, database, or real workers are healthy.

## 7. Backup and restore

A synthetic PostgreSQL 16.6 backup/restore drill passed on a temporary cluster: a custom-format backup was restored into a separate empty disposable database and representative counts matched. **The application database itself was not backed up or restored during that drill.**

Before a local migration or other data-changing maintenance:
1. Confirm the database name and host are the intended local target.
2. Close the app's write surfaces and confirm no migration/maintenance command is running.
3. Create a backup outside either Git repository.
4. Check the backup archive listing.
5. Restore only into a newly created, empty recovery database first and verify the result before considering any application recovery.

The workstation's PostgreSQL client tools are in the existing local installation. In a fresh PowerShell session, expose that folder for this session only and verify the tools before running a backup:

```powershell
$pgBin = 'C:\Users\ASUS\.gemini\antigravity\scratch\pgsql\pgsql\bin'
$env:Path = "$pgBin;$env:Path"
Get-Command pg_dump, pg_restore, createdb
pg_dump --version
```

Example template (replace the placeholders locally; do not put passwords in the command line or this document):

```powershell
$backupDir = Join-Path $env:USERPROFILE 'SIREADER-Backups'
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$archive = Join-Path $backupDir "sireader-$stamp.dump"

pg_dump --format=custom --no-owner --no-acl --host=127.0.0.1 --port=5432 --username=<local-db-role> --dbname=sireader_disposable --file=$archive
pg_restore --list $archive
```

Restore rehearsal template, targeting a **new empty recovery database**, never the existing application database:

```powershell
createdb --host=127.0.0.1 --port=5432 --username=<local-db-role> sireader_recovery_check
pg_restore --no-owner --no-acl --host=127.0.0.1 --port=5432 --username=<local-db-role> --dbname=sireader_recovery_check $archive
```

Confirm row counts and application views before treating recovery as successful. Remove the temporary recovery database only after verifying the exact target name and confirming no sessions are connected. Keep backup files private and encrypted using Windows/device encryption; do not commit or upload them. If the local PostgreSQL authentication policy requires a password, use a locally protected PostgreSQL credential mechanism rather than embedding it in the command.

## 8. Update and rollback

Before updating:
- Preserve uncommitted changes and untracked patch files; do not use `git reset --hard`, `git clean`, or overwrite local work.
- Review the branch and diff in both repositories.
- Take a local database backup before any database migration.
- Install dependencies from the lockfile / pinned requirements, then run tests, typecheck, and build.

For source rollback, restore the last known-good local revision only after saving the current diff. For database rollback, use the migration's matching rollback script or restore into a separate recovery database and validate first. Never guess a down-migration, run a destructive command against `sireader_disposable`, or point rollback commands at Supabase LIVE.

## 9. Personal-use security baseline

Keep the protections that prevent common local mistakes:
- Loopback-only service binding.
- Operator login for controls that modify task/review state.
- Server-only API and command tokens; no credentials in browser storage or frontend bundles.
- Separate read-only and command database/API roles.
- Input/DTO validation, bounded requests, safe logs, and fail-closed behavior.
- Explicit SIMULATED versus LIVE labels and no implicit worker/provider activation.
- Local database backup before a data-changing operation.

A strict CSP, enterprise monitoring, multi-user access, public hosting, high-availability infrastructure, and compliance controls are intentionally not Phase 6 requirements for this private workstation application.

## 10. Known limitations at this phase

- The current scene uses procedural articulated humanoid avatars. The GLB loader and fallback path are present, but no final licensed GLB avatar asset is included.
- LIVE scene layout is deterministic and tested at 7, 50, and 100 worker records. The current office floor is a single-floor visualization; the layout helper rejects more than 175 workers rather than silently overlapping them.
- A formal Chrome/GPU frame-time and JavaScript heap benchmark at 100 simultaneously rendered avatars has not been recorded. Automated 100-worker layout tests are not a substitute for a rendered-browser FPS measurement.
- The production bundle's main JavaScript chunk is approximately 1.51 MB minified (about 405 KB gzip); the build succeeds but Vite reports a non-blocking large-chunk warning. Code splitting can be a later optimization if actual load time becomes a problem.
- LIVE backend availability does not mean real worker processes are running. Worker/provider execution remains a separately controlled capability; demo activity and cost/token values remain SIMULATED.

## 11. Safety boundary

This runbook does not authorize Supabase LIVE migrations, paid AI provider calls, Telegram processing, MT5/HFM or broker actions, live trading, or worker runtime activation. These require separate explicit approval and their own verification.


## Current workstation readiness note — 2026-11-11

This is an observed snapshot, not a permanent statement about future runs.

The read-only `scripts/check-local.ps1` diagnostic currently reports all five expected loopback services absent: Vite 3000, BFF 3001, Python observability API 8000, Workforce Command API 8010, and PostgreSQL 5432. The browser UI is not responding because Vite is not running. No process was started or stopped by the diagnostic.

A separate sanitized read of the backend environment shows:
- `DATABASE_URL`: remote/pooler host class, database `postgres`, `postgres.<project-ref>`-style identity.
- `SIREADER_WORKFORCE_COMMAND_DATABASE_URL`: loopback host class, database `sireader_disposable`, dedicated `sireader_workforce_cmd` identity.

Therefore this checkout's effective database targets are split. Do not assume the runbook's prior local-only PostgreSQL topology is currently active, and do not start the complete stack or run migrations until the operator has reconciled the intended local/remote database configuration. Never expose or paste either URL. The Phase 7.4 provider gate migration is test-only (`sireader_test`) and is not deployable to the remote database as written.


## Latest effective database topology correction — 2026-11-11

A sanitized read of the effective backend `.env` values now reports:
- `DATABASE_URL`: remote pooler, database `postgres`, broad `postgres.*` identity.
- `SIREADER_API_DATABASE_URL`: remote pooler, database `postgres`, dedicated read-only `sireader_api_ro.*` identity.
- `SIREADER_WORKFORCE_COMMAND_DATABASE_URL`: local loopback `sireader_disposable`, dedicated `sireader_workforce_cmd` identity.
- `SIREADER_WORKFORCE_MAINTENANCE_DATABASE_URL`: not configured.
- `WORKER_DATABASE_URL`: not configured.

This supersedes earlier snapshots in this runbook/integration docs that described the active API database URL as local. No URL or secret value was exposed. All five local services were absent in the most recent read-only diagnostics.

The read-only API startup audit requires 14 approved workforce/observability views and the expected ownership/grants/security-barrier settings. The production database snapshot recorded in the cutover plan had only the six original Phase 3.1 views; the 14-view workforce expansion was validated on an isolated PG17.11 staging clone, not proven deployed to production. Therefore do not start the API against the remote target until the migration/cutover gate has been approved and verified. Do not weaken the startup audit or point test fixtures at the remote database.

The new worker-specific connection code requires `WORKER_DATABASE_URL` with `sireader_worker_runtime` identity for live worker modes. The backend `.env` remains unchanged; no production writer identity exists yet. See `backend/docs/PRODUCTION_WORKER_DATABASE_IDENTITY_DESIGN_2026-11-11.md`.


## Final worker connection safety update — 2026-11-11

Worker DB connection safety now fails closed before any worker heartbeat/claim:
- LIVE/non-MOCK execution requires `WORKER_DATABASE_URL` and the dedicated `sireader_worker_runtime` identity.
- Remote connection requires TLS; URL must specify a database and cannot contain URL fragments or libpq target-overriding query parameters.
- MOCK fallback is only possible when the live-provider switch is OFF and the core URL points to an explicit loopback disposable/test DB. The current remote core URL is rejected even for MOCK; no production worker can inherit it.

The private `.env` remains unchanged and `WORKER_DATABASE_URL` is unset. Final backend PG16.6 suite: 702 passed, 1 skipped; 42 focused guard/runtime tests passed. Temp DB cluster removed and port closed. Production writer/maintenance role design is documented separately and not deployed.
