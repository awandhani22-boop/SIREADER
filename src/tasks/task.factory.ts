import {
  COST_PER_1K_TOKENS_SIMULATED,
  DEFAULT_STAGE_PIPELINES,
} from '../workers/worker.registry';
import {
  mapCategoryToDefaultTaskType,
  mapTaskTypeToCategory,
} from '../workers/worker.capabilities';
import {
  TaskCategory,
  TaskEntity,
  TaskErrorDetail,
  TaskInputPayload,
  TaskPriority,
  TaskResultPayload,
  TaskStatus,
  TaskType,
  TaskValidationResult,
  WorkerId,
} from '../workers/worker.types';
import { toTaskLifecycleStatus } from './task.transitions';
import {
  assertValidTaskEntity,
  validateTaskEntity,
  ValidateTaskOptions,
} from './task.validation';

/**
 * Deterministic Task Factory (Phase 2.1)
 * Creates validated, structured TaskEntity objects using simulation time (`simTimeMs`)
 * and deterministic sequence/seed counters.
 * Never uses `Date.now()`, `Math.random()`, or non-deterministic UUIDs.
 */

export interface DeterministicTaskIdParams {
  readonly seed?: number;
  readonly sequenceNumber: number;
  readonly simTimeMs: number;
  readonly workerPrefix?: string;
}

/**
 * Pure deterministic task ID generator function.
 * Given identical `(seed, sequenceNumber, simTimeMs, workerPrefix)`, always returns
 * the exact same ID string.
 */
export function generateDeterministicTaskId(
  params: DeterministicTaskIdParams,
): string {
  const normalizedSimTime = Math.max(0, Math.floor(params.simTimeMs));
  const normalizedSeq = Math.max(1, Math.floor(params.sequenceNumber));
  if (params.workerPrefix) {
    return `tsk_${params.workerPrefix}_${normalizedSeq}_${normalizedSimTime}`;
  }
  const seedTag =
    params.seed !== undefined
      ? (params.seed >>> 0).toString(16).padStart(8, '0')
      : '00000000';
  return `tsk_${seedTag}_${String(normalizedSeq).padStart(4, '0')}_${normalizedSimTime}`;
}

/**
 * Stateful deterministic ID sequence generator that can be reset to its initial state
 * to guarantee reproducible ID sequences across simulation resets.
 */
export class DeterministicTaskSequence {
  private readonly initialSeed: number;
  private readonly initialCounter: number;
  private currentCounter: number;

  constructor(seed = 0x517ead37, startAt = 1) {
    this.initialSeed = seed >>> 0;
    this.initialCounter = Math.max(1, Math.floor(startAt));
    this.currentCounter = this.initialCounter;
  }

  nextId(simTimeMs: number, workerPrefix?: string): string {
    const seq = this.currentCounter;
    this.currentCounter += 1;
    return generateDeterministicTaskId({
      seed: this.initialSeed,
      sequenceNumber: seq,
      simTimeMs,
      workerPrefix,
    });
  }

  peekSequenceNumber(): number {
    return this.currentCounter;
  }

  reset(): void {
    this.currentCounter = this.initialCounter;
  }
}

export interface CreateTaskParams {
  readonly id?: string;
  readonly sequenceNumber?: number;
  readonly seed?: number;
  readonly simTimeMs: number;
  readonly type?: TaskType;
  readonly category?: TaskCategory;
  readonly title: string;
  readonly description?: string;
  readonly priority?: TaskPriority;
  readonly status?: TaskStatus;
  readonly assignedWorkerId?: WorkerId | null;
  readonly fallbackWorkerId?: WorkerId;
  readonly parentTaskId?: string | null;
  readonly dependencyIds?: readonly string[];
  readonly input?: Partial<TaskInputPayload>;
  readonly result?: TaskResultPayload | null;
  readonly error?: TaskErrorDetail | null;
  readonly attemptCount?: number;
  readonly maxAttempts?: number;
  readonly queuedAt?: number | null;
  readonly startedAt?: number | null;
  readonly completedAt?: number | null;
  readonly updatedAt?: number;
  readonly totalDurationSimMs?: number;
  readonly targetTokens?: number;
  readonly existingTaskIds?: ReadonlySet<string> | readonly string[];
}

