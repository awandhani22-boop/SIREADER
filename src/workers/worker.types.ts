/**
 * Domain types for SIREADER Virtual Office (Phase 1 — Local Simulation Only)
 * Enforces strict separation between Worker and Task entities, deterministic
 * simulation clock state, and explicit SIMULATED metric labeling.
 */

export type WorkerId =
  | 'supervisor'
  | 'haiku'
  | 'sonnet'
  | 'opus'
  | 'decision_engineer'
  | 'market_monitor'
  | 'data_archivist'
  | (string & {});

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

/**
 * Explicit Task lifecycle status (separate from Worker status).
 * A BUSY worker can have a currentTask in ANALYZING while queued tasks are QUEUED.
 */
export type TaskStatus =
  | 'QUEUED'
  | 'ROUTING'
  | 'EXTRACTING'
  | 'ANALYZING'
  | 'VALIDATING'
  | 'ARCHIVING'
  | 'COMPLETED'
  | 'FAILED';

export type TaskPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';

export type TaskCategory =
  | 'ROUTING'
  | 'CLASSIFICATION'
  | 'REASONING'
  | 'ESCALATION'
  | 'DECISION_CHECK'
  | 'MARKET_WATCH'
  | 'ARCHIVAL';

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
  status: Exclude<TaskStatus, 'QUEUED' | 'COMPLETED' | 'FAILED'>;
  startPercent: number;
  endPercent: number;
}

export interface TaskEntity {
  id: string;
  workerId: WorkerId;
  title: string;
  description: string;
  category: TaskCategory;
  priority: TaskPriority;
  status: TaskStatus;
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
  currentTaskId: string | null;
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
  isGlobalPaused: boolean;
  simSpeedMultiplier: 1 | 2 | 4;
  workers: Record<WorkerId, WorkerEntity>;
  workerOrder: WorkerId[];
  tasks: Record<string, TaskEntity>;
  events: ActivityEvent[];
}
