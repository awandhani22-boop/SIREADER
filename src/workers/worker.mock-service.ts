import {
  COST_PER_1K_TOKENS_SIMULATED,
  DEFAULT_STAGE_PIPELINES,
  WORKER_TASK_TEMPLATES,
} from './worker.registry';
import {
  mapCategoryToDefaultTaskType,
} from './worker.capabilities';
import {
  withTaskActivated,
  withTaskDeactivated,
} from './worker.concurrency';
import {
  createTaskEntity as buildValidatedTaskEntity,
} from '../tasks/task.factory';
import {
  activateQueuedTaskForExecution,
  transitionTaskStatus,
} from '../tasks/task.transitions';
import {
  ActivityEvent,
  ActivityEventType,
  AnimationClipKey,
  MockTaskTemplate,
  SimulationSnapshot,
  TaskCategory,
  TaskEntity,
  TaskErrorDetail,
  TaskPriority,
  TaskStatus,
  TaskType,
  WorkerEntity,
  WorkerId,
  WorkerStatus,
} from './worker.types';

/**
 * WorkerMockService (Phase 1.1 & Phase 2.1 + Audit Remediation — Local Simulation Only)
 * Responsible for domain operations on Workers and Tasks:
 * - Creating validated, deterministic TaskEntities with Phase 2.1 structured metadata
 * - Enforcing canonical Task State Machine transitions (`QUEUED -> ASSIGNED -> RUNNING`,
 *   `RUNNING -> COMPLETED`, `RUNNING -> FAILED`) via centralized transition helpers
 * - Managing per-worker FIFO task queues
 * - Updating SIMULATED token/cost counters and emitting structured ActivityEvents
 */

const MAX_EVENT_LOG_LENGTH = 80;

export interface AssignTaskInput {
  workerId: WorkerId;
  type?: TaskType;
  title?: string;
  description?: string;
  category?: TaskCategory;
  priority?: TaskPriority;
  durationSimMs?: number;
  targetTokens?: number;
  parentTaskId?: string | null;
  dependencyIds?: readonly string[];
  maxAttempts?: number;
}

export function deriveAnimationForWorker(
  workerStatus: WorkerStatus,
  taskStatus: TaskStatus | null,
): AnimationClipKey {
  if (workerStatus === 'WALKING') return 'walking';
  if (workerStatus === 'PAUSED') return 'seated';
  if (workerStatus === 'TASK_RECEIVED' || workerStatus === 'COMPLETED') return 'talking';
  if (workerStatus === 'BUSY') {
    if (taskStatus === 'ROUTING' || taskStatus === 'VALIDATING') {
      return 'talking';
    }
    return 'typing';
  }
  return 'seated';
}

export function resolveTaskStageStatus(task: TaskEntity, progressPercent: number): TaskStatus {
  if (progressPercent >= 100) {
    return 'COMPLETED';
  }
  for (const stage of task.stagePipeline) {
    if (progressPercent >= stage.startPercent && progressPercent < stage.endPercent) {
      return stage.status;
    }
  }
  const lastStage = task.stagePipeline[task.stagePipeline.length - 1];
  return lastStage ? lastStage.status : 'ANALYZING';
}

export class WorkerMockService {
  static createEvent(
    snapshot: SimulationSnapshot,
    params: {
      workerId: WorkerId | null;
      workerName: string;
      department: string;
      taskId?: string | null;
      type: ActivityEventType;
      message: string;
      accentColor: string;
    },
  ): ActivityEvent {
    let previousSeq = 0;
    const latestEvent = snapshot.events[0];
    if (latestEvent) {
      const lastUnderscoreIdx = latestEvent.id.lastIndexOf('_');
      if (lastUnderscoreIdx !== -1) {
        const parsed = Number.parseInt(
          latestEvent.id.slice(lastUnderscoreIdx + 1),
          10,
        );
        if (Number.isFinite(parsed) && parsed > 0) {
          previousSeq = parsed;
        }
      }
    }
    const eventIndex = Math.max(
      snapshot.tickCount + snapshot.events.length + 1,
      previousSeq + 1,
    );
    const normalizedSimTime = Number(snapshot.simTimeMs.toFixed(3));
    return {
      id: `evt_${normalizedSimTime}_${eventIndex}`,
      simTimestampMs: normalizedSimTime,
      workerId: params.workerId,
      workerName: params.workerName,
      department: params.department,
      taskId: params.taskId ?? null,
      type: params.type,
      message: params.message,
      accentColor: params.accentColor,
      isSimulated: true,
    };
  }

