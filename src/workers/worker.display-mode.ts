import { create } from 'zustand';

export type WorkerDisplayMode = 'DEMO' | 'LIVE';

interface WorkerDisplayModeState {
  readonly mode: WorkerDisplayMode;
  readonly selectedLiveWorkerId: string | null;
  setMode: (mode: WorkerDisplayMode) => void;
  setSelectedLiveWorkerId: (workerId: string | null) => void;
}

export const useWorkerDisplayModeStore = create<WorkerDisplayModeState>((set) => ({
  // Safe by default: a fresh browser session never pretends to be connected LIVE.
  mode: 'DEMO',
  selectedLiveWorkerId: null,
  setMode: (mode) => set((state) => state.mode === mode ? state : { mode }),
  setSelectedLiveWorkerId: (selectedLiveWorkerId) => set((state) =>
    state.selectedLiveWorkerId === selectedLiveWorkerId ? state : { selectedLiveWorkerId },
  ),
}));

/** LIVE mode must never advance the deterministic DEMO clock. */
export function shouldRunSimulationClock(
  mode: WorkerDisplayMode,
  isGlobalPaused: boolean,
): boolean {
  return mode === 'DEMO' && !isGlobalPaused;
}
