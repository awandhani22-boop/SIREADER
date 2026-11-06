import {
  createInitialWorkersRegistry,
  INITIAL_WORKER_ORDER,
  WORKER_TASK_TEMPLATES,
} from './worker.registry';
import {
  deriveAnimationForWorker,
  resolveTaskStageStatus,
  WorkerMockService,
} from './worker.mock-service';
import {
  SimulationSnapshot,
  TaskEntity,
  WorkerEntity,
  WorkerId,
  WorkerStatus,
} from './worker.types';

/**
 * SimulationEngine (Phase 1.1 — Deterministic Local Simulation Clock)
 *
 * Enforces the critical architectural invariants:
 * 1. Frame-rate independence: Uses its own simulation clock step (`MAX_DELTA_CLAMP_MS = 1000`).
 * 2. Explicit Pause semantics:
 *    - Global Pause (`isGlobalPaused`): freezes the entire simulation clock and all workers.
 *    - Worker Pause (`worker.status === 'PAUSED'`): freezes ONLY that worker's
 *      current task progress while all other workers continue normally.
 *    - Global Resume (`setGlobalPaused(false)`): never resumes a worker that was
 *      individually paused before Global Pause.
 *    - Worker Resume: restores `statusBeforePause` and continues the active task
 *      from its exact `elapsedSimMs` and `progress` without resetting.
 * 3. Deterministic Reset (`resetToBaseline`):
 *    - Restores a clean, zero-task, zero-clock deterministic baseline (`simTimeMs = 0`,
 *      `tickCount = 0`, `prngState = seed`, `tasks = {}`, `events = []`, all workers `IDLE`
 *      with empty queues and zeroed `SIMULATED` metrics) whether called while running,
 *      while globally paused, with active tasks, or with queued tasks.
 */

export const DEFAULT_SIMULATION_SEED = 20261106;
export const FIXED_TICK_SIM_MS = 500;
export const MAX_DELTA_CLAMP_MS = 1000;

const TASK_RECEIVED_DURATION_MS = 1000;
const WALKING_DURATION_MS = 1500;
const COMPLETED_CELEBRATION_DURATION_MS = 1000;

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

