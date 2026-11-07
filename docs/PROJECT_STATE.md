# SIREADER Virtual Office — Project State

## Current phase
**Phase 2.2 — COMPLETE (with non-blocking notes).**
The Phase 2.2 Global Task Dispatcher milestone has completed all architectural and runtime requirements, verified by 256 automated tests across 13 test files, clean TypeScript compilation, clean production build, and partial browser QA.

Branch: `phase-2-2-task-dispatcher`<br>
HEAD Baseline: `cf1083d`

## Implemented
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
- **Automated Tests**: **256 passing, 0 failing** across 13 test files (`npx tsx --test src/**/*.test.ts`).
- **TypeScript Typecheck**: **Clean (0 errors)** via `npm run lint` (`tsc --noEmit`).
- **Production Build**: **Successful** via `npm run build` (built in ~1.0s).
- **Purity Check**: **Clean (0 issues)** via `git diff --check`.
- **Verification Environment**: Automated test, lint, and build execution results were reported by owner/local test environment and statically verified by reviewer (256 `test(` declarations across 13 files).
- **Build Warnings (Nonfatal)**:
  1. Vite config `__dirname` warning (`vite.config.ts:11:27` uses `__dirname` unsupported by native configLoader; planned deprecation in Vite in favor of `import.meta.dirname`).
  2. Rolldown chunk size warning (`dist/assets/index-CapXtjpT.js` is ~1.4 MB minified, exceeding default 500 kB chunk warning threshold).
- **Browser-level Manual QA**:
  - *Verified in Browser*: Blocked task state $\rightarrow$ dispatch to RUNNING upon worker availability $\rightarrow$ completion $\rightarrow$ reset to baseline.
  - *Unverified in Browser (Covered by Automated Tests)*: Pause/resume UI button interaction, speed controls (1x, 2x, 4x) visual inspection, 3D avatar scene inspection, FAILED activity lifecycle display, and manual enqueue form UI interaction.

## Next
Phase 2.2 is complete. Proceed to milestone sign-off and planning for subsequent phases. Python/backend and real AI-worker integration remain deferred to future milestones.
