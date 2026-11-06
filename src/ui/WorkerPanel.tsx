import {
  AlertTriangle,
  Box,
  CheckCircle2,
  Clock,
  Cpu,
  Layers,
  ListTodo,
  Terminal,
  X,
} from 'lucide-react';
import {
  formatProgressPercent,
  formatSimulatedCost,
  formatSimDuration,
  formatTokens,
} from '../utils/formatters';
import { getWorkerCapabilityProfile } from '../workers/worker.capabilities';
import { useOfficeStore } from '../workers/worker.state';
import { WorkerControls } from './WorkerControls';

/**
 * WorkerPanel Component (Selected Worker Profile Drawer — Phase 1.1 & Phase 2.1)
 * Displays:
 * - Worker Identity, Role, Department, Workstation
 * - Explicit separation between Worker Status (`BUSY`/`IDLE`/`PAUSED`) and
 *   Current Task Status (`ROUTING`/`EXTRACTING`/`ANALYZING`/`VALIDATING`/`ARCHIVING`)
 * - Deterministic Task Progress bar & Stage Pipeline
 * - Task Queue (`QUEUED` items)
 * - Read-only Official Worker Capabilities (`WorkerCapabilityProfile`)
 * - Honest Character Asset & Rig Configuration (`PLACEHOLDER AVATAR — GLB READY`
 *   plus isolated GLB fallback diagnostics when a model URL fails to load)
 * - Simulated Telemetry (`SIMULATED` tokens & cost)
 */