export function createTaskEntity(params: CreateTaskParams): TaskEntity {
  const simTimeMs = params.simTimeMs;
  const resolvedCategory: TaskCategory =
    params.category ??
    (params.type ? mapTaskTypeToCategory(params.type) : 'ROUTING');
  const resolvedType: TaskType =
    params.type ?? mapCategoryToDefaultTaskType(resolvedCategory);

  const assignedWorkerId: WorkerId | null =
    params.assignedWorkerId !== undefined ? params.assignedWorkerId : null;
  const workerId: WorkerId =
    assignedWorkerId ?? params.fallbackWorkerId ?? 'supervisor';

  const id =
    params.id !== undefined
      ? params.id
      : generateDeterministicTaskId({
          seed: params.seed,
          sequenceNumber: params.sequenceNumber ?? 1,
          simTimeMs,
          workerPrefix:
            params.assignedWorkerId || params.fallbackWorkerId
              ? String(workerId)
              : undefined,
        });

  const status: TaskStatus = params.status ?? 'PENDING';
  const lifecycleStatus = toTaskLifecycleStatus(status);

  const queuedAt: number | null =
    params.queuedAt !== undefined
      ? params.queuedAt
      : lifecycleStatus === 'PENDING'
        ? null
        : simTimeMs;

  const startedAt: number | null =
    params.startedAt !== undefined
      ? params.startedAt
      : lifecycleStatus === 'RUNNING' || lifecycleStatus === 'COMPLETED'
        ? simTimeMs
        : null;

  const completedAt: number | null =
    params.completedAt !== undefined
      ? params.completedAt
      : lifecycleStatus === 'COMPLETED'
        ? Math.max(startedAt ?? simTimeMs, simTimeMs)
        : null;

  const updatedAt = params.updatedAt !== undefined ? params.updatedAt : simTimeMs;

  const maxAttempts = params.maxAttempts ?? 3;
  const attemptCount =
    params.attemptCount !== undefined
      ? params.attemptCount
      : lifecycleStatus === 'RUNNING' || lifecycleStatus === 'COMPLETED'
        ? 1
        : 0;

  const trimmedTitle = params.title.trim();
  const description = params.description?.trim() || trimmedTitle;

  const inputPayload: TaskInputPayload = {
    instruction:
      params.input?.instruction !== undefined
        ? params.input.instruction
        : description,
    parameters: params.input?.parameters ? { ...params.input.parameters } : {},
    sourceChannel: params.input?.sourceChannel ?? 'manual_ui',
    contextTags: params.input?.contextTags
      ? [...params.input.contextTags]
      : [resolvedCategory.toLowerCase(), resolvedType.toLowerCase()],
  };

  const stagePipeline =
    DEFAULT_STAGE_PIPELINES[resolvedCategory] ??
    DEFAULT_STAGE_PIPELINES.REASONING;
  const costRate = COST_PER_1K_TOKENS_SIMULATED[workerId] ?? 0.002;
  const totalDurationSimMs = params.totalDurationSimMs ?? 6000;
  const targetTokens = params.targetTokens ?? 320;

  const task: TaskEntity = {
    id,
    workerId,
    type: resolvedType,
    title: trimmedTitle,
    description,
    category: resolvedCategory,
    priority: params.priority ?? 'NORMAL',
    status,
    lifecycleStatus,
    assignedWorkerId,
    parentTaskId: params.parentTaskId ?? null,
    dependencyIds: params.dependencyIds ? [...params.dependencyIds] : [],
    input: inputPayload,
    result: params.result
      ? {
          ...params.result,
          outputData: { ...params.result.outputData },
          artifacts: [...params.result.artifacts],
        }
      : lifecycleStatus === 'COMPLETED'
        ? {
            summary: `Completed "${trimmedTitle}"`,
            outputData: { completedAtSimMs: completedAt ?? simTimeMs },
            artifacts: [],
            confidenceScore: 1,
            isSimulated: true,
          }
        : null,
    error: params.error ? { ...params.error } : null,
    attemptCount,
    maxAttempts,
    createdAt: simTimeMs,
    queuedAt,
    startedAt,
    completedAt,
    updatedAt,
    progress: lifecycleStatus === 'COMPLETED' ? 100 : 0,
    elapsedSimMs: lifecycleStatus === 'COMPLETED' ? totalDurationSimMs : 0,
    totalDurationSimMs,
    stagePipeline: stagePipeline.map((s) => ({ ...s })),
    simulatedTokens: lifecycleStatus === 'COMPLETED' ? targetTokens : 0,
    targetTokens,
    simulatedCostUsd:
      lifecycleStatus === 'COMPLETED'
        ? Number(((targetTokens / 1000) * costRate).toFixed(6))
        : 0,
    costPerThousandTokensUsd: costRate,
    createdAtSimMs: simTimeMs,
    startedAtSimMs: startedAt,
    completedAtSimMs: completedAt,
    isSimulated: true,
  };

  assertValidTaskEntity(task, { existingTaskIds: params.existingTaskIds });
  return task;
}

