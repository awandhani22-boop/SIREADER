import {
  Camera,
  ChevronLeft,
  ChevronRight,
  FastForward,
  Layers,
  Users,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import React, { useEffect, useRef } from 'react';
import { OfficeScene } from '../scene/OfficeScene';
import { ActivityFeed } from '../ui/ActivityFeed';
import { TopBar } from '../ui/TopBar';
import { WorkerPanel } from '../ui/WorkerPanel';
import { GlobalQueuePanel } from '../ui/GlobalQueuePanel';
import { recordWorkerComponentRender } from '../utils/renderProfiler';
import {
  FIXED_TICK_SIM_MS,
  SimulationEngine,
} from '../workers/simulation.engine';
import { useOfficeStore } from '../workers/worker.state';
import { WorkerId } from '../workers/worker.types';

/**
 * Granular Memoized Roster Worker Item (Phase 1.1 Fix C)
 * Subscribes exclusively to a single worker, its active task, and its selection state
 * so updating one worker never causes all 7 roster items to re-render.
 */
export const RosterWorkerItem = React.memo(function RosterWorkerItem({
  workerId,
}: {
  workerId: WorkerId;
}) {
  recordWorkerComponentRender(workerId, 'roster');

  const worker = useOfficeStore((s) => s.workers[workerId]);
  const activeTaskId = worker?.currentTaskId ?? null;
  const activeTask = useOfficeStore((s) =>
    activeTaskId ? s.tasks[activeTaskId] ?? null : null,
  );
  const isSelected = useOfficeStore((s) => s.selectedWorkerId === workerId);
  const selectWorker = useOfficeStore((s) => s.selectWorker);

  if (!worker) return null;

  return (
    <button
      type="button"
      data-testid={`roster-worker-${worker.id}`}
      onClick={() => selectWorker(worker.id)}
      className={`w-full flex flex-col gap-0.5 p-2 rounded-md border text-left transition-all cursor-pointer ${
        isSelected
          ? 'bg-slate-900 border-cyan-400/80 shadow-[0_0_12px_rgba(6,182,212,0.2)]'
          : 'bg-slate-900/60 border-slate-800/90 hover:bg-slate-900 hover:border-slate-700'
      }`}
      aria-label={`Select ${worker.name} in ${worker.department}`}
    >
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="w-2 h-2 rounded-sm shrink-0"
            style={{ backgroundColor: worker.avatarConfig.accentColor }}
          />
          <span className="text-xs font-semibold text-white truncate">
            {worker.name}
          </span>
        </div>
        <span
          className={`font-mono text-[9px] font-semibold px-1.5 py-0.5 rounded border shrink-0 ${
            worker.status === 'PAUSED'
              ? 'bg-amber-950 text-amber-300 border-amber-500/40'
              : worker.status === 'BUSY' ||
                  worker.status === 'WALKING' ||
                  worker.status === 'TASK_RECEIVED'
                ? 'bg-cyan-950 text-cyan-300 border-cyan-500/40'
                : 'bg-slate-800 text-slate-400 border-slate-700'
          }`}
        >
          {worker.status}
        </span>
      </div>

      <div className="flex items-center justify-between text-[10px] text-slate-400">
        <span className="truncate">{worker.department}</span>
        <span className="font-mono text-slate-400 shrink-0">
          Queue: {worker.taskQueueIds.length}
        </span>
      </div>

      {activeTask && (
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <span className="font-mono text-[9px] text-sky-300 truncate">
            {activeTask.status}: {activeTask.title}
          </span>
          <span className="font-mono text-[9px] text-slate-300 shrink-0">
            {Math.round(activeTask.progress)}%
          </span>
        </div>
      )}
    </button>
  );
});

/**
 * OfficeApp Shell (SIREADER Virtual Office — Phase 1.1 Final Audit)
 * Integrates:
 * 1. Unified SimulationEngine Clock Anchor (`SimulationEngine.syncRealtimeClockAnchor`)
 *    so `SimulationEngine` is the single source of truth for both discrete task ticks
 *    and continuous 3D avatar animation time without 60Hz React state updates.
 * 2. Full-viewport 3D Isometric Virtual Office (`OfficeScene`).
 * 3. Accessible HTML Command-Center Overlay (`TopBar`, Top-Center Isometric Camera
 *    Dock, Collapsible Department/Worker Roster, `WorkerPanel` Profile Drawer,
 *    and `ActivityFeed`).
 */

export function OfficeApp() {
  const isGlobalPaused = useOfficeStore((s) => s.isGlobalPaused);
  const simSpeedMultiplier = useOfficeStore((s) => s.simSpeedMultiplier);
  const advanceByWallClock = useOfficeStore((s) => s.advanceByWallClock);
  const workerOrder = useOfficeStore((s) => s.workerOrder);
  const selectedWorkerId = useOfficeStore((s) => s.selectedWorkerId);
  const isGlobalQueueOpen = useOfficeStore((s) => s.isGlobalQueueOpen);
  const isRosterOpen = useOfficeStore((s) => s.isRosterOpen);
  const graphicsPreset = useOfficeStore((s) => s.graphicsPreset);
  const reducedMotion = useOfficeStore((s) => s.reducedMotion);

  const setRosterOpen = useOfficeStore((s) => s.setRosterOpen);
  const triggerCameraReset = useOfficeStore((s) => s.triggerCameraReset);
  const triggerCameraZoom = useOfficeStore((s) => s.triggerCameraZoom);
  const setGraphicsPreset = useOfficeStore((s) => s.setGraphicsPreset);
  const setReducedMotion = useOfficeStore((s) => s.setReducedMotion);

  const lastTickWallMsRef = useRef<number>(performance.now());

  // Unified simulation clock interval anchored to SimulationEngine
  useEffect(() => {
    const startWallNow = performance.now();
    lastTickWallMsRef.current = startWallNow;
    SimulationEngine.syncRealtimeClockAnchor(
      useOfficeStore.getState(),
      startWallNow,
      !isGlobalPaused,
    );

    if (isGlobalPaused) return;

    const intervalId = window.setInterval(() => {
      const now = performance.now();
      const rawDelta = now - lastTickWallMsRef.current;
      lastTickWallMsRef.current = now;
      advanceByWallClock(rawDelta);
      SimulationEngine.syncRealtimeClockAnchor(
        useOfficeStore.getState(),
        now,
        true,
      );
    }, FIXED_TICK_SIM_MS);

    return () => {
      window.clearInterval(intervalId);
      SimulationEngine.syncRealtimeClockAnchor(
        useOfficeStore.getState(),
        performance.now(),
        false,
      );
    };
  }, [isGlobalPaused, simSpeedMultiplier, advanceByWallClock]);

  return (
    <div className="relative w-screen h-screen flex flex-col bg-[#070C18] text-slate-100 overflow-hidden">
      {/* Top Command Bar */}
      <TopBar />

      {/* Main Workspace Area: 3D Isometric World + Accessible Overlay Drawers */}
      <main className="relative flex-1 min-h-0 w-full overflow-hidden">
        {/* Central 3D Isometric Office Viewport */}
        <OfficeScene />

        {/* Top-Center Floating Isometric Camera & Graphics Dock */}
        <div
          role="group"
          aria-label="Isometric Camera and Graphics Controls"
          className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center justify-center gap-1 px-2 py-1 bg-[#0B1220] border border-slate-800/95 rounded-lg shadow-xl pointer-events-auto sm:max-w-none sm:flex-nowrap"
        >
          <button
            type="button"
            onClick={() => triggerCameraZoom(4)}
            className="flex items-center gap-1 px-1 sm:px-2 py-1 text-[11px] font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors cursor-pointer whitespace-nowrap"
            aria-label="Zoom In Camera"
          >
            <ZoomIn className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Zoom In</span>
          </button>
          <button
            type="button"
            onClick={() => triggerCameraZoom(-4)}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors cursor-pointer whitespace-nowrap"
            aria-label="Zoom Out Camera"
          >
            <ZoomOut className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Zoom Out</span>
          </button>
          <button
            type="button"
            onClick={triggerCameraReset}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors cursor-pointer whitespace-nowrap"
            aria-label="Reset Isometric View"
          >
            <Camera className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Reset Isometric View</span>
          </button>
          <span className="text-slate-700 px-0.5" aria-hidden="true">
            |
          </span>
          <button
            type="button"
            onClick={() =>
              setGraphicsPreset(graphicsPreset === 'high' ? 'balanced' : 'high')
            }
            className="flex items-center gap-1 px-1 sm:px-2 py-1 font-mono text-[10px] font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors cursor-pointer whitespace-nowrap"
            aria-label="Switch Graphics Preset"
            aria-pressed={graphicsPreset === 'high'}
          >
            <Layers className="w-3 h-3 text-sky-400" />
            <span className="hidden sm:inline">{graphicsPreset === 'high' ? 'GFX:High' : 'GFX:Balanced'}</span>
          </button>
          <button
            type="button"
            onClick={() => setReducedMotion(!reducedMotion)}
            className={`flex items-center gap-1 px-1 sm:px-2 py-1 font-mono text-[10px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
              reducedMotion
                ? 'bg-violet-500/25 text-violet-200 border border-violet-500/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            aria-label="Toggle Reduced Motion"
            aria-pressed={reducedMotion}
          >
            <FastForward className="w-3 h-3" />
            <span className="hidden sm:inline">{reducedMotion ? 'Motion:Reduced' : 'Motion:Full'}</span>
          </button>
        </div>

        {/* Left Collapsible Accessible Worker & Department Roster */}
        <div className="absolute top-3 left-3 z-20 flex items-start gap-1.5 max-h-[calc(100%-245px)] pointer-events-none">
          {isRosterOpen ? (
            <nav
              aria-label="Department and Worker Roster"
              data-testid="worker-roster-panel"
              className="w-60 max-h-full flex flex-col bg-[#0B1220] border border-slate-800/95 rounded-lg shadow-2xl overflow-hidden pointer-events-auto"
            >
              <div className="flex items-center justify-between px-3 py-2 bg-[#080E1A] border-b border-slate-800">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                  <Users className="w-3.5 h-3.5 text-cyan-400" />
                  <span>7 AI Workers · Roster</span>
                </div>
                <button
                  type="button"
                  onClick={() => setRosterOpen(false)}
                  className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors cursor-pointer"
                  aria-label="Collapse Worker Roster"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                {workerOrder.map((workerId) => (
                  <RosterWorkerItem key={workerId} workerId={workerId} />
                ))}
              </div>
            </nav>
          ) : (
            <button
              type="button"
              onClick={() => setRosterOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-2 bg-[#0B1220] border border-slate-800 rounded-lg text-xs font-semibold text-slate-200 hover:text-white hover:border-cyan-500/50 shadow-xl pointer-events-auto cursor-pointer"
              aria-label="Expand Worker Roster"
            >
              <Users className="w-3.5 h-3.5 text-cyan-400" />
              <span>Roster (7)</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Bottom-Left Simulated Activity Feed */}
        <div className="absolute bottom-0 left-3 z-20 pointer-events-auto max-w-[calc(100vw-24px)]">
          <ActivityFeed />
        </div>

        {/* Right Selected Worker Detail Drawer (hidden when Global Queue Drawer is open) */}
        {selectedWorkerId && !isGlobalQueueOpen && (
          <div className="absolute top-0 right-0 bottom-0 z-20 flex pointer-events-auto max-w-full">
            <WorkerPanel />
          </div>
        )}

        {/* Right Global Task Queue Drawer */}
        {isGlobalQueueOpen && (
          <div className="absolute top-0 right-0 bottom-0 z-20 flex pointer-events-auto max-w-full">
            <GlobalQueuePanel />
          </div>
        )}
      </main>
    </div>
  );
}
