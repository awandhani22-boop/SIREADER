import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Layers,
  ListOrdered,
  Plus,
  X,
} from 'lucide-react';
import {
  formatProgressPercent,
  formatSimDuration,
  formatTokens,
} from '../utils/formatters';
import { GLOBAL_DEMO_TASK_TEMPLATES } from '../workers/worker.registry';
import {
  selectGlobalQueueEntries,
  selectGlobalTaskActivity,
  useOfficeStore,
} from '../workers/worker.state';
import type { TaskPriority } from '../tasks/task.types';

export function GlobalQueuePanel() {
  const scheduler = useOfficeStore((s) => s.scheduler);
  const tasks = useOfficeStore((s) => s.tasks);
  const workers = useOfficeStore((s) => s.workers);
  const lastBlockedRecords = useOfficeStore((s) => s.lastBlockedRecords);
  const lastDispatchDiagnosticsAtSimMs = useOfficeStore(
    (s) => s.lastDispatchDiagnosticsAtSimMs,
  );
  const lastDispatchDiagnosticsTickCount = useOfficeStore(
    (s) => s.lastDispatchDiagnosticsTickCount,
  );
  const simTimeMs = useOfficeStore((s) => s.simTimeMs);
  const isGlobalPaused = useOfficeStore((s) => s.isGlobalPaused);
  const setGlobalQueueOpen = useOfficeStore((s) => s.setGlobalQueueOpen);
  const enqueueGlobalMockTask = useOfficeStore((s) => s.enqueueGlobalMockTask);

  const [activeTab, setActiveTab] = useState<'queue' | 'activity'>('queue');
  const [selectedTemplateIndex, setSelectedTemplateIndex] = useState(0);
  const [priorityOverride, setPriorityOverride] = useState<TaskPriority | 'DEFAULT'>('DEFAULT');
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const queueEntries = useMemo(
    () => selectGlobalQueueEntries(scheduler, tasks, lastBlockedRecords, simTimeMs),
    [scheduler, tasks, lastBlockedRecords, simTimeMs],
  );

  const poolActivities = useMemo(
    () => selectGlobalTaskActivity(tasks, scheduler, 20),
    [tasks, scheduler],
  );

  const handleEnqueue = (e: React.FormEvent) => {
    e.preventDefault();
    const template = GLOBAL_DEMO_TASK_TEMPLATES[selectedTemplateIndex];
    if (!template) return;

    const payload = {
      type: template.type,
      category: template.category,
      title: template.title,
      description: template.description,
      priority: priorityOverride === 'DEFAULT' ? template.priority : priorityOverride,
      durationSimMs: template.durationSimMs,
      targetTokens: template.targetTokens,
    };

    const res = enqueueGlobalMockTask(payload);
    if (res.ok) {
      if (isGlobalPaused) {
        setFeedbackMessage(
          `Enqueued "${template.title}" (${payload.priority}). Simulation is PAUSED — will evaluate on resume/tick.`,
        );
      } else {
        setFeedbackMessage(
          `Enqueued "${template.title}" (${payload.priority}) as WAITING. Will evaluate on next tick dispatch pass.`,
        );
      }
    } else {
      setFeedbackMessage('Failed to enqueue task (rejected by scheduler validation).');
    }
  };

  const getPriorityBadgeClass = (priority: TaskPriority | 'UNKNOWN') => {
    switch (priority) {
      case 'CRITICAL':
        return 'bg-rose-950 text-rose-300 border-rose-500/40';
      case 'HIGH':
        return 'bg-amber-950 text-amber-300 border-amber-500/40';
      case 'NORMAL':
        return 'bg-sky-950 text-sky-300 border-sky-500/40';
      case 'LOW':
        return 'bg-slate-800 text-slate-400 border-slate-700';
      default:
        return 'bg-slate-900 text-slate-500 border-slate-800';
    }
  };

  return (
    <aside
      data-testid="global-queue-panel"
      className="w-96 max-w-[calc(100vw-24px)] h-full bg-[#0B1220]/95 backdrop-blur-md border-l border-slate-800 flex flex-col overflow-hidden text-slate-100 shadow-2xl z-20 pointer-events-auto"
      aria-label="Global Task Dispatcher Queue"
    >
      {/* 1. Header with Live Queue Count & Close Button */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#080E1A] border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <ListOrdered className="w-4 h-4 text-cyan-400 shrink-0" />
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-white truncate">
              Global Task Queue
            </h2>
            <p className="text-[10px] text-cyan-400/90 font-mono" data-testid="global-queue-count-label">
              Pool Queue: {scheduler?.entries.length ?? 0} Tasks
            </p>
          </div>
        </div>
        <button
          type="button"
          data-testid="close-global-queue-btn"
          onClick={() => setGlobalQueueOpen(false)}
          className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors cursor-pointer"
          aria-label="Close Global Task Queue Panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 2. Quick Enqueue Control Accordion/Form */}
      <div className="px-4 py-2.5 bg-[#0D1527] border-b border-slate-800 shrink-0">
        <form onSubmit={handleEnqueue} className="space-y-2" data-testid="add-task-form">
          <div className="flex items-center justify-between">
            <label
              htmlFor="template-select"
              className="text-[11px] font-semibold text-slate-300 flex items-center gap-1"
            >
              <Plus className="w-3 h-3 text-cyan-400" />
              <span>Enqueue Pool Task</span>
            </label>
            <span className="text-[10px] text-slate-500 font-mono">14 Templates</span>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            <select
              id="template-select"
              data-testid="template-select"
              value={selectedTemplateIndex}
              onChange={(e) => setSelectedTemplateIndex(Number(e.target.value))}
              className="col-span-2 text-[11px] bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-cyan-500 truncate cursor-pointer"
            >
              {GLOBAL_DEMO_TASK_TEMPLATES.map((tmpl, idx) => (
                <option key={`${tmpl.type}_${idx}`} value={idx}>
                  {tmpl.title} ({tmpl.category})
                </option>
              ))}
            </select>

            <select
              data-testid="priority-override-select"
              value={priorityOverride}
              onChange={(e) => setPriorityOverride(e.target.value as TaskPriority | 'DEFAULT')}
              className="col-span-1 text-[11px] bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer"
              aria-label="Task Priority Override"
            >
              <option value="DEFAULT">Priority</option>
              <option value="CRITICAL">CRITICAL</option>
              <option value="HIGH">HIGH</option>
              <option value="NORMAL">NORMAL</option>
              <option value="LOW">LOW</option>
            </select>
          </div>

          <button
            type="submit"
            data-testid="enqueue-task-btn"
            className="w-full flex items-center justify-center gap-1.5 py-1 text-[11px] font-semibold bg-cyan-600/30 text-cyan-200 hover:bg-cyan-600/40 border border-cyan-500/50 rounded transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-cyan-400" />
            <span>Enqueue to Dispatcher Pool</span>
          </button>

          {feedbackMessage && (
            <p
              data-testid="enqueue-feedback"
              className="text-[10px] text-cyan-300/90 font-mono bg-cyan-950/40 border border-cyan-800/40 rounded p-1.5 break-words"
            >
              {feedbackMessage}
            </p>
          )}
        </form>
      </div>

      {/* 3. Navigation Tabs: Active Queue vs Pool Activity */}
      <div className="flex border-b border-slate-800 bg-[#080E1A] shrink-0">
        <button
          type="button"
          data-testid="tab-queue"
          onClick={() => setActiveTab('queue')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'queue'
              ? 'border-cyan-400 text-white bg-slate-900/40'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <ListOrdered className="w-3.5 h-3.5 text-cyan-400" />
          <span>Queue ({queueEntries.length})</span>
        </button>

        <button
          type="button"
          data-testid="tab-activity"
          onClick={() => setActiveTab('activity')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'activity'
              ? 'border-cyan-400 text-white bg-slate-900/40'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Activity className="w-3.5 h-3.5 text-emerald-400" />
          <span>Pool Activity ({poolActivities.length})</span>
        </button>
      </div>

      {/* 4. Tab Content: Queue View or Activity View */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {activeTab === 'queue' ? (
          /* SECTION A: GLOBAL QUEUE ENTRIES */
          queueEntries.length === 0 ? (
            <div className="text-center py-8 text-slate-500 space-y-1.5">
              <ListOrdered className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-xs">No tasks currently in the global queue.</p>
              <p className="text-[10px] text-slate-600 max-w-xs mx-auto">
                Tasks will be auto-generated by the simulation or you can enqueue tasks using the controls above.
              </p>
            </div>
          ) : (
            queueEntries.map((item) => (
              <div
                key={item.taskId}
                data-testid={`queue-item-${item.taskId}`}
                className={`p-2.5 rounded-md border transition-all ${
                  item.isBlocked
                    ? 'bg-amber-950/20 border-amber-500/40 shadow-[0_0_8px_rgba(245,158,11,0.1)]'
                    : 'bg-slate-900/70 border-slate-800/90'
                }`}
              >
                {/* Header: Dispatch Order + Sequence + Priority */}
                <div className="flex items-center justify-between gap-1.5 mb-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-mono text-[10px] font-bold text-cyan-300 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/40">
                      #{item.dispatchOrderIndex}
                    </span>
                    <span className="font-mono text-[9px] text-slate-400">
                      Seq #{item.sequence}
                    </span>
                  </div>
                  <span
                    className={`font-mono text-[9px] font-semibold px-1.5 py-0.5 rounded border ${getPriorityBadgeClass(
                      item.priority,
                    )}`}
                  >
                    {item.priority}
                  </span>
                </div>

                {/* Title and Category */}
                <h4 className="text-xs font-semibold text-white truncate mb-1">
                  {item.task?.title ?? `[Task Entity Missing: ${item.taskId}]`}
                </h4>

                <div className="flex items-center justify-between text-[10px] text-slate-400 mb-2">
                  <span>{item.task?.category ?? 'UNSPECIFIED'} · {item.task?.type ?? 'UNKNOWN'}</span>
                  <span className="font-mono text-slate-500">
                    Wait: {formatSimDuration(item.waitDurationSimMs)}
                  </span>
                </div>

                {/* Status Diagnostic Badge */}
                {item.isBlocked && item.blockedRecord ? (
                  <div className="p-1.5 rounded bg-amber-950/40 border border-amber-600/30 text-[10px] text-amber-300 space-y-0.5">
                    <div className="flex items-center gap-1 font-semibold">
                      <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                      <span>BLOCKED — {item.blockedRecord.reason}</span>
                    </div>
                    {item.blockedRecord.detail && (
                      <p className="text-[9px] text-amber-200/80 pl-4">
                        {item.blockedRecord.detail}
                      </p>
                    )}
                    {lastDispatchDiagnosticsAtSimMs !== null && (
                      <p className="text-[9px] text-slate-400 pl-4 font-mono">
                        Last dispatcher check: {formatSimDuration(lastDispatchDiagnosticsAtSimMs)} (Tick #{lastDispatchDiagnosticsTickCount})
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-[10px] font-mono text-cyan-300/80">
                    <Clock className="w-3 h-3 text-cyan-400 shrink-0" />
                    <span>WAITING (Ready for next idle worker)</span>
                  </div>
                )}
              </div>
            ))
          )
        ) : (
          /* SECTION B: GLOBAL TASK ACTIVITY (RUNNING, COMPLETED, FAILED) */
          poolActivities.length === 0 ? (
            <div className="text-center py-8 text-slate-500 space-y-1.5">
              <Activity className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-xs">No pool task execution activity yet.</p>
              <p className="text-[10px] text-slate-600 max-w-xs mx-auto">
                Dispatched tasks from the global queue will appear here as workers execute and complete them.
              </p>
            </div>
          ) : (
            poolActivities.map((item) => {
              const assignedWorker = item.assignedWorkerId ? workers[item.assignedWorkerId] : null;
              return (
                <div
                  key={item.task.id}
                  data-testid={`activity-item-${item.task.id}`}
                  className="p-2.5 rounded-md border bg-slate-900/60 border-slate-800/80 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-xs font-semibold text-white truncate">
                      {item.task.title}
                    </span>
                    <span
                      className={`font-mono text-[9px] font-semibold px-1.5 py-0.5 rounded border ${
                        item.lifecycleStatus === 'COMPLETED'
                          ? 'bg-emerald-950 text-emerald-300 border-emerald-500/40'
                          : item.lifecycleStatus === 'FAILED'
                            ? 'bg-rose-950 text-rose-300 border-rose-500/40'
                            : 'bg-cyan-950 text-cyan-300 border-cyan-500/40'
                      }`}
                    >
                      {item.lifecycleStatus}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span className="truncate">
                      Worker: {assignedWorker ? assignedWorker.name : (item.assignedWorkerId ?? 'Unassigned')}
                    </span>
                    <span className="font-mono text-slate-500">
                      {item.lifecycleStatus === 'COMPLETED'
                        ? `+${formatTokens(item.task.simulatedTokens)} tok`
                        : `${item.progress}%`}
                    </span>
                  </div>

                  {item.lifecycleStatus === 'RUNNING' && (
                    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-cyan-400 h-full rounded-full transition-all duration-300"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  )}

                  {item.lifecycleStatus === 'FAILED' && (
                    <div
                      role="note"
                      aria-label={`Failure details for ${item.task.title}`}
                      data-testid={`activity-error-${item.task.id}`}
                      className="rounded border border-rose-500/30 bg-rose-950/30 px-2 py-1.5 space-y-0.5"
                    >
                      {item.task.error ? (
                        <>
                          <p className="text-[10px] text-rose-200 break-words">
                            {item.task.error.message || 'Execution failed.'}
                          </p>
                          {(() => {
                            const details = [
                              item.task.error.code,
                              item.task.error.attemptNumber !== undefined
                                ? `Attempt ${item.task.error.attemptNumber}`
                                : null,
                              item.task.error.recoverable !== undefined
                                ? item.task.error.recoverable
                                  ? 'Recoverable'
                                  : 'Non-recoverable'
                                : null,
                            ].filter((v): v is string => Boolean(v));
                            return details.length > 0 ? (
                              <p className="font-mono text-[9px] text-rose-300/80 break-words">
                                {details.join(' · ')}
                              </p>
                            ) : null;
                          })()}
                        </>
                      ) : (
                        <p className="text-[10px] text-rose-200">
                          Failure details unavailable.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[9px] text-slate-500 font-mono pt-0.5">
                    <span>{item.task.category}</span>
                    <span>Active: {formatSimDuration(item.lastActiveSimMs)}</span>
                  </div>
                </div>
              );
            })
          )
        )}
      </div>
    </aside>
  );
}
