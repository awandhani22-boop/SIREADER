# SIREADER Virtual Office — Project State

## Current phase
**Phase 2.2 M3 — Commits 6–8 implemented; Commit 9 documents and verifies the milestone.** Phase 2.2 is not final until the post-Commit-9 audit is complete.

Branch: `phase-2-2-task-dispatcher`

## Implemented
- **Commit 6 — Runtime Dispatcher Integration** (`0cee0da`): global enqueue/dispatch integrated into deterministic simulation; legacy wrappers retained.
- **Commit 7 — Global Demo Task Migration** (`e741c2d`): seeded demo generation migrated to the global queue with 14 templates.
- **Commit 8 — Store & UI Integration** (`d669428`): Zustand queue state/diagnostics and dashboard views for WAITING/BLOCKED queue items and RUNNING/COMPLETED/FAILED pool activity.
- `src/scheduler/` owns priority ordering, capability matching/selection, dispatch decisions, and blocked reasons; the simulation engine owns simulated time and tick order.

## Boundaries and limitations
Worker execution, queues, activity, token usage, and USD costs are local **SIMULATED** data. No real AI provider, Python backend, API, database, persistence, MT5, or trading action is connected. `DEMO_MAX_QUEUE_CAP = 3` limits automatic demo generation only, not the global queue. RUNNING activity recency currently uses lifecycle timestamps rather than continuously refreshed progress. Browser-level manual QA was not independently performed in this review.

## Verification evidence
The branch has **13 test files / 249 test declarations**. The implementation agent reported `npx tsx --test src/**/*.test.ts` (249 passed, 0 failed), `npm run lint`, `npm run build`, and `git diff --check` as successful. This review independently checked the branch and test inventory but could not re-execute local commands through GitHub.

## Next
Finish the Phase 2.2 final audit before planning the next phase. Python/backend and real AI-worker integration remain deferred.
