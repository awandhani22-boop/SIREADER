import {
  createInitialWorkersRegistry,
  GLOBAL_DEMO_TASK_TEMPLATES,
  INITIAL_WORKER_ORDER,
  WORKER_TASK_TEMPLATES,
} from './worker.registry';
import {
  getActiveTaskIds,
} from './worker.concurrency';
import {
  deriveAnimationForWorker,
  resolveTaskStageStatus,
  WorkerMockService,
} from './worker.mock-service';
import {
  createInitialSchedulerState,
  normalizeSimulationSnapshot,
} from '../scheduler/scheduler.state';
import type { DispatchPassResult } from '../scheduler/scheduler.types';
import {
  updateTaskExecutionStage,
} from '../tasks/task.transitions';
import {
  SimulationSnapshot,
  WorkerEntity,
  WorkerId,
  WorkerStatus,
} from './worker.types';

/**
 * SimulationEngine (Phase 1.1 Final Audit — Unified Simulation & Animation Clock)
 *
 * Enforces the critical architectural invariants:
 * 1. Single Source of Truth for Time:
 *    - `SimulationEngine` owns both discrete tick simulation time (`snapshot.simTimeMs`)
 *      and the unified render simulation time (`SimulationEngine.getUnifiedSimTimeMs`),
 *      so 3D avatar animations (placeholder joints, GLB `THREE.AnimationMixer`, and
 *      workstation rings) advance strictly from `SimulationEngine` time deltas without
 *      60Hz React state updates or FPS-drop drift.
 * 2. Explicit Pause semantics:
 *    - Global Pause (`isGlobalPaused`): freezes the entire simulation clock and all workers.
 *    - Worker Pause (`worker.status === 'PAUSED'`): freezes ONLY that worker's
 *      current task progress and animation time while all other workers continue normally.
 *    - Global Resume (`setGlobalPaused(false)`): never resumes a worker that was
 *      individually paused before Global Pause.
 *    - Worker Resume: restores `statusBeforePause` and continues the active task
 *      from its exact `elapsedSimMs` and `progress` without resetting.
 * 3. Deterministic Reset (`resetToBaseline`):
 *    - Restores a clean, zero-task, zero-clock deterministic baseline (`simTimeMs = 0`,
 *      `tickCount = 0`, `prngState = seed`, `tasks = {}`, `events = []`, all workers `IDLE`
 *      with empty queues and zeroed `SIMULATED` metrics) and increments `resetGeneration`
 *      so all avatar animation phases reset deterministically.
 */

export const DEFAULT_SIMULATION_SEED = 20261106;
export const FIXED_TICK_SIM_MS = 500;
export const MAX_DELTA_CLAMP_MS = 1000;
export const DEMO_MAX_QUEUE_CAP = 3;

const TASK_RECEIVED_DURATION_MS = 1000;
const WALKING_DURATION_MS = 1500;
const COMPLETED_CELEBRATION_DURATION_MS = 1000;

export interface RealtimeClockAnchorState {
  baseSimTimeMs: number;
  anchorWallTimeMs: number;
  isRealtimeLoopActive: boolean;
  highWaterSimTimeMs: number;
  resetGeneration: number;
}

const clockAnchor: RealtimeClockAnchorState = {
  baseSimTimeMs: 0,
  anchorWallTimeMs: 0,
  isRealtimeLoopActive: false,
  highWaterSimTimeMs: 0,
  resetGeneration: 1,
};

/**
 * Mulberry32 deterministic seeded PRNG.
 * Returns next uint32 state and a float in [0, 1).
 */