  static appendEvent(snapshot: SimulationSnapshot, event: ActivityEvent): ActivityEvent[] {
    return [event, ...snapshot.events].slice(0, MAX_EVENT_LOG_LENGTH);
  }

  static createTaskEntity(
    snapshot: SimulationSnapshot,
    input: AssignTaskInput,
    templateIndex = 0,
  ): TaskEntity {
    const templates: MockTaskTemplate[] = WORKER_TASK_TEMPLATES[input.workerId] ??
      WORKER_TASK_TEMPLATES.supervisor;
    const template = templates[templateIndex % templates.length];

    const category = input.category ?? template.category;
    const taskType = input.type ?? mapCategoryToDefaultTaskType(category);
    const stagePipeline = DEFAULT_STAGE_PIPELINES[category] ?? DEFAULT_STAGE_PIPELINES.REASONING;
    const costRate = COST_PER_1K_TOKENS_SIMULATED[input.workerId] ?? 0.002;
    const existingTaskIds = Object.keys(snapshot.tasks);
    const taskNumber = existingTaskIds.length + 101;
    const id = `tsk_${input.workerId}_${taskNumber}_${snapshot.simTimeMs}`;
    const title = input.title?.trim() ? input.title.trim() : template.title;
    const description = input.description?.trim()
      ? input.description.trim()
      : template.description;

    const created = buildValidatedTaskEntity({
      id,
      sequenceNumber: taskNumber,
      seed: snapshot.seed,
      simTimeMs: snapshot.simTimeMs,
      type: taskType,
      category,
      title,
      description,
      priority: input.priority ?? template.priority,
      status: 'QUEUED',
      assignedWorkerId: input.workerId,
      fallbackWorkerId: input.workerId,
      parentTaskId: input.parentTaskId ?? null,
      dependencyIds: input.dependencyIds ?? [],
      maxAttempts: input.maxAttempts ?? 3,
      totalDurationSimMs: input.durationSimMs ?? template.durationSimMs,
      targetTokens: input.targetTokens ?? template.targetTokens,
      existingTaskIds,
      input: {
        instruction: description,
        parameters: {
          workerId: input.workerId,
          category,
          templateIndex,
        },
        sourceChannel: 'simulation_baseline',
        contextTags: [category.toLowerCase(), taskType.toLowerCase()],
      },
    });

    return {
      ...created,
      stagePipeline: stagePipeline.map((s) => ({ ...s })),
      costPerThousandTokensUsd: costRate,
    };
  }

  /**
   * Assigns a task to a worker.
   * - Creates the task in `QUEUED` status.
   * - If the worker is IDLE (and has no active task), activates the task through the
   *   canonical state machine (`QUEUED -> ASSIGNED -> RUNNING` via initial execution stage)
   *   and transitions the worker `IDLE -> TASK_RECEIVED`.
   * - If the worker is BUSY, WALKING, TASK_RECEIVED, COMPLETED, or PAUSED,
   *   places the task into the worker's `taskQueueIds` with status `QUEUED`.
   */
  static assignTask(
    snapshot: SimulationSnapshot,
    input: AssignTaskInput,
    templateIndex = 0,
  ): SimulationSnapshot {
    const worker = snapshot.workers[input.workerId];
    if (!worker) return snapshot;

    const newTask = this.createTaskEntity(snapshot, input, templateIndex);
    const updatedTasks: Record<string, TaskEntity> = {
      ...snapshot.tasks,
      [newTask.id]: newTask,
    };

    const canStartImmediately =
      (worker.status === 'IDLE' || worker.status === 'WAITING') && !worker.currentTaskId;

    let updatedWorker: WorkerEntity;
    let event: ActivityEvent;

    if (canStartImmediately) {
      const initialStageStatus = resolveTaskStageStatus(newTask, 0);
      const activation = activateQueuedTaskForExecution(
        newTask,
        initialStageStatus,
        {
          simTimeMs: snapshot.simTimeMs,
          assignedWorkerId: worker.id,
        },
      );
      if (!activation.ok) {
        return snapshot;
      }

      const startedTask = activation.runningTask;
      updatedTasks[newTask.id] = startedTask;

      const workerWithActivatedTask = withTaskActivated(worker, startedTask.id);
      updatedWorker = {
        ...workerWithActivatedTask,
        status: 'TASK_RECEIVED',
        transitionSimMs: 0,
        animationState: deriveAnimationForWorker('TASK_RECEIVED', startedTask.status),
        metrics: {
          ...worker.metrics,
          lastActivitySimMs: snapshot.simTimeMs,
        },
      };

      event = this.createEvent({ ...snapshot, tasks: updatedTasks }, {
        workerId: worker.id,
        workerName: worker.name,
        department: worker.department,
        taskId: startedTask.id,
        type: 'TASK_STARTED',
        message: `[SIMULATED] Received "${startedTask.title}" (${startedTask.status})`,
        accentColor: worker.avatarConfig.accentColor,
      });
    } else {
      updatedWorker = {
        ...worker,
        taskQueueIds: [...worker.taskQueueIds, newTask.id],
      };

      event = this.createEvent({ ...snapshot, tasks: updatedTasks }, {
        workerId: worker.id,
        workerName: worker.name,
        department: worker.department,
        taskId: newTask.id,
        type: 'TASK_QUEUED',
        message: `[SIMULATED] Queued "${newTask.title}" (Queue position #${updatedWorker.taskQueueIds.length})`,
        accentColor: worker.avatarConfig.accentColor,
      });
    }

    return {
      ...snapshot,
      tasks: updatedTasks,
      workers: {
        ...snapshot.workers,
        [worker.id]: updatedWorker,
      },
      events: this.appendEvent(snapshot, event),
    };
  }

