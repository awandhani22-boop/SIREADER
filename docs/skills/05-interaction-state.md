# Skill 05 — Interaction and Worker State Management

## Mission
Make every clickable control functional and ensure visual behavior reflects application state.

## Worker model fields
- `id`, `name`, `role`, `department`, `model`, `provider`, `status`.
- `currentTask`, `lastActivityAt`, `tokenUsage`, `estimatedCost`.
- `successCount`, `errorCount`, `workstationId`, `animationState`.

All values are simulated in Phase 1. Clearly label them as demo/mock data.

## Status state machine
```text
IDLE -> TASK_RECEIVED -> WALKING -> WORKING -> COMPLETED -> IDLE
                         |             |
                         +-> PAUSED <--+
                         +-> ERROR
WAITING -> TASK_RECEIVED
```
Implement valid transitions centrally. Do not allow arbitrary component-level status changes that bypass the state machine.

## Controls
- Assign Task: opens a small task input/select UI and records a mock task.
- Pause: transitions active worker to PAUSED.
- Resume: returns worker to a safe previous/idle state.
- Activity History: opens a chronological event list.
- Select Worker: selects avatar or workstation and synchronizes panel selection.

## Simulation
- Use controlled, seeded or deterministic transitions where possible so tests and demos are repeatable.
- Avoid random worker status changes every render.
- Provide play/pause simulation control and clear simulated activity label.
- Keep worker state independent from animation implementation.

## Acceptance criteria
- Buttons have working handlers and visible feedback.
- Worker state and activity feed remain consistent.
- Selection works with mouse and keyboard-accessible UI controls.


## Phase 2.2 — Global task queue and diagnostics
- The global queue is distinct from each worker's legacy task queue. Do not show the demo generator's cap as the global queue capacity.
- Render queued lifecycle states separately from task activity: queue view = `WAITING` and `BLOCKED`; pool activity view = `RUNNING`, `COMPLETED`, and `FAILED`.
- Use the store's pure selectors (`selectGlobalQueueEntries`, `selectGlobalTaskActivity`, and `selectGlobalSimulatedTotals`) for derived display data. Keep priority, eligibility, and dispatch rules in `src/scheduler/`.
- Show dispatch diagnostics only when the store has received an actual dispatch result. Reset must clear diagnostic state; a global resume must not invent an immediate dispatch.
- Manual global enqueue is evaluated by the next simulation dispatch pass. Do not imply that adding a task guarantees immediate assignment.
- Label queue execution, worker activity, token usage, and cost as simulated until a real backend contract is implemented.
