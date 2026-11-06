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
