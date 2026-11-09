import { create } from 'zustand';

export type WorkerDisplayMode = 'DEMO' | 'LIVE';

interface WorkerDisplayModeState {
  readonly mode: WorkerDisplayMode;
  setMode: (mode: WorkerDisplayMode) => void;
}

export const useWorkerDisplayModeStore = create<WorkerDisplayModeState>((set) => ({
  // Safe by default: a fresh browser session never pretends to be connected LIVE.
  mode: 'DEMO',
  setMode: (mode) => set((state) => state.mode === mode ? state : { mode }),
}));

/** LIVE mode must never advance the deterministic DEMO clock. */
export function shouldRunSimulationClock(
  mode: WorkerDisplayMode,
  isGlobalPaused: boolean,
): boolean {
  return mode === 'DEMO' && !isGlobalPaused;
}