export class SimulationEngine {
  /**
   * Creates a clean, zero-task deterministic baseline snapshot (`t = 0`).
   * Used by `resetToBaseline` so Reset clears all active/queued tasks, activity events,
   * worker states, and restores the exact seeded PRNG state.
   */
  static createBaselineSnapshot(seed: number = DEFAULT_SIMULATION_SEED): SimulationSnapshot {
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
    };
  }

  /**
   * Restores the simulation to the clean deterministic baseline (`t = 0`),
   * clearing all active and queued tasks, resetting worker states and metrics,
   * and restoring `prngState = seed`.
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

    return snapshot;
  }

  /**
   * Advances the simulation from an external timer delta while clamping the maximum
   * elapsed time (`MAX_DELTA_CLAMP_MS`) before applying `simSpeedMultiplier`, so
   * `1x`, `2x`, and `4x` speeds advance simulation time consistently in fixed steps
   * without skipping task stages.
   */
  static advanceByWallClockDelta(
    snapshot: SimulationSnapshot,
    rawElapsedMs: number,
  ): SimulationSnapshot {
    if (snapshot.isGlobalPaused || rawElapsedMs <= 0) {
      return snapshot;
    }

    // Clamp wall-clock delta to MAX_DELTA_CLAMP_MS before applying speed multiplier
    const clampedBaseMs = Math.max(0, Math.min(rawElapsedMs, MAX_DELTA_CLAMP_MS));
    const totalSimMsToAdvance = clampedBaseMs * snapshot.simSpeedMultiplier;

    let current = snapshot;
    let remainingMs = totalSimMsToAdvance;

    while (remainingMs >= FIXED_TICK_SIM_MS) {
      current = this.stepSimulationTick(current, FIXED_TICK_SIM_MS);
      remainingMs -= FIXED_TICK_SIM_MS;
    }

    if (remainingMs > 0) {
      current = this.stepSimulationTick(current, remainingMs);
    }

    return current;
  }

  /**
   * Advances the simulation by a single deterministic step (`stepSimMs`).
   * Does not depend on `Date.now()` or `requestAnimationFrame`.
   */
  static stepSimulationTick(
    snapshot: SimulationSnapshot,
    stepSimMs: number = FIXED_TICK_SIM_MS,
  ): SimulationSnapshot {
    if (snapshot.isGlobalPaused || stepSimMs <= 0) {
      return snapshot;
    }

    // Bound any single step so stage transitions are never skipped
    const boundedStepMs = Math.min(stepSimMs, MAX_DELTA_CLAMP_MS);
    let nextSnapshot: SimulationSnapshot = {
      ...snapshot,
      simTimeMs: snapshot.simTimeMs + boundedStepMs,
      tickCount: snapshot.tickCount + 1,
      workers: { ...snapshot.workers },
      tasks: { ...snapshot.tasks },
    };

    for (const workerId of nextSnapshot.workerOrder) {
      nextSnapshot = this.stepSingleWorker(nextSnapshot, workerId, boundedStepMs);
    }

    // Deterministic auto-dispatch: every 12 ticks, if an active simulation worker is IDLE
    // with an empty queue, use seeded PRNG to optionally dispatch a realistic office task
    if (nextSnapshot.tickCount % 12 === 0) {
      const prng1 = nextSeededRandom(nextSnapshot.prngState);
      nextSnapshot.prngState = prng1.nextState;

      const idleWorkers = nextSnapshot.workerOrder.filter((id) => {
        const w = nextSnapshot.workers[id];
        return w && w.status === 'IDLE' && !w.currentTaskId && w.taskQueueIds.length === 0;
      });

      if (idleWorkers.length > 0 && prng1.value < 0.75) {
        const prng2 = nextSeededRandom(nextSnapshot.prngState);
        nextSnapshot.prngState = prng2.nextState;
        const chosenIndex = Math.floor(prng2.value * idleWorkers.length);
        const targetWorkerId = idleWorkers[chosenIndex];
        const templates = WORKER_TASK_TEMPLATES[targetWorkerId] ?? WORKER_TASK_TEMPLATES.supervisor;
        const templateIdx = nextSnapshot.tickCount % templates.length;

        nextSnapshot = WorkerMockService.assignTask(
          nextSnapshot,
          { workerId: targetWorkerId },
          templateIdx,
        );
      }
    }

    return nextSnapshot;
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

    // 3. Active Execution: BUSY -> progresses currentTask deterministically
    if (worker.status === 'BUSY') {
      if (!worker.currentTaskId) {
        const idleWorker: WorkerEntity = {
          ...worker,
          status: 'IDLE',
          animationState: 'seated',
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

      const task = snapshot.tasks[worker.currentTaskId];
      if (!task) return snapshot;

      const nextElapsedMs = Math.min(task.totalDurationSimMs, task.elapsedSimMs + stepSimMs);
      const nextProgress = Number(
        ((nextElapsedMs / task.totalDurationSimMs) * 100).toFixed(2),
      );

      // Complete task if progress reaches 100%
      if (nextElapsedMs >= task.totalDurationSimMs || nextProgress >= 100) {
        return WorkerMockService.completeCurrentTask(snapshot, workerId);
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

      const updatedTask: TaskEntity = {
        ...task,
        elapsedSimMs: nextElapsedMs,
        progress: nextProgress,
        status: nextStageStatus,
        simulatedTokens: nextSimTokens,
        simulatedCostUsd: nextSimCost,
      };

      const updatedWorker: WorkerEntity = {
        ...worker,
        animationState: deriveAnimationForWorker('BUSY', nextStageStatus),
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
   * Pauses a single worker without affecting any other worker or the global simulation clock.
   * Preserves `statusBeforePause` and current task `elapsedSimMs` / `progress`.
   */
  static pauseWorker(snapshot: SimulationSnapshot, workerId: WorkerId): SimulationSnapshot {
    const worker = snapshot.workers[workerId];
    if (!worker || worker.status === 'PAUSED') return snapshot;

    const updatedWorker: WorkerEntity = {
      ...worker,
      statusBeforePause: worker.status,
      status: 'PAUSED',
      animationState: 'seated',
      metrics: {
        ...worker.metrics,
        lastActivitySimMs: snapshot.simTimeMs,
      },
    };

    const event = WorkerMockService.createEvent(snapshot, {
      workerId: worker.id,
      workerName: worker.name,
      department: worker.department,
      taskId: worker.currentTaskId,
      type: 'WORKER_PAUSED',
      message: `[SIMULATED] Worker paused (Task progress preserved)`,
      accentColor: worker.avatarConfig.accentColor,
    });

    return {
      ...snapshot,
      workers: {
        ...snapshot.workers,
        [workerId]: updatedWorker,
      },
      events: WorkerMockService.appendEvent(snapshot, event),
    };
  }

  /**
   * Resumes a paused worker from their exact previous state and task progress.
   * Never restarts or resets `elapsedSimMs` or `progress`.
   */
  static resumeWorker(snapshot: SimulationSnapshot, workerId: WorkerId): SimulationSnapshot {
    const worker = snapshot.workers[workerId];
    if (!worker || worker.status !== 'PAUSED') return snapshot;

    const currentTask = worker.currentTaskId ? snapshot.tasks[worker.currentTaskId] : null;
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
        lastActivitySimMs: snapshot.simTimeMs,
      },
    };

    const event = WorkerMockService.createEvent(snapshot, {
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

    const resumedSnapshot: SimulationSnapshot = {
      ...snapshot,
      workers: {
        ...snapshot.workers,
        [workerId]: updatedWorker,
      },
      events: WorkerMockService.appendEvent(snapshot, event),
    };

    if (restoredStatus === 'IDLE' && !updatedWorker.currentTaskId && updatedWorker.taskQueueIds.length > 0) {
      return WorkerMockService.promoteNextQueuedTask(resumedSnapshot, workerId);
    }

    return resumedSnapshot;
  }

  /**
   * Toggles global simulation pause.
   * - When `isGlobalPaused === true`, the entire simulation clock and all animations freeze.
   * - When `isGlobalPaused === false` (Global Resume), any worker that was individually
   *   `PAUSED` before Global Pause remains `PAUSED` (`worker.status` is untouched).
   */
  static setGlobalPaused(snapshot: SimulationSnapshot, isPaused: boolean): SimulationSnapshot {
    if (snapshot.isGlobalPaused === isPaused) return snapshot;

    const event = WorkerMockService.createEvent(snapshot, {
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
      ...snapshot,
      isGlobalPaused: isPaused,
      events: WorkerMockService.appendEvent(snapshot, event),
    };
  }
}
