import { create } from 'zustand';
import {
  DEFAULT_SIMULATION_SEED,
  FIXED_TICK_SIM_MS,
  SimulationEngine,
} from './simulation.engine';
import {
  AssignTaskInput,
  GlobalTaskInput,
  WorkerMockService,
} from './worker.mock-service';
import {
  RoomId,
  SimulationSnapshot,
  TaskEntity,
  WorkerEntity,
  WorkerId,
} from './worker.types';
import type {
  BlockedTaskRecord,
  DispatchPassResult,
  QueuedTaskEntry,
  SchedulerSnapshotState,
} from '../scheduler/scheduler.types';
import type {
  TaskLifecycleStatus,
  TaskPriority,
} from '../tasks/task.types';
import { orderQueue } from '../scheduler/priority.scheduler';

/**
 * Central Zustand Store for SIREADER Virtual Office (Phase 2.2 M3 — Commit 8)
 * - Supports granular per-worker subscriptions so updating one worker does not
 *   re-render unrelated worker components.
 * - Tracks isolated avatar GLB load errors per worker (`avatarLoadErrors`).
 * - Implements deterministic baseline reset (`resetSimulationWithSeed`).
 * - Synchronizes `SimulationEngine` real-time clock anchor on pause/resume/speed changes.
 * - Integrates global task queue, dispatch diagnostics, and activity history.
 */

export type GraphicsPreset = 'high' | 'balanced';

export interface OfficeStoreState extends SimulationSnapshot {
  selectedWorkerId: WorkerId | null;
  selectedRoomId: RoomId | null;
  isRosterOpen: boolean;
  isActivityFeedOpen: boolean;
  departmentFilter: string;
  cameraResetTrigger: number;
  cameraZoomDeltaTrigger: { step: number; nonce: number };
  graphicsPreset: GraphicsPreset;
  reducedMotion: boolean;
  /** Per-worker GLB model loading failure diagnostics (isolated fallback state) */
  avatarLoadErrors: Record<string, string | undefined>;

  // Global Queue Drawer & Diagnostics State
  isGlobalQueueOpen: boolean;
  lastBlockedRecords: readonly BlockedTaskRecord[];
  lastDispatchDiagnosticsAtSimMs: number | null;
  lastDispatchDiagnosticsTickCount: number | null;

  // Actions
  selectWorker: (workerId: WorkerId | null) => void;
  selectRoom: (roomId: RoomId | null, primaryWorkerId?: WorkerId) => void;
  setRosterOpen: (isOpen: boolean) => void;
  setActivityFeedOpen: (isOpen: boolean) => void;
  setDepartmentFilter: (department: string) => void;
  triggerCameraReset: () => void;
  triggerCameraZoom: (step: number) => void;
  setGraphicsPreset: (preset: GraphicsPreset) => void;
  setReducedMotion: (reduced: boolean) => void;

  // Global Queue UI Actions
  setGlobalQueueOpen: (isOpen: boolean) => void;
  toggleGlobalQueueOpen: () => void;
  enqueueGlobalMockTask: (
    input?: GlobalTaskInput,
    templateIndex?: number,
  ) => { ok: boolean; taskId?: string };

  // Avatar GLB Asset & Error Isolation Actions
  setWorkerModelUrl: (workerId: WorkerId, modelUrl: string | null) => void;
  recordAvatarModelError: (
    workerId: WorkerId,
    modelUrl: string,
    errorMessage: string,
  ) => void;
  clearAvatarModelError: (workerId: WorkerId) => void;

  // Simulation & Worker Domain Actions
  tickSimulation: (stepSimMs?: number) => void;
  advanceByWallClock: (rawDeltaMs: number) => void;
  setGlobalPaused: (isPaused: boolean) => void;
  toggleGlobalPaused: () => void;
  setSimSpeedMultiplier: (speed: 1 | 2 | 4) => void;
  resetSimulationWithSeed: (seed?: number) => void;
  assignMockTask: (input: AssignTaskInput, templateIndex?: number) => void;
  pauseWorker: (workerId: WorkerId) => void;
  resumeWorker: (workerId: WorkerId) => void;
  toggleWorkerPause: (workerId: WorkerId) => void;
}

function applySnapshotPatch(
  snapshot: SimulationSnapshot,
): Pick<
  OfficeStoreState,
  | 'seed'
  | 'prngState'
  | 'simTimeMs'
  | 'tickCount'
  | 'accumulatorMs'
  | 'isGlobalPaused'
  | 'simSpeedMultiplier'
  | 'workers'
  | 'workerOrder'
  | 'tasks'
  | 'events'
  | 'scheduler'
