## Current status override — 2026-11-10 (Phase 5 remaining implementation)

This section supersedes older status statements below where they conflict with the current branch state. Historical snapshots are retained as historical evidence.

- **Phase 5.1 — COMPLETE:** Owner acceptance was recorded on 2026-11-09 in `PHASE_5_1_OWNER_ACCEPTANCE_REPORT.md`.
- **Phase 5.2.1 — COMPLETE:** Lifecycle audit ledger and timeline API/BFF were implemented and verified.
- **Phase 5.2.2-A — COMPLETE:** Review architecture proposal revision 1.1.1 was accepted as the implementation baseline.
- **Phase 5.2.2-B — IMPLEMENTED:** Review metadata/payload quarantine, database guards, minimum privileges, and PostgreSQL test coverage are present. The review-view owner has only the required column-level SELECT grants; `sireader_api_ro` remains denied direct SELECT on the two base review tables.
- **Phase 5.2.2-C — IMPLEMENTED:** The adjudication command API uses row locking, expected original-output SHA-256, audited idempotent command execution, and distinct operator identity header validation.
- **Phase 5.2.2-D — IMPLEMENTED:** Read API and security-barrier review view are available. The frontend BFF uses fixed loopback upstreams, server-side tokens, response validation, bounded response parsing, and operator-session protection.
- **Phase 5.2.2-E — IMPLEMENTED; FRONTEND CI PASS:** Review Inbox UI supports pending review list/detail and APPROVE, EDIT, REJECT actions. Frontend head: `9919ef90a9464cc0e093e288353634884b6d3992`; [CI run 42667733078 PASS](https://github.com/awandhani22-boop/SIREADER/actions/runs/42667733078): 415 tests passed, `tsc --noEmit` passed, and Vite production build passed. Build emits an existing/remaining large-chunk warning; it is not a build failure.
- **5.2.3 — IMPLEMENTED; FRONTEND AND BACKEND CI PASS:** Existing Cost Guard remains the only reservation/billing ledger. Read-only cost attribution uses a security-barrier view joining usage records to task attempts. Budget API/dashboard reports daily IDR, rolling 30-day IDR, Anthropic USD, tier allocations, worker/task attribution, and reserved versus actual usage. Frontend CI: [42667733078 PASS](https://github.com/awandhani22-boop/SIREADER/actions/runs/42667733078). Backend 5.2.3 CI: [42667794174 PASS](https://github.com/awandhani22-boop/SIREADER-Python-Backend/actions/runs/42667794174) — 177 API tests and 75 core tests passed.
- **5.2.4 — IMPLEMENTED; BACKEND CI PASS:** Backend-owned capability-to-tier routing and ALLOW/REDACT/REVIEW/REJECT sensitive-task policy are added. Credential and personal-data redaction happens before provider dispatch. Trading/execution capabilities and Decision Engineer/Market Monitor are barred from general-purpose LIVE provider routing. Model tier is fixed before the provider call; UNKNOWN outcomes are not automatically replayed or escalated to another provider request.
- **5.2.5 — IMPLEMENTED; BACKEND CI PASS:** One-shot retention/expiry maintenance command, Windows Task Scheduler wrapper, operations runbook, migration-cycle and maintenance-order tests are added. The scheduler wrapper is provided but has not been registered on the owner's machine/deployment.
- **Current frontend feature-code commit:** `9919ef90a9464cc0e093e288353634884b6d3992`; current branch HEAD (documentation closeout): `939fd0f4e04a264644a3c2e3710b6dd9ef0ceb0b`.
- **Backend implementation commit:** `1568435e092fc3b59bb271a9eef9d24981daa8e8`; policy/maintenance workflow `42671067597` PASS (187 API + 76 core). Current backend branch HEAD (documentation closeout): `6fc26d153f76a37b0fc6cecfd3e58faaa0955b39`; documentation workflow `42671597785` PASS.
- **Final Phase 5 gate remains OPEN** until the latest backend policy/security tests are green and one comprehensive owner-run Windows/Chrome browser acceptance is recorded. Do not merge to `main`, deploy migrations to Supabase LIVE, enable paid providers, or alter trading/MT5/HFM paths as part of this closeout.

---

## Current status override — 2026-11-09 (Phase 5.2.1 Closeout)

- **Phase 5.1 — COMPLETE (owner acceptance recorded 2026-11-09):** Source implementation, automated CI, bug fix for retry target ID, and owner-run Windows/Chrome/Antigravity acceptance are recorded PASS. See [PHASE_5_1_OWNER_ACCEPTANCE_REPORT.md](./PHASE_5_1_OWNER_ACCEPTANCE_REPORT.md).
- **Phase 5.2.1 — Lifecycle Audit Ledger & Timeline API: COMPLETE (2026-11-09):**
  - **Python Backend HEAD:** `a7cc431` — Hardened `workforce_activity_events` audit ledger with append-only BEFORE triggers (blocking UPDATE/DELETE/TRUNCATE), deterministic sequence ordering (`event_seq BIGINT GENERATED ALWAYS AS IDENTITY`), actor attribution (`SYSTEM`, `WORKER`, `OPERATOR`, `LEGACY_UNKNOWN`), explicit retry lineage (`related_task_id`), sanitized security-barrier view `v_api_workforce_task_timeline`, and read-only timeline endpoint `GET /api/v1/workforce/tasks/{task_id}/timeline` on port 8000. 148 backend tests pass (`148 passed in 6.10s`), zero compile errors.
  - **Virtual Office source HEAD:** `6dd9af4` — Fixed BFF route `/api/v1/workforce/tasks/:taskId/timeline` proxying to port 8000 with loopback-only binding, strict input validation, response schema validation, zero credential leakage, and client adapter `getTaskTimeline`. 406 frontend tests pass (`406 passed in 3.80s`), TypeScript `tsc --noEmit` pass with zero errors, Vite production build successful.
  - See [PHASE_5_2_1_EXECUTION_LOG.md](./PHASE_5_2_1_EXECUTION_LOG.md) and [PHASE_5_2_1_EVENT_COVERAGE_AUDIT.md](./PHASE_5_2_1_EVENT_COVERAGE_AUDIT.md).
- **Phase 5.2.2 — Human Output Review Subsystem is now NEXT.**
- **Current working branch:** `phase-5-implementation` in both repositories (strictly isolated from main; no merge performed).
- **Hard boundaries preserved:** No live Supabase migration, paid provider invocation, MT5/HFM operation, trading order, or trading approval change was performed.

See [PHASE_5_EXECUTION_PLAN.md](./PHASE_5_EXECUTION_PLAN.md), [PHASE_5_2_1_EXECUTION_LOG.md](./PHASE_5_2_1_EXECUTION_LOG.md), and [PHASE_5_1_OWNER_ACCEPTANCE_REPORT.md](./PHASE_5_1_OWNER_ACCEPTANCE_REPORT.md).

---

## Historical Phase 4 acceptance snapshot — 2026-11-09


- **Phase 3.3 — COMPLETE:** the project owner confirmed all remaining acceptance checks were safe.
- **Phase 4 — COMPLETE (owner acceptance recorded 2026-11-09):** 4.1–4.4 implementation, automated CI, and owner-run Windows/Chrome browser acceptance are recorded PASS. Live Supabase migration was intentionally not applied; paid provider and trading actions remain disabled.
- **Current implementation branch:** `phase-4-implementation` in both Virtual Office and Python Backend repositories.
- **No merge to `main`, no live Supabase migration, no real provider canary, and no trading execution were performed.**
- The owner chose not to apply workforce migrations to Supabase LIVE during Phase 4 acceptance. Any later production migration or paid provider canary requires its own explicit approval and deployment review.

See [PHASE_4_EXECUTION_LOG.md](./PHASE_4_EXECUTION_LOG.md) for the implementation details, tests added, and remaining gates.

---

# SIREADER Virtual Office — Project State

## Phase 4 acceptance snapshot (historical)
**Phase 4 — COMPLETE (2026-11-09):** implementation, automated verification, and owner-reported Windows/Chrome acceptance are recorded PASS. See the owner acceptance report. Phase 3.3 was owner-confirmed safe/accepted on 2026-11-09; see the explicit evidence qualification below.

- Phase 3.2 — Secure BFF & Frontend Observability Integration: **COMPLETE — owner acceptance confirmed 2026-11-09**.

- Active Virtual Office implementation branch: `phase-4-implementation` (branched from the accepted Phase 3.3 baseline; not merged to main).
- Active Python Backend implementation branch: `phase-4-implementation` (branched from the Phase 3.3 backend baseline; not merged to main).
- Phase 4 execution order: 4.1 runtime contract/registry → 4.2 provider routing and Cost Guard → 4.3 persistent task orchestration → 4.4 frontend LIVE runtime adapter. No later phase is silently skipped.
- Phase 3.2 implementation baseline remains `9641d18f773d8a35e14f0c5224289d8d8cfc4ea5`; Phase 3.3 code is isolated in the two branches above.
- Virtual Office Phase 3.3 initial implementation commit: `57e3f2d1d1eb3a616eb6792f69294f0d3072e261`; GitHub Actions run `42534082388` passed 367/367 tests, TypeScript check, and production build. Follow-up BFF disconnect/capacity test passed run `42572749792`; active-session-expiry EventSource cleanup test passed run `42572901195`; both runs also passed the full test suite, TypeScript check, and production build.
- Python Backend Phase 3.3 latest implementation/test commit: `b8dac552decc0c25a9aca176d81cd6b387d6bc4a`; GitHub Actions run `42572336352` completed successfully (API tests including disposable PostgreSQL migration/trigger integration, API compile checks, and core regressions).
- Phase 3.3 work covers the backend EventHub/listener/route/migration, BFF streaming proxy, and frontend EventSource invalidation/fallback. Owner-reported local manual acceptance confirms PostgreSQL NOTIFY delivery through SSE, targeted system snapshot refresh, backend restart recovery, and four concurrent SSE streams held open for five minutes without reported errors. CI verifies heartbeat generation/subscriber cleanup, trigger mapping in disposable PostgreSQL 16, BFF abort/cancel and stream-capacity release on browser disconnect, and EventSource cleanup when the active operator session expires at the 60-second reconciliation. A five-minute Windows process sample recorded very low CPU (max sampled 10-second interval: Python 0.05%, BFF 0.02%, Vite 0.04%) and nearly flat Working Set. Numeric Chrome JS heap/browser measurements and a formal resource budget remain open; combined owner-run BFF restart/network interruption/session re-authentication browser E2E remains open. Follow-up automated regression tests now cover BFF shutdown abort/cancel, authenticated BFF recreation with old-session rejection and fresh SSE login, frontend polling fallback + immediate full-snapshot refresh after EventSource reconnection, operator re-authentication after session loss, and bidirectional LIVE/SIMULATED store isolation. Final code CI run `42574780437` on commit `bb1a44d` passed **374/374 tests**, TypeScript check, and production build. See the execution log.
- Batch 1 — BFF Foundation & Security Guards: implementation pushed; port and security changes source-audited.
- Batch 2 — Fixed Upstream Proxy: implementation pushed; GitHub Actions run `42482847460` passed (323/323).
- Batch 3 — Operator Authentication & Session Lifecycle: implementation pushed; GitHub Actions run `42483616073` passed (331/331), typecheck and production build passed.
- Phase 3.3 closeout: owner explicitly confirmed on 2026-11-09 that the remaining BFF restart, recovery, and performance acceptance was safe. The owner's final report describes successful real-browser authentication/SSE, one active EventSource, targeted refresh of all five snapshots, Offline→Online recovery, and LIVE/SIMULATED isolation; it reports the BFF and local services were stopped cleanly. The report did not include the six raw Chrome Performance Monitor samples, so no numeric browser metrics are independently reproduced in this state file. Treat the final owner confirmation as the acceptance attestation; retain this evidence limitation for any later release audit. The earlier CI evidence of 374/374 tests, TypeScript, and production build remains separate from owner-run browser acceptance.
- Phases 1, 2.1, 2.2 and 2.3 remain complete with historical evidence and documented deferrals.
- Phase 3.1 is implemented in the separate Python Backend repo. Owner-provided local report confirms the dedicated read-only database/API configuration and five authenticated GET smoke checks; a documentation-only status reconciliation remains for the backend runbook.

### Phase 4 final acceptance checkpoint (2026-11-09)

- **4.1 runtime contract/registry:** versioned worker/task/capability/attempt/activity/health contracts, stable seven-worker registry, and concurrency rules implemented; backend CI PASS.
- **4.2 provider/Cost Guard:** deterministic mock and fail-closed OmniRoute adapter implemented; existing Cost Guard reservations reused; timeout/unknown outcomes are never blindly retried. Live provider remains disabled.
- **4.3 persistent orchestration:** idempotent enqueue, transactional claims/leases, heartbeat, retry/recovery/dead-letter, append-only activity, restricted API views and two SQL migrations implemented. Disposable PostgreSQL 16 CI passes; no Supabase LIVE migration was applied.
- **Additional backend hardening:** immediate activity heartbeats, aggregation across fresh worker process instances, 30-day terminal payload retention, 90-day WAITING_REVIEW retention, and database protection against requeue after payload purge.
- **4.4 frontend:** authenticated read-only workforce routes, strict BFF allowlist/DTO validation, task pagination, attempt history, SSE refresh, mode-aware WorkerRepository, isolated DEMO/LIVE selections, worker scene mapping, and 50/100-worker data fixtures implemented.
- **Backend implementation HEAD:** f1071ef1c798e7168bb998e99dfdc49082777343. Backend CI #163 PASS: 111 API/PostgreSQL tests, API compile check, and 75 core regression tests. https://github.com/awandhani22-boop/SIREADER-Python-Backend/actions/runs/42590234343.
- **Frontend source verification commit:** eb8b1ad7dce0cde6cc0821a4831290ee8ffd3dd0. Frontend CI #201 PASS: 390/390 tests, TypeScript check, production build. https://github.com/awandhani22-boop/SIREADER/actions/runs/42588073811.
- **Owner-run browser acceptance:** PASS according to the owner's report. Nine CDP scenarios cover DEMO/LIVE transitions, authenticated seven-worker roster, 50-worker fixture, 75-task pagination, task attempt history, logout/session expiry, late-response rejection, data isolation, and console/network checks. See [PHASE_4_OWNER_ACCEPTANCE_REPORT.md](PHASE_4_OWNER_ACCEPTANCE_REPORT.md).
- **Evidence qualification:** the report's PNG screenshots are referenced by local Antigravity file paths but were not included in the GitHub upload. The report is retained as owner attestation; the image artifacts are not independently retrievable from GitHub.
- **Safety/deployment boundary:** no live Supabase migration, paid provider canary, MT5/HFM action, trading order, or merge to main was performed. These remain separately gated and are not represented as having run.

Product mission: [PRODUCT_VISION.md](PRODUCT_VISION.md).
Master roadmap: [ROADMAP.md](ROADMAP.md).
Phase 4 execution plan: [PHASE_4_EXECUTION_PLAN.md](PHASE_4_EXECUTION_PLAN.md).
Phase 4 execution log: [PHASE_4_EXECUTION_LOG.md](PHASE_4_EXECUTION_LOG.md).
Owner acceptance report: [PHASE_4_OWNER_ACCEPTANCE_REPORT.md](PHASE_4_OWNER_ACCEPTANCE_REPORT.md).

### Current Phase 3.2 checkpoint
- Documentation branch: `phase-3-2-closeout-phase-3-3-sse-plan`; latest verified implementation commit remains `9641d18f773d8a35e14f0c5224289d8d8cfc4ea5` (documentation-only commits are not implementation commits).
- Batch 1 and Batch 2 details are recorded in the execution log below.
- Batch 3 added `server/auth.ts`, `server/auth.test.ts`, the login/session/logout routes, error/log event updates, a masked local password-hash helper at `scripts/create-operator-password-hash.ts`, and `docs/OPERATOR_AUTH_SETUP.md`.
- Password hash uses fixed scrypt N=16384, r=8, p=1, 16-byte salt and 64-byte derived key. No default password. Missing/malformed hash returns `503 AUTH_NOT_CONFIGURED`.
- Session IDs and CSRF tokens are generated from 32 CSPRNG bytes. Session IDs are stored hashed in process memory; sessions rotate on successful login, expire after 1-hour idle or 8-hour absolute life, and are revoked on logout or process restart.
- Login is limited to five attempts per loopback client IP per 15-minute window. Attempts are reserved synchronously before scrypt work so concurrent requests cannot race past the limit.
- Cookie is `__Host-sireader_sid`, HttpOnly, Secure, SameSite=Strict, Path=/, no Domain, Max-Age=28800. Logout requires active session + constant-time CSRF check.
- All five upstream observability routes now use the real operator session middleware in production. The upstream auth bypass dependency is documented as test-only and is used only by mock test harnesses.
- GitHub Actions run `42483616073` on `8dfa50421f30bc888d22c880dcb5bd496f201d0e`: 331 tests passed, 0 failed; TypeScript check passed; production build passed (828 ms in run log). Frozen Bun dependency install passed.
- Batch 4 added `src/live/live.contracts.ts`, `live.api.ts`, `live.state.ts`, `live.controller.ts`, and `live.test.ts`; `package.json` now includes the LIVE tests in the complete test command. Five API DTOs are strictly validated against the BFF/Python contract; the browser client calls fixed same-origin paths only, never sends a bearer token, stores CSRF only in a private in-memory closure, uses same-origin credentials and a 5-second timeout, and has explicit transport/auth/schema errors. LIVE data is kept in an independent Zustand store with explicit `source: LIVE`; it does not import or derive from `useOfficeStore` simulation state. Session-required and logout flows clear private LIVE data; polling and presentation are implemented in Batch 5 below.
- Batch 4 CI: first run `42485110003` — 343/343 tests passed, TypeScript check found two unsafe DTO casts, so build was skipped. Fix commit `e504abf3d7cd8781559275eb4243431a88df57ad` was followed by GitHub Actions run `42485169977`: 343/343 tests passed; TypeScript check passed; production build passed; final workflow conclusion SUCCESS.
- Batch 5 added `src/live/live.poller.ts`, deterministic fake-clock tests in `src/live/live.poller.test.ts`, and `src/ui/LiveObservabilityDock.tsx` wired into the existing `TopBar`. System/pipeline/market watches poll every 10 seconds; usage/audit poll every 30 seconds. The poller prevents same-path overlap, uses bounded jittered backoff (maximum 60 seconds), records OFFLINE after two consecutive transport failures, marks retained snapshots STALE after three intervals, clears private LIVE data on SESSION_REQUIRED, and ignores late responses after stop/logout. Global connection reaches LIVE only after all five endpoint snapshots validate. Existing simulation and 3D scene remain separate and intact.
- Batch 5 CI: initial run `42485909696` found the missing internal `stop()` helper; follow-up run `42485983354` fixed it but exposed two test generic typing errors. Final commit `f15f7430e871c032b3b7f4f457f43c26f820db4b`, GitHub Actions run `42486162630`: 353/353 tests passed; TypeScript check passed; production build passed; workflow SUCCESS.
- Batch 6 added loopback-only Vite configuration, exact `/api` namespace regex proxy to the BFF with `changeOrigin: false`, cross-platform dual-process dev launcher, dotenv-first BFF entrypoint, production Express static hosting of `dist/`, SPA navigation fallback excluding `/api`, safe asset/index cache headers, and local setup runbook `docs/PHASE_3_2_LOCAL_SETUP.md`. Production startup selects port 3000 and fails closed if `dist/index.html` is missing; development starts Vite at 3000 and BFF at 3001. Static files and proxy behavior have automated integration/configuration tests.
- Batch 6 CI: first run `42486677113` passed 358/358 tests but typecheck flagged TypeScript-only syntax in the `.mjs` launcher. Commit `9641d18f773d8a35e14f0c5224289d8d8cfc4ea5` corrected it. GitHub Actions run `42486731963`: 358/358 tests passed, 0 failed/skipped; TypeScript check passed; production build passed (653 ms); workflow SUCCESS.
- The first Batch 3 CI run on `6c10ddf` failed one time-expiry assertion (401 instead of 200). The test was corrected to refresh idle time while advancing toward the absolute deadline. The login-attempt limiter was additionally hardened to reserve attempts before asynchronous scrypt. The rerun on `8dfa504` passed fully.
- CI tests used in-process loopback servers and deterministic test hashes only; no live Python API, Supabase, paid provider, or real credentials were used.
- Owner acceptance confirmed by the user (2026-11-09; manual owner-reported evidence, not independently captured logs): local development services and production-like launcher were reported safe; operator login succeeded; the Python Backend and five authenticated read-only API endpoints had previously passed local smoke checks; the server-to-server token remained configured without exposing its value; Chrome showed the `__Host-sireader_sid` cookie with HttpOnly, Secure, SameSite=Strict, Path=/ and host-only behavior; `document.cookie` could not read the session cookie; LIVE observability loaded; refresh restored the LIVE view; Simulation and LIVE remained isolated; logout/reload/session revocation were reported safe.
- Production-like check limitation: the owner confirmed the production launcher test as safe, but did not provide command output or a sanitized HTTP transcript. Treat it as owner-reported acceptance, not independently reproducible evidence. Repeat from the runbook when preparing a formal release or diagnosing deployment issues.
- Pipeline may display a transient `LOADING` state while a request is in progress; do not describe it as permanently LIVE. Empty datasets (for example zero active market watches) are valid when the endpoint snapshot itself is LIVE.
- GitHub CI and local owner acceptance are separate evidence classes. No secret values or credentials are recorded here.
- No merge to `main` has been performed.

## Implemented
- **Phase 2.3 — Completed with Deferred Item (2026-11-08)**:
  - **Automated Test Suite**: 282/282 tests passing (0 failing, 0 skipped) across 15 test files.
  - **TypeScript Typecheck**: PASS (`npx tsc --noEmit`, 0 errors).
  - **Lint Script**: PASS (`npm run lint` invokes `tsc --noEmit`; this project script performs TypeScript typechecking and is not an ESLint execution).
  - **Production Build**: PASS (`npm run build`, built successfully in 1.08s, `dist/assets/index-CblihZV0.js`).
  - **Purity & Diff Check**: Clean (0 issues) via `git diff --check`.
  - **C1 Fixed-Step Accumulator**: 12/12 determinism tests (`T1` through `T12`) passing, confirming delta-size independence, accumulator preservation across pause/resume/speed-change, and strict 500ms fixed ticks.
  - **Manual Step Protections**: Store-level guard strictly enforcing NO-OP when unpaused (`!state.isGlobalPaused`); TopBar step button disabled with dynamic tooltip when running.
  - **Sim Clock Precision & Formatter Parity**: Fractional tenth-second display (`MM:SS.s`) providing immediate visual feedback for 500ms steps; backward-compatible negative duration clamping (`formatSimDuration(-6000) === '00:00'`) in default mode.
  - **Test 43 Non-Vacuous Task Consistency**: Verified after 48 deterministic ticks (24,000 ms) with 2 active running tasks (`runningTaskIds.length === 2`) matching worker activeTaskIds without duplicates.
  - **Scheduler Post-Reset Step**: Explicitly tested in `scheduler.state.test.ts` advancing exactly one 500ms tick with clean scheduler entries.
  - **FAILED Diagnostics Sanitization**: Component tests 46, 47, and 47b in `worker.state.test.ts` confirming structured error rendering, legacy fallback (`Failure details unavailable.`), and partial payload rendering without literal `"undefined"`.
  - **Browser Camera Controls & Reset**: Empirical CDP verification of 3D azimuth rotation (372.19px displacement on Reception landmark) and isometric reset returning coordinates within $\le 2\text{px}$ baseline tolerance.
  - **Browser Speed Benchmark**: Empirical 10-second wall-time clock scaling test confirming exact tempo scaling: 2x/1x ratio = 2.0001 (0.00% deviation) and 4x/1x ratio = 4.0001 (0.00% deviation), well within $\pm 3\%$ criteria.
  - **Browser Manual Task Enqueue**: Successfully enqueued task `tsk_pool_110_5500` ("Fast Entity & Signal Triage", CRITICAL) into the global queue drawer, verified feedback message, and observed deterministic dispatch to `Haiku Worker` in the Pool Activity tab after a 500ms tick.
  - **Responsive Viewport Verification**: Verified across Desktop 1440x900, Tablet Landscape 1024x768, Tablet Portrait 768x900, and Mobile 390x844 viewports.
  - **Asset & Placeholder Status**: All 7 avatars remain procedural placeholder models; no final GLB rigged human assets are claimed complete in this phase.
  - **Deferred Item**: Direct live-browser trigger for FAILED task is deferred. Reason: the deterministic Phase 2.3 simulator has no natural/random failure trigger (random failures are prohibited to preserve C1 determinism). FAILED diagnostics are verified via automated component tests 46, 47, and 47b. Deferred until the live worker/task runtime exposes an authoritative FAILED lifecycle and error diagnostics contract. Reassess during Phase 4.1 and Phase 4.3.
  - **Screenshots Available (`qa_screenshots/`)**:
    - `01_initial_scene_1440x900.png`
    - `02_camera_controls_active.png`
    - `03_worker_panel_open.png`
    - `03a_worker_panel_haiku.png`
    - `03b_worker_panel_opus_via_badge.png`
    - `04_global_pause_verified.png`
    - `05_speed_controls.png`
    - `06_manual_step_executed.png`
    - `07_global_queue_panel.png`
    - `07a_queue_enqueued_task.png`
    - `08_pool_activity_feed.png`
    - `08a_activity_tab_list.png`
    - `09_responsive_1440x900_desktop.png`
    - `09_responsive_1024x768_tablet_landscape.png`
    - `09_responsive_768x900_tablet_portrait.png`
    - `09_responsive_390x844_mobile_viewport.png`
    - `10_reduced_motion_gfx.png`
    - `11_reconciliation_failed_card_rendered.png`
    - `12a_camera_before_rotate.png`
    - `12b_camera_after_rotate.png`
    - `12c_camera_after_reset.png`
    - `13a_manual_enqueue_in_queue.png`
    - `13b_manual_enqueue_dispatched.png`
- **Phase 2.1 Foundation** (`8d2b9bb`): Capability registry for 7 permanent workers, multi-task worker concurrency invariants, and deterministic stage execution.
- **Commit 1 — Task Dispatch State Machine & Types** (`2063c29`): Pure dispatch state machine, types, and capability matching data structures.
- **Commit 2 — Multi-Task Worker Concurrency** (`5af49cd`): Multi-task concurrency tracking, active task slots, and worker load ratio calculation.
- **Commit 3 — Deterministic Priority Ordering** (`782d8ab`): Pure `orderQueue()` ordering by CRITICAL > HIGH > NORMAL > LOW, sequence ascending, and original index tie-breaker.
- **Commit 4 — Worker Matching & Candidate Selector** (`69c53d9`): Capability filtering, worker eligibility checks, concurrency limits, load ratio balancing, cost tie-breaking, and workerOrder priority.
- **Commit 5 — Global Task Enqueue & Deterministic Dispatch Pass** (`546cdca` / `6e3e7d6`): Global unassigned task enqueue with deterministic ID format `tsk_pool_<seq>_<simTimeMs>`, rejection precedence, and atomic `dispatchPass()`.
- **Commit 6 — Runtime Dispatcher Integration** (`0cee0da`): Integration of `enqueueGlobalTask()` and `dispatchGlobalQueue()` into `SimulationEngine.stepSimulationTick()` and `WorkerMockService`.
- **Commit 7 — Global Demo Task Migration** (`e741c2d`): Migration of the 12-tick periodic demo task generator to the unassigned global queue with 14 canonical templates across 7 departments.
- **Commit 8 — Store & UI Integration** (`d669428`): Integration of global scheduler state, queue drawer (`GlobalQueuePanel`), `TopBar` queue counters, explicit diagnostic propagation, and activity history.
- **Commit 10 — UI Activity & Metrics Corrections** (`45ee964`): Corrected simulation-mode and queue labels, lifecycle-aware task activity timestamps, deterministic tie-breaking, and RUNNING-only active task counts.
- **Commit 11 — UI Regression Coverage** (`6e82623`): Repaired React 19 UI event-handler test interactions and added regression cases for activity timestamp fallbacks, ordering, and active-count semantics.
- **Commit 12–15 — Audit & Test Stabilization** (`2173ac2`, `9525ce9`, `4cecfdf`, `a9aa327`): Audit checklist, project state updates, and React act/UI test stabilization bringing total tests to 256/256 passing.
- **QA Artifacts** (`2997f4d`, `cf1083d`): Browser QA screenshot evidence added.
- Architecture ownership: `src/scheduler/` owns priority ordering, capability matching/selection, dispatch decisions, and blocked reasons; `SimulationEngine` owns simulated time and tick order; `useOfficeStore` owns reactive UI state and diagnostic synchronization.

## Boundaries and limitations
- **Simulated-Only Boundary**: Worker execution, queues, activity, token usage, and USD costs are local **SIMULATED** data. No real AI provider, Python backend, external API, database, persistence, MT5, or trading action is connected.
- **Demo Queue Guard**: `DEMO_MAX_QUEUE_CAP = 3` limits automatic demo generation only to avoid unbounded memory growth, not the global queue capacity.
- **Legacy Queue Reservation**: An idle worker slot will not receive a global pool task if that worker has tasks pending in its legacy per-worker queue (`taskQueueIds`).
- **Priority Starvation (No Aging)**: Strict priority rank ordering means continuous CRITICAL/HIGH/NORMAL tasks will starve LOW tasks in local simulation (no priority aging mechanism in Phase 2.2).
- **Ignored Dependencies**: `dependencyIds` are carried as metadata on task entities but are not evaluated by the local dispatcher.
- **Missing Task Entity Eviction**: Scheduler entries whose task entity is missing from `snapshot.tasks` are diagnosed and evicted to `dropped` (`MISSING_TASK_ENTITY`) rather than kept queued indefinitely.
- **Joiner Task Progress Gating**: A secondary task dispatched to a worker in `TASK_RECEIVED` or `WALKING` status remains at 0% progress until the worker transitions to `BUSY`.
- **Activity Timestamp Basis**: RUNNING activity recency is based on lifecycle timestamps (`startedAtSimMs`) rather than continuously refreshed progress.
- **Real-time Loop Driver**: `OfficeApp` uses `window.setInterval` as a UI driver to advance real-time wall delta; core simulation engine logic remains purely deterministic.

## Verification status
- **Automated Tests**: **282 passing, 0 failing, 0 skipped** across 15 test files (`node --import tsx --test src/**/*.test.ts`).
- **C1 Determinism Invariance Suite**: **12 passing, 0 failing** (`src/workers/simulation.engine.determinism.test.ts`).
- **TypeScript Typecheck**: **PASS** (`npx tsc --noEmit`, 0 errors).
- **Lint Script**: **PASS** (`npm run lint` invokes `tsc --noEmit`; this project script performs TypeScript typechecking and is not an ESLint execution).
- **Production Build**: **PASS** (`npm run build`, built successfully in 1.08s, chunk size warning noted for Phase 6.2 code-splitting).
- **Purity Check**: **Clean (0 issues)** via `git diff --check`.
- **Browser-level Manual QA Status**:
  - *Verified in Browser (Confirmed)*:
    1. Complete 3D isometric office scene with 7 room signage overlays and worker tags.
    2. Camera Zoom In/Out, right-button azimuth rotation (372.19px displacement), and Reset Isometric View within $\pm 2\text{px}$ tolerance.
    3. All 7 workers discoverable via 3D badges and roster drawer; panel controls operable.
    4. Manual task enqueue via Global Queue drawer with CRITICAL override (`tsk_pool_110_5500`), feedback presentation, and dispatch to `Haiku Worker` in Pool Activity.
    5. Global Pause freezes time, Resume continues, and 1x/2x/4x speed scaling maintains exact tempo (0.00% deviation on 10s benchmark).
    6. Reduced motion and lower graphics preset toggles verified in UI.
    7. Responsive layouts verified across Desktop 1440x900, Tablet Landscape 1024x768, Tablet Portrait 768x900, and Mobile 390x844.
  - *Deferred Browser Items*:
    1. Live UI natural trigger for FAILED task is deferred until the live worker/task runtime exposes an authoritative FAILED lifecycle and error diagnostics contract. Reassess during Phase 4.1 and Phase 4.3 (prohibited random failure generator in deterministic engine; covered by automated tests 46, 47, 47b).
    2. Final GLB avatar assets remain procedural placeholders until 3D asset modeling phase.

## External backend milestone
- **Phase 3.1 — Read-Only Observability API Gateway: COMPLETE (2026-11-08)** in the separate `awandhani22-boop/SIREADER-Python-Backend` repository. Supabase lockdown and dedicated `sireader_api_ro` access were verified; all five local GET endpoints returned 200; missing token returned 401; POST/PUT/PATCH/DELETE returned 405; 74 API tests and 50 core backend regression tests passed locally; API compile passed; GitHub Actions run `42397323807` succeeded. Backend remains a separate project boundary.

## Next

**Phase 5.1 — Human-Supervised Worker and Task Operations (PLANNED).** Phase 4 is accepted; do not enable any write/command endpoint until Phase 5 security and authorization contracts are separately designed and tested.

- Define narrowly scoped enqueue, pause/resume, cancel, and safe retry commands for generic non-trading work only.
- Keep read-only workforce observability credentials separate from command credentials.
- Require authentication, authorization, validation, idempotency, rate limits, and append-only audit for every command.
- Preserve the prohibition on MT5/HFM order placement, modification, closure, SL/TP changes, and trading approval bypass.
- Keep Supabase LIVE migrations and paid provider canaries separately gated; neither was performed during Phase 4 acceptance.