  /**
   * Promotes the next queued task for a worker if they have no active task.
   * Transitions the queued task through `QUEUED -> ASSIGNED -> RUNNING` (initial stage)
   * while preserving `createdAt` and `queuedAt`.
   */
  static promoteNextQueuedTask(
    snapshot: SimulationSnapshot,
    workerId: WorkerId,
  ): SimulationSnapshot {
    const worker = snapshot.workers[workerId];
    if (!worker || worker.currentTaskId || worker.taskQueueIds.length === 0) {
      return snapshot;
    }

    const [nextTaskId, ...remainingQueue] = worker.taskQueueIds;
    const nextTask = snapshot.tasks[nextTaskId];
    if (!nextTask) {
      return {
        ...snapshot,
        workers: {
          ...snapshot.workers,
          [workerId]: {
            ...worker,
            taskQueueIds: remainingQueue,
          },
        },
      };
    }

    const initialStageStatus = resolveTaskStageStatus(nextTask, 0);
    const activation = activateQueuedTaskForExecution(
      nextTask,
      initialStageStatus,
      {
        simTimeMs: snapshot.simTimeMs,
        assignedWorkerId: worker.id,
      },
    );
    if (!activation.ok) {
      return snapshot;
    }

    const activatedTask = activation.runningTask;
    const workerWithActivatedTask = withTaskActivated(worker, activatedTask.id);

    const updatedWorker: WorkerEntity = {
      ...workerWithActivatedTask,
      status: 'TASK_RECEIVED',
      transitionSimMs: 0,
      taskQueueIds: remainingQueue,
      animationState: deriveAnimationForWorker('TASK_RECEIVED', activatedTask.status),
      metrics: {
        ...worker.metrics,
        lastActivitySimMs: snapshot.simTimeMs,
      },
    };

    const event = this.createEvent(snapshot, {
      workerId: worker.id,
      workerName: worker.name,
      department: worker.department,
      taskId: activatedTask.id,
      type: 'TASK_STARTED',
      message: `[SIMULATED] Started queued task "${activatedTask.title}" (${activatedTask.status})`,
      accentColor: worker.avatarConfig.accentColor,
    });

    return {
      ...snapshot,
      tasks: {
        ...snapshot.tasks,
        [activatedTask.id]: activatedTask,
      },
      workers: {
        ...snapshot.workers,
        [workerId]: updatedWorker,
      },
      events: this.appendEvent(snapshot, event),
    };
  }