> {
  return {
    seed: snapshot.seed,
    prngState: snapshot.prngState,
    simTimeMs: snapshot.simTimeMs,
    tickCount: snapshot.tickCount,
    accumulatorMs: snapshot.accumulatorMs,
    isGlobalPaused: snapshot.isGlobalPaused,
    simSpeedMultiplier: snapshot.simSpeedMultiplier,
    workers: snapshot.workers,
    workerOrder: snapshot.workerOrder,
    tasks: snapshot.tasks,
    events: snapshot.events,
    scheduler: snapshot.scheduler,
  };
}

interface DiagnosticPatch {
  readonly lastBlockedRecords: readonly BlockedTaskRecord[];
  readonly lastDispatchDiagnosticsAtSimMs: number | null;
  readonly lastDispatchDiagnosticsTickCount: number | null;
}

function syncDiagnostics(
  state: OfficeStoreState,
  nextSnapshot: SimulationSnapshot,
  dispatchResult?: DispatchPassResult<SimulationSnapshot>,
): DiagnosticPatch {
  const remainingTaskIds = new Set(nextSnapshot.scheduler?.entries.map((e) => e.taskId) ?? []);

  // When no dispatch result or dispatch pass was skipped due to global pause:
  if (!dispatchResult || dispatchResult.skipped === 'GLOBALLY_PAUSED') {
    return {
      lastBlockedRecords: state.lastBlockedRecords.filter((b) => remainingTaskIds.has(b.taskId)),
      lastDispatchDiagnosticsAtSimMs: state.lastDispatchDiagnosticsAtSimMs,
      lastDispatchDiagnosticsTickCount: state.lastDispatchDiagnosticsTickCount,
    };
  }

  // An actual dispatch pass occurred:
  return {
    lastBlockedRecords: dispatchResult.blocked.filter((b) => remainingTaskIds.has(b.taskId)),
    lastDispatchDiagnosticsAtSimMs: nextSnapshot.simTimeMs,
    lastDispatchDiagnosticsTickCount: nextSnapshot.tickCount,
  };
}

const initialSnapshot = SimulationEngine.createInitialSnapshot(DEFAULT_SIMULATION_SEED);

