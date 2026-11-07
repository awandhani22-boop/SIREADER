import {
  COST_PER_1K_TOKENS_SIMULATED,
  DEFAULT_STAGE_PIPELINES,
  INITIAL_WORKER_ORDER,
  WORKER_TASK_TEMPLATES,
} from './worker.registry';
import {
  mapCategoryToDefaultTaskType,
  mapTaskTypeToCategory,
} from './worker.capabilities';
import {
  getActiveTaskIds,
  withTaskActivated,
  withTaskDeactivated,
} from './worker.concurrency';
import {
  dispatchPass,
  enqueueTask,
  type DispatchPassOptions,
} from '../scheduler/task.dispatcher';
import type { DispatchPassResult } from '../scheduler/scheduler.types';
import {
  createTaskEntity as buildValidatedTaskEntity,
  createTaskEntitySafe,
  generateDeterministicTaskId,
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
  TaskInputPayload,
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
 * - Managing per-worker FIFO task queues and Phase 2.2 global task enqueue/dispatch wrappers
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

export interface GlobalTaskInput {
  id?: string;
  sequenceNumber?: number;
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
  sourceChannel?: TaskInputPayload['sourceChannel'];
  parameters?: TaskInputPayload['parameters'];
  contextTags?: readonly string[];
}

const POOL_FALLBACK_TEMPLATES: readonly MockTaskTemplate[] = Object.freeze(
  INITIAL_WORKER_ORDER.flatMap(
    (workerId) => WORKER_TASK_TEMPLATES[workerId] ?? [],
  ),
);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTaskEntityCandidate(
  value: GlobalTaskInput | TaskEntity,
): value is TaskEntity {
  return (
    isPlainObject(value) &&
    'lifecycleStatus' in value &&
    'assignedWorkerId' in value &&
    'stagePipeline' in value &&
    'createdAt' in value
  );
}

function isTaskIdUsedInSnapshot(
  snapshot: SimulationSnapshot,
  candidateId: string,
): boolean {
  if (Object.prototype.hasOwnProperty.call(snapshot.tasks, candidateId)) {
    return true;
  }
  for (const key of Object.keys(snapshot.tasks)) {
    const existing = snapshot.tasks[key];
    if (isPlainObject(existing) && existing.id === candidateId) {
      return true;
    }
  }
  if (Array.isArray(snapshot.scheduler?.entries)) {
    for (const entry of snapshot.scheduler.entries) {
      if (isPlainObject(entry) && entry.taskId === candidateId) {
        return true;
      }
    }
  }
  if (isPlainObject(snapshot.workers)) {
    for (const workerKey of Object.keys(snapshot.workers)) {
      const worker = snapshot.workers[workerKey];
      if (!isPlainObject(worker)) {
        continue;
      }
      const typedWorker = worker as unknown as WorkerEntity;
      if (getActiveTaskIds(typedWorker).includes(candidateId)) {
        return true;
      }
      if (
        Array.isArray(typedWorker.taskQueueIds) &&
        typedWorker.taskQueueIds.includes(candidateId)
      ) {
        return true;
      }
      if (
        Array.isArray(typedWorker.completedTaskIds) &&
        typedWorker.completedTaskIds.includes(candidateId)
      ) {
        return true;
      }
    }
  }
  return false;
}

function resolveGlobalPoolTaskIdentity(
  snapshot: SimulationSnapshot,
  input: GlobalTaskInput,
): { readonly id: string; readonly sequenceNumber: number } {
  const existingTaskCount = Object.keys(snapshot.tasks).length;
  if (input.id !== undefined) {
    return {
      id: input.id,
      sequenceNumber: input.sequenceNumber ?? existingTaskCount + 101,
    };
  }
  if (input.sequenceNumber !== undefined) {
    return {
      id: generateDeterministicTaskId({
        seed: snapshot.seed,
        sequenceNumber: input.sequenceNumber,
        simTimeMs: snapshot.simTimeMs,
        workerPrefix: 'pool',
      }),
      sequenceNumber: input.sequenceNumber,
    };
  }

  let sequenceNumber = existingTaskCount + 101;
  let id = generateDeterministicTaskId({
    seed: snapshot.seed,
    sequenceNumber,
    simTimeMs: snapshot.simTimeMs,
    workerPrefix: 'pool',
  });
  while (isTaskIdUsedInSnapshot(snapshot, id)) {
    sequenceNumber += 1;
    id = generateDeterministicTaskId({
      seed: snapshot.seed,
      sequenceNumber,
      simTimeMs: snapshot.simTimeMs,
      workerPrefix: 'pool',
    });
  }
  return { id, sequenceNumber };
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
   * Creates a validated unassigned global `TaskEntity` (`assignedWorkerId: null`,
   * `status: 'QUEUED'`) using the deterministic ID format `tsk_pool_<seq>_<simTimeMs>`.
   */
  static createGlobalTaskEntity(
    snapshot: SimulationSnapshot,
    input: GlobalTaskInput = {},
    templateIndex = 0,
  ): TaskEntity {
    const templateCount = POOL_FALLBACK_TEMPLATES.length;
    const normalizedIdx =
      Number.isFinite(templateIndex) && templateCount > 0
        ? ((Math.trunc(templateIndex) % templateCount) + templateCount) %
          templateCount
        : 0;
    const template =
      POOL_FALLBACK_TEMPLATES[normalizedIdx] ??
      WORKER_TASK_TEMPLATES.supervisor[0];

    const category: TaskCategory =
      input.category ??
      (input.type !== undefined
        ? mapTaskTypeToCategory(input.type)
        : template.category);
    const taskType: TaskType =
      input.type ?? mapCategoryToDefaultTaskType(category);
    const stagePipeline =
      DEFAULT_STAGE_PIPELINES[category] ?? DEFAULT_STAGE_PIPELINES.REASONING;
    const costRate = COST_PER_1K_TOKENS_SIMULATED.supervisor ?? 0.002;
    const existingTaskIds = Object.keys(snapshot.tasks);
    const { id, sequenceNumber } = resolveGlobalPoolTaskIdentity(
      snapshot,
      input,
    );
    const title = input.title?.trim() ? input.title.trim() : template.title;
    const description = input.description?.trim()
      ? input.description.trim()
      : template.description;

    const created = buildValidatedTaskEntity({
      id,
      sequenceNumber,
      seed: snapshot.seed,
      simTimeMs: snapshot.simTimeMs,
      type: taskType,
      category,
      title,
      description,
      priority: input.priority ?? template.priority,
      status: 'QUEUED',
      assignedWorkerId: null,
      fallbackWorkerId: 'supervisor',
      parentTaskId: input.parentTaskId ?? null,
      dependencyIds: input.dependencyIds ?? [],
      maxAttempts: input.maxAttempts ?? 3,
      totalDurationSimMs: input.durationSimMs ?? template.durationSimMs,
      targetTokens: input.targetTokens ?? template.targetTokens,
      existingTaskIds,
      input: {
        instruction: description,
        parameters: input.parameters
          ? { ...input.parameters }
          : {
              category,
              templateIndex: normalizedIdx,
            },
        sourceChannel: input.sourceChannel ?? 'manual_ui',
        contextTags: input.contextTags
          ? [...input.contextTags]
          : [category.toLowerCase(), taskType.toLowerCase()],
      },
    });

    return {
      ...created,
      stagePipeline: stagePipeline.map((s) => ({ ...s })),
      costPerThousandTokensUsd: costRate,
    };
  }

  /**
   * Creates (or accepts) a global `QUEUED` task with `assignedWorkerId: null` and
   * enqueues it into `snapshot.scheduler` via `enqueueTask()`.
   * - Appends exactly one `TASK_QUEUED` event when `enqueueTask()` succeeds.
   * - Returns the exact original `snapshot` reference with zero events when enqueue fails.
   * - Allows valid tasks whose `TaskType` currently has no capable worker so
   *   `dispatchPass()` can classify `NO_CAPABLE_WORKER`.
   */
  static enqueueGlobalTask(
    snapshot: SimulationSnapshot,
    taskOrInput: GlobalTaskInput | TaskEntity = {},
    templateIndex = 0,
  ): SimulationSnapshot {
    if (
      !isPlainObject(snapshot) ||
      typeof snapshot.simTimeMs !== 'number' ||
      !Number.isFinite(snapshot.simTimeMs) ||
      snapshot.simTimeMs < 0 ||
      !isPlainObject(snapshot.tasks) ||
      typeof taskOrInput !== 'object' || taskOrInput === null || Array.isArray(taskOrInput)
    ) {
      return snapshot;
    }

    let candidateTask: TaskEntity;
    if (isTaskEntityCandidate(taskOrInput)) {
      candidateTask = taskOrInput;
    } else {
      if (
        taskOrInput.sequenceNumber !== undefined &&
        (typeof taskOrInput.sequenceNumber !== 'number' ||
          !Number.isInteger(taskOrInput.sequenceNumber) ||
          taskOrInput.sequenceNumber <= 0)
      ) {
        return snapshot;
      }

      if (
        taskOrInput.durationSimMs !== undefined &&
        (typeof taskOrInput.durationSimMs !== 'number' ||
          !Number.isFinite(taskOrInput.durationSimMs) ||
          taskOrInput.durationSimMs <= 0)
      ) {
        return snapshot;
      }

      if (
        taskOrInput.targetTokens !== undefined &&
        (typeof taskOrInput.targetTokens !== 'number' ||
          !Number.isFinite(taskOrInput.targetTokens) ||
          taskOrInput.targetTokens < 0)
      ) {
        return snapshot;
      }

      const templateCount = POOL_FALLBACK_TEMPLATES.length;
      const normalizedIdx =
        Number.isFinite(templateIndex) && templateCount > 0
          ? ((Math.trunc(templateIndex) % templateCount) + templateCount) %
            templateCount
          : 0;
      const template =
        POOL_FALLBACK_TEMPLATES[normalizedIdx] ??
        WORKER_TASK_TEMPLATES.supervisor[0];

      const category: TaskCategory =
        taskOrInput.category ??
        (taskOrInput.type !== undefined
          ? mapTaskTypeToCategory(taskOrInput.type)
          : template.category);
      const taskType: TaskType =
        taskOrInput.type ?? mapCategoryToDefaultTaskType(category);
      const stagePipeline =
        DEFAULT_STAGE_PIPELINES[category] ?? DEFAULT_STAGE_PIPELINES.REASONING;
      const costRate = COST_PER_1K_TOKENS_SIMULATED.supervisor ?? 0.002;
      const { id, sequenceNumber } = resolveGlobalPoolTaskIdentity(
        snapshot,
        taskOrInput,
      );
      const title = taskOrInput.title?.trim()
        ? taskOrInput.title.trim()
        : template.title;
      const description = taskOrInput.description?.trim()
        ? taskOrInput.description.trim()
        : template.description;

      const safeOutcome = createTaskEntitySafe({
        id,
        sequenceNumber,
        seed: snapshot.seed,
        simTimeMs: snapshot.simTimeMs,
        type: taskType,
        category,
        title,
        description,
        priority: taskOrInput.priority ?? template.priority,
        status: 'QUEUED',
        assignedWorkerId: null,
        fallbackWorkerId: 'supervisor',
        parentTaskId: taskOrInput.parentTaskId ?? null,
        dependencyIds: taskOrInput.dependencyIds ?? [],
        maxAttempts: taskOrInput.maxAttempts ?? 3,
        totalDurationSimMs:
          taskOrInput.durationSimMs ?? template.durationSimMs,
        targetTokens: taskOrInput.targetTokens ?? template.targetTokens,
        input: {
          instruction: description,
          parameters: taskOrInput.parameters
            ? { ...taskOrInput.parameters }
            : {
                category,
                templateIndex: normalizedIdx,
              },
          sourceChannel: taskOrInput.sourceChannel ?? 'manual_ui',
          contextTags: taskOrInput.contextTags
            ? [...taskOrInput.contextTags]
            : [category.toLowerCase(), taskType.toLowerCase()],
        },
      });

      if (!safeOutcome.valid || !safeOutcome.task) {
        return snapshot;
      }

      candidateTask = {
        ...safeOutcome.task,
        stagePipeline: stagePipeline.map((s) => ({ ...s })),
        costPerThousandTokensUsd: costRate,
      };
    }

    const enqueueOutcome = enqueueTask(snapshot, candidateTask);
    if (!enqueueOutcome.ok) {
      return enqueueOutcome.snapshot;
    }

    const enqueuedTask =
      enqueueOutcome.snapshot.tasks[enqueueOutcome.entry.taskId] ??
      candidateTask;
    const queuedEvent = this.createEvent(enqueueOutcome.snapshot, {
      workerId: null,
      workerName: 'Task Dispatcher',
      department: 'Global Scheduler',
      taskId: enqueuedTask.id,
      type: 'TASK_QUEUED',
      message: `[SIMULATED] Queued global task "${enqueuedTask.title}" (${enqueuedTask.priority}, Seq #${enqueueOutcome.entry.sequence})`,
      accentColor: '#38BDF8',
    });

    return {
      ...enqueueOutcome.snapshot,
      events: this.appendEvent(enqueueOutcome.snapshot, queuedEvent),
    };
  }

  /**
   * Thin service wrapper around `dispatchPass()` from `src/scheduler/task.dispatcher.ts`.
   * Returns `dispatchPass(snapshot, options).snapshot` directly without duplicating
   * dispatcher logic or re-emitting `TASK_STARTED` events.
   */
  /**
   * Thin service wrapper around dispatchPass() from src/scheduler/task.dispatcher.ts.
   * Returns the full DispatchPassResult<SimulationSnapshot> without duplicating
   * dispatcher logic or re-emitting TASK_STARTED events.
   */
  static dispatchGlobalQueueWithResult(
    snapshot: SimulationSnapshot,
    options?: DispatchPassOptions,
  ): DispatchPassResult<SimulationSnapshot> {
    return dispatchPass(snapshot, options);
  }

  /**
   * Backward-compatible wrapper returning only snapshot from dispatchGlobalQueueWithResult().
   */
  static dispatchGlobalQueue(
    snapshot: SimulationSnapshot,
    options?: DispatchPassOptions,
  ): SimulationSnapshot {
    return this.dispatchGlobalQueueWithResult(snapshot, options).snapshot;
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
   * Marks a specific active task of a worker as COMPLETED via the canonical
   * `transitionTaskStatus(task, 'COMPLETED', ...)` state machine helper and updates
   * simulated metrics.
   *
   * - Validates that the worker exists, the task exists, and `taskId` is currently active
   *   (`getActiveTaskIds(worker).includes(taskId)`). Returns `snapshot` unchanged otherwise.
   * - Uses `withTaskDeactivated` as the only mechanism for updating `activeTaskIds` and `currentTaskId`.
   * - When other active tasks remain, keeps the worker `BUSY` and preserves `transitionSimMs`.
   * - When the last active task completes, transitions the worker to `COMPLETED`.
   */
  static completeTask(
    snapshot: SimulationSnapshot,
    workerId: WorkerId,
    taskId: string,
  ): SimulationSnapshot {
    const worker = snapshot.workers[workerId];
    if (!worker || !taskId) return snapshot;

    const activeIds = getActiveTaskIds(worker);
    if (!activeIds.includes(taskId)) return snapshot;

    const currentTask = snapshot.tasks[taskId];
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
    const hasRemainingActive = workerWithDeactivatedTask.activeTaskIds.length > 0;
    const nextPrimaryTask =
      hasRemainingActive && workerWithDeactivatedTask.currentTaskId
        ? snapshot.tasks[workerWithDeactivatedTask.currentTaskId] ?? null
        : null;

    const updatedWorker: WorkerEntity = {
      ...workerWithDeactivatedTask,
      status: hasRemainingActive ? 'BUSY' : 'COMPLETED',
      transitionSimMs: hasRemainingActive ? worker.transitionSimMs : 0,
      completedTaskIds: [completedTask.id, ...worker.completedTaskIds].slice(0, 25),
      animationState: hasRemainingActive
        ? deriveAnimationForWorker('BUSY', nextPrimaryTask?.status ?? null)
        : deriveAnimationForWorker('COMPLETED', 'COMPLETED'),
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
   * Marks the current primary active task of a worker as COMPLETED.
   * Thin wrapper over `completeTask` using `worker.currentTaskId`.
   */
  static completeCurrentTask(
    snapshot: SimulationSnapshot,
    workerId: WorkerId,
  ): SimulationSnapshot {
    const worker = snapshot.workers[workerId];
    if (!worker || !worker.currentTaskId) return snapshot;
    return this.completeTask(snapshot, workerId, worker.currentTaskId);
  }

  /**
   * Marks a specific active task of a worker as FAILED via the canonical
   * `transitionTaskStatus(task, 'FAILED', ...)` state machine helper and updates
   * simulated error metrics.
   *
   * - Validates that the worker exists, the task exists, and `taskId` is currently active
   *   (`getActiveTaskIds(worker).includes(taskId)`). Returns `snapshot` unchanged otherwise.
   * - Uses `withTaskDeactivated` as the only mechanism for updating `activeTaskIds` and `currentTaskId`.
   * - When other active tasks remain, keeps the worker `BUSY` and preserves `transitionSimMs`.
   * - When the last active task fails, transitions the worker to `IDLE`.
   */
  static failTask(
    snapshot: SimulationSnapshot,
    workerId: WorkerId,
    taskId: string,
    errorOverride?: Partial<TaskErrorDetail>,
  ): SimulationSnapshot {
    const worker = snapshot.workers[workerId];
    if (!worker || !taskId) return snapshot;

    const activeIds = getActiveTaskIds(worker);
    if (!activeIds.includes(taskId)) return snapshot;

    const currentTask = snapshot.tasks[taskId];
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
    const hasRemainingActive = workerWithDeactivatedTask.activeTaskIds.length > 0;
    const nextPrimaryTask =
      hasRemainingActive && workerWithDeactivatedTask.currentTaskId
        ? snapshot.tasks[workerWithDeactivatedTask.currentTaskId] ?? null
        : null;

    const updatedWorker: WorkerEntity = {
      ...workerWithDeactivatedTask,
      status: hasRemainingActive ? 'BUSY' : 'IDLE',
      transitionSimMs: hasRemainingActive ? worker.transitionSimMs : 0,
      animationState: hasRemainingActive
        ? deriveAnimationForWorker('BUSY', nextPrimaryTask?.status ?? null)
        : deriveAnimationForWorker('IDLE', null),
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

  /**
   * Marks the current primary active task of a worker as FAILED.
   * Thin wrapper over `failTask` using `worker.currentTaskId`.
   */
  static failCurrentTask(
    snapshot: SimulationSnapshot,
    workerId: WorkerId,
    errorOverride?: Partial<TaskErrorDetail>,
  ): SimulationSnapshot {
    const worker = snapshot.workers[workerId];
    if (!worker || !worker.currentTaskId) return snapshot;
    return this.failTask(snapshot, workerId, worker.currentTaskId, errorOverride);
  }
}
