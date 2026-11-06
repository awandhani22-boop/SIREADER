# SIREADER Virtual Office — Project State

## Current phase
Phase 2.1 (Worker Capability Registry & Task Model — Complete & Verified) — Builds on the Phase 1.1 unified 3D simulation & animation foundation by introducing a centralized, deeply immutable `WorkerCapabilityRegistry` across all 7 permanent workers (`28` unique capabilities) and a backward-compatible, deterministically validated `TaskEntity` domain model with a 9-state lifecycle state machine (`PENDING`, `QUEUED`, `ASSIGNED`, `RUNNING`, `COMPLETED`, `FAILED`, `RETRY_WAIT`, `BLOCKED`, `CANCELLED`).

## Working features
- **Centralized Worker Capability Registry (`src/workers/worker.capabilities.ts`, `src/tasks/task.types.ts`)**:
  - Single source of truth for static capability metadata across the 7 permanent workers (`supervisor`, `haiku`, `sonnet`, `opus`, `decision_engineer`, `market_monitor`, `data_archivist`) and `28` unique `WorkerCapabilityId` definitions.
  - Strict separation between static capability profiles (`WorkerCapabilityProfile`) and runtime worker operational status (`IDLE`, `BUSY`, `PAUSED`).
  - Supports worker profile lookup (`getWorkerCapabilityProfile`), full profile enumeration (`getAllWorkerCapabilityProfiles`), capability lookup (`getCapabilityById`), active task-type support check (`supportsTaskType`), worker discovery by task type (`getWorkersByTaskType`), and isolated custom registry snapshots (`createCustomCapabilityRegistry`) where disabled capabilities (`enabled: false`) or disabled workers are excluded from active queries.
  - All returned profiles and capability definitions are deeply frozen (`Object.freeze`) defensive clones that cannot be mutated from outside.
- **Unified Structured Task Model & Deterministic Factory (`src/workers/worker.types.ts`, `src/tasks/task.factory.ts`, `src/workers/worker.mock-service.ts`)**:
  - Extended the existing `TaskEntity` backward-compatibly (without creating a duplicate task entity) to include `type`, `lifecycleStatus`, `assignedWorkerId`, `parentTaskId`, `dependencyIds`, structured `input` (`TaskInputPayload`), structured `result` (`TaskResultPayload | null`), structured `error` (`TaskErrorDetail | null`), `attemptCount`, `maxAttempts`, and simulation-clock timestamps (`createdAt`, `queuedAt`, `startedAt`, `completedAt`, `updatedAt`).
  - Deterministic task ID and entity creation (`generateDeterministicTaskId`, `DeterministicTaskSequence`, `createTaskEntity`) driven strictly by `simTimeMs`, seed, and sequence counters (zero `Date.now()` or `Math.random()`).
- **Task Lifecycle State Machine & 17-Rule Validator (`src/tasks/task.transitions.ts`, `src/tasks/task.validation.ts`)**:
  - Enforces all valid Phase 2.1 lifecycle transitions (`PENDING`, `QUEUED`, `ASSIGNED`, `RUNNING`, `COMPLETED`, `FAILED`, `RETRY_WAIT`, `BLOCKED`, `CANCELLED`), terminal state immutability (`COMPLETED`, `CANCELLED`), and backward-compatible mapping from Phase 1.1 stage statuses (`ROUTING`, `EXTRACTING`, `ANALYZING`, `VALIDATING`, `ARCHIVING` -> `RUNNING`).
  - `transitionTaskStatus` is pure and immutable: failed transitions return structured `TaskTransitionError` objects without mutating the input `TaskEntity`.
  - `validateTaskEntity` enforces all 17 structural, relational, and simulation-timestamp invariants.
- **Preserved Phase 1.1 Foundation**:
  - Unified `SimulationEngine` & avatar animation clock (`stepAvatarClockFromEngine`), direct `THREE.AnimationMixer` controller (`GlbAvatarAnimationController`), isolated GLB error boundaries, granular Zustand selectors, and read-only capability badges in `WorkerPanel`.

## Files modified / added in Phase 2.1
- `src/tasks/task.types.ts` (Added — Phase 2.1 task, capability, validation, and transition types)
- `src/workers/worker.capabilities.ts` (Added — centralized immutable Worker Capability Registry & query operations)
- `src/tasks/task.transitions.ts` (Added — 9-state Task State Machine, stage compatibility mapper, and immutable transition functions)
- `src/tasks/task.validation.ts` (Added — 17-rule TaskEntity structural and timestamp validator)
- `src/tasks/task.factory.ts` (Added — deterministic Task ID sequence & validated TaskEntity factory)
- `src/workers/worker.types.ts` (Modified — backward-compatible extension of `TaskEntity` with Phase 2.1 fields)
- `src/workers/worker.mock-service.ts` (Modified — populates and maintains Phase 2.1 `TaskEntity` metadata & timestamps)
- `src/workers/simulation.engine.ts` (Modified — maintains `lifecycleStatus` and `updatedAt` during execution ticks)
- `src/ui/WorkerPanel.tsx` (Modified — displays read-only worker capabilities from `getWorkerCapabilityProfile`)
- `src/workers/worker.capabilities.test.ts` (Added — 10 automated unit tests for Capability Registry)
- `src/tasks/task.model.test.ts` (Added — 14 automated unit tests for Task Model, Validation & Deterministic Factory)
- `src/tasks/task.transitions.test.ts` (Added — 5 automated unit tests for Task State Machine & transitions)
- `docs/PROJECT_STATE.md` (Modified)

## Architecture constraints
- Strictly 100% Frontend-only (`Phase 2.1`). Python backend, databases, migrations, `.env`, Telegram, MetaTrader 5, and live trading execution are untouched.
- Phase 2.1 scope strictly limited to Worker Capability Registry & Task Model (no Task Dispatcher, Priority Scheduler, Dependency Graph / Cycle Detection, Inter-worker Messaging, or Retry/Timeout/Audit Engine yet).

## Known limitations
- All tasks, queues, events, token counts, and USD costs are local deterministic simulations explicitly labeled `SIMULATED`.
- Task Dispatcher, Priority Queue Scheduler, and Task Decomposition will be introduced in Phase 2.2.

## Last verified checks (Exact commands & actual results)
1. **Automated Unit & Integration Tests (Phase 1.1 + Phase 2.1)**:
   - Command: `npx --yes tsx --test src/workers/simulation.engine.test.ts src/workers/worker.capabilities.test.ts src/tasks/task.model.test.ts src/tasks/task.transitions.test.ts`
   - Result: **Passed (`1..45`, `pass 45`, `fail 0`, exit code `0`)** — 16 Phase 1.1 tests + 10 Capability Registry tests + 14 Task Model/Validation/Factory tests + 5 State Transition tests.
2. **TypeScript Typecheck**:
   - Command: `npm run lint` (`tsc --noEmit`)
   - Result: **Passed (`0` errors, exit code `0`)**.
3. **Production Build**:
   - Command: `npm run build` (`vite build`)
   - Result: **Passed (`Build succeeded - the applet is compiled`, exit code `0`)**.

## Next task
Await owner review of Phase 2.1 before proceeding to Phase 2.2 (Supervisor Decomposition, Task Dispatcher & Priority Scheduler).