export function WorkerPanel() {
  const selectedWorkerId = useOfficeStore((s) => s.selectedWorkerId);
  const worker = useOfficeStore((s) =>
    s.selectedWorkerId ? s.workers[s.selectedWorkerId] ?? null : null,
  );
  const tasks = useOfficeStore((s) => s.tasks);
  const avatarError = useOfficeStore((s) =>
    s.selectedWorkerId ? s.avatarLoadErrors[s.selectedWorkerId] ?? null : null,
  );
  const selectWorker = useOfficeStore((s) => s.selectWorker);
  const setWorkerModelUrl = useOfficeStore((s) => s.setWorkerModelUrl);

  if (!selectedWorkerId || !worker) {
    return null;
  }

  const capabilityProfile = getWorkerCapabilityProfile(worker.id);
  const activeTask = worker.currentTaskId
    ? tasks[worker.currentTaskId] ?? null
    : null;
  const queuedTasks = worker.taskQueueIds
    .map((id) => tasks[id])
    .filter((t): t is NonNullable<typeof t> => Boolean(t));
  const completedTasks = worker.completedTaskIds
    .slice(0, 4)
    .map((id) => tasks[id])
    .filter((t): t is NonNullable<typeof t> => Boolean(t));

  return (
    <aside
      aria-label="Selected Worker Profile Panel"
      data-testid="worker-profile-panel"
      className="w-full sm:w-[390px] max-h-full flex flex-col bg-[#0B1220] border-l border-slate-800/95 text-slate-100 shadow-2xl overflow-hidden"
    >
      {/* Header: Worker Identity & Department */}
      <div className="flex items-start justify-between gap-3 p-4 border-b border-slate-800/90 bg-[#080E1A]">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span
              className="w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ backgroundColor: worker.avatarConfig.accentColor }}
            />
            <span className="font-mono font-semibold text-slate-300">
              {worker.avatarConfig.badgeCode}
            </span>
            <span aria-hidden="true">·</span>
            <span className="truncate">{worker.department}</span>
          </div>
          <h2 className="text-lg font-bold tracking-tight text-white mt-0.5">
            {worker.name}
          </h2>
          <p className="text-xs text-slate-400">{worker.role}</p>
        </div>

        <button
          type="button"
          onClick={() => selectWorker(null)}
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
          aria-label="Close Worker Profile Panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 1. Explicit Worker Status vs Current Task Status Card */}
        <section
          aria-label="Worker and Task Status Separation"
          className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 space-y-2.5"
        >
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium">Worker Status</span>
            <span
              data-testid="selected-worker-status"
              className={`font-mono text-xs font-semibold px-2 py-0.5 rounded border ${
                worker.status === 'PAUSED'
                  ? 'bg-amber-950/90 text-amber-300 border-amber-500/40'
                  : worker.status === 'BUSY' ||
                      worker.status === 'WALKING' ||
                      worker.status === 'TASK_RECEIVED'
                    ? 'bg-cyan-950/90 text-cyan-300 border-cyan-500/40'
                    : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}
            >
              {worker.status}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium">Current Task Status</span>
            <span
              data-testid="selected-task-status"
              className="font-mono text-xs font-semibold text-sky-300"
            >
              {activeTask ? activeTask.status : 'NONE (IDLE)'}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium">Next Queue Status</span>
            <span
              data-testid="selected-queue-status"
              className="font-mono text-xs text-slate-300"
            >
              {queuedTasks.length > 0
                ? `${queuedTasks.length} QUEUED`
                : '0 QUEUED (EMPTY)'}
            </span>
          </div>
        </section>

        {/* 2. Active Task Detail & Deterministic Stage Progress */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-cyan-400" />
              <span>Active Simulated Task</span>
            </h3>
            <span className="font-mono text-[10px] text-cyan-300">SIMULATED</span>
          </div>

          {activeTask ? (
            <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="text-xs font-semibold text-white">
                  {activeTask.title}
                </div>
                <span className="font-mono text-[10px] text-slate-400 shrink-0">
                  {activeTask.priority}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {activeTask.description}
              </p>

              {/* Deterministic Progress Bar */}
              <div className="space-y-1">
                <div className="flex items-center justify-between font-mono text-[11px]">
                  <span className="text-cyan-300 font-medium">
                    Stage: {activeTask.status}
                  </span>
                  <span
                    className="text-white font-semibold"
                    data-testid="active-task-progress"
                  >
                    {formatProgressPercent(activeTask.progress)}
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className="h-full transition-all duration-300"
                    style={{
                      width: `${Math.min(100, Math.max(0, activeTask.progress))}%`,
                      backgroundColor:
                        worker.status === 'PAUSED'
                          ? '#F59E0B'
                          : worker.avatarConfig.accentColor,
                    }}
                  />
                </div>
                <div className="flex items-center justify-between font-mono text-[10px] text-slate-400 pt-0.5">
                  <span>
                    Sim Elapsed: {formatSimDuration(activeTask.elapsedSimMs)} /{' '}
                    {formatSimDuration(activeTask.totalDurationSimMs)}
                  </span>
                  <span>
                    {formatTokens(activeTask.simulatedTokens)} /{' '}
                    {formatTokens(activeTask.targetTokens)} tok
                  </span>
                </div>
              </div>

              {/* Stage Threshold Pipeline */}
              <div className="flex items-center gap-1 pt-1 flex-wrap">
                {activeTask.stagePipeline.map((stage) => {
                  const isCurrentStage = activeTask.status === stage.status;
                  const isPassed = activeTask.progress >= stage.endPercent;
                  return (
                    <span
                      key={stage.status}
                      className={`font-mono text-[9px] px-1.5 py-0.5 rounded border ${
                        isCurrentStage
                          ? 'bg-cyan-950 text-cyan-200 border-cyan-400 font-semibold'
                          : isPassed
                            ? 'bg-slate-800/80 text-emerald-300 border-slate-700'
                            : 'bg-slate-950 text-slate-500 border-slate-800'
                      }`}
                    >
                      {stage.status} ({stage.startPercent}–{stage.endPercent}%)
                    </span>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800/80 text-xs text-slate-400">
              No active task currently running. Assign a mock task below or advance the simulation clock.
            </div>
          )}
        </section>

        {/* 3. Worker Task Queue List (`QUEUED` Entities) */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <ListTodo className="w-3.5 h-3.5 text-sky-400" />
              <span>Task Queue ({queuedTasks.length})</span>
            </h3>
            <span className="font-mono text-[10px] text-slate-400">
              FIFO · SIMULATED
            </span>
          </div>

          {queuedTasks.length > 0 ? (
            <div className="space-y-1.5" data-testid="worker-queue-list">
              {queuedTasks.map((qTask, index) => (
                <div
                  key={qTask.id}
                  className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-md bg-slate-900/75 border border-slate-800 text-xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] text-slate-400">
                        #{index + 1}
                      </span>
                      <span className="font-medium text-slate-200 truncate">
                        {qTask.title}
                      </span>
                    </div>
                    <div className="font-mono text-[10px] text-slate-400">
                      {qTask.category} · {qTask.priority} · ~{qTask.targetTokens} tok
                    </div>
                  </div>
                  <span className="font-mono text-[10px] font-semibold text-amber-300 shrink-0">
                    {qTask.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-3 py-2 rounded-md bg-slate-900/40 border border-slate-800/70 text-xs text-slate-400">
              Queue is empty. Additional tasks assigned while {worker.shortName} is busy will queue here.
            </div>
          )}
        </section>

        {/* 4. Simulated Telemetry Counters (All marked SIMULATED) */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-emerald-400" />
              <span>Worker Telemetry</span>
            </h3>
            <span className="font-mono text-[10px] font-semibold text-cyan-300">
              SIMULATED
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
              <div className="text-[10px] text-slate-400">Tokens (SIMULATED)</div>
              <div
                className="font-mono text-sm font-semibold text-emerald-300 mt-0.5"
                data-testid="worker-sim-tokens"
              >
                {formatTokens(worker.metrics.simulatedTokens)}
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
              <div className="text-[10px] text-slate-400">Cost (SIMULATED)</div>
              <div
                className="font-mono text-sm font-semibold text-violet-300 mt-0.5"
                data-testid="worker-sim-cost"
              >
                {formatSimulatedCost(worker.metrics.simulatedCostUsd)}
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
              <div className="text-[10px] text-slate-400">Done (SIMULATED)</div>
              <div className="font-mono text-sm font-semibold text-sky-300 mt-0.5">
                {worker.metrics.completedTasksCount}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
            <span>Workstation: {worker.workstationId}</span>
            <span>Engine: {worker.modelLabel}</span>
          </div>
        </section>

        {/* 4b. Read-Only Worker Capability Registry Profile (Phase 2.1) */}
        {capabilityProfile && (
          <section
            aria-label="Worker Capabilities"
            data-testid="worker-capabilities-section"
            className="p-3 rounded-lg bg-slate-900/75 border border-slate-800 space-y-2"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                <span>
                  Capabilities ({capabilityProfile.capabilities.length})
                </span>
              </h3>
              <span className="font-mono text-[10px] text-slate-400">
                MAX CONCURRENCY: {capabilityProfile.maxConcurrency}
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {capabilityProfile.capabilities.map((cap) => (
                <span
                  key={cap.capabilityId}
                  title={cap.description}
                  className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-950 text-cyan-300 border border-slate-800"
                >
                  {cap.capabilityId}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* 5. Interactive Controls (Pause/Resume + Assign Mock Task) */}
        <WorkerControls worker={worker} />

        {/* 6. Honest Character Asset & Animation Rig Status + GLB Fallback Control */}
        <section className="p-3 rounded-lg bg-slate-950/90 border border-slate-800/90 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Box className="w-3.5 h-3.5 text-violet-400" />
              <span>3D Character Rig Status</span>
            </span>
            <span
              data-testid="avatar-rig-status-badge"
              className={`font-mono text-[10px] font-semibold ${
                avatarError
                  ? 'text-amber-300'
                  : worker.avatarConfig.modelUrl
                    ? 'text-emerald-300'
                    : 'text-amber-300'
              }`}
            >
              {avatarError
                ? 'FALLBACK ACTIVE — GLB FAILED'
                : worker.avatarConfig.modelUrl
                  ? 'GLB MODEL CONFIGURED'
                  : 'PLACEHOLDER AVATAR — GLB READY'}
            </span>
          </div>

          <p className="text-[11px] text-slate-400 leading-snug">
            Active Fallback:{' '}
            <code className="font-mono text-slate-200">
              {worker.avatarConfig.fallbackType}
            </code>{' '}
            · Pose Clip:{' '}
            <code className="font-mono text-cyan-300">
              {worker.animationState}
            </code>{' '}
            ({worker.avatarConfig.animationMap[worker.animationState]})
          </p>

          {avatarError && (
            <div
              data-testid="avatar-fallback-diagnostic"
              className="flex items-start gap-1.5 p-2 rounded bg-amber-950/50 border border-amber-500/40 text-[10px] font-mono text-amber-200"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <div className="min-w-0 break-all">
                <div>Isolated GLB Fallback: Articulated humanoid active.</div>
                <div className="text-amber-300/80">{avatarError}</div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-1.5 pt-1">
            {worker.avatarConfig.modelUrl ? (
              <button
                type="button"
                data-testid="restore-placeholder-rig-btn"
                onClick={() => setWorkerModelUrl(worker.id, null)}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-mono text-slate-200 border border-slate-700 cursor-pointer"
              >
                Reset to Default Placeholder Rig
              </button>
            ) : (
              <button
                type="button"
                data-testid="simulate-missing-glb-btn"
                onClick={() =>
                  setWorkerModelUrl(
                    worker.id,
                    `/models/non-existent-${worker.id}.glb`,
                  )
                }
                className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-[10px] font-mono text-slate-300 border border-slate-800 cursor-pointer"
              >
                Test Missing GLB Fallback
              </button>
            )}
          </div>
        </section>

        {/* 7. Recent Completed Tasks by this Worker */}
        {completedTasks.length > 0 && (
          <section className="space-y-1.5 pt-1">
            <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>Recent Completed Tasks (SIMULATED)</span>
            </h3>
            <div className="space-y-1">
              {completedTasks.map((cTask) => (
                <div
                  key={cTask.id}
                  className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded bg-slate-900/50 border border-slate-800/70 text-[11px]"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span className="text-slate-300 truncate">{cTask.title}</span>
                  </div>
                  <span className="font-mono text-[10px] text-slate-400 shrink-0">
                    +{cTask.simulatedTokens} tok
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}
