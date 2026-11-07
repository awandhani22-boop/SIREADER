import {
  COST_PER_1K_TOKENS_SIMULATED,
  DEFAULT_STAGE_PIPELINES,
} from '../workers/worker.registry';
import {
  mapCategoryToDefaultTaskType,
  mapTaskTypeToCategory,
  resolveDefaultCategoryForWorker,
} from '../workers/worker.capabilities';
import {
  PermanentWorkerId,
  TaskCategory,
  TaskEntity,
  TaskErrorDetail,
  TaskInputPayload,
  TaskLifecycleStatus,
  TaskPriority,
  TaskResultPayload,
  TaskStatus,
  TaskType,
  TaskValidationResult,
  WorkerCapabilityProfile,
  WorkerId,
} from '../workers/worker.types';
import { isValidTaskStatus, toTaskLifecycleStatus } from './task.transitions';
import {
  assertValidTaskEntity,
  validateTaskEntity,
  ValidateTaskOptions,
} from './task.validation';

/**
 * Deterministic Task Factory (Phase 2.1 + Audit Remediation)
 * Creates validated, structured TaskEntity objects using simulation time (`simTimeMs`)
 * and explicit deterministic identity contexts (`id`, `sequenceNumber`, `sequence`, or `existingTaskIds`).
 * Never uses `Date.now()`, `Math.random()`, `crypto.randomUUID()`, or hidden global mutable counters.
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
  if (
    typeof params.sequenceNumber !== 'number' ||
    !Number.isInteger(params.sequenceNumber) ||
    params.sequenceNumber <= 0
  ) {
    throw new Error(
      `generateDeterministicTaskId requires a positive integer sequenceNumber (received ${String(params.sequenceNumber)}).`,
    );
  }
  const normalizedSimTime = Math.max(0, Math.floor(params.simTimeMs));
  const normalizedSeq = params.sequenceNumber;
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
  readonly sequence?: DeterministicTaskSequence;
  readonly seed?: number;
  readonly simTimeMs: number;
  readonly type?: TaskType;
  readonly category?: TaskCategory;
  readonly title: string;
  readonly description?: string;
  readonly priority?: TaskPriority;
  readonly status?: TaskStatus;
  readonly lifecycleStatus?: TaskLifecycleStatus;
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
  readonly capabilityRegistry?: Readonly<
    Record<PermanentWorkerId, WorkerCapabilityProfile>
  >;
}

function resolveTaskIdentity(
  params: CreateTaskParams,
  workerPrefix?: string,
): string {
  if (params.id !== undefined) {
    return params.id;
  }
  if (params.sequence) {
    return params.sequence.nextId(params.simTimeMs, workerPrefix);
  }
  if (params.sequenceNumber !== undefined) {
    return generateDeterministicTaskId({
      seed: params.seed,
      sequenceNumber: params.sequenceNumber,
      simTimeMs: params.simTimeMs,
      workerPrefix,
    });
  }
  throw new Error(
    'Deterministic task creation requires an explicit id, sequenceNumber, or DeterministicTaskSequence instance. existingTaskIds is reserved strictly for duplicate ID validation.',
  );
}

function buildUnvalidatedTaskCandidate(
  params: CreateTaskParams,
  resolvedId: string,
): TaskEntity {
  const simTimeMs = params.simTimeMs;
  const assignedWorkerId: WorkerId | null =
    params.assignedWorkerId !== undefined ? params.assignedWorkerId : null;
  const workerId: WorkerId =
    assignedWorkerId ?? params.fallbackWorkerId ?? 'supervisor';

  const resolvedCategory: TaskCategory =
    params.category ??
    (params.type
      ? mapTaskTypeToCategory(params.type)
      : resolveDefaultCategoryForWorker(
          assignedWorkerId ?? params.fallbackWorkerId,
        ));
  const resolvedType: TaskType =
    params.type ?? mapCategoryToDefaultTaskType(resolvedCategory);

  const status: TaskStatus = params.status ?? 'PENDING';
  const derivedLifecycle: TaskLifecycleStatus = isValidTaskStatus(status)
    ? toTaskLifecycleStatus(status)
    : 'PENDING';
  const lifecycleStatus: TaskLifecycleStatus =
    params.lifecycleStatus !== undefined
      ? params.lifecycleStatus
      : derivedLifecycle;

  const queuedAt: number | null =
    params.queuedAt !== undefined
      ? params.queuedAt
      : derivedLifecycle === 'PENDING'
        ? null
        : simTimeMs;

  const startedAt: number | null =
    params.startedAt !== undefined
      ? params.startedAt
      : derivedLifecycle === 'RUNNING' || derivedLifecycle === 'COMPLETED'
        ? simTimeMs
        : null;

  const completedAt: number | null =
    params.completedAt !== undefined
      ? params.completedAt
      : derivedLifecycle === 'COMPLETED'
        ? Math.max(startedAt ?? simTimeMs, simTimeMs)
        : null;

  const updatedAt = params.updatedAt !== undefined ? params.updatedAt : simTimeMs;

  const maxAttempts = params.maxAttempts ?? 3;
  const attemptCount =
    params.attemptCount !== undefined
      ? params.attemptCount
      : derivedLifecycle === 'RUNNING' || derivedLifecycle === 'COMPLETED'
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

  return {
    id: resolvedId,
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
      : derivedLifecycle === 'COMPLETED'
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
    progress: derivedLifecycle === 'COMPLETED' ? 100 : 0,
    elapsedSimMs: derivedLifecycle === 'COMPLETED' ? totalDurationSimMs : 0,
    totalDurationSimMs,
    stagePipeline: stagePipeline.map((s) => ({ ...s })),
    simulatedTokens: derivedLifecycle === 'COMPLETED' ? targetTokens : 0,
    targetTokens,
    simulatedCostUsd:
      derivedLifecycle === 'COMPLETED'
        ? Number(((targetTokens / 1000) * costRate).toFixed(6))
        : 0,
    costPerThousandTokensUsd: costRate,
    createdAtSimMs: simTimeMs,
    startedAtSimMs: startedAt,
    completedAtSimMs: completedAt,
    isSimulated: true,
  };
}

export function createTaskEntity(params: CreateTaskParams): TaskEntity {
  const assignedWorkerId =
    params.assignedWorkerId !== undefined ? params.assignedWorkerId : null;
  const workerPrefix =
    assignedWorkerId || params.fallbackWorkerId
      ? String(assignedWorkerId ?? params.fallbackWorkerId)
      : undefined;

  const resolvedId = resolveTaskIdentity(params, workerPrefix);
  const task = buildUnvalidatedTaskCandidate(params, resolvedId);

  assertValidTaskEntity(task, {
    existingTaskIds: params.existingTaskIds,
    capabilityRegistry: params.capabilityRegistry,
  });
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
  const mergedExistingIds =
    validationOptions?.existingTaskIds ?? params.existingTaskIds;
  const mergedRegistry =
    validationOptions?.capabilityRegistry ?? params.capabilityRegistry;

  const assignedWorkerId =
    params.assignedWorkerId !== undefined ? params.assignedWorkerId : null;
  const workerPrefix =
    assignedWorkerId || params.fallbackWorkerId
      ? String(assignedWorkerId ?? params.fallbackWorkerId)
      : undefined;

  let resolvedId = '';
  try {
    resolvedId = resolveTaskIdentity(
      { ...params, existingTaskIds: mergedExistingIds },
      workerPrefix,
    );
  } catch {
    resolvedId = '';
  }

  const candidate = buildUnvalidatedTaskCandidate(params, resolvedId);
  const validation = validateTaskEntity(candidate, {
    existingTaskIds: mergedExistingIds,
    capabilityRegistry: mergedRegistry,
  });

  if (!validation.valid) {
    return {
      valid: false,
      task: null,
      validation,
    };
  }

  return {
    valid: true,
    task: candidate,
    validation,
  };
}