export const useOfficeStore = create<OfficeStoreState>((set, get) => ({
  ...applySnapshotPatch(initialSnapshot),
  selectedWorkerId: 'sonnet',
  selectedRoomId: 'room_analysis',
  isRosterOpen: true,
  isActivityFeedOpen: true,
  departmentFilter: 'ALL',
  cameraResetTrigger: 0,
  cameraZoomDeltaTrigger: { step: 0, nonce: 0 },
  graphicsPreset: 'high',
  reducedMotion: false,
  avatarLoadErrors: {},

  // Global Queue initial state
  isGlobalQueueOpen: false,
  lastBlockedRecords: [],
  lastDispatchDiagnosticsAtSimMs: null,
  lastDispatchDiagnosticsTickCount: null,

  selectWorker: (workerId) =>
    set((state) => {
      if (!workerId) {
        return { selectedWorkerId: null, selectedRoomId: null };
      }
      const worker = state.workers[workerId];
      return {
        selectedWorkerId: workerId,
        selectedRoomId: worker ? worker.roomId : state.selectedRoomId,
      };
    }),

  selectRoom: (roomId, primaryWorkerId) =>
    set((state) => ({
      selectedRoomId: roomId,
      selectedWorkerId: primaryWorkerId ?? state.selectedWorkerId,
    })),

  setRosterOpen: (isOpen) => set({ isRosterOpen: isOpen }),
  setActivityFeedOpen: (isOpen) => set({ isActivityFeedOpen: isOpen }),
  setDepartmentFilter: (department) => set({ departmentFilter: department }),

  setGlobalQueueOpen: (isOpen) => set({ isGlobalQueueOpen: isOpen }),
  toggleGlobalQueueOpen: () => set((state) => ({ isGlobalQueueOpen: !state.isGlobalQueueOpen })),

  triggerCameraReset: () =>
    set((state) => ({ cameraResetTrigger: state.cameraResetTrigger + 1 })),

  triggerCameraZoom: (step) =>
    set((state) => ({
      cameraZoomDeltaTrigger: {
        step,
        nonce: state.cameraZoomDeltaTrigger.nonce + 1,
      },
    })),

  setGraphicsPreset: (preset) => set({ graphicsPreset: preset }),
  setReducedMotion: (reduced) => set({ reducedMotion: reduced }),

  enqueueGlobalMockTask: (input, templateIndex) => {
    const state = get();
    const next = WorkerMockService.enqueueGlobalTask(state, input, templateIndex);

    if (next === state) {
      return { ok: false };
    }

    const newEntry = next.scheduler?.entries.find(
      (e) => !state.scheduler?.entries.some((prev) => prev.taskId === e.taskId),
    );
    const taskId = newEntry?.taskId;

    const remainingTaskIds = new Set(next.scheduler?.entries.map((e) => e.taskId) ?? []);
    const preservedBlocked = state.lastBlockedRecords.filter((b) =>
      remainingTaskIds.has(b.taskId),
    );

    set({
      ...applySnapshotPatch(next),
      lastBlockedRecords: preservedBlocked,
    });

    return { ok: true, taskId };
  },

  setWorkerModelUrl: (workerId, modelUrl) =>
    set((state) => {
      const worker = state.workers[workerId];
      if (!worker) return state;
      const nextErrors = { ...state.avatarLoadErrors };
      delete nextErrors[workerId];

      return {
        avatarLoadErrors: nextErrors,
        workers: {
          ...state.workers,
          [workerId]: {
            ...worker,
            avatarConfig: {
              ...worker.avatarConfig,
              modelUrl,
            },
          },
        },
      };
    }),

  recordAvatarModelError: (workerId, modelUrl, errorMessage) =>
    set((state) => {
      if (state.avatarLoadErrors[workerId] === errorMessage) {
        return state;
      }
      const worker = state.workers[workerId];
      const event = worker
        ? WorkerMockService.createEvent(state, {
            workerId: worker.id,
            workerName: worker.name,
            department: worker.department,
            type: 'SIMULATION_CONTROL',
            message: `[SIMULATED] Avatar GLB load fallback triggered for "${modelUrl}" (${errorMessage})`,
            accentColor: '#F59E0B',
          })
        : null;

      return {
        avatarLoadErrors: {
          ...state.avatarLoadErrors,
          [workerId]: errorMessage,
        },
        events: event ? WorkerMockService.appendEvent(state, event) : state.events,
      };
    }),

  clearAvatarModelError: (workerId) =>
    set((state) => {
      if (!state.avatarLoadErrors[workerId]) return state;
      const nextErrors = { ...state.avatarLoadErrors };
      delete nextErrors[workerId];
      return { avatarLoadErrors: nextErrors };
    }),

  tickSimulation: (stepSimMs = FIXED_TICK_SIM_MS) =>
    set((state) => {
      // Manual step advances exact stepSimMs even if globally paused, preserving isGlobalPaused
      const tempUnpaused: SimulationSnapshot = {
        ...state,
        isGlobalPaused: false,
      };
      const res = SimulationEngine.stepSimulationTickWithDiagnostics(tempUnpaused, stepSimMs);
      const diagPatch = syncDiagnostics(state, res.snapshot, res.dispatchResult);
      return {
        ...applySnapshotPatch(res.snapshot),
        ...diagPatch,
        isGlobalPaused: state.isGlobalPaused,
      };
    }),

  advanceByWallClock: (rawDeltaMs) =>
    set((state) => {
      if (state.isGlobalPaused) return state;
      const res = SimulationEngine.advanceByWallClockDeltaWithDiagnostics(state, rawDeltaMs);
      const diagPatch = syncDiagnostics(state, res.snapshot, res.lastDispatchResult);
      return {
        ...applySnapshotPatch(res.snapshot),
        ...diagPatch,
      };
    }),

  setGlobalPaused: (isPaused) =>
    set((state) => {
      let current: SimulationSnapshot = state;
      let latestDispatch: DispatchPassResult<SimulationSnapshot> | undefined;
      if (isPaused && !state.isGlobalPaused) {
        const pendingWallMs = SimulationEngine.getPendingRealtimeWallDeltaMs(
          performance.now(),
        );
        if (pendingWallMs > 0) {
          const advanceRes = SimulationEngine.advanceByWallClockDeltaWithDiagnostics(current, pendingWallMs);
          current = advanceRes.snapshot;
          latestDispatch = advanceRes.lastDispatchResult;
        }
      }
      const next = SimulationEngine.setGlobalPaused(current, isPaused);
      const diagPatch = syncDiagnostics(state, next, latestDispatch);
      return {
        ...applySnapshotPatch(next),
        ...diagPatch,
      };
    }),

  toggleGlobalPaused: () => {
    const currentlyPaused = get().isGlobalPaused;
    get().setGlobalPaused(!currentlyPaused);
  },

  setSimSpeedMultiplier: (speed) =>
    set((state) => {
      let current: SimulationSnapshot = state;
      let latestDispatch: DispatchPassResult<SimulationSnapshot> | undefined;
      if (!state.isGlobalPaused) {
        const now = performance.now();
        const pendingWallMs = SimulationEngine.getPendingRealtimeWallDeltaMs(now);
        if (pendingWallMs > 0) {
          const advanceRes = SimulationEngine.advanceByWallClockDeltaWithDiagnostics(current, pendingWallMs);
          current = advanceRes.snapshot;
          latestDispatch = advanceRes.lastDispatchResult;
        }
        SimulationEngine.syncRealtimeClockAnchor(
          { ...current, simSpeedMultiplier: speed },
          now,
          true,
        );
      }
      const diagPatch = syncDiagnostics(state, current, latestDispatch);
      return {
        ...applySnapshotPatch(current),
        ...diagPatch,
        simSpeedMultiplier: speed,
      };
    }),

  /**
   * Restores a deterministic zero-task baseline (`t = 0`, `prngState = seed`,
   * `tasks = {}`, `events = []`, all workers `IDLE` with zeroed metrics) whether
   * called while running, while globally paused, with active tasks, or with queued tasks.
   */
  resetSimulationWithSeed: (seed = DEFAULT_SIMULATION_SEED) => {
    const baseline = SimulationEngine.resetToBaseline(seed);
    set({
      ...applySnapshotPatch(baseline),
      avatarLoadErrors: {},
      selectedWorkerId: 'sonnet',
      selectedRoomId: 'room_analysis',
      lastBlockedRecords: [],
      lastDispatchDiagnosticsAtSimMs: null,
      lastDispatchDiagnosticsTickCount: null,
    });
  },

  assignMockTask: (input, templateIndex) =>
    set((state) => {
      const worker = state.workers[input.workerId];
      const nextIdx =
        templateIndex ??
        (worker
          ? worker.metrics.completedTasksCount + worker.taskQueueIds.length
          : state.tickCount);
      const next = WorkerMockService.assignTask(state, input, nextIdx);
      return applySnapshotPatch(next);
    }),

  pauseWorker: (workerId) =>
    set((state) => {
      const next = SimulationEngine.pauseWorker(state, workerId);
      return applySnapshotPatch(next);
    }),

  resumeWorker: (workerId) =>
    set((state) => {
      const res = SimulationEngine.resumeWorkerWithDiagnostics(state, workerId);
      const diagPatch = syncDiagnostics(state, res.snapshot, res.dispatchResult);
      return {
        ...applySnapshotPatch(res.snapshot),
        ...diagPatch,
      };
    }),

  toggleWorkerPause: (workerId) => {
    const worker = get().workers[workerId];
    if (!worker) return;
    if (worker.status === 'PAUSED') {
      get().resumeWorker(workerId);
    } else {
      get().pauseWorker(workerId);
    }
  },
}));

