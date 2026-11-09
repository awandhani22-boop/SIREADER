import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Activity, Bot, Clock3, RefreshCw, X } from 'lucide-react';
import { LiveApiError } from '../live/live.api';
import { liveController } from '../live/live.controller';
import { useLiveStore, type LiveResourceSnapshot } from '../live/live.state';
import { useWorkerDisplayModeStore } from '../workers/worker.display-mode';
import { createLiveWorkerRepository } from '../workers/worker.live-repository';
import type {
  WorkforceActivityResponseDto,
  WorkforceAttemptsResponseDto,
  WorkforceRuntimeResponseDto,
  WorkforceTasksResponseDto,
} from '../live/live.contracts';

function statusTone(status: string): string {
  if (status === 'READY' || status === 'COMPLETED' || status === 'LIVE') return 'border-emerald-500/40 bg-emerald-950/60 text-emerald-300';
  if (status === 'RUNNING' || status === 'CLAIMED' || status === 'STARTED') return 'border-cyan-500/40 bg-cyan-950/60 text-cyan-300';
  if (status === 'WAITING_REVIEW' || status === 'RETRY_WAIT' || status === 'STALE') return 'border-amber-500/40 bg-amber-950/60 text-amber-300';
  if (status === 'FAILED' || status === 'DEAD_LETTERED' || status === 'ERROR') return 'border-rose-500/40 bg-rose-950/60 text-rose-300';
  return 'border-slate-700 bg-slate-900 text-slate-400';
}

function timeLabel(value: string | null): string {
  return value ? new Date(value).toLocaleString('id-ID') : '—';
}

function ResourceState({ resource }: { resource: LiveResourceSnapshot<unknown> }) {
  return (
    <span className={'rounded border px-2 py-0.5 font-mono text-[9px] font-bold ' + statusTone(resource.status)}>
      {resource.status}
    </span>
  );
}

function Metric({ label, value, detail }: { label: string; value: number | string; detail?: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-xl font-bold text-white">{value}</p>
      {detail && <p className="mt-1 text-[10px] text-slate-500">{detail}</p>}
    </div>
  );
}

function ResourceError({ resource }: { resource: LiveResourceSnapshot<unknown> }) {
  if (!resource.error) return null;
  return <p className="mt-1 text-[10px] text-amber-300">Last request: {resource.error}</p>;
}