  /**
   * Marks the current active task of a worker as COMPLETED via the canonical
   * `transitionTaskStatus(task, 'COMPLETED', ...)` state machine helper and updates
   * simulated metrics.
   */
  static completeCurrentTask(
    snapshot: SimulationSnapshot,
    workerId: WorkerId,
  ): SimulationSnapshot {
    const worker = snapshot.workers[workerId];
    if (!worker || !worker.currentTaskId) return snapshot;

    const currentTask = snapshot.tasks[worker.currentTaskId];
    if (!currentTask) return snapshot;

    const finalTokens = currentTask.targetTokens;
    const finalCost = Number(
      ((finalTokens / 1000) * currentTask.costPerThousandTokensUsd).toFixed(6),
    );

    const tokenDelta = Math.max(0, finalTokens - currentTask.simulatedTokens);
    const costDelta = Math.max(0, finalCost - currentTask.simulatedCostUsd);

    const transitionOutcome = transitionTaskStatus(currentTask, 'COMPLETED', {
      simTimeMs: snapshot.simTimeMs,
      assignedWorkerId: worker.id,
      progress: 100,
      elapsedSimMs: currentTask.totalDurationSimMs,
      simulatedTokens: finalTokens,
      simulatedCostUsd: finalCost,
      result: {
        summary: `[SIMULATED] Completed "${currentTask.title}" by ${worker.name}`,
        outputData: {
          simulatedTokens: finalTokens,
          simulatedCostUsd: finalCost,
          completedAtSimMs: snapshot.simTimeMs,
        },
        artifacts: [`artifact_${currentTask.id}`],
        confidenceScore: 0.98,
        isSimulated: true,
      },
    });

    if (!transitionOutcome.ok) {
      return snapshot;
    }

    const completedTask = transitionOutcome.task;
    const workerWithDeactivatedTask = withTaskDeactivated(worker, completedTask.id);

    const updatedWorker: WorkerEntity = {
      ...workerWithDeactivatedTask,
      status: 'COMPLETED',
      transitionSimMs: 0,
      completedTaskIds: [completedTask.id, ...worker.completedTaskIds].slice(0, 25),
      animationState: deriveAnimationForWorker('COMPLETED', 'COMPLETED'),
      metrics: {
        ...worker.metrics,
        simulatedTokens: worker.metrics.simulatedTokens + tokenDelta,
        simulatedCostUsd: Number((worker.metrics.simulatedCostUsd + costDelta).toFixed(6)),
        completedTasksCount: worker.metrics.completedTasksCount + 1,
        lastActivitySimMs: snapshot.simTimeMs,
      },
    };

    const event = this.createEvent(snapshot, {
      workerId: worker.id,
      workerName: worker.name,
      department: worker.department,
      taskId: completedTask.id,
      type: 'TASK_COMPLETED',
      message: `[SIMULATED] Completed "${completedTask.title}" (+${finalTokens} sim tokens)`,
      accentColor: worker.avatarConfig.accentColor,
    });

    return {
      ...snapshot,
      tasks: {
        ...snapshot.tasks,
        [completedTask.id]: completedTask,
      },
      workers: {
        ...snapshot.workers,
        [workerId]: updatedWorker,
      },
      events: this.appendEvent(snapshot, event),
    };
  }

  /**
   * Marks the current active task of a worker as FAILED via the canonical
   * `transitionTaskStatus(task, 'FAILED', ...)` state machine helper and updates
   * simulated error metrics.
   */
  static failCurrentTask(
    snapshot: SimulationSnapshot,
    workerId: WorkerId,
    errorOverride?: Partial<TaskErrorDetail>,
  ): SimulationSnapshot {
    const worker = snapshot.workers[workerId];
    if (!worker || !worker.currentTaskId) return snapshot;

    const currentTask = snapshot.tasks[worker.currentTaskId];
    if (!currentTask) return snapshot;

    const transitionOutcome = transitionTaskStatus(currentTask, 'FAILED', {
      simTimeMs: snapshot.simTimeMs,
      assignedWorkerId: worker.id,
      error: {
        code: errorOverride?.code ?? 'EXECUTION_FAILURE_SIMULATED',
        message:
          errorOverride?.message ??
          `[SIMULATED] Task "${currentTask.title}" encountered a simulated execution failure.`,
        occurredAtSimMs: snapshot.simTimeMs,
        attemptNumber: Math.max(1, currentTask.attemptCount),
        recoverable:
          errorOverride?.recoverable ??
          currentTask.attemptCount < currentTask.maxAttempts,
      },
    });

    if (!transitionOutcome.ok) {
      return snapshot;
    }

    const failedTask = transitionOutcome.task;
    const workerWithDeactivatedTask = withTaskDeactivated(worker, failedTask.id);

    const updatedWorker: WorkerEntity = {
      ...workerWithDeactivatedTask,
      status: 'IDLE',
      transitionSimMs: 0,
      animationState: deriveAnimationForWorker('IDLE', null),
      metrics: {
        ...worker.metrics,
        errorCount: worker.metrics.errorCount + 1,
        lastActivitySimMs: snapshot.simTimeMs,
      },
    };

    const event = this.createEvent(snapshot, {
      workerId: worker.id,
      workerName: worker.name,
      department: worker.department,
      taskId: failedTask.id,
      type: 'TASK_STAGE_CHANGED',
      message: `[SIMULATED] Failed "${failedTask.title}" (${failedTask.error?.code ?? 'ERROR'})`,
      accentColor: '#EF4444',
    });

    return {
      ...snapshot,
      tasks: {
        ...snapshot.tasks,
        [failedTask.id]: failedTask,
      },
      workers: {
        ...snapshot.workers,
        [workerId]: updatedWorker,
      },
      events: this.appendEvent(snapshot, event),
    };
  }
}