export function nextSeededRandom(state: number): { nextState: number; value: number } {
  let t = (state + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const unsigned = (t ^ (t >>> 14)) >>> 0;
  return {
    nextState: (state + 0x6d2b79f5) | 0,
    value: unsigned / 4294967296,
  };
}

function interpolatePosition(
  from: [number, number, number],
  to: [number, number, number],
  alpha: number,
): [number, number, number] {
  const t = Math.max(0, Math.min(1, alpha));
  return [
    Number((from[0] + (to[0] - from[0]) * t).toFixed(3)),
    Number((from[1] + (to[1] - from[1]) * t).toFixed(3)),
    Number((from[2] + (to[2] - from[2]) * t).toFixed(3)),
  ];
}

export interface SimulationTickResult {
  readonly snapshot: SimulationSnapshot;
  readonly dispatchResult?: DispatchPassResult<SimulationSnapshot>;
}

export interface SimulationAdvanceResult {
  readonly snapshot: SimulationSnapshot;
  readonly lastDispatchResult?: DispatchPassResult<SimulationSnapshot>;
}

export interface WorkerResumeResult {
  readonly snapshot: SimulationSnapshot;
  readonly dispatchResult?: DispatchPassResult<SimulationSnapshot>;
}

export class SimulationEngine {
  /**
   * Returns the monotonic reset generation counter.
   * Increments whenever `createBaselineSnapshot` / `resetToBaseline` is invoked
   * so avatar animation clocks deterministically restore their initial phases.
   */
  static getResetGeneration(): number {
    return clockAnchor.resetGeneration;
  }

  /**
   * Synchronizes the non-reactive real-time clock anchor with `snapshot.simTimeMs`.
   * Called by `OfficeApp`'s real-time loop so `useFrame` can read continuous
   * engine-anchored simulation time at 60fps without 60Hz React state updates
   * and with zero long-term or FPS-drop drift from `snapshot.simTimeMs`.
   */
  static syncRealtimeClockAnchor(
    snapshot: SimulationSnapshot,
    nowWallTimeMs: number,
    isRealtimeLoopActive: boolean,
  ): void {
    clockAnchor.baseSimTimeMs = snapshot.simTimeMs;
    clockAnchor.anchorWallTimeMs = nowWallTimeMs;
    clockAnchor.isRealtimeLoopActive = isRealtimeLoopActive && !snapshot.isGlobalPaused;
    clockAnchor.highWaterSimTimeMs = Math.max(
      clockAnchor.highWaterSimTimeMs,
      snapshot.simTimeMs,
    );
  }

  /**
   * Returns the elapsed wall-clock milliseconds since the last real-time anchor sync
   * (or `0` when the real-time loop is not active). Used when pausing or changing speed
   * mid-interval to flush partial tick progress into `SimulationEngine` before freezing.
   */
  static getPendingRealtimeWallDeltaMs(nowWallTimeMs: number): number {
    if (!clockAnchor.isRealtimeLoopActive) {
      return 0;
    }
    return Math.max(
      0,
      Math.min(nowWallTimeMs - clockAnchor.anchorWallTimeMs, MAX_DELTA_CLAMP_MS),
    );
  }

  /**
   * Computes the authoritative simulation time (ms) from `SimulationEngine`.
   * - When globally paused or in deterministic unit-test / step mode (`!isRealtimeLoopActive`),
   *   returns `snapshot.simTimeMs` directly.
   * - When the real-time loop is active in the browser, interpolates sub-tick progress
   *   anchored strictly to `snapshot.simTimeMs` so animation never drifts from `simTimeMs`
   *   even if browser FPS drops.
   */
  static getUnifiedSimTimeMs(
    snapshot: SimulationSnapshot,
    nowWallTimeMs?: number,
  ): number {
    if (snapshot.simTimeMs === 0 && snapshot.tickCount === 0) {
      return 0;
    }

    if (
      snapshot.isGlobalPaused ||
      !clockAnchor.isRealtimeLoopActive ||
      nowWallTimeMs === undefined
    ) {
      return Math.max(snapshot.simTimeMs, clockAnchor.highWaterSimTimeMs);
    }

    const elapsedWallMs = Math.max(
      0,
      Math.min(nowWallTimeMs - clockAnchor.anchorWallTimeMs, FIXED_TICK_SIM_MS),
    );
    const interpolatedSimMs =
      snapshot.simTimeMs + elapsedWallMs * snapshot.simSpeedMultiplier;

    clockAnchor.highWaterSimTimeMs = Math.max(
      clockAnchor.highWaterSimTimeMs,
      snapshot.simTimeMs,
      interpolatedSimMs,
    );
    return clockAnchor.highWaterSimTimeMs;
  }

  /**
   * Creates a clean, zero-task deterministic baseline snapshot (`t = 0`).
   * Used by `resetToBaseline` so Reset clears all active/queued tasks, activity events,
   * worker states, and restores the exact seeded PRNG state and avatar animation phases.
   */
  static createBaselineSnapshot(seed: number = DEFAULT_SIMULATION_SEED): SimulationSnapshot {
    clockAnchor.resetGeneration += 1;
    clockAnchor.baseSimTimeMs = 0;
    clockAnchor.anchorWallTimeMs = 0;
    clockAnchor.isRealtimeLoopActive = false;
    clockAnchor.highWaterSimTimeMs = 0;

    const workers = createInitialWorkersRegistry();
    return {
      seed,
      prngState: seed,
      simTimeMs: 0,
      tickCount: 0,
      isGlobalPaused: false,
      simSpeedMultiplier: 1,
      workers,
      workerOrder: [...INITIAL_WORKER_ORDER],
      tasks: {},
      events: [],
      scheduler: createInitialSchedulerState(),
    };
  }

  /**
   * Restores the simulation to the clean deterministic baseline (`t = 0`),
   * clearing all active and queued tasks, resetting worker states and metrics,
   * restoring `prngState = seed`, and resetting avatar animation phases.
   */
  static resetToBaseline(seed: number = DEFAULT_SIMULATION_SEED): SimulationSnapshot {
    return this.createBaselineSnapshot(seed);
  }

  /**
   * Creates an initial snapshot for first app boot with deterministic demo tasks
   * pre-assigned so the 3D office is immediately active upon opening.
   */
  static createInitialSnapshot(seed: number = DEFAULT_SIMULATION_SEED): SimulationSnapshot {
    let snapshot = this.createBaselineSnapshot(seed);

    // Seed initial tasks deterministically so the office is immediately alive and inspectable
    snapshot = WorkerMockService.assignTask(snapshot, { workerId: 'supervisor' }, 0);
    snapshot = WorkerMockService.assignTask(snapshot, { workerId: 'supervisor' }, 1);
    snapshot = WorkerMockService.assignTask(snapshot, { workerId: 'haiku' }, 0);
    snapshot = WorkerMockService.assignTask(snapshot, { workerId: 'sonnet' }, 0);
    snapshot = WorkerMockService.assignTask(snapshot, { workerId: 'sonnet' }, 1);
    snapshot = WorkerMockService.assignTask(snapshot, { workerId: 'opus' }, 0);
    snapshot = WorkerMockService.assignTask(snapshot, { workerId: 'decision_engineer' }, 0);
    snapshot = WorkerMockService.assignTask(snapshot, { workerId: 'market_monitor' }, 0);
    snapshot = WorkerMockService.assignTask(snapshot, { workerId: 'data_archivist' }, 0);

    // Advance 6 deterministic ticks (3000ms) so workers are BUSY in distinct stages
    for (let i = 0; i < 6; i++) {
      snapshot = this.stepSimulationTick(snapshot, FIXED_TICK_SIM_MS);
    }

    clockAnchor.baseSimTimeMs = snapshot.simTimeMs;
    clockAnchor.highWaterSimTimeMs = snapshot.simTimeMs;
    return snapshot;
  }

  /**
   * Advances the simulation from an external timer delta while clamping the maximum
   * elapsed time (`MAX_DELTA_CLAMP_MS`) before applying `simSpeedMultiplier`, so
   * `1x`, `2x`, and `4x` speeds advance simulation time consistently in fixed steps
   * without skipping task stages.
   */
  static advanceByWallClockDeltaWithDiagnostics(
    snapshot: SimulationSnapshot,
    rawElapsedMs: number,
  ): SimulationAdvanceResult {
    if (snapshot.isGlobalPaused || rawElapsedMs <= 0) {
      return { snapshot };
    }

    // Clamp wall-clock delta to MAX_DELTA_CLAMP_MS before applying speed multiplier
    const clampedBaseMs = Math.max(0, Math.min(rawElapsedMs, MAX_DELTA_CLAMP_MS));
    const totalSimMsToAdvance = clampedBaseMs * snapshot.simSpeedMultiplier;

    let current = normalizeSimulationSnapshot(snapshot);
    let remainingMs = totalSimMsToAdvance;
    let lastDispatchResult: DispatchPassResult<SimulationSnapshot> | undefined;

    while (remainingMs >= FIXED_TICK_SIM_MS) {
      const tickResult = this.stepSimulationTickWithDiagnostics(current, FIXED_TICK_SIM_MS);
      current = tickResult.snapshot;
      lastDispatchResult = tickResult.dispatchResult;
      remainingMs -= FIXED_TICK_SIM_MS;
    }

    if (remainingMs > 0) {
      const tickResult = this.stepSimulationTickWithDiagnostics(current, remainingMs);
      current = tickResult.snapshot;
      lastDispatchResult = tickResult.dispatchResult;
    }

    clockAnchor.baseSimTimeMs = current.simTimeMs;
    clockAnchor.highWaterSimTimeMs = Math.max(
      clockAnchor.highWaterSimTimeMs,
      current.simTimeMs,
    );
    return {
      snapshot: current,
      lastDispatchResult,
    };
  }

  static advanceByWallClockDelta(
    snapshot: SimulationSnapshot,
    rawElapsedMs: number,
  ): SimulationSnapshot {
    return this.advanceByWallClockDeltaWithDiagnostics(snapshot, rawElapsedMs).snapshot;
  }

  /**
   * Advances the simulation by a single deterministic step (`stepSimMs`) and
   * captures full dispatch diagnostics from the actual final dispatch pass.
   */
  static stepSimulationTickWithDiagnostics(
    snapshot: SimulationSnapshot,
    stepSimMs: number = FIXED_TICK_SIM_MS,
  ): SimulationTickResult {
    if (snapshot.isGlobalPaused || stepSimMs <= 0) {
      return { snapshot };
    }

    const normalizedSnapshot = normalizeSimulationSnapshot(snapshot);

    // 1. Advance simulation clock (bounded so stage transitions are never skipped)
    const boundedStepMs = Math.min(stepSimMs, MAX_DELTA_CLAMP_MS);
    let nextSnapshot: SimulationSnapshot = {
      ...normalizedSnapshot,
      simTimeMs: Number((normalizedSnapshot.simTimeMs + boundedStepMs).toFixed(3)),
      tickCount: normalizedSnapshot.tickCount + 1,
      workers: { ...normalizedSnapshot.workers },
      tasks: { ...normalizedSnapshot.tasks },
    };

    // 2. Step all workers and their active tasks in canonical workerOrder
    for (const workerId of nextSnapshot.workerOrder) {
      nextSnapshot = this.stepSingleWorker(nextSnapshot, workerId, boundedStepMs);
    }

    // 3. Deterministic demo task generator: every 12 ticks, if queue cap permits,
    // consume two PRNG draws and enqueue an unpinned global task
    if (nextSnapshot.tickCount % 12 === 0) {
      const prng1 = nextSeededRandom(nextSnapshot.prngState);
      nextSnapshot.prngState = prng1.nextState;

      const prng2 = nextSeededRandom(nextSnapshot.prngState);
      nextSnapshot.prngState = prng2.nextState;

      const currentQueueLength = nextSnapshot.scheduler?.entries.length ?? 0;
      if (prng1.value < 0.75 && currentQueueLength < DEMO_MAX_QUEUE_CAP) {
        const templateCount = GLOBAL_DEMO_TASK_TEMPLATES.length;
        const chosenIndex = Math.floor(prng2.value * templateCount);
        const template = GLOBAL_DEMO_TASK_TEMPLATES[chosenIndex];
        if (template) {
          nextSnapshot = WorkerMockService.enqueueGlobalTask(
            nextSnapshot,
            template,
          );
        }
      }
    }

    // 4. Execute deterministic global scheduler dispatch pass
    const dispatchResult = WorkerMockService.dispatchGlobalQueueWithResult(nextSnapshot);
    nextSnapshot = dispatchResult.snapshot;

    // 5. Synchronize unified clock anchor
    clockAnchor.baseSimTimeMs = nextSnapshot.simTimeMs;
    clockAnchor.highWaterSimTimeMs = Math.max(
      clockAnchor.highWaterSimTimeMs,
      nextSnapshot.simTimeMs,
    );
    return {
      snapshot: nextSnapshot,
      dispatchResult,
    };
  }

  /**
   * Advances the simulation by a single deterministic step (`stepSimMs`).
   * Does not depend on `Date.now()` or `requestAnimationFrame`.
   * Backward-compatible wrapper delegating to `stepSimulationTickWithDiagnostics()`.
   */
  static stepSimulationTick(
    snapshot: SimulationSnapshot,
    stepSimMs: number = FIXED_TICK_SIM_MS,
  ): SimulationSnapshot {
    return this.stepSimulationTickWithDiagnostics(snapshot, stepSimMs).snapshot;
  }

  private static stepSingleWorker(
    snapshot: SimulationSnapshot,
    workerId: WorkerId,
    stepSimMs: number,
  ): SimulationSnapshot {
    const worker = snapshot.workers[workerId];
    if (!worker) return snapshot;

    // Invariant: If this specific worker is PAUSED, freeze their state & task progress completely
    if (worker.status === 'PAUSED') {
      return snapshot;
    }

    // 1. Transition: TASK_RECEIVED -> WALKING (brief briefing/corridor step)
    if (worker.status === 'TASK_RECEIVED') {
      const nextTransitionMs = worker.transitionSimMs + stepSimMs;
      if (nextTransitionMs >= TASK_RECEIVED_DURATION_MS) {
        const currentTask = worker.currentTaskId ? snapshot.tasks[worker.currentTaskId] : null;
        const updatedWorker: WorkerEntity = {
          ...worker,
          status: 'WALKING',
          transitionSimMs: 0,
          position3D: interpolatePosition(worker.corridorWaypoint3D, worker.homePosition3D, 0.25),
          animationState: deriveAnimationForWorker('WALKING', currentTask?.status ?? null),
        };
        return {
          ...snapshot,
          workers: {
            ...snapshot.workers,
            [workerId]: updatedWorker,
          },
        };
      }
      return {
        ...snapshot,
        workers: {
          ...snapshot.workers,
          [workerId]: {
            ...worker,
            transitionSimMs: nextTransitionMs,
          },
        },
      };
    }

    // 2. Transition: WALKING -> BUSY (arriving at workstation desk)
    if (worker.status === 'WALKING') {
      const nextTransitionMs = worker.transitionSimMs + stepSimMs;
      const walkAlpha = Math.min(1, 0.25 + (nextTransitionMs / WALKING_DURATION_MS) * 0.75);
      const currentTask = worker.currentTaskId ? snapshot.tasks[worker.currentTaskId] : null;

      if (nextTransitionMs >= WALKING_DURATION_MS) {
        const updatedWorker: WorkerEntity = {
          ...worker,
          status: 'BUSY',
          transitionSimMs: 0,
          position3D: [...worker.homePosition3D],
          animationState: deriveAnimationForWorker('BUSY', currentTask?.status ?? null),
        };
        return {
          ...snapshot,
          workers: {
            ...snapshot.workers,
            [workerId]: updatedWorker,
          },
        };
      }

      return {
        ...snapshot,
        workers: {
          ...snapshot.workers,
          [workerId]: {
            ...worker,
            transitionSimMs: nextTransitionMs,
            position3D: interpolatePosition(
              worker.corridorWaypoint3D,
              worker.homePosition3D,
              walkAlpha,
            ),
          },
        },
      };
    }

    // 3. Active Execution: BUSY -> progresses all active tasks deterministically
    if (worker.status === 'BUSY') {
      const capturedActiveIds = getActiveTaskIds(worker);
      if (capturedActiveIds.length === 0) {
        const idleWorker: WorkerEntity = {
          ...worker,
          status: 'IDLE',
          animationState: 'seated',
          activeTaskIds: [],
          currentTaskId: null,
        };
        const updated = {
          ...snapshot,
          workers: {
            ...snapshot.workers,
            [workerId]: idleWorker,
          },
        };
        return WorkerMockService.promoteNextQueuedTask(updated, workerId);
      }

      let workingSnapshot = snapshot;
      for (const taskId of capturedActiveIds) {
        const latestWorker = workingSnapshot.workers[workerId];
        if (!latestWorker || !getActiveTaskIds(latestWorker).includes(taskId)) {
          continue;
        }
        workingSnapshot = this.stepActiveTask(
          workingSnapshot,
          workerId,
          taskId,
          stepSimMs,
        );
      }
      return workingSnapshot;
    }

    // 4. Transition: COMPLETED -> IDLE (or next queued task)
    if (worker.status === 'COMPLETED') {
      const nextTransitionMs = worker.transitionSimMs + stepSimMs;
      if (nextTransitionMs >= COMPLETED_CELEBRATION_DURATION_MS) {
        const idleWorker: WorkerEntity = {
          ...worker,
          status: 'IDLE',
          transitionSimMs: 0,
          animationState: 'seated',
        };
        const updatedSnapshot: SimulationSnapshot = {
          ...snapshot,
          workers: {
            ...snapshot.workers,
            [workerId]: idleWorker,
          },
        };
        return WorkerMockService.promoteNextQueuedTask(updatedSnapshot, workerId);
      }
      return {
        ...snapshot,
        workers: {
          ...snapshot.workers,
          [workerId]: {
            ...worker,
            transitionSimMs: nextTransitionMs,
          },
        },
      };
    }

    // 5. IDLE with queued tasks waiting -> promote next task immediately
    if (worker.status === 'IDLE' && !worker.currentTaskId && worker.taskQueueIds.length > 0) {
      return WorkerMockService.promoteNextQueuedTask(snapshot, workerId);
    }

    // Return unchanged reference when worker is IDLE with empty queue
    return snapshot;
  }

  /**
   * Advances a single active task on a BUSY worker by `stepSimMs`, preserving
   * exact single-task progress, stage, token, cost, and completion arithmetic.
   */
  private static stepActiveTask(
    snapshot: SimulationSnapshot,
    workerId: WorkerId,
    taskId: string,
    stepSimMs: number,
  ): SimulationSnapshot {
    const worker = snapshot.workers[workerId];
    if (!worker) return snapshot;

    const task = snapshot.tasks[taskId];
    if (!task) return snapshot;

    const nextElapsedMs = Math.min(task.totalDurationSimMs, task.elapsedSimMs + stepSimMs);
    const nextProgress = Number(
      ((nextElapsedMs / task.totalDurationSimMs) * 100).toFixed(2),
    );

    // Complete task if progress reaches 100%
    if (nextElapsedMs >= task.totalDurationSimMs || nextProgress >= 100) {
      return WorkerMockService.completeTask(snapshot, workerId, taskId);
    }

    // Compute deterministic stage status from nextProgress
    const previousStageStatus = task.status;
    const nextStageStatus = resolveTaskStageStatus(task, nextProgress);

    // Compute proportional simulated tokens and cost
    const nextSimTokens = Math.round((nextProgress / 100) * task.targetTokens);
    const tokenDelta = Math.max(0, nextSimTokens - task.simulatedTokens);
    const nextSimCost = Number(
      ((nextSimTokens / 1000) * task.costPerThousandTokensUsd).toFixed(6),
    );
    const costDelta = Math.max(0, nextSimCost - task.simulatedCostUsd);

    const stageUpdateOutcome = updateTaskExecutionStage(task, nextStageStatus, {
      simTimeMs: snapshot.simTimeMs,
      elapsedSimMs: nextElapsedMs,
      progress: nextProgress,
      simulatedTokens: nextSimTokens,
      simulatedCostUsd: nextSimCost,
    });
    if (!stageUpdateOutcome.ok) {
      return snapshot;
    }
    const updatedTask = stageUpdateOutcome.task;

    const primaryTaskId = worker.currentTaskId;
    const primaryStageStatus =
      primaryTaskId === taskId
        ? nextStageStatus
        : primaryTaskId
          ? snapshot.tasks[primaryTaskId]?.status ?? nextStageStatus
          : nextStageStatus;

    const updatedWorker: WorkerEntity = {
      ...worker,
      animationState: deriveAnimationForWorker('BUSY', primaryStageStatus),
      metrics: {
        ...worker.metrics,
        simulatedTokens: worker.metrics.simulatedTokens + tokenDelta,
        simulatedCostUsd: Number((worker.metrics.simulatedCostUsd + costDelta).toFixed(6)),
        lastActivitySimMs: snapshot.simTimeMs,
      },
    };

    let nextEvents = snapshot.events;
    if (nextStageStatus !== previousStageStatus) {
      const stageEvent = WorkerMockService.createEvent(snapshot, {
        workerId: worker.id,
        workerName: worker.name,
        department: worker.department,
        taskId: updatedTask.id,
        type: 'TASK_STAGE_CHANGED',
        message: `[SIMULATED] "${updatedTask.title}" transitioned ${previousStageStatus} → ${nextStageStatus} (${Math.round(nextProgress)}%)`,
        accentColor: worker.avatarConfig.accentColor,
      });
      nextEvents = WorkerMockService.appendEvent(snapshot, stageEvent);
    }

    return {
      ...snapshot,
      tasks: {
        ...snapshot.tasks,
        [updatedTask.id]: updatedTask,
      },
      workers: {
        ...snapshot.workers,
        [workerId]: updatedWorker,
      },
      events: nextEvents,
    };
  }

  /**
   * Pauses a single worker without affecting any other worker or the global simulation clock.
   * Preserves `statusBeforePause` and current task `elapsedSimMs` / `progress`.
   */
  static pauseWorker(snapshot: SimulationSnapshot, workerId: WorkerId): SimulationSnapshot {
    const normalizedSnapshot = normalizeSimulationSnapshot(snapshot);
    const worker = normalizedSnapshot.workers[workerId];
    if (!worker || worker.status === 'PAUSED') return normalizedSnapshot;

    const updatedWorker: WorkerEntity = {
      ...worker,
      statusBeforePause: worker.status,
      status: 'PAUSED',
      animationState: 'seated',
      metrics: {
        ...worker.metrics,
        lastActivitySimMs: normalizedSnapshot.simTimeMs,
      },
    };

    const event = WorkerMockService.createEvent(normalizedSnapshot, {
      workerId: worker.id,
      workerName: worker.name,
      department: worker.department,
      taskId: worker.currentTaskId,
      type: 'WORKER_PAUSED',
      message: `[SIMULATED] Worker paused (Task progress preserved)`,
      accentColor: worker.avatarConfig.accentColor,
    });

    return {
      ...normalizedSnapshot,
      workers: {
        ...normalizedSnapshot.workers,
        [workerId]: updatedWorker,
      },
      events: WorkerMockService.appendEvent(normalizedSnapshot, event),
    };
  }

  /**
   * Resumes a paused worker from their exact previous state and task progress.
   * Never restarts or resets `elapsedSimMs` or `progress`.
   * Immediately runs a global scheduler dispatch pass when `isGlobalPaused === false`.
   */
  static resumeWorkerWithDiagnostics(
    snapshot: SimulationSnapshot,
    workerId: WorkerId,
  ): WorkerResumeResult {
    const normalizedSnapshot = normalizeSimulationSnapshot(snapshot);
    const worker = normalizedSnapshot.workers[workerId];
    if (!worker || worker.status !== 'PAUSED') return { snapshot: normalizedSnapshot };

    const currentTask = worker.currentTaskId ? normalizedSnapshot.tasks[worker.currentTaskId] : null;
    const restoredStatus: WorkerStatus =
      worker.statusBeforePause && worker.statusBeforePause !== 'PAUSED'
        ? worker.statusBeforePause
        : currentTask
          ? 'BUSY'
          : 'IDLE';

    const updatedWorker: WorkerEntity = {
      ...worker,
      status: restoredStatus,
      statusBeforePause: null,
      animationState: deriveAnimationForWorker(restoredStatus, currentTask?.status ?? null),
      metrics: {
        ...worker.metrics,
        lastActivitySimMs: normalizedSnapshot.simTimeMs,
      },
    };

    const event = WorkerMockService.createEvent(normalizedSnapshot, {
      workerId: worker.id,
      workerName: worker.name,
      department: worker.department,
      taskId: worker.currentTaskId,
      type: 'WORKER_RESUMED',
      message: currentTask
        ? `[SIMULATED] Worker resumed "${currentTask.title}" at ${Math.round(currentTask.progress)}% (${currentTask.status})`
        : `[SIMULATED] Worker resumed (${restoredStatus})`,
      accentColor: worker.avatarConfig.accentColor,
    });

    let nextSnapshot: SimulationSnapshot = {
      ...normalizedSnapshot,
      workers: {
        ...normalizedSnapshot.workers,
        [workerId]: updatedWorker,
      },
      events: WorkerMockService.appendEvent(normalizedSnapshot, event),
    };

    if (
      restoredStatus === 'IDLE' &&
      !updatedWorker.currentTaskId &&
      updatedWorker.taskQueueIds.length > 0
    ) {
      nextSnapshot = WorkerMockService.promoteNextQueuedTask(nextSnapshot, workerId);
    }

    let dispatchResult: DispatchPassResult<SimulationSnapshot> | undefined;
    if (!nextSnapshot.isGlobalPaused) {
      dispatchResult = WorkerMockService.dispatchGlobalQueueWithResult(nextSnapshot);
      nextSnapshot = dispatchResult.snapshot;
    }

    return {
      snapshot: nextSnapshot,
      dispatchResult,
    };
  }

  static resumeWorker(snapshot: SimulationSnapshot, workerId: WorkerId): SimulationSnapshot {
    return this.resumeWorkerWithDiagnostics(snapshot, workerId).snapshot;
  }

  /**
   * Toggles global simulation pause.
   * - When `isGlobalPaused === true`, the entire simulation clock and all animations freeze.
   * - When `isGlobalPaused === false` (Global Resume), any worker that was individually
   *   `PAUSED` before Global Pause remains `PAUSED` (`worker.status` is untouched).
   */
  static setGlobalPaused(snapshot: SimulationSnapshot, isPaused: boolean): SimulationSnapshot {
    const normalizedSnapshot = normalizeSimulationSnapshot(snapshot);
    if (normalizedSnapshot.isGlobalPaused === isPaused) return normalizedSnapshot;

    if (isPaused) {
      clockAnchor.isRealtimeLoopActive = false;
    }

    const event = WorkerMockService.createEvent(normalizedSnapshot, {
      workerId: null,
      workerName: 'Simulation Clock',
      department: 'System Control',
      type: 'SIMULATION_CONTROL',
      message: isPaused
        ? '[SIMULATED] Global simulation clock PAUSED'
        : '[SIMULATED] Global simulation clock RESUMED',
      accentColor: '#06B6D4',
    });

    return {
      ...normalizedSnapshot,
      isGlobalPaused: isPaused,
      events: WorkerMockService.appendEvent(normalizedSnapshot, event),
    };
  }
}
