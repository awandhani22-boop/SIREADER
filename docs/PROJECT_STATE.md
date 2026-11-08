# SIREADER Virtual Office — Project State

## Current phase
**Phase 3.2 — NEXT: Secure BFF & Frontend Observability Integration.**
Phases 1, 2.1, 2.2, and 2.3 are complete as recorded below. Phase 2.3 achieved formal acceptance (ACCEPT WITH DEFERRED ITEMS) with all 282 automated tests passing, empirical CDP browser QA, sub-second clock precision, camera rotate/reset evidence, manual task enqueue validation, and strict C1 fixed-step determinism. The next priority is Phase 3.2: connecting the frontend to the Phase 3.1 Python backend observability endpoints via a secure loopback BFF. Do not restart the scheduler or create a replacement frontend.

Product mission: [`docs/PRODUCT_VISION.md`](PRODUCT_VISION.md) — canonical purpose of SIREADER and its Virtual Office.
Master roadmap: [`docs/ROADMAP.md`](ROADMAP.md) — authoritative phase order and v1.0 acceptance gates.
Before every task, read PRODUCT_VISION.md, ROADMAP.md, and this PROJECT_STATE.md before inspecting code.
Branch: `phase-2-2-task-dispatcher`<br>
Phase 2.2 implementation baseline: `cf1083d`

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
Execute **Phase 3.2 — Secure BFF & Frontend Observability Integration**: Connect the existing Three.js Virtual Office to the five Phase 3.1 Python Backend GET endpoints via a secure backend-for-frontend loopback reverse proxy without exposing the API Bearer Token in browser bundles. Follow `docs/ROADMAP.md` for all later phases through Virtual Office v1.0.
