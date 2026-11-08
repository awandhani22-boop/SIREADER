/**
 * Domain types for SIREADER Virtual Office (Phase 1.1 & Phase 2.1 — Local Simulation Only)
 * Enforces strict separation between Worker and Task entities, deterministic
 * simulation clock state, Phase 2.1 structured task metadata, and explicit SIMULATED metric labeling.
 */

import {
  CapabilityComplexityLevel,
  CapabilityDefinition,
  CapabilitySchemaDescriptor,
  PERMANENT_WORKER_IDS,
  PermanentWorkerId,
  TASK_CATEGORIES,
  TASK_EXECUTION_STAGE_STATUSES,
  TASK_LIFECYCLE_STATUSES,
  TASK_PRIORITIES,
  TASK_TYPES,
  TaskCategory,
  TaskErrorDetail,
  TaskExecutionStageStatus,
  TaskInputPayload,
  TaskLifecycleStatus,
  TaskParameterPrimitive,
  TaskPriority,
  TaskResultPayload,
  TaskStatus,
  TaskTransitionError,
  TaskType,
  TaskValidationIssue,
  TaskValidationResult,
  TaskValidationRuleCode,
  WORKER_CAPABILITY_IDS,
  WorkerCapabilityId,
  WorkerCapabilityProfile,
  WorkerId,
} from '../tasks/task.types';
import type {
  BlockedTaskRecord,
  DispatchBlockReason,
  DispatchedTaskRecord,
  QueuedTaskEntry,
  SchedulerSnapshotState,
} from '../scheduler/scheduler.types';

export const FIXED_TICK_SIM_MS = 500;
export const MAX_DELTA_CLAMP_MS = 1000;

export {
  PERMANENT_WORKER_IDS,
  TASK_CATEGORIES,
  TASK_EXECUTION_STAGE_STATUSES,
  TASK_LIFECYCLE_STATUSES,
  TASK_PRIORITIES,
  TASK_TYPES,
  WORKER_CAPABILITY_IDS,
};

export type {
  BlockedTaskRecord,
  CapabilityComplexityLevel,
  CapabilityDefinition,
  CapabilitySchemaDescriptor,
  DispatchBlockReason,
  DispatchedTaskRecord,
  PermanentWorkerId,
  QueuedTaskEntry,
  SchedulerSnapshotState,
  TaskCategory,
  TaskErrorDetail,
  TaskExecutionStageStatus,
  TaskInputPayload,
  TaskLifecycleStatus,
  TaskParameterPrimitive,
  TaskPriority,
  TaskResultPayload,
  TaskStatus,
  TaskTransitionError,
  TaskType,
  TaskValidationIssue,
  TaskValidationResult,
  TaskValidationRuleCode,
  WorkerCapabilityId,
  WorkerCapabilityProfile,
  WorkerId,
};

export type RoomId =
  | 'room_reception'
  | 'room_research'
  | 'room_analysis'
  | 'room_strategy'
  | 'room_trading_ops'
  | 'room_market_monitor'
  | 'room_archive'
  | (string & {});

/**
 * Explicit Worker operational status (separate from Task status).
 * Follows central state machine rules:
 * IDLE -> TASK_RECEIVED -> WALKING -> BUSY -> COMPLETED -> IDLE
 * Plus PAUSED, WAITING, and ERROR states.
 */
export type WorkerStatus =
  | 'IDLE'
  | 'TASK_RECEIVED'
  | 'WALKING'
  | 'BUSY'
  | 'WAITING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'ERROR';

export type AnimationClipKey = 'idle' | 'seated' | 'typing' | 'walking' | 'talking';

export interface AvatarConfig {
  modelUrl: string | null;
  animationMap: Record<AnimationClipKey, string>;
  fallbackType: 'articulated-humanoid';
  accentColor: string;
  secondaryColor: string;
  suitColor: string;
  badgeCode: string;
}

export interface TaskStageThreshold {
  status: TaskExecutionStageStatus;
  startPercent: number;
  endPercent: number;
}

/**
 * Unified TaskEntity (Phase 1.1 + Phase 2.1 backward-compatible extension).
 * Single canonical task model across the entire repository.
 */
export interface TaskEntity {
  id: string;
  /** Phase 1.1 worker reference (kept in sync with assignedWorkerId when assigned) */
  workerId: WorkerId;
  /** Phase 2.1 structured task type mapped to worker capabilities */
  type: TaskType;
  title: string;
  description: string;
  /** Phase 1.1 legacy category preserved for UI badges & stage pipelines */
  category: TaskCategory;
  priority: TaskPriority;
  /** Unified status (supports Phase 2.1 lifecycle states and Phase 1.1 execution sub-stages) */
  status: TaskStatus;
  /** Canonical Phase 2.1 lifecycle status ('PENDING' | 'QUEUED' | 'ASSIGNED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'RETRY_WAIT' | 'BLOCKED' | 'CANCELLED') */
  lifecycleStatus: TaskLifecycleStatus;
  /** Phase 2.1 explicit assigned worker ID (null when unassigned in PENDING/QUEUED/BLOCKED states) */
  assignedWorkerId: WorkerId | null;
  /** Phase 2.1 parent task ID for decomposed subtasks */
  parentTaskId: string | null;
  /** Phase 2.1 upstream task IDs that must complete before execution */
  dependencyIds: string[];
  /** Phase 2.1 structured task input payload */
  input: TaskInputPayload;
  /** Phase 2.1 structured task result payload (populated on completion) */
  result: TaskResultPayload | null;
  /** Phase 2.1 structured error detail (populated on failure/error) */
  error: TaskErrorDetail | null;
  /** Phase 2.1 execution attempt counter (0 before first run, >= 1 when started) */
  attemptCount: number;
  /** Phase 2.1 maximum allowed attempts (must be > 0) */
  maxAttempts: number;
  /** Phase 2.1 simulation timestamps (in simulation milliseconds, synced with *SimMs fields) */
  createdAt: number;
  queuedAt: number | null;
  startedAt: number | null;
  completedAt: number | null;
  updatedAt: number;
  /** Deterministic progress 0..100 derived strictly from elapsedSimMs / totalDurationSimMs */
  progress: number;
  elapsedSimMs: number;
  totalDurationSimMs: number;
  /** Stage sequence that maps deterministic progress thresholds to TaskStatus */
  stagePipeline: TaskStageThreshold[];
  simulatedTokens: number;
  targetTokens: number;
  simulatedCostUsd: number;
  costPerThousandTokensUsd: number;
  createdAtSimMs: number;
  startedAtSimMs: number | null;
  completedAtSimMs: number | null;
  isSimulated: true;
}

