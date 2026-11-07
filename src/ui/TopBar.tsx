import {
  Activity,
  ListOrdered,
  Pause,
  Play,
  RotateCcw,
  StepForward,
  Users,
} from 'lucide-react';
import {
  formatSimulatedCost,
  formatSimDuration,
  formatTokens,
} from '../utils/formatters';
import {
  selectGlobalSimulatedTotals,
  useOfficeStore,
} from '../workers/worker.state';

/**
 * TopBar Component (Single-Row Command Center Header)
 * Provides SIREADER Virtual Office identity, explicit SIMULATED telemetry counters,
 * and deterministic Simulation Engine controls (Play/Pause, Speed, Manual Step, Seed Reset).
 */

export function TopBar() {
  const workers = useOfficeStore((s) => s.workers);
  const tasks = useOfficeStore((s) => s.tasks);
  const simTimeMs = useOfficeStore((s) => s.simTimeMs);
  const isGlobalPaused = useOfficeStore((s) => s.isGlobalPaused);
  const simSpeedMultiplier = useOfficeStore((s) => s.simSpeedMultiplier);
  const isRosterOpen = useOfficeStore((s) => s.isRosterOpen);
  const isActivityFeedOpen = useOfficeStore((s) => s.isActivityFeedOpen);
  const scheduler = useOfficeStore((s) => s.scheduler);
  const isGlobalQueueOpen = useOfficeStore((s) => s.isGlobalQueueOpen);
  const toggleGlobalQueueOpen = useOfficeStore((s) => s.toggleGlobalQueueOpen);

  const toggleGlobalPaused = useOfficeStore((s) => s.toggleGlobalPaused);
  const setSimSpeedMultiplier = useOfficeStore((s) => s.setSimSpeedMultiplier);
  const tickSimulation = useOfficeStore((s) => s.tickSimulation);
  const resetSimulationWithSeed = useOfficeStore((s) => s.resetSimulationWithSeed);
  const setRosterOpen = useOfficeStore((s) => s.setRosterOpen);
  const setActivityFeedOpen = useOfficeStore((s) => s.setActivityFeedOpen);

  const totals = selectGlobalSimulatedTotals(workers, tasks, scheduler);

  return (
    <header className="relative z-30 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2 min-h-12 bg-[#090F1D] border-b border-slate-800/90 text-slate-100 shrink-0 xl:flex-nowrap xl:gap-4 xl:px-4 xl:py-0 xl:h-12">
      {/* Zone 1: Brand Identity & Simulation Mode Notice */}
      <div className="flex items-center gap-2.5 shrink-0">
        <span className="w-2.5 h-2.5 rounded-sm bg-cyan-400 shrink-0" />
        <span className="text-sm font-bold tracking-tight text-white whitespace-nowrap">
          SIREADER Virtual Office
        </span>
        <span className="text-slate-600" aria-hidden="true">
          ·
        </span>
        <span
          className="font-mono text-[10px] font-semibold tracking-wider text-cyan-300 whitespace-nowrap"
          data-testid="simulated-mode-indicator"
        >
          SIMULATION MODE
        </span>
      </div>

      {/* Zone 2: Global Simulated Office Telemetry (All explicitly marked SIMULATED) */}
      <div
        role="group"
        aria-label="Global Simulated Metrics"
        className="hidden lg:flex items-center gap-3.5 text-[11px] text-slate-300 whitespace-nowrap"
      >
        <div className="flex items-center gap-1">
          <span className="text-slate-400">Sim Clock:</span>
          <span
            className="font-mono font-semibold text-white"
            data-testid="sim-clock-value"
          >
            {formatSimDuration(simTimeMs)}
          </span>
        </div>
        <span className="text-slate-700" aria-hidden="true">
          ·
        </span>
        <div className="flex items-center gap-1">
          <span className="text-slate-400">Active:</span>
          <span className="font-mono font-semibold text-cyan-300">
            {totals.activeWorkersCount}/7
          </span>
          {totals.pausedWorkersCount > 0 && (
            <span className="font-mono text-[10px] text-amber-400">
              ({totals.pausedWorkersCount} Paused)
            </span>
          )}
        </div>
        <span className="text-slate-700" aria-hidden="true">
          ·
        </span>
        <div className="flex items-center gap-1">
          <span className="text-slate-400">Queued Total (SIMULATED):</span>
          <span
            className="font-mono font-semibold text-sky-300"
            data-testid="global-queued-count"
          >
            {totals.totalQueued}
          </span>
        </div>
        <span className="text-slate-700" aria-hidden="true">
          ·
        </span>
        <div className="flex items-center gap-1">
          <span className="text-slate-400">Tokens (SIMULATED):</span>
          <span
            className="font-mono font-semibold text-emerald-300"
            data-testid="global-sim-tokens"
          >
            {formatTokens(totals.totalTokens)}
          </span>
        </div>
        <span className="text-slate-700" aria-hidden="true">
          ·
        </span>
        <div className="flex items-center gap-1">
          <span className="text-slate-400">Cost (SIMULATED):</span>
          <span
            className="font-mono font-semibold text-violet-300"
            data-testid="global-sim-cost"
          >
            {formatSimulatedCost(totals.totalCostUsd)}
          </span>
        </div>
      </div>

      {/* Zone 3: Simulation Engine & Drawer Controls */}
      <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-2 xl:w-auto xl:flex-nowrap xl:shrink-0 xl:justify-end">
        {/* Roster & Feed Drawer Toggles */}
        <div role="group" aria-label="Office panel controls" className="flex flex-wrap sm:flex-nowrap items-center gap-1 bg-slate-900/90 p-0.5 rounded-md border border-slate-800">
          <button
            type="button"
            data-testid="toggle-global-queue-btn"
            onClick={toggleGlobalQueueOpen}
            className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
              isGlobalQueueOpen
                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40'
                : 'text-slate-400 hover:text-white'
            }`}
            aria-label="Toggle Global Task Queue Panel"
            aria-pressed={isGlobalQueueOpen}
          >
            <ListOrdered className="w-3 h-3" />
            <span data-testid="topbar-pool-queue-count">Pool Queue ({scheduler?.entries.length ?? 0})</span>
          </button>
          <button
            type="button"
            onClick={() => setRosterOpen(!isRosterOpen)}
            className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
              isRosterOpen
                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40'
                : 'text-slate-400 hover:text-white'
            }`}
            aria-label="Toggle Worker Roster"
            aria-pressed={isRosterOpen}
          >
            <Users className="w-3 h-3" />
            <span>Roster</span>
          </button>
          <button
            type="button"
            onClick={() => setActivityFeedOpen(!isActivityFeedOpen)}
            className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
              isActivityFeedOpen
                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40'
                : 'text-slate-400 hover:text-white'
            }`}
            aria-label="Toggle Simulated Activity Feed"
            aria-pressed={isActivityFeedOpen}
          >
            <Activity className="w-3 h-3" />
            <span>Feed</span>
          </button>
        </div>

        {/* Simulation Clock Controls */}
        <div role="group" aria-label="Simulation controls" className="flex flex-wrap sm:flex-nowrap items-center gap-1 bg-slate-900/90 p-0.5 rounded-md border border-slate-800">
          <button
            type="button"
            onClick={toggleGlobalPaused}
            className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded transition-colors cursor-pointer whitespace-nowrap ${
              isGlobalPaused
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
            }`}
            aria-label={isGlobalPaused ? 'Resume Global Simulation' : 'Pause Global Simulation'}
            aria-pressed={isGlobalPaused}
          >
            {isGlobalPaused ? (
              <>
                <Play className="w-3 h-3" />
                <span>Resume Sim</span>
              </>
            ) : (
              <>
                <Pause className="w-3 h-3" />
                <span>Global Pause</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => tickSimulation(500)}
            className="flex items-center gap-0.5 px-2 py-1 text-[11px] font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors cursor-pointer whitespace-nowrap"
            title="Advance Simulation Clock by +500ms deterministically"
            aria-label="Step Simulation +500ms"
          >
            <StepForward className="w-3 h-3" />
            <span className="font-mono">+0.5s</span>
          </button>

          {([1, 2, 4] as const).map((spd) => (
            <button
              key={spd}
              type="button"
              onClick={() => setSimSpeedMultiplier(spd)}
              className={`px-2 py-1 font-mono text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                simSpeedMultiplier === spd
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              aria-label={`Simulation speed ${spd}x`}
              aria-pressed={simSpeedMultiplier === spd}
              data-testid={`simulation-speed-${spd}x`}
            >
              {spd}x
            </button>
          ))}

          <button
            type="button"
            onClick={() => resetSimulationWithSeed()}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors cursor-pointer whitespace-nowrap"
            title="Reset deterministic simulation to initial seed"
            aria-label="Reset Simulation Seed"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>
        </div>
      </div>
    </header>
  );
}
