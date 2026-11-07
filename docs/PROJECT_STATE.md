# SIREADER Virtual Office — Project State

## Current phase
**Phase 2.2 M3 — Runtime dispatcher, global queue, UI integration, and post-audit corrections are implemented.** The milestone remains open pending local verification and final audit.

Branch: `phase-2-2-task-dispatcher`

## Implemented
- **Commit 6 — Runtime Dispatcher Integration** (`0cee0da`): global enqueue/dispatch integrated into deterministic simulation; legacy wrappers retained.
- **Commit 7 — Global Demo Task Migration** (`e741c2d`): seeded demo generation migrated to the global queue with 14 templates.
- **Commit 8 — Store & UI Integration** (`d669428`): Zustand queue state/diagnostics and dashboard views for WAITING/BLOCKED queue items and RUNNING/COMPLETED/FAILED pool activity.
- **Commit 10 — UI Activity & Metrics Corrections** (`45ee964`): corrected simulation-mode and queue labels, lifecycle-aware task activity timestamps, deterministic tie-breaking, and RUNNING-only active task counts.
- **Commit 11 — UI Regression Coverage** (`6e82623`): repaired React 19 UI event-handler test interactions and added regression cases for activity timestamp fallbacks, ordering, and active-count semantics.
- `src/scheduler/` owns priority ordering, capability matching/selection, dispatch decisions, and blocked reasons; the simulation engine owns simulated time and tick order.

## Boundaries and limitations
Worker execution, queues, activity, token usage, and USD costs are local **SIMULATED** data. No real AI provider, Python backend, API, database, persistence, MT5, or trading action is connected. `DEMO_MAX_QUEUE_CAP = 3` limits automatic demo generation only, not the global queue. RUNNING activity recency is based on lifecycle timestamps rather than continuously refreshed progress. Browser-level manual QA has not been performed.

## Verification status
Commits 10–11 have been pushed to the branch. Local test, TypeScript, production-build, and browser-level verification are **pending** and must be performed before declaring Phase 2.2 complete. Do not treat a successful GitHub push or code review as proof that tests/build pass.

## Next
Complete the Phase 2.2 final audit and run local verification together. Only after that should the next phase be planned. Python/backend and real AI-worker integration remain deferred.
