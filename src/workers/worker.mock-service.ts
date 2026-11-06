import {
  COST_PER_1K_TOKENS_SIMULATED,
  DEFAULT_STAGE_PIPELINES,
  WORKER_TASK_TEMPLATES,
} from './worker.registry';
import {
  mapCategoryToDefaultTaskType,
} from './worker.capabilities';
import {
  createTaskEntity as buildValidatedTaskEntity,
} from '../tasks/task.factory';
import {
  toTaskLifecycleStatus,
} from '../tasks/task.transitions';
import {
  ActivityEvent,
  ActivityEventType,
  AnimationClipKey,
  MockTaskTemplate,
  SimulationSnapshot,
  TaskCategory,
  TaskEntity,
  TaskPriority,
  TaskStatus,
  TaskType,
  WorkerEntity,
  WorkerId,
  WorkerStatus,
} from './worker.types';

/**
 * WorkerMockService (Phase 1.1 & Phase 2.1 — Local Simulation Only)
 * Responsible for domain operations on Workers and Tasks:
 * - Creating validated, deterministic TaskEntities with Phase 2.1 structured metadata
 * - Assigning tasks and managing per-worker task queues
 * - Promoting queued tasks when a worker becomes available
 * - Completing simulated tasks and updating SIMULATED token/cost counters
 * - Emitting structured ActivityEvents
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
    const eventIndex = snapshot.tickCount + snapshot.events.length + 1;
    return {
      id: `evt_${snapshot.simTimeMs}_${eventIndex}`,
      simTimestampMs: snapshot.simTimeMs,
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
    const taskNumber = Object.keys(snapshot.tasks).length + 101;
    const id = `tsk_${input.workerId}_${taskNumber}_${snapshot.simTimeMs}`;
    const title = input.title?.trim() ? input.title.trim() : template.title;
    const description = input.description?.trim()
      ? input.description.trim()
      : template.description;

    const created = buildValidatedTaskEntity({
      id,
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
   * - If the worker is IDLE (and has no active task), promotes the task immediately
   *   and transitions the worker IDLE -> TASK_RECEIVED.
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
      const startedTask: TaskEntity = {
        ...newTask,
        status: initialStageStatus,
        lifecycleStatus: toTaskLifecycleStatus(initialStageStatus),
        attemptCount: Math.min(newTask.maxAttempts, newTask.attemptCount + 1),
        startedAt: snapshot.simTimeMs,
        updatedAt: snapshot.simTimeMs,
        startedAtSimMs: snapshot.simTimeMs,
      };
      updatedTasks[newTask.id] = startedTask;

      updatedWorker = {
        ...worker,
        status: 'TASK_RECEIVED',
        transitionSimMs: 0,
        currentTaskId: startedTask.id,
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
    const activatedTask: TaskEntity = {
      ...nextTask,
      status: initialStageStatus,
      lifecycleStatus: toTaskLifecycleStatus(initialStageStatus),
      attemptCount: Math.min(nextTask.maxAttempts, nextTask.attemptCount + 1),
      startedAt: snapshot.simTimeMs,
      updatedAt: snapshot.simTimeMs,
      startedAtSimMs: snapshot.simTimeMs,
    };

    const updatedWorker: WorkerEntity = {
      ...worker,
      status: 'TASK_RECEIVED',
      transitionSimMs: 0,
      currentTaskId: activatedTask.id,
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
   * Marks the current active task of a worker as COMPLETED and updates
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

    const completedTask: TaskEntity = {
      ...currentTask,
      status: 'COMPLETED',
      lifecycleStatus: 'COMPLETED',
      progress: 100,
      elapsedSimMs: currentTask.totalDurationSimMs,
      simulatedTokens: finalTokens,
      simulatedCostUsd: finalCost,
      completedAt: snapshot.simTimeMs,
      updatedAt: snapshot.simTimeMs,
      completedAtSimMs: snapshot.simTimeMs,
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
    };

    const updatedWorker: WorkerEntity = {
      ...worker,
      status: 'COMPLETED',
      transitionSimMs: 0,
      currentTaskId: null,
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
}
