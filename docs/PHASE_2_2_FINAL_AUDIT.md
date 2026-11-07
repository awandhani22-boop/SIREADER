# Phase 2.2 — Final Audit Checklist

This document records the acceptance checks for the Phase 2.2 global task dispatcher milestone. It is a verification plan, not a claim that the milestone has passed.

## Scope and hard boundaries

- [ ] All worker execution, queue state, token usage, cost, and timestamps remain local simulated data.
- [ ] No real AI provider, external API, Python backend, database, persistence, MT5, or trading action is introduced.
- [ ] Simulation state changes remain deterministic for identical inputs and seed.
- [ ] Existing per-worker task assignment behavior remains compatible with the global dispatcher.

## Domain and scheduler checks

- [ ] Enqueue accepts only valid, unassigned QUEUED tasks.
- [ ] Enqueue rejection precedence and exact-snapshot preservation are covered.
- [ ] Duplicate IDs are rejected across task map, scheduler entries, and worker tracking.
- [ ] Queue order is CRITICAL > HIGH > NORMAL > LOW, then FIFO sequence, then stable original index.
- [ ] Missing task entities are diagnosed and removed from the queue without fabricating tasks.
- [ ] Blocked tasks remain queued and can dispatch on a later pass when constraints clear.
- [ ] Worker capability matching and selection respect eligibility, concurrency, load ratio, cost tie-break, and worker order.
- [ ] Dispatch updates task lifecycle, worker active-task tracking, scheduler entries, and activity events consistently.
- [ ] Global pause short-circuits dispatch without mutating or normalizing the original snapshot.
- [ ] Dispatch and normalization preserve unaffected object references where specified.

## Simulation and UI checks

- [ ] Simulation tick order advances simulated time and worker execution before/around dispatch according to the documented engine contract.
- [ ] Diagnostics reflect the actual dispatch pass and are preserved when no pass occurs.
- [ ] Global queue panel distinguishes WAITING/BLOCKED queue entries from RUNNING/COMPLETED/FAILED pool activity.
- [ ] Activity timestamps use lifecycle-appropriate fields and deterministic tie-breaking.
- [ ] Active task metrics count only RUNNING lifecycle tasks.
- [ ] UI labels clearly identify simulated mode and simulated token/cost metrics.

## Local verification — pending

Run from the repository root after syncing the branch:

1. Install dependencies if needed: `npm install`.
2. Run the test suite using the repository's supported test command or the project's documented `tsx --test` invocation.
3. Run TypeScript validation: `npm run lint` (this script runs `tsc --noEmit`).
4. Run production compilation: `npm run build`.
5. Run `git diff --check`.
6. Start the app with `npm run dev` and manually inspect the 3D office, pause/resume, speed controls, queue enqueue, dispatch, blocked state, completion/failure activity, and reset behavior.

Record the actual command output and any failures before marking these checks complete. A GitHub push or source inspection alone does not prove local tests, compilation, or browser behavior.

## Current audit status

- Source review: ongoing.
- Automated tests: not independently executed in this audit session.
- TypeScript validation and production build: not independently executed.
- Browser/manual QA: pending.
- Phase 2.2 completion: **not yet approved**.

## Exit criteria

Phase 2.2 may be marked complete only after all applicable checks above pass, regressions are fixed, and the final branch state is reviewed. Backend and real AI-worker integration are explicitly outside this milestone.