export interface SafeCreateTaskOutcome {
  readonly valid: boolean;
  readonly task: TaskEntity | null;
  readonly validation: TaskValidationResult;
}

export function createTaskEntitySafe(
  params: CreateTaskParams,
  validationOptions?: ValidateTaskOptions,
): SafeCreateTaskOutcome {
  try {
    const task = createTaskEntity({
      ...params,
      existingTaskIds:
        validationOptions?.existingTaskIds ?? params.existingTaskIds,
    });
    return {
      valid: true,
      task,
      validation: { valid: true, issues: [] },
    };
  } catch {
    // Construct raw candidate to surface exact structured validation issues
    const simTimeMs = params.simTimeMs;
    const resolvedCategory: TaskCategory =
      params.category ??
      (params.type ? mapTaskTypeToCategory(params.type) : 'ROUTING');
    const resolvedType: TaskType =
      params.type ?? mapCategoryToDefaultTaskType(resolvedCategory);
    const assignedWorkerId =
      params.assignedWorkerId !== undefined ? params.assignedWorkerId : null;
    const workerId: WorkerId =
      assignedWorkerId ?? params.fallbackWorkerId ?? 'supervisor';
    const status: TaskStatus = params.status ?? 'PENDING';
    const lifecycleStatus = toTaskLifecycleStatus(status);
    const rawCandidate: TaskEntity = {
      id:
        params.id ??
        generateDeterministicTaskId({
          seed: params.seed,
          sequenceNumber: params.sequenceNumber ?? 1,
          simTimeMs,
        }),
      workerId,
      type: resolvedType,
      title: params.title,
      description: params.description ?? params.title,
      category: resolvedCategory,
      priority: params.priority ?? 'NORMAL',
      status,
      lifecycleStatus,
      assignedWorkerId,
      parentTaskId: params.parentTaskId ?? null,
      dependencyIds: params.dependencyIds ? [...params.dependencyIds] : [],
      input: {
        instruction: params.input?.instruction ?? params.title,
        parameters: params.input?.parameters ?? {},
        sourceChannel: params.input?.sourceChannel ?? 'manual_ui',
        contextTags: params.input?.contextTags
          ? [...params.input.contextTags]
          : [],
      },
      result: params.result ?? null,
      error: params.error ?? null,
      attemptCount: params.attemptCount ?? 0,
      maxAttempts: params.maxAttempts ?? 3,
      createdAt: simTimeMs,
      queuedAt:
        params.queuedAt !== undefined
          ? params.queuedAt
          : lifecycleStatus === 'PENDING'
            ? null
            : simTimeMs,
      startedAt: params.startedAt ?? null,
      completedAt: params.completedAt ?? null,
      updatedAt: params.updatedAt ?? simTimeMs,
      progress: 0,
      elapsedSimMs: 0,
      totalDurationSimMs: params.totalDurationSimMs ?? 6000,
      stagePipeline:
        DEFAULT_STAGE_PIPELINES[resolvedCategory] ??
        DEFAULT_STAGE_PIPELINES.REASONING,
      simulatedTokens: 0,
      targetTokens: params.targetTokens ?? 320,
      simulatedCostUsd: 0,
      costPerThousandTokensUsd:
        COST_PER_1K_TOKENS_SIMULATED[workerId] ?? 0.002,
      createdAtSimMs: simTimeMs,
      startedAtSimMs: params.startedAt ?? null,
      completedAtSimMs: params.completedAt ?? null,
      isSimulated: true,
    };

    const validation = validateTaskEntity(rawCandidate, {
      existingTaskIds:
        validationOptions?.existingTaskIds ?? params.existingTaskIds,
    });
    return {
      valid: false,
      task: null,
      validation,
    };
  }
}