/**
 * Pure selector helpers for enriched global scheduler queue entries (WAITING & BLOCKED)
 */
export interface EnrichedQueuedTask {
  readonly taskId: string;
  readonly sequence: number;
  readonly enqueuedAtSimMs: number;
  readonly task: TaskEntity | null;
  readonly priority: TaskPriority | 'UNKNOWN';
  readonly blockedRecord?: BlockedTaskRecord;
  readonly isBlocked: boolean;
  readonly waitDurationSimMs: number;
  readonly dispatchOrderIndex: number;
}

export function selectGlobalQueueEntries(
  scheduler: SchedulerSnapshotState | undefined,
  tasks: Record<string, TaskEntity>,
  lastBlocked: readonly BlockedTaskRecord[] = [],
  currentSimTimeMs = 0,
): readonly EnrichedQueuedTask[] {
  if (!scheduler || !Array.isArray(scheduler.entries) || scheduler.entries.length === 0) {
    return [];
  }

  const orderedItems = orderQueue(scheduler.entries, tasks);

  return orderedItems.map((item, index) => {
    const { entry, task } = item;
    const priority: TaskPriority | 'UNKNOWN' = task ? task.priority : 'UNKNOWN';
    const blockedRecord = lastBlocked.find((b) => b.taskId === entry.taskId);
    const waitDurationSimMs = Math.max(0, currentSimTimeMs - entry.enqueuedAtSimMs);

    return {
      taskId: entry.taskId,
      sequence: entry.sequence,
      enqueuedAtSimMs: entry.enqueuedAtSimMs,
      task,
      priority,
      blockedRecord,
      isBlocked: Boolean(blockedRecord),
      waitDurationSimMs,
      dispatchOrderIndex: index + 1,
    };
  });
}