export function WorkforceLiveDock() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<WorkforceAttemptsResponseDto | null>(null);
  const [attemptError, setAttemptError] = useState<string | null>(null);
  const [attemptLoading, setAttemptLoading] = useState(false);
  const [taskPageOffset, setTaskPageOffset] = useState(0);
  const [taskPageData, setTaskPageData] = useState<WorkforceTasksResponseDto | null>(null);
  const [taskPageLoading, setTaskPageLoading] = useState(false);
  const [taskPageError, setTaskPageError] = useState<string | null>(null);
  const taskPageRequestGeneration = useRef(0);
  const displayMode = useWorkerDisplayModeStore((state) => state.mode);

  useEffect(() => {
    if (displayMode === 'LIVE') setIsOpen(true);
  }, [displayMode]);

  const connection = useLiveStore((state) => state.connection);
  const session = useLiveStore((state) => state.session);
  const runtime = useLiveStore((state) => state.resources['/api/v1/workforce/runtime']);
  const tasks = useLiveStore((state) => state.resources['/api/v1/workforce/tasks']);
  const activity = useLiveStore((state) => state.resources['/api/v1/workforce/activity']);

  const runtimeData = runtime.data as WorkforceRuntimeResponseDto | null;
  const taskData = tasks.data as WorkforceTasksResponseDto | null;
  const visibleTaskData = taskPageOffset === 0 ? taskData : taskPageData;
  const taskRows = visibleTaskData?.tasks ?? [];
  const taskTotal = visibleTaskData?.total_count ?? taskData?.total_count ?? 0;
  const taskPageStart = taskRows.length > 0 && visibleTaskData ? visibleTaskData.offset + 1 : 0;
  const taskPageEnd = taskRows.length > 0 && visibleTaskData ? visibleTaskData.offset + taskRows.length : 0;
  const activityData = activity.data as WorkforceActivityResponseDto | null;
  const workerRepository = createLiveWorkerRepository(runtimeData, runtime.status, session, connection);
  const workerRows = workerRepository.listWorkers();

  useEffect(() => {
    if (session !== 'AUTHENTICATED') {
      taskPageRequestGeneration.current += 1;
      setTaskPageOffset(0);
      setTaskPageData(null);
      setTaskPageError(null);
      setTaskPageLoading(false);
    }
    return () => {
      taskPageRequestGeneration.current += 1;
    };
  }, [session]);

  const loadTaskPage = async (offset: number): Promise<void> => {
    if (taskPageLoading) return;
    if (offset <= 0) {
      setTaskPageOffset(0);
      setTaskPageData(null);
      setTaskPageError(null);
      return;
    }
    const requestGeneration = ++taskPageRequestGeneration.current;
    setTaskPageLoading(true);
    setTaskPageError(null);
    try {
      const page = await liveController.getWorkforceTasks(50, offset);
      if (requestGeneration !== taskPageRequestGeneration.current || session !== 'AUTHENTICATED') return;
      setTaskPageData(page);
      setTaskPageOffset(offset);
    } catch (error) {
      if (requestGeneration !== taskPageRequestGeneration.current || session !== 'AUTHENTICATED') return;
      setTaskPageError(error instanceof LiveApiError ? error.code : 'REQUEST_FAILED');
    } finally {
      if (requestGeneration === taskPageRequestGeneration.current) {
        setTaskPageLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!isOpen || !selectedTaskId || session !== 'AUTHENTICATED') {
      setAttempts(null);
      setAttemptError(null);
      setAttemptLoading(false);
      return;
    }

    let active = true;
    setAttempts(null);
    setAttemptLoading(true);
    setAttemptError(null);
    void liveController.getWorkforceAttempts(selectedTaskId)
      .then((result) => {
        if (active) setAttempts(result);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setAttempts(null);
        setAttemptError(error instanceof LiveApiError ? error.code : 'REQUEST_FAILED');
      })
      .finally(() => {
        if (active) setAttemptLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, selectedTaskId, session]);

  function closeOnBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) setIsOpen(false);
  }

  return (
    <>
      <button
        type="button"
        data-testid="open-workforce-live"
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1.5 rounded-md border border-cyan-500/30 bg-cyan-950/40 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-200 transition-colors hover:border-cyan-400/60 hover:bg-cyan-950/70"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <Bot className="h-3.5 w-3.5" />
        Workforce LIVE
        <span className={'h-1.5 w-1.5 rounded-full ' + (connection === 'LIVE' ? 'bg-emerald-400' : 'bg-amber-400')} />
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-[80] flex justify-end bg-black/70 backdrop-blur-sm"
          onClick={closeOnBackdrop}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="workforce-live-title"
            data-testid="workforce-live-panel"
            className="flex h-full w-full max-w-4xl flex-col overflow-hidden border-l border-slate-700 bg-[#080E1A] shadow-2xl"
          >
            <header className="flex items-center justify-between gap-3 border-b border-slate-800 bg-[#0B1220] px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-cyan-300" />
                  <h2 id="workforce-live-title" className="text-sm font-bold tracking-wide text-white">
                    WORKFORCE OBSERVABILITY
                  </h2>
                  <span className="rounded border border-cyan-500/30 bg-cyan-950/50 px-1.5 py-0.5 font-mono text-[9px] text-cyan-200">
                    READ ONLY
                  </span>
                </div>
                <p className="mt-1 text-[10px] text-slate-500">
                  Data runtime backend · terpisah dari simulasi kantor
                </p>
              </div>
              <div className="flex items-center gap-2">
                <ResourceState resource={runtime as LiveResourceSnapshot<unknown>} />
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
                  aria-label="Close workforce panel"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
              {session !== 'AUTHENTICATED' ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-4 text-sm text-amber-200">
                  Login operator melalui panel LIVE terlebih dahulu untuk melihat data workforce.
                </div>
              ) : (
                <>
                  <section aria-label="Workforce runtime metrics">
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-300">Runtime overview</h3>
                      <span className="font-mono text-[9px] text-slate-500">
                        {runtimeData ? timeLabel(runtimeData.runtime.observed_at) : 'Menunggu snapshot'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                      <Metric label="Configured workers" value={runtimeData?.runtime.configured_workers ?? '—'} detail={runtime.status} />
                      <Metric label="Ready workers" value={runtimeData?.runtime.ready_workers ?? '—'} />
                      <Metric label="Active tasks" value={runtimeData?.runtime.active_tasks ?? '—'} />
                      <Metric label="Queued tasks" value={runtimeData?.runtime.queued_tasks ?? '—'} />
                      <Metric label="Waiting review" value={runtimeData?.runtime.waiting_review_tasks ?? '—'} />
                      <Metric label="Dead-lettered" value={runtimeData?.runtime.dead_lettered_tasks ?? '—'} />
                      <Metric label="Completed 24h" value={runtimeData?.runtime.completed_last_24h ?? '—'} />
                      <Metric label="Offline / stale" value={runtimeData ? runtimeData.runtime.offline_workers + runtimeData.runtime.stale_workers : '—'} />
                    </div>
                    <ResourceError resource={runtime as LiveResourceSnapshot<unknown>} />
                  </section>

                  <section aria-label="Live worker registry">
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-300">Worker registry</h3>
                      <ResourceState resource={runtime as LiveResourceSnapshot<unknown>} />
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      {workerRows.map((worker) => (
                        <article key={worker.workerId} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold text-white">{worker.displayName}</p>
                              <p className="mt-0.5 text-[10px] text-slate-500">{worker.role} · {worker.department}</p>
                            </div>
                            <span className={'shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] ' + statusTone(worker.statusLabel)}>
                              {worker.statusLabel}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[9px] text-slate-400">
                            <span className="rounded bg-slate-800 px-1.5 py-0.5">{worker.modelTier}</span>
                            <span className="rounded bg-slate-800 px-1.5 py-0.5">Concurrency {worker.activeTaskCount ?? '—'}/{worker.maxConcurrency ?? '—'}</span>
                            <span className="rounded bg-slate-800 px-1.5 py-0.5">Provider in-flight {worker.inFlightProviderRequests ?? '—'}</span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {worker.capabilityIds.map((capability) => (
                              <span key={capability} className="rounded border border-slate-700 px-1.5 py-0.5 text-[9px] text-cyan-200">
                                {capability}
                              </span>
                            ))}
                          </div>
                          <p className="mt-2 text-[9px] text-slate-600">Heartbeat: {timeLabel(worker.heartbeatAt)}</p>
                        </article>
                      ))}
                      {runtimeData && workerRows.length === 0 && (
                        <p className="rounded border border-slate-800 p-3 text-xs text-slate-500">Belum ada worker terdaftar pada snapshot backend.</p>
                      )}
                      {!runtimeData && (
                        <p data-testid="workforce-runtime-waiting" className="rounded border border-slate-800 p-3 text-xs text-slate-500">Belum ada snapshot workforce yang tervalidasi.</p>
                      )}
                    </div>
                  </section>

                  <section aria-label="Persistent backend tasks">
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-300">Persistent task queue</h3>
                      <ResourceState resource={tasks as LiveResourceSnapshot<unknown>} />
                    </div>
                    <div className="overflow-hidden rounded-lg border border-slate-800">
                      {taskRows.map((task) => (
                        <button
                          key={task.task_id}
                          type="button"
                          onClick={() => setSelectedTaskId(task.task_id)}
                          className={'flex w-full items-center justify-between gap-3 border-b border-slate-800 px-3 py-2.5 text-left last:border-b-0 hover:bg-slate-900 ' + (selectedTaskId === task.task_id ? 'bg-cyan-950/30' : 'bg-slate-950/30')}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-medium text-slate-200">{task.title}</span>
                            <span className="mt-0.5 block truncate font-mono text-[9px] text-slate-500">
                              {task.task_type} · {task.assigned_worker_id ?? 'Unassigned'} · {task.attempts}/{task.max_attempts} attempts
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="font-mono text-[9px] text-slate-500">P{task.priority}</span>
                            <span className={'rounded border px-1.5 py-0.5 font-mono text-[9px] ' + statusTone(task.status)}>
                              {task.status}
                            </span>
                          </span>
                        </button>
                      ))}
                      {visibleTaskData?.tasks.length === 0 && (
                        <p className="p-3 text-xs text-slate-500">Belum ada task backend.</p>
                      )}
                      {!visibleTaskData && <p className="p-3 text-xs text-slate-500">Menunggu snapshot task…</p>}
                    </div>
                    {visibleTaskData && visibleTaskData.total_count > visibleTaskData.limit && (
                      <div className="flex items-center justify-between gap-2 border-t border-slate-800 px-3 py-2">
                        <span className="font-mono text-[10px] text-slate-500">
                          {taskPageStart}–{taskPageEnd} of {taskTotal}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            data-testid="workforce-task-page-previous"
                            disabled={taskPageOffset === 0 || taskPageLoading}
                            onClick={() => void loadTaskPage(Math.max(0, taskPageOffset - 50))}
                            className="rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-300 disabled:opacity-30"
                          >
                            Previous
                          </button>
                          <button
                            type="button"
                            data-testid="workforce-task-page-next"
                            disabled={taskPageEnd >= taskTotal || taskPageLoading}
                            onClick={() => void loadTaskPage(taskPageOffset + 50)}
                            className="rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-300 disabled:opacity-30"
                          >
                            {taskPageLoading ? 'Loading…' : 'Next'}
                          </button>
                        </div>
                      </div>
                    )}
                    {taskPageError && (
                      <p role="alert" className="border-t border-rose-800/60 p-2 text-[10px] text-rose-300">
                        Task page failed: {taskPageError}
                      </p>
                    )}
                    <ResourceError resource={tasks as LiveResourceSnapshot<unknown>} />
                    {selectedTaskId && (
                      <div className="mt-2 rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10px] font-semibold text-slate-200">Attempt history · {selectedTaskId}</p>
                          {attemptLoading && <RefreshCw className="h-3 w-3 animate-spin text-cyan-300" />}
                        </div>
                        {attemptError && <p className="mt-2 text-[10px] text-rose-300">{attemptError}</p>}
                        {attempts?.attempts.map((attempt) => (
                          <div key={attempt.attempt_id} className="mt-2 flex items-center justify-between gap-2 border-t border-slate-800 pt-2 text-[10px]">
                            <span className="text-slate-300">#{attempt.attempt_number} · {attempt.worker_id} · {attempt.status}</span>
                            <span className="font-mono text-slate-400">
                              {attempt.cost_amount === null ? '—' : (attempt.billing_currency ?? '') + ' ' + attempt.cost_amount}
                            </span>
                          </div>
                        ))}
                        {attempts && attempts.attempts.length === 0 && (
                          <p className="mt-2 text-[10px] text-slate-500">Belum ada attempt.</p>
                        )}
                      </div>
                    )}
                  </section>

                  <section aria-label="Workforce activity">
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-300">
                        <Activity className="h-3 w-3 text-cyan-300" /> Activity stream
                      </h3>
                      <ResourceState resource={activity as LiveResourceSnapshot<unknown>} />
                    </div>
                    <div className="space-y-1.5">
                      {(activityData?.events ?? []).map((event) => (
                        <div key={event.event_id} className="flex items-start gap-2 rounded border border-slate-800/80 bg-slate-900/40 p-2">
                          <Clock3 className="mt-0.5 h-3 w-3 shrink-0 text-slate-500" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-medium text-slate-200">{event.event_type.replaceAll('_', ' ')}</p>
                            <p className="mt-0.5 truncate font-mono text-[9px] text-slate-500">
                              {event.worker_id ?? 'System'} · {event.task_id ?? 'No task'} · {timeLabel(event.occurred_at)}
                            </p>
                          </div>
                        </div>
                      ))}
                      {activityData?.events.length === 0 && (
                        <p className="rounded border border-slate-800 p-3 text-xs text-slate-500">Belum ada activity backend.</p>
                      )}
                    </div>
                    <ResourceError resource={activity as LiveResourceSnapshot<unknown>} />
                  </section>
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
