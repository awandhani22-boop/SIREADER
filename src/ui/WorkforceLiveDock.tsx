import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Activity, Bot, Clock3, RefreshCw, X } from 'lucide-react';
import { LiveApiError } from '../live/live.api';
import { liveController } from '../live/live.controller';
import { useLiveStore, type LiveResourceSnapshot } from '../live/live.state';
import { useWorkerDisplayModeStore } from '../workers/worker.display-mode';
import { createLiveWorkerRepository } from '../workers/worker.live-repository';
import type {
  WorkforceCommandPath,
  WorkforceCommandRequest,
  WorkforceActivityResponseDto,
  WorkforceAttemptsResponseDto,
  WorkforceRuntimeResponseDto,
  WorkforceTasksResponseDto,
} from '../live/live.contracts';


const NON_TRADING_TASK_OPTIONS = [
  { worker: 'supervisor', capability: 'instruction_intake', taskType: 'INSTRUCTION_INTAKE', label: 'Supervisor · Instruction intake' },
  { worker: 'supervisor', capability: 'task_decomposition', taskType: 'TASK_DECOMPOSITION', label: 'Supervisor · Task decomposition' },
  { worker: 'supervisor', capability: 'workflow_supervision', taskType: 'WORKFLOW_SUPERVISION', label: 'Supervisor · Workflow supervision' },
  { worker: 'supervisor', capability: 'task_assignment_oversight', taskType: 'TASK_ASSIGNMENT_OVERSIGHT', label: 'Supervisor · Assignment oversight' },
  { worker: 'supervisor', capability: 'result_review', taskType: 'RESULT_REVIEW', label: 'Supervisor · Result review' },
  { worker: 'haiku', capability: 'quick_research', taskType: 'QUICK_RESEARCH', label: 'Haiku · Quick research' },
  { worker: 'haiku', capability: 'information_extraction', taskType: 'INFORMATION_EXTRACTION', label: 'Haiku · Information extraction' },
  { worker: 'haiku', capability: 'summarization', taskType: 'SUMMARIZATION', label: 'Haiku · Summarization' },
  { worker: 'haiku', capability: 'lightweight_classification', taskType: 'LIGHTWEIGHT_CLASSIFICATION', label: 'Haiku · Classification' },
  { worker: 'sonnet', capability: 'data_analysis', taskType: 'DATA_ANALYSIS', label: 'Sonnet · Data analysis' },
  { worker: 'sonnet', capability: 'comparison', taskType: 'COMPARISON', label: 'Sonnet · Comparison' },
  { worker: 'sonnet', capability: 'evaluation', taskType: 'EVALUATION', label: 'Sonnet · Evaluation' },
  { worker: 'sonnet', capability: 'structured_reasoning', taskType: 'STRUCTURED_REASONING', label: 'Sonnet · Structured reasoning' },
  { worker: 'opus', capability: 'complex_reasoning', taskType: 'COMPLEX_REASONING', label: 'Opus · Complex reasoning' },
  { worker: 'opus', capability: 'strategic_analysis', taskType: 'STRATEGIC_ANALYSIS', label: 'Opus · Strategic analysis' },
  { worker: 'opus', capability: 'deep_review', taskType: 'DEEP_REVIEW', label: 'Opus · Deep review' },
  { worker: 'data_archivist', capability: 'data_archiving', taskType: 'DATA_ARCHIVING', label: 'Archivist · Data archiving' },
  { worker: 'data_archivist', capability: 'artifact_indexing', taskType: 'ARTIFACT_INDEXING', label: 'Archivist · Artifact indexing' },
  { worker: 'data_archivist', capability: 'historical_retrieval_simulation', taskType: 'HISTORICAL_RETRIEVAL_SIMULATION', label: 'Archivist · Historical retrieval' },
  { worker: 'data_archivist', capability: 'data_organization', taskType: 'DATA_ORGANIZATION', label: 'Archivist · Data organization' },
] as const;
const NON_TRADING_WORKERS = new Set(['supervisor', 'haiku', 'sonnet', 'opus', 'data_archivist']);
const FINAL_TASK_STATUSES = new Set(['COMPLETED', 'FAILED', 'CANCELLED', 'DEAD_LETTERED']);

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
  const [commandPending, setCommandPending] = useState(false);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [commandNotice, setCommandNotice] = useState<string | null>(null);
  const [taskInstruction, setTaskInstruction] = useState('');
  const [taskOptionKey, setTaskOptionKey] = useState('haiku|summarization|SUMMARIZATION');
  const taskPageRequestGeneration = useRef(0);
  const displayMode = useWorkerDisplayModeStore((state) => state.mode);

  useEffect(() => {
    setIsOpen(displayMode === 'LIVE');
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
    if (session !== 'AUTHENTICATED' || displayMode !== 'LIVE') {
      setCommandPending(false);
      setCommandError(null);
      setCommandNotice(null);
      setTaskInstruction('');
    }
  }, [session, displayMode]);

  useEffect(() => {
    if (session !== 'AUTHENTICATED') {
      taskPageRequestGeneration.current += 1;
      setTaskPageOffset(0);
      setTaskPageData(null);
      setTaskPageError(null);
      setSelectedTaskId(null);
      setAttempts(null);
      setAttemptError(null);
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


  const runWorkforceCommand = async (
    path: WorkforceCommandPath,
    request: WorkforceCommandRequest,
  ): Promise<Record<string, unknown> | null> => {
    if (displayMode !== 'LIVE' || session !== 'AUTHENTICATED' || commandPending) return null;
    setCommandPending(true);
    setCommandError(null);
    setCommandNotice(null);
    try {
      const result = await liveController.sendWorkforceCommand(path, request);
      const outcome = result.outcome;
      setCommandNotice(path === '/api/v1/commands/tasks/enqueue'
        ? 'Task accepted · ' + String(outcome.task_id)
        : path === '/api/v1/commands/tasks/cancel'
          ? outcome.status === 'WAITING_REVIEW'
            ? 'Provider outcome unknown · routed to WAITING_REVIEW'
            : 'Task cancelled before a provider request'
          : path === '/api/v1/commands/tasks/retry'
            ? 'New retry task created · ' + String(outcome.task_id)
            : 'Worker scheduling · ' + String(outcome.schedule_state));
      await Promise.allSettled([
        liveController.loadResource('/api/v1/workforce/runtime'),
        liveController.loadResource('/api/v1/workforce/tasks'),
        liveController.loadResource('/api/v1/workforce/activity'),
      ]);
      return outcome;
    } catch (error) {
      const code = error instanceof LiveApiError ? error.code : 'REQUEST_FAILED';
      setCommandError(code);
      return null;
    } finally {
      setCommandPending(false);
    }
  };

  const submitTask = async (): Promise<void> => {
    const instruction = taskInstruction.trim();
    const selected = NON_TRADING_TASK_OPTIONS.find((option) =>
      option.worker + '|' + option.capability + '|' + option.taskType === taskOptionKey,
    );
    if (!selected || !instruction || instruction.length > 180) {
      setCommandError('BAD_REQUEST');
      return;
    }
    const outcome = await runWorkforceCommand('/api/v1/commands/tasks/enqueue', {
      task_type: selected.taskType,
      title: instruction,
      required_capability: selected.capability,
      requested_worker_id: selected.worker,
      input_payload: { instruction, source: 'virtual_office_operator_console' },
      priority: 50,
      max_attempts: 2,
      non_trading_acknowledged: true,
    });
    if (outcome) setTaskInstruction('');
  };

  const isOperatorTask = (task: WorkforceTasksResponseDto['tasks'][number]): boolean =>
    NON_TRADING_TASK_OPTIONS.some((option) =>
      option.taskType === task.task_type && option.capability === task.required_capability,
    ) && (task.requested_worker_id === null || NON_TRADING_WORKERS.has(task.requested_worker_id));

  const cancelTask = async (taskId: string): Promise<void> => {
    await runWorkforceCommand('/api/v1/commands/tasks/cancel', { task_id: taskId });
  };

  const retryTask = async (taskId: string): Promise<void> => {
    await runWorkforceCommand('/api/v1/commands/tasks/retry', { task_id: taskId });
  };

  const setWorkerScheduling = async (workerId: string, acceptingTasks: boolean): Promise<void> => {
    await runWorkforceCommand('/api/v1/commands/workers/scheduling', {
      worker_id: workerId,
      accepting_tasks: acceptingTasks,
    });
  };

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
                  {displayMode === 'LIVE' && (
                    <section aria-label="Human-supervised workforce commands" className="rounded-xl border border-cyan-500/25 bg-cyan-950/10 p-3">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="text-[11px] font-bold uppercase tracking-wider text-cyan-200">Operator command console</h3>
                          <p className="mt-1 text-[10px] text-slate-500">Non-trading work only · every command is authenticated and audited</p>
                        </div>
                        <span className="rounded border border-amber-500/30 bg-amber-950/20 px-2 py-1 font-mono text-[9px] text-amber-200">HUMAN SUPERVISED</span>
                      </div>
                      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto]">
                        <select
                          aria-label="Non-trading task type"
                          data-testid="workforce-command-task-type"
                          value={taskOptionKey}
                          disabled={commandPending}
                          onChange={(event) => setTaskOptionKey(event.target.value)}
                          className="min-w-0 rounded border border-slate-700 bg-slate-950 px-2 py-2 text-[11px] text-slate-200"
                        >
                          {NON_TRADING_TASK_OPTIONS.map((option) => (
                            <option key={option.worker + option.taskType} value={option.worker + '|' + option.capability + '|' + option.taskType}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <input
                          aria-label="Task instruction"
                          data-testid="workforce-command-instruction"
                          value={taskInstruction}
                          maxLength={180}
                          disabled={commandPending}
                          onChange={(event) => setTaskInstruction(event.target.value)}
                          placeholder="Describe the non-trading task (max 180 characters)"
                          className="min-w-0 rounded border border-slate-700 bg-slate-950 px-3 py-2 text-[11px] text-white placeholder:text-slate-600"
                        />
                        <button
                          type="button"
                          data-testid="workforce-command-enqueue"
                          disabled={commandPending || taskInstruction.trim().length === 0}
                          onClick={() => void submitTask()}
                          className="rounded border border-cyan-500/40 bg-cyan-500/15 px-3 py-2 text-[10px] font-bold text-cyan-100 disabled:opacity-40"
                        >
                          {commandPending ? 'Submitting…' : 'Create task'}
                        </button>
                      </div>
                      {commandPending && <p role="status" className="mt-2 text-[10px] text-cyan-200">Command is being processed. No UI state is assumed until the backend responds.</p>}
                      {commandError && <p role="alert" className="mt-2 text-[10px] text-rose-300">Command rejected or unavailable: {commandError}</p>}
                      {commandNotice && <p role="status" className="mt-2 text-[10px] text-emerald-200">{commandNotice}</p>}
                    </section>
                  )}

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
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-2">
                            <span className="text-[9px] text-slate-400">Scheduling: {worker.acceptingTasks === null ? 'UNKNOWN' : worker.acceptingTasks ? 'ACCEPTING' : 'PAUSED'}</span>
                            {displayMode === 'LIVE' && session === 'AUTHENTICATED' &&
                              NON_TRADING_WORKERS.has(worker.workerId) && worker.enabled === true &&
                              worker.acceptingTasks !== null && (
                                <button
                                  type="button"
                                  data-testid={'worker-scheduling-' + worker.workerId}
                                  disabled={commandPending}
                                  onClick={() => void setWorkerScheduling(worker.workerId, !worker.acceptingTasks)}
                                  className="rounded border border-slate-700 px-2 py-1 text-[9px] font-semibold text-slate-300 disabled:opacity-40"
                                >
                                  {worker.acceptingTasks ? 'Pause new tasks' : 'Resume tasks'}
                                </button>
                              )}
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
                        <div key={task.task_id} className="flex items-center gap-2 border-b border-slate-800 bg-slate-950/30 px-2 py-2 last:border-b-0">
                          <button
                            type="button"
                            onClick={() => setSelectedTaskId(task.task_id)}
                            className={'min-w-0 flex-1 rounded px-1 py-1 text-left hover:bg-slate-900 ' + (selectedTaskId === task.task_id ? 'bg-cyan-950/30' : '')}
                          >
                            <span className="block truncate text-xs font-medium text-slate-200">{task.title}</span>
                            <span className="mt-0.5 block truncate font-mono text-[9px] text-slate-500">
                              {task.task_type} · {task.assigned_worker_id ?? 'Unassigned'} · {task.attempts}/{task.max_attempts} attempts
                            </span>
                          </button>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="font-mono text-[9px] text-slate-500">P{task.priority}</span>
                            <span className={'rounded border px-1.5 py-0.5 font-mono text-[9px] ' + statusTone(task.status)}>{task.status}</span>
                            {displayMode === 'LIVE' && session === 'AUTHENTICATED' && isOperatorTask(task) &&
                              ['QUEUED', 'CLAIMED', 'RUNNING', 'RETRY_WAIT'].includes(task.status) && (
                                <button
                                  type="button"
                                  data-testid={'workforce-task-cancel-' + task.task_id}
                                  disabled={commandPending}
                                  onClick={() => void cancelTask(task.task_id)}
                                  className="rounded border border-rose-500/30 px-2 py-1 text-[9px] text-rose-200 disabled:opacity-40"
                                >Cancel</button>
                              )}
                            {displayMode === 'LIVE' && session === 'AUTHENTICATED' && isOperatorTask(task) &&
                              task.status === 'FAILED' && (
                                <button
                                  type="button"
                                  data-testid={'workforce-task-retry-' + task.task_id}
                                  disabled={commandPending}
                                  onClick={() => void retryTask(task.task_id)}
                                  className="rounded border border-amber-500/30 px-2 py-1 text-[9px] text-amber-200 disabled:opacity-40"
                                >Retry</button>
                              )}
                          </span>
                        </div>
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
