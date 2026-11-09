# Phase 4 — Final Acceptance Runbook

**Branch:** `phase-4-implementation`  
**Purpose:** verify the Phase 4 branch after implementation; this runbook does not authorize a merge or a live migration.

## 1. Preserve local work and sync the branch

Run in PowerShell:

```powershell
$front = "$env:USERPROFILE\.gemini\antigravity\scratch\SIREADER"
$back = "$env:USERPROFILE\.gemini\antigravity\scratch\SIREADER-Python-Backend"

git -C $front status --short --branch
git -C $back status --short --branch
```

Check both repositories before syncing. If either has tracked local changes, stop and reconcile them manually. Preserve all untracked user files. Never run `git reset`, `git clean`, or an automatic merge to `main`.

If both working trees are safe for a fast-forward:

```powershell
git -C $front fetch origin phase-4-implementation
git -C $front merge --ff-only FETCH_HEAD

git -C $back fetch origin phase-4-implementation
git -C $back merge --ff-only FETCH_HEAD

git -C $front rev-parse --short HEAD
git -C $back rev-parse --short HEAD
git -C $front status --short --branch
git -C $back status --short --branch
```

If a fast-forward is not possible, stop. Do not reset or rebase local work to force it.

## 2. Automated validation

From the frontend workspace:

```powershell
Set-Location $front
bun install --frozen-lockfile
bun run test
bun run lint
bun run build
```

From the Python backend workspace:

```powershell
Set-Location $back
& "C:\SIREADER\.venv\Scripts\python.exe" -m pytest -q
```

Run the PostgreSQL integration/migration tests only when the configured test database URL points to a disposable PostgreSQL database. Do not point test migrations at the live Supabase project. Record skipped database tests as NOT RUN, not PASS.

## 3. Start local services in separate PowerShell windows

Use three separate terminals and do not start duplicate processes.

**Terminal A — Python API**

```powershell
& "C:\SIREADER\.venv\Scripts\python.exe" -m app.api.server
```

**Terminal B — Express BFF**

```powershell
Set-Location $front
npm run dev:bff
```

**Terminal C — Vite**

```powershell
Set-Location $front
npm run dev:vite
```

Open `http://localhost:3000`. Confirm the expected local ports are occupied by these three services only.

## 4. Browser acceptance — source mode and isolation

1. Confirm a fresh browser session opens in `DEMO`; the indicator must explicitly say `SIMULATION MODE · DEMO`.
2. Observe that the simulation clock and demo task/feed continue in unpaused DEMO.
3. Select `LIVE` in the top bar.
4. Confirm:
   - the simulation clock stops;
   - simulation queue controls and activity feed are hidden;
   - the authenticated LIVE workforce dock opens;
   - the top bar shows LIVE backend counts or unknown values, never fabricated zeros;
   - no DEMO worker status/task count is shown as LIVE;
   - the LIVE roster contains only worker records from the authenticated runtime snapshot.
5. Authenticate through the local operator login UI if required. Enter the password directly in the browser; never paste it into the agent chat or terminal.
6. Confirm known workers map backend process status to the 3D avatar, world badge and room indicator. Unknown, missing, stale, failed, connecting and unauthenticated states must remain visibly distinct.
7. Select a worker in LIVE and verify that the DEMO selection/worker/task state does not change.
8. Return to DEMO. Confirm the deterministic simulation clock resumes only if DEMO is unpaused and the previous simulation state is preserved.

## 5. Session expiry and late-page response

1. In LIVE, select a task and open its attempts.
2. Navigate to another task page if the response contains more than 50 rows.
3. Log out or revoke the operator session while a paginated request is in flight.
4. Verify that private worker/task/attempt data clears and a late response cannot repopulate the panel.
5. Confirm the old session is rejected and a new authenticated session is required.

## 6. Pagination and scale

- The panel uses 50 rows per page.
- Verify Previous/Next and correct row ranges with a disposable fixture containing more than 50 tasks.
- The BFF accepts only integer `limit` (1–100) and `offset` (0–100000) on the fixed workforce tasks path.
- Invalid bounds, duplicate parameters, and unapproved query keys must receive `400 BAD_REQUEST` without an upstream request.
- Verify the LIVE roster renders a 50-worker fixture and that the 100-worker contract/repository fixture remains intact.
- The currently authored floor plan has seven physical avatar stations. Additional backend workers remain visible in the data-driven roster; do not fabricate spatial positions for them.

## 7. Safety and shutdown

- Do not enable real provider credentials or run a paid provider canary as part of this acceptance.
- Do not submit trading instructions, orders, or MT5/HFM actions.
- Do not apply workforce migrations to live Supabase.
- Stop Vite, BFF and Python API gracefully in their respective terminals.
- Record the tested branch/commit, test counts, typecheck/build results, source-mode checks, pagination checks, session-expiry checks and any unavailable measurements.

Phase 4 can be marked COMPLETE only after the automated gates and owner-run browser acceptance have explicit PASS evidence. No merge to `main` is part of this runbook.
