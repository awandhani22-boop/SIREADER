# SIREADER — Project Truth, Working Context & Anti-Hallucination Rules

**Document purpose:** Persistent handoff/context for ChatGPT, Sonnet, Argon, Antigravity, and human contributors. Read this before planning or changing SIREADER.
**Last evidence review:** 2026-11-08 (UTC+7)
**Canonical product:** SIREADER AI Workforce Platform + SIREADER Virtual Office
**This document is a dated audit snapshot, not a substitute for checking current code, branches, CI, runtime, and the canonical roadmap.**

---

## 1. Product mission — do not lose sight of this

SIREADER is intended to become a real, human-supervised AI workforce platform.

- **SIREADER Python Backend is the operational source of truth** for real task execution, worker/runtime state, AI provider usage, cost, persistence, and permitted operations.
- **SIREADER Virtual Office is the visual command/observability surface**: an interactive futuristic isometric 3D office where a human can inspect workers, tasks, queues, activity, usage, system health, and permitted controls.
- The seven initial worker identities are Supervisor, Haiku, Sonnet, Opus, Decision Engineer, Market Monitor, and Data Archivist. The architecture should be able to scale toward 50–100 workers without duplicating scene components.
- A moving avatar or a local mock task is never proof that a real process or AI worker is running.
- SIMULATED and LIVE data must remain separate and carry explicit provenance. When LIVE data is unavailable, show OFFLINE/STALE/ERROR; never silently substitute SIMULATED data and call it LIVE.
- Virtual Office must never place, close, or modify MT5 orders, bypass the Python Decision Engine, bypass manual approval, or change SL/TP. Trading safeguards remain in the Python backend and outside the authority of the frontend.

Read these canonical documents before every substantial task:
1. `docs/PRODUCT_VISION.md` — product mission and meaning.
2. `docs/ROADMAP.md` — phase order, scope, and acceptance gates.
3. `docs/PROJECT_STATE.md` — implementation state and recorded evidence.
4. `AI_RULES.md` and `CORE_RULES_COMPACT.md` — working and safety rules.
5. Relevant files in `docs/skills/` for the task.

If this document conflicts with a newer verified canonical document or actual code, investigate and reconcile the discrepancy; do not blindly trust this snapshot.

---

## 2. Repository map and branch truth at last review

### Repository A — Virtual Office
- Repository: https://github.com/awandhani22-boop/SIREADER
- Working branch: `phase-2-2-task-dispatcher`
- Last verified remote HEAD: `6e354027216107550512b73f1366ff0b29752fd0` (`6e35402`)
- Default branch `main` at last review: `6e00eba965f1a05dcbb102575e7db0c061312922` (`6e00eba`)
- The two branches had diverged. The two recent `main` commits were GitHub file-upload commits containing review artifacts; they did not contain the C1 source implementation in `src/workers/`.
- No Pull Request was found at last review.
- **Do not merge `main` into the working branch to retrieve the C1 review files. Do not assume `main` is the latest implementation branch.**