export interface WorkerSimulatedMetrics {
  simulatedTokens: number;
  simulatedCostUsd: number;
  completedTasksCount: number;
  errorCount: number;
  lastActivitySimMs: number;
  isSimulated: true;
}

export interface WorkerEntity {
  id: WorkerId;
  name: string;
  shortName: string;
  role: string;
  department: string;
  roomId: RoomId;
  workstationId: string;
  modelLabel: string;
  providerLabel: string;
  description: string;
  /** Current 3D world coordinates [x, y, z] */
  position3D: [number, number, number];
  /** Assigned desk seat coordinates [x, y, z] */
  homePosition3D: [number, number, number];
  /** Corridor entry waypoint coordinates [x, y, z] for smooth locomotion */
  corridorWaypoint3D: [number, number, number];
  /** Default facing angle (radians) when seated at workstation */
  deskRotationY: number;
  status: WorkerStatus;
  /** Preserves exact pre-pause WorkerStatus so Resume continues cleanly */
  statusBeforePause: WorkerStatus | null;
  /** Elapsed simulation ms in transitional states (TASK_RECEIVED, WALKING, COMPLETED) */
  transitionSimMs: number;
  animationState: AnimationClipKey;
  /** Primary active task ID (`activeTaskIds[0] ?? null`) preserved for Phase 1.1/2.1 backward compatibility */
  currentTaskId: string | null;
  /** Canonical ordered list of active concurrent task IDs (`currentTaskId === activeTaskIds[0] ?? null`) */
  activeTaskIds: string[];
  taskQueueIds: string[];
  completedTaskIds: string[];
  avatarConfig: AvatarConfig;
  metrics: WorkerSimulatedMetrics;
}

export interface RoomDefinition {
  id: RoomId;
  name: string;
  departmentCode: string;
  subtitle: string;
  primaryWorkerId: WorkerId;
  /** Center position of the room on the office floor [x, y, z] */
  center3D: [number, number, number];
  /** Room dimensions [widthX, heightY, depthZ] */
  size3D: [number, number, number];
  /** Door opening side facing the central corridor */
  doorSide: 'north' | 'south' | 'east' | 'west';
  accentColor: string;
  floorTint: string;
  roomType:
    | 'reception'
    | 'research'
    | 'analysis'
    | 'strategy'
    | 'trading_ops'
    | 'market_monitor'
    | 'archive';
}

export interface WorkstationDefinition {
  id: string;
  roomId: RoomId;
  workerId: WorkerId;
  label: string;
  /** Desk center position [x, y, z] */
  deskPosition3D: [number, number, number];
  /** Chair/avatar seated position [x, y, z] */
  seatPosition3D: [number, number, number];
  /** Rotation in radians around Y axis */
  rotationY: number;
  monitorCount: 1 | 2 | 3;
  accentColor: string;
}

export type ActivityEventType =
  | 'TASK_QUEUED'
  | 'TASK_STARTED'
  | 'TASK_STAGE_CHANGED'
  | 'TASK_COMPLETED'
  | 'WORKER_PAUSED'
  | 'WORKER_RESUMED'
  | 'SIMULATION_CONTROL';

export interface ActivityEvent {
  id: string;
  simTimestampMs: number;
  workerId: WorkerId | null;
  workerName: string;
  department: string;
  taskId: string | null;
  type: ActivityEventType;
  message: string;
  accentColor: string;
  isSimulated: true;
}

export interface MockTaskTemplate {
  title: string;
  description: string;
  category: TaskCategory;
  priority: TaskPriority;
  durationSimMs: number;
  targetTokens: number;
}

export interface SimulationSnapshot {
  seed: number;
  prngState: number;
  simTimeMs: number;
  tickCount: number;
  accumulatorMs?: number;
  isGlobalPaused: boolean;
  simSpeedMultiplier: 1 | 2 | 4;
  workers: Record<WorkerId, WorkerEntity>;
  workerOrder: WorkerId[];
  tasks: Record<string, TaskEntity>;
  events: ActivityEvent[];
  /** Phase 2.2 global task dispatcher & priority scheduler state (optional for legacy snapshot compatibility) */
  scheduler?: SchedulerSnapshotState;
}
