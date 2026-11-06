import { create } from 'zustand';
import {
  DEFAULT_SIMULATION_SEED,
  FIXED_TICK_SIM_MS,
  SimulationEngine,
} from './simulation.engine';
import { AssignTaskInput, WorkerMockService } from './worker.mock-service';
import {
  ActivityEvent,
  RoomId,
  SimulationSnapshot,
  TaskEntity,
  WorkerEntity,
  WorkerId,
} from './worker.types';

/**
 * Central Zustand Store for SIREADER Virtual Office (Phase 1 — Local Simulation Only)
 * Strictly decoupled from 3D per-frame rendering (`useFrame` uses refs only).
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
  | 'isGlobalPaused'
  | 'simSpeedMultiplier'
  | 'workers'
  | 'workerOrder'
  | 'tasks'
  | 'events'
> {
  return {
    seed: snapshot.seed,
    prngState: snapshot.prngState,
    simTimeMs: snapshot.simTimeMs,
    tickCount: snapshot.tickCount,
    isGlobalPaused: snapshot.isGlobalPaused,
    simSpeedMultiplier: snapshot.simSpeedMultiplier,
    workers: snapshot.workers,
    workerOrder: snapshot.workerOrder,
    tasks: snapshot.tasks,
    events: snapshot.events,
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

  tickSimulation: (stepSimMs = FIXED_TICK_SIM_MS) =>
    set((state) => {
      // Allow manual step even when global pause is active if explicitly stepped by user
      const tempUnpaused: SimulationSnapshot = {
        ...state,
        isGlobalPaused: false,
      };
      const next = SimulationEngine.stepSimulationTick(tempUnpaused, stepSimMs);
      return {
        ...applySnapshotPatch(next),
        isGlobalPaused: state.isGlobalPaused,
      };
    }),

  advanceByWallClock: (rawDeltaMs) =>
    set((state) => {
      if (state.isGlobalPaused) return state;
      const next = SimulationEngine.advanceByWallClockDelta(state, rawDeltaMs);
      return applySnapshotPatch(next);
    }),

  setGlobalPaused: (isPaused) =>
    set((state) => {
      const next = SimulationEngine.setGlobalPaused(state, isPaused);
      return applySnapshotPatch(next);
    }),

  toggleGlobalPaused: () =>
    set((state) => {
      const next = SimulationEngine.setGlobalPaused(state, !state.isGlobalPaused);
      return applySnapshotPatch(next);
    }),

  setSimSpeedMultiplier: (speed) => set({ simSpeedMultiplier: speed }),

  resetSimulationWithSeed: (seed = DEFAULT_SIMULATION_SEED) => {
    const fresh = SimulationEngine.createInitialSnapshot(seed);
    set({
      ...applySnapshotPatch(fresh),
      selectedWorkerId: 'sonnet',
      selectedRoomId: 'room_analysis',
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
      const next = SimulationEngine.resumeWorker(state, workerId);
      return applySnapshotPatch(next);
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
 * Pure selector helpers for aggregated SIMULATED office telemetry
 */
export function selectGlobalSimulatedTotals(
  workers: Record<WorkerId, WorkerEntity>,
  tasks: Record<string, TaskEntity>,
) {
  let totalTokens = 0;
  let totalCostUsd = 0;
  let totalCompleted = 0;
  let totalQueued = 0;
  let activeWorkersCount = 0;
  let pausedWorkersCount = 0;

  for (const worker of Object.values(workers)) {
    totalTokens += worker.metrics.simulatedTokens;
    totalCostUsd += worker.metrics.simulatedCostUsd;
    totalCompleted += worker.metrics.completedTasksCount;
    totalQueued += worker.taskQueueIds.length;
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

  const activeTasksCount = Object.values(tasks).filter(
    (t) => t.status !== 'QUEUED' && t.status !== 'COMPLETED' && t.status !== 'FAILED',
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