/**
 * Pure selector helpers for pool task execution and completion history (RUNNING, COMPLETED, FAILED)
 */
export interface GlobalTaskActivityItem {
  readonly task: TaskEntity;
  readonly lifecycleStatus: TaskLifecycleStatus;
  readonly assignedWorkerId: WorkerId | null;
  readonly progress: number;
  readonly lastActiveSimMs: number;
}

export function selectGlobalTaskActivity(
  tasks: Record<string, TaskEntity>,
  scheduler: SchedulerSnapshotState | undefined,
  limit = 20,
): readonly GlobalTaskActivityItem[] {
  const queuedTaskIds = new Set(scheduler?.entries.map((e) => e.taskId) ?? []);

  const poolTasks: GlobalTaskActivityItem[] = [];

  for (const task of Object.values(tasks)) {
    // Only pool tasks
    if (!task.id.startsWith('tsk_pool_')) continue;
    // Must not be currently in scheduler queue
    if (queuedTaskIds.has(task.id)) continue;

    // Filter strictly to RUNNING, COMPLETED, FAILED
    const ls = task.lifecycleStatus;
    if (ls !== 'RUNNING' && ls !== 'COMPLETED' && ls !== 'FAILED') {
      continue;
    }

    // For RUNNING tasks, require assignedWorkerId !== null
    if (ls === 'RUNNING' && task.assignedWorkerId === null) {
      continue;
    }

    const timestampCandidates =
      ls === 'RUNNING'
        ? [task.startedAtSimMs, task.createdAtSimMs]
        : ls === 'COMPLETED'
          ? [task.completedAtSimMs, task.updatedAt, task.startedAtSimMs, task.createdAtSimMs]
          : [
              task.error?.occurredAtSimMs,
              task.updatedAt,
              task.completedAtSimMs,
              task.startedAtSimMs,
              task.createdAtSimMs,
            ];
    const lastActiveSimMs =
      timestampCandidates.find(
        (value): value is number =>
          typeof value === 'number' && Number.isFinite(value) && value >= 0,
      ) ?? 0;

    poolTasks.push({
      task,
      lifecycleStatus: ls,
      assignedWorkerId: task.assignedWorkerId,
      progress: Math.round(task.progress),
      lastActiveSimMs,
    });
  }

  // Sort newest activity first; use code-unit task ID order for deterministic ties.
  poolTasks.sort((a, b) => {
    const timestampOrder = b.lastActiveSimMs - a.lastActiveSimMs;
    if (timestampOrder !== 0) return timestampOrder;
    if (a.task.id < b.task.id) return -1;
    if (a.task.id > b.task.id) return 1;
    return 0;
  });

  return poolTasks.slice(0, Math.max(1, limit));
}

/**
 * Pure selector helpers for aggregated SIMULATED office telemetry
 */
export function selectGlobalSimulatedTotals(
  workers: Record<WorkerId, WorkerEntity>,
  tasks: Record<string, TaskEntity>,
  scheduler?: SchedulerSnapshotState,
) {
  let totalTokens = 0;
  let totalCostUsd = 0;
  let totalCompleted = 0;
  let activeWorkersCount = 0;
  let pausedWorkersCount = 0;

  for (const worker of Object.values(workers)) {
    totalTokens += worker.metrics.simulatedTokens;
    totalCostUsd += worker.metrics.simulatedCostUsd;
    totalCompleted += worker.metrics.completedTasksCount;
    if (
      worker.status === 'BUSY' ||
      worker.status === 'WALKING' ||
      worker.status === 'TASK_RECEIVED'
    ) {
      activeWorkersCount += 1;
    }
    if (worker.status === 'PAUSED') {
      pausedWorkersCount += 1;
    }
  }

  const totalQueued =
    (scheduler?.entries.length ?? 0) +
    Object.values(workers).reduce(
      (sum, worker) => sum + (worker.taskQueueIds?.length ?? 0),
      0,
    );

  const activeTasksCount = Object.values(tasks).filter(
    (task) => task.lifecycleStatus === 'RUNNING',
  ).length;

  return {
    totalTokens,
    totalCostUsd: Number(totalCostUsd.toFixed(4)),
    totalCompleted,
    totalQueued,
    activeWorkersCount,
    pausedWorkersCount,
    activeTasksCount,
    isSimulated: true as const,
  };
}