### Repository B — Python Backend
- Repository: https://github.com/awandhani22-boop/SIREADER-Python-Backend
- Working branch: `phase-3-1-api-gateway`
- Last verified remote HEAD: `76b968fce399a5f591b1bd48e1501e9baa45c92a` (`76b968f`)
- Default branch `main` at last review: `e764503e16b8dc673b7aee32420f26ee68b69c30` (`e764503`)
- Working branch was 45 commits ahead of main and had no behind commits at last comparison.
- No Pull Request was found at last review.
- The latest branch had successful GitHub Actions run [42397323807](https://github.com/awandhani22-boop/SIREADER-Python-Backend/actions/runs/42397323807).

**Before any work, re-fetch both repository branch heads.** Branches, commits, CI, and PR status can change. Never use the SHAs in this document as if they were guaranteed current.

---

## 3. Verified implementation status at 2026-11-08

### Virtual Office

| Area | Evidence-based status |
|---|---|
| React 19, TypeScript, Vite, Three.js/R3F, Zustand foundation | Implemented |
| Isometric 3D office scene, building/rooms/workstations, camera controls | Implemented as a foundation; full browser acceptance still open |
| Seven permanent worker identities and roster | Implemented |
| Worker capability registry and structured TaskEntity/lifecycle model | Implemented and documented as complete |
| Multi-task/concurrency model | Implemented with automated tests |
| Global priority scheduler, worker matching, task dispatch and blocked diagnostics | Implemented and documented as Phase 2.2 complete |
| Global queue, activity feed, TopBar metrics and worker panels | Implemented for local deterministic simulation |
| Metrics, task generation, token/cost mock data | SIMULATED only |
| C1 fixed-step accumulator correction (500 ms) | **Not present in the last verified remote working-branch source** |
| Phase 2.3 browser QA and visual closure | **Not complete** |
| Final seven-worker GLB assets | **Not present**; `worker.registry.ts` has `modelUrl: null` for all seven workers and articulated placeholders are used |
| Secure BFF / frontend backend adapter / LIVE frontend data | Not implemented in the audited frontend branch |
| SSE client integration | Not implemented |

At the last review, the frontend tree contained 13 `.test.ts` files and 261 `test(...)` declarations by static inspection. This is a count of test declarations, **not proof that 261 tests passed**. The frontend repository had no GitHub Actions workflow visible at that branch/review. A previous local agent report of 272 passing tests is not evidence for the remote branch unless the corresponding source/commit and execution result are verified.

### C1 fixed-step correction — important history

The C1 bug is that wall-clock delta remainders below 500 ms were applied as partial simulation ticks. This could make tickCount, task generator invocation, PRNG state, and worker progression depend on how elapsed time was divided across calls.

The proposed correction uses a 500 ms accumulator:
- Only exact 500 ms simulation ticks advance workers/tasks/scheduler.
- Remainder stays in `accumulatorMs` with invariant `0 <= accumulatorMs < 500`.
- Preserve accumulator through pause/resume and snapshot/store updates.
- Reset clears accumulator.
- Speed change flushes pending wall time using old speed before switching.
- Manual Step performs exactly one 500 ms tick while globally paused and preserves the remainder.
- Render clock includes the accumulator without double counting.
- `stepSimulationTickWithDiagnostics` rejects non-500 ms steps with RangeError.

Two review artifacts were uploaded to the root of Virtual Office `main`:
- `SIREADER-C1-review.diff`
- `simulation.engine.determinism.test.ts` (uploaded in the repository root, not `src/workers/`; its relative imports therefore do not match that location)
- `rcworkerssimulation.engine.determinism.test.ts` (the uploaded item was a diff artifact, not a valid source test file)

These uploads are **review artifacts only**, not the implementation on `phase-2-2-task-dispatcher`. Do not mistake them for a completed C1 fix. The user's local workspace previously showed uncommitted C1 source edits, so preserve local work and inspect `git status` before any operation. Never reset, clean, stash, rebase, checkout over, or delete user files without explicit authorization.

C1 acceptance must include:
1. Full snapshot equivalence across delta patterns 500, 130, 33, 17, and 1000 ms at 1x/2x/4x for the same total effective accepted simulation time.
2. 120 ticks -> exactly 10 generator invocations -> exactly 20 PRNG draws (verified directly, not only by comparing patterns).
3. Residual accumulator preservation and strict range invariant.
4. Wall-clock clamp behavior.
5. Pause/resume preserving simulation time, PRNG, workers, tasks, scheduler, events, and accumulator.
6. Reset/replay determinism.
7. Real store speed-change action tested with pending wall-time flush using old speed.
8. Strict 500 ms step contract, including paused manual Step.
9. No partial internal ticks.
10. Render clock accumulator accounting, interpolation, pause freeze, and no double count.
11. Regression proof without unverified historical numeric claims.

### Python Backend

The backend working branch contains the existing SIREADER services/modules including Telegram ingestion and approval, notification outbox, AI router/OmniRoute client, message aggregation, AI pipeline, Cost Guard/billing, database models, signal extraction/decision services, market-watch modules, and MT5 connector/price math.

Key code/config facts at the last review:
- `AI_PIPELINE_ENABLED=False` by default.
- `AI_API_KEY=None` by default.
- `AUTO_EXECUTION_ENABLED=False`.
- `TRADING_MODE=DRY_RUN`.
- `REQUIRE_MANUAL_APPROVAL=True`.
- The existence of AI modules does not prove AI inference is currently enabled or a provider credential is configured.
- The existence of MT5 connector code does not prove a live terminal is connected or orders can/should be sent.
- Existing trading execution safeguards must remain intact.

### Phase 3.1 Read-Only Observability API Gateway

Implemented on backend branch `phase-3-1-api-gateway`:
- Five read-only GET endpoints:
  - `GET /api/v1/system/status`
  - `GET /api/v1/telemetry/usage`
  - `GET /api/v1/pipeline/active`
  - `GET /api/v1/market-watches/active`
  - `GET /api/v1/audit/decisions`
- Dedicated `SIREADER_API_DATABASE_URL`; no fallback to primary writable `DATABASE_URL`.
- Dedicated `sireader_api_ro` login and read-only transaction mode.
- Six approved SQL views and startup privilege/ownership checks.
- Bearer authentication, fail-closed configuration, loopback binding `127.0.0.1`, single Uvicorn worker, and GET-only CORS methods.
- Pipeline API explicitly uses `IN_FLIGHT_UNCONFIRMED`; PROCESSING rows are not proof of OS worker liveness because the backend does not yet provide a trustworthy persistent worker heartbeat.
- API CI run 42397323807 passed 83 API tests, API package compile, and 50 core regression tests (133 pytest cases total). It uses a disposable PostgreSQL 16 service in CI; that is not the same as proving the user's local live Supabase connection works.
- The backend `PHASE_3_1_API_CONTRACT.md` and `docs/PHASE_3_1_API_GATEWAY_RUNBOOK.md` still stated that private local DB credential setup and local five-endpoint HTTP smoke acceptance remained pending at last review.
- The Virtual Office project state and Backend Runbook were inconsistent about whether local HTTP acceptance was complete. Resolve this discrepancy with actual evidence before marking Phase 3.1 fully accepted.

---

## 4. Roadmap — mandatory order

Use `docs/ROADMAP.md` as the canonical source of phase scope and acceptance gates.

| Phase | Name | Last audited state |
|---|---|---|
| 1 | Project Foundation & 3D Office Visualization | Complete |
| 2.1 | Worker Intelligence Foundation | Complete |
| 2.2 | Global Task Dispatcher & Deterministic Simulation | Complete per roadmap, subject to C1 remote fix/verification |
| 2.3 | Browser QA, Visual Closure & Simulation UX Stabilization | **Next priority; not complete** |
| 3.1 | Read-Only Observability API Gateway | Code and CI implemented; reconcile local operational acceptance |
| 3.2 | Secure BFF & Frontend Observability Integration | Planned; after 2.3 sign-off |
| 3.3 | Real-Time Observability (SSE) | Planned; after 3.2 stable |
| 4.1 | Real Worker Runtime Contract & Registry | Planned |
| 4.2 | AI Provider Routing, Execution & Cost Guard | Backend cost/provider foundation exists; full workforce execution phase planned |
| 4.3 | Persistent Backend Task Orchestration | Planned |
| 4.4 | Frontend Live Runtime Adapter & Demo/Live Separation | Planned |
| 5.1 | Human-Supervised Worker and Task Operations | Planned |
| 5.2 | Review, Audit, Budgets & Governance | Partial foundations exist in backend; workforce governance phase planned |
| 6.1 | Security, Reliability & Failure Recovery | Planned |
| 6.2 | 3D Asset, Performance & Scale Readiness | Planned |
| 6.3 | Packaging, Deployment & Release Acceptance | Planned |
| FINAL | SIREADER Virtual Office v1.0 | Not released |

**Approved order:** finish C1 remediation and Phase 2.3; reconcile Phase 3.1 operational acceptance; build Phase 3.2 BFF integration; add Phase 3.3 SSE only after snapshot integration is stable; then Phase 4.1 -> 4.2 -> 4.3 -> 4.4; then Phase 5.1 -> 5.2; then Phase 6.1 -> 6.2 -> 6.3; finally v1.0. Do not jump phases or silently skip acceptance gates. An approved scope change must be recorded in the roadmap and project state.

---

## 5. What “normally usable” means

Do not call SIREADER fully usable just because it builds or unit tests pass. Distinguish these levels:

- **Level A — Virtual Office Demo:** browser app loads reliably; 3D scene, seven worker placeholders, camera, worker panels, queue, task enqueue, activity, pause/resume, 1x/2x/4x, manual Step, responsive/reduced-motion/error states are manually accepted. Data is clearly SIMULATED.
- **Level B — Live observability:** BFF protects server-side token; the five Phase 3.1 read-only APIs are integrated; LIVE/SIMULATED/STALE/OFFLINE/ERROR provenance is explicit; no secret in browser assets/storage/network URL; failures are tested.
- **Level C — Real AI workforce:** versioned runtime contract, trustworthy worker heartbeat/health, provider execution, cost guard, persistent backend queue/dispatch, retry/cancel/idempotency, frontend live adapter, and demo/live separation all function and are tested.
- **Level D — v1.0 operational product:** authenticated human controls, audit/governance, security review, failure recovery, asset/license acceptance, 7-worker baseline and representative 50–100 worker performance testing, reproducible installation/deployment/backup/rollback, full regression and release acceptance.

A successful build is not a successful browser QA. Passing unit tests is not a live integration test. A CI test using disposable PostgreSQL is not proof that the production Supabase connection is available. A PROCESSING database row is not proof that a worker OS process is alive.

---

## 6. Anti-hallucination and safe-work protocol (mandatory)

Before every task:
1. Re-read Product Vision and relevant roadmap/state.
2. Inspect the actual current repository, branch, local status, remote HEAD, recent commit(s), relevant files, and existing diffs.
3. Identify which repo and branch the task belongs to. Do not mix Virtual Office and Python Backend, or their local workspaces.
4. Separate **verified facts**, **agent-reported claims**, **hypotheses**, and **unknowns** in the response.
5. If a fact is based only on a document, say it is documented, not independently proven.
6. If a feature is only represented by code, say “implemented in source” — do not claim operational readiness.
7. Verify exact test commands/results on the current target commit before saying tests pass. Record commit SHA and environment.
8. For UI, require actual target-browser manual evidence; automated component assertions do not prove visual behavior.
9. For backend/API, distinguish disposable CI tests, local smoke tests, actual Supabase acceptance, and production deployment evidence.
10. When evidence is unavailable, state “not verified” and specify the evidence needed. Do not fill gaps with assumptions.

Before editing:
- Read applicable AI rules and skills.
- Keep work within the current phase and target files.
- Preserve user changes and untracked files.
- Never reset/clean/stash/rebase/force-push/merge or delete files unless explicitly authorized.
- Do not commit or push unless the user explicitly requests it.
- Never access, print, copy, or expose secret values. Ask the user to verify secret presence privately using safe boolean checks only.
- No backend/provider/Telegram/MT5/trading changes during Phase 2.3.
- Do not make real AI provider calls or incur paid cost without explicit approval.
- No browser-side credentials, API Bearer token, Supabase service-role key, database URL, broker key, Telegram secret, or provider key.

After editing:
- Review the full diff and changed-file list.
- Run the phase-required tests, typecheck/lint, production build, and diff whitespace checks.
- Check for unrelated files and accidental secrets.
- Report exact branch/HEAD, file list, exact test counts and commands, checks, manual QA evidence, unresolved risks, and whether commit/push happened.
- Update `docs/PROJECT_STATE.md` only when the milestone's evidence supports the status change.

### Model division preference
- **Sonnet:** planning, architecture, deep audit, acceptance design, code review.
- **Argon:** implementation, coding, tests, build/fix work.
- The model's own completion summary is not evidence; independently inspect the resulting code and test output.

---

## 7. Immediate next actions at last review

1. Preserve the local C1 changes. Inspect local `git status`; do not discard user edits.
2. Complete/review C1 accumulator implementation and acceptance tests. Confirm it is actually committed to and present on `phase-2-2-task-dispatcher`.
3. Complete Phase 2.3 manual browser QA using the actual target browser/viewport; record evidence and remaining deferred items.
4. Reconcile Phase 3.1 Runbook and Project State; privately configure the dedicated DB credential and server-only Bearer token; verify startup and all five HTTP GET endpoints locally without exposing secrets.
5. Only after Phase 2.3 sign-off, start Phase 3.2 BFF design/implementation.

**Never state SIREADER v1.0 or the real AI workforce is complete until all required roadmap acceptance gates have evidence.**
