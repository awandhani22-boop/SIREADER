import { useEffect, useState, type FormEvent } from 'react';
import { Activity, LogOut, RefreshCw, ShieldCheck, Wifi, WifiOff } from 'lucide-react';
import { LiveApiError } from '../live/live.api';
import { liveController } from '../live/live.controller';
import { createLivePoller, type LivePoller } from '../live/live.poller';
import {
  useLiveStore,
  type LiveResourceSnapshot,
  type LiveResourceStatus,
} from '../live/live.state';
import type {
  ActiveMarketWatchesDto,
  ActivePipelineDto,
  AuditDecisionsDto,
  TelemetryUsageDto,
} from '../live/live.contracts';

function connectionLabel(value: string): string {
  return value.replaceAll('_', ' ');
}

function connectionClass(value: string): string {
  switch (value) {
    case 'LIVE': return 'border-emerald-500/40 bg-emerald-950/70 text-emerald-300';
    case 'STALE': return 'border-amber-500/40 bg-amber-950/70 text-amber-300';
    case 'OFFLINE':
    case 'ERROR': return 'border-rose-500/40 bg-rose-950/70 text-rose-300';
    case 'SESSION_REQUIRED': return 'border-amber-500/40 bg-amber-950/70 text-amber-300';
    default: return 'border-slate-700 bg-slate-900 text-slate-300';
  }
}

function resourceClass(status: LiveResourceStatus): string {
  switch (status) {
    case 'LIVE': return 'text-emerald-300';
    case 'STALE': return 'text-amber-300';
    case 'ERROR': return 'text-rose-300';
    case 'LOADING': return 'text-sky-300';
    default: return 'text-slate-500';
  }
}

function safeErrorMessage(error: unknown): string {
  if (!(error instanceof LiveApiError)) return 'Request failed. Check the local BFF service.';
  switch (error.code) {
    case 'INVALID_CREDENTIALS': return 'Password tidak cocok.';
    case 'RATE_LIMITED': return 'Terlalu banyak percobaan. Coba lagi nanti.';
    case 'AUTH_NOT_CONFIGURED': return 'Operator authentication belum dikonfigurasi di server lokal.';
    case 'SESSION_REQUIRED': return 'Sesi operator sudah berakhir. Login kembali.';
    case 'CSRF_INVALID':
    case 'CSRF_MISSING': return 'Token keamanan sesi tidak valid. Muat ulang sesi dan login kembali.';
    case 'OFFLINE':
    case 'TIMEOUT':
    case 'UNREACHABLE': return 'BFF atau Python API tidak dapat dijangkau.';
    case 'UPSTREAM_AUTH_FAILED': return 'Kredensial server-to-server ditolak atau belum tersedia.';
    case 'SCHEMA_INVALID': return 'Format data backend berubah dan tidak cocok dengan kontrak.';
    case 'UNEXPECTED_RESPONSE': return 'BFF belum tersedia pada jalur ini atau mengembalikan respons yang tidak dikenal.';
    case 'BACKEND_ERROR': return 'Backend mengembalikan error.';
    case 'FORBIDDEN': return 'Permintaan ditolak oleh pemeriksaan keamanan BFF.';
    default: return 'Permintaan LIVE gagal: ' + error.code;
  }
}

function displayTime(timestamp: number | null): string {
  return timestamp === null ? 'Belum tersinkron' : new Date(timestamp).toLocaleTimeString();
}

function displayNumber(value: number): string {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(value);
}

function displayAmount(value: number | string): string {
  return typeof value === 'string' ? value : displayNumber(value);
}

function ResourceHeading<T>({
  title,
  resource,
}: {
  title: string;
  resource: LiveResourceSnapshot<T>;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">{title}</span>
      <span className={'font-mono text-[9px] font-bold ' + resourceClass(resource.status)}>
        {resource.status}
      </span>
    </div>
  );
}

function ResourceError<T>({ resource }: { resource: LiveResourceSnapshot<T> }) {
  if (!resource.error) return null;
  return (
    <p className="mt-1 text-[10px] leading-4 text-amber-300/90">
      Last request: {resource.error}
    </p>
  );
}

export function LiveObservabilityDock() {
  const [poller] = useState<LivePoller>(() => createLivePoller(liveController));
  const [isOpen, setIsOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const connection = useLiveStore((state) => state.connection);
  const session = useLiveStore((state) => state.session);
  const system = useLiveStore((state) => state.resources['/api/v1/system/status']);
  const telemetry = useLiveStore((state) => state.resources['/api/v1/telemetry/usage']);
  const pipeline = useLiveStore((state) => state.resources['/api/v1/pipeline/active']);
  const marketWatches = useLiveStore((state) => state.resources['/api/v1/market-watches/active']);
  const audit = useLiveStore((state) => state.resources['/api/v1/audit/decisions']);

  useEffect(() => {
    void poller.start().catch((error: unknown) => setActionError(safeErrorMessage(error)));
    return () => poller.stop();
  }, [poller]);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || password.length === 0) return;
    const submittedPassword = password;
    setPassword('');
    setActionError(null);
    setIsSubmitting(true);
    try {
      await liveController.login(submittedPassword);
      await poller.start({ skipSessionBootstrap: true });
    } catch (error) {
      setActionError(safeErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function logout() {
    if (isSubmitting) return;
    setActionError(null);
    setIsSubmitting(true);
    poller.stop();
    try {
      await liveController.logout();
    } catch (error) {
      setActionError(safeErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function retrySession() {
    if (isSubmitting) return;
    setActionError(null);
    setIsSubmitting(true);
    poller.stop();
    try {
      await poller.start();
    } catch (error) {
      setActionError(safeErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function refreshAll() {
    if (isSubmitting) return;
    setActionError(null);
    setIsSubmitting(true);
    try {
      await poller.refreshAll();
    } catch (error) {
      setActionError(safeErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  const authenticated = session === 'AUTHENTICATED';

  return (
    <div className="relative pointer-events-auto">
      <button
        type="button"
        data-testid="live-observability-toggle"
        aria-expanded={isOpen}
        aria-controls="live-observability-panel"
        onClick={() => setIsOpen((current) => !current)}
        className="flex items-center gap-2 rounded-md border border-slate-700 bg-[#0B1220] px-2.5 py-1.5 text-[10px] font-semibold text-slate-200 shadow-xl transition-colors hover:border-cyan-500/50 hover:text-white"
      >
        <span className="text-cyan-300">LIVE BACKEND</span>
        <span className={'rounded border px-1.5 py-0.5 font-mono text-[9px] ' + connectionClass(connection)}>
          {connectionLabel(connection)}
        </span>
      </button>

      {isOpen && (
        <section
          id="live-observability-panel"
          role="dialog"
          aria-label="LIVE backend observability"
          data-testid="live-observability-panel"
          className="absolute right-0 top-full z-[80] mt-2 max-h-[min(72vh,680px)] w-[min(390px,calc(100vw-24px))] overflow-y-auto rounded-xl border border-slate-700 bg-[#080F1C] p-3 text-slate-100 shadow-2xl shadow-black/50"
        >
          <div className="mb-3 flex items-start justify-between gap-3 border-b border-slate-800 pb-2">
            <div>
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-cyan-300" />
                <h2 className="text-xs font-bold tracking-wide text-white">LIVE OBSERVABILITY</h2>
              </div>
              <p className="mt-1 text-[10px] text-slate-500">
                Data backend terautentikasi · terpisah dari SIMULATION MODE
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-white"
              aria-label="Close LIVE observability panel"
            >
              ×
            </button>
          </div>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className={'inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[10px] font-semibold ' + connectionClass(connection)}>
              {connection === 'LIVE' ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {connectionLabel(connection)}
            </span>
            <span className="text-[10px] text-slate-500">Session: {session.toLowerCase()}</span>
          </div>

          {actionError && (
            <p role="alert" className="mb-3 rounded border border-rose-500/30 bg-rose-950/30 px-2.5 py-2 text-[11px] text-rose-200">
              {actionError}
            </p>
          )}

          {!authenticated && (session === 'UNAUTHENTICATED' || connection === 'SESSION_REQUIRED') && (
            <form onSubmit={(event) => void submitLogin(event)} className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/50 p-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-amber-300" />
                <h3 className="text-xs font-semibold text-white">Operator login</h3>
              </div>
              <p className="text-[10px] leading-4 text-slate-400">
                Masukkan password operator lokal. Password hanya dikirim ke BFF same-origin dan tidak disimpan di LIVE store.
              </p>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                maxLength={256}
                required
                aria-label="Operator password"
                placeholder="Operator password"
                className="w-full rounded border border-slate-700 bg-[#060B14] px-3 py-2 text-xs text-white outline-none transition-colors focus:border-cyan-500"
              />
              <button
                type="submit"
                disabled={isSubmitting || password.length === 0}
                className="flex w-full items-center justify-center gap-2 rounded bg-cyan-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                {isSubmitting ? 'Checking…' : 'Authenticate operator'}
              </button>
            </form>
          )}

          {!authenticated && session === 'UNKNOWN' && (
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
              <p className="text-xs font-semibold text-white">Session status belum terverifikasi.</p>
              <p className="mt-1 text-[10px] leading-4 text-slate-400">
                Tidak ada data LIVE yang dianggap valid sebelum BFF mengonfirmasi sesi operator.
              </p>
              <button
                type="button"
                onClick={() => void retrySession()}
                disabled={isSubmitting}
                className="mt-3 flex items-center gap-2 rounded border border-slate-700 px-3 py-1.5 text-[11px] text-slate-200 hover:border-cyan-500/50 disabled:opacity-50"
              >
                <RefreshCw className="h-3 w-3" />
                Retry session check
              </button>
            </div>
          )}

          {authenticated && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-slate-500">Authenticated operator session</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void refreshAll()}
                    disabled={isSubmitting}
                    aria-label="Refresh LIVE data"
                    className="rounded border border-slate-700 p-1.5 text-slate-300 hover:border-cyan-500/50 hover:text-white disabled:opacity-50"
                  >
                    <RefreshCw className={isSubmitting ? 'h-3 w-3 animate-spin' : 'h-3 w-3'} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void logout()}
                    disabled={isSubmitting}
                    className="flex items-center gap-1 rounded border border-slate-700 px-2 py-1.5 text-[10px] text-slate-300 hover:border-rose-500/50 hover:text-rose-200 disabled:opacity-50"
                  >
                    <LogOut className="h-3 w-3" />
                    Logout
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-2.5" data-testid="live-system-card">
                  <ResourceHeading title="System" resource={system} />
                  <p className="mt-2 text-xs font-semibold text-white">API: {system.data?.api_status ?? '—'}</p>
                  <p className="mt-1 text-[10px] text-slate-400">Database: {system.data?.database_status ?? '—'}</p>
                  <p className="mt-1 text-[9px] text-slate-500">Updated: {displayTime(system.fetchedAt)}</p>
                  <ResourceError resource={system} />
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-2.5" data-testid="live-pipeline-card">
                  <ResourceHeading title="Pipeline" resource={pipeline} />
                  <p className="mt-2 text-lg font-bold tabular-nums text-white">{pipeline.data ? displayNumber(pipeline.data.total_in_flight) : '—'}</p>
                  <p className="text-[10px] text-slate-400">In-flight analyses</p>
                  <p className="mt-1 text-[10px] text-slate-400">Queued: {pipeline.data ? displayNumber(pipeline.data.total_queued) : '—'}</p>
                  <p className="mt-1 text-[9px] text-slate-500">Not OS worker heartbeat</p>
                  {!pipeline.data && <p className="mt-1 text-[9px] text-slate-500">Waiting for backend data.</p>}
                  <ResourceError resource={pipeline} />
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-2.5" data-testid="live-market-card">
                  <ResourceHeading title="Market watches" resource={marketWatches} />
                  <p className="mt-2 text-lg font-bold tabular-nums text-white">{marketWatches.data ? displayNumber(marketWatches.data.total_active_watches) : '—'}</p>
                  <p className="text-[10px] text-slate-400">Active backend watches</p>
                  <div className="mt-1 space-y-0.5">
                    {marketWatches.data?.watches.slice(0, 3).map((watch) => (
                      <p key={watch.watch_id} className="text-[10px] text-slate-300">
                        {watch.symbol} · {watch.status.replaceAll('_', ' ')}
                      </p>
                    ))}
                    {marketWatches.data?.watches.length === 0 && (
                      <p className="text-[10px] text-slate-500">No market watches returned.</p>
                    )}
                    {!marketWatches.data && <p className="text-[10px] text-slate-500">Waiting for backend data.</p>}
                  </div>
                  <ResourceError resource={marketWatches} />
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-2.5" data-testid="live-telemetry-card">
                  <ResourceHeading title="AI usage" resource={telemetry} />
                  <div className="mt-2 space-y-1">
                    {telemetry.data?.currencies.map((item) => (
                      <div key={item.currency}>
                        <p className="text-xs font-semibold tabular-nums text-white">
                          {item.currency} {displayAmount(item.total_cost)}
                        </p>
                        <p className="text-[10px] text-slate-400">{displayNumber(item.total_requests)} requests</p>
                      </div>
                    ))}
                    {telemetry.data?.budget && (
                      <div className="mt-3 space-y-2 border-t border-slate-800 pt-2" data-testid="live-budget-observability">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-semibold text-slate-200">Daily IDR budget</span>
                          <span className={'text-[9px] font-semibold ' + (telemetry.data.budget.daily_idr.warning_level === 'NONE' ? 'text-emerald-300' : 'text-amber-300')}>
                            {telemetry.data.budget.daily_idr.warning_level}
                          </span>
                        </div>
                        <p className="text-[11px] tabular-nums text-white">
                          Rp {displayAmount(telemetry.data.budget.daily_idr.projected_cost)} / Rp {displayAmount(telemetry.data.budget.daily_idr.budget_amount)}
                        </p>
                        <div className="h-1.5 overflow-hidden rounded bg-slate-800">
                          <div className="h-full rounded bg-cyan-500" style={{ width: Math.min(100, Number(telemetry.data.budget.daily_idr.percent_used)) + '%' }} />
                        </div>
                        <p className="text-[9px] text-slate-500">
                          Actual {displayAmount(telemetry.data.budget.daily_idr.actual_cost)} · reserved {displayAmount(telemetry.data.budget.daily_idr.reserved_cost)} · hard limit Rp {displayAmount(telemetry.data.budget.daily_idr.hard_limit_amount ?? 0)}
                        </p>
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <div>
                            <p className="text-[9px] text-slate-500">Rolling 30-day IDR</p>
                            <p className="text-[10px] font-semibold text-white">Rp {displayAmount(telemetry.data.budget.rolling_month_idr.projected_cost)} / {displayAmount(telemetry.data.budget.rolling_month_idr.budget_amount)}</p>
                          </div>
                          <div>
                            <p className="text-[9px] text-slate-500">Anthropic monthly USD</p>
                            <p className="text-[10px] font-semibold text-white">$ {displayAmount(telemetry.data.budget.monthly_anthropic_usd.projected_cost)} / {displayAmount(telemetry.data.budget.monthly_anthropic_usd.budget_amount)}</p>
                          </div>
                        </div>
                        <p className="text-[9px] text-slate-500">
                          Anthropic daily hard cap: $ {displayAmount(telemetry.data.budget.daily_anthropic_usd.projected_cost)} / $ {displayAmount(telemetry.data.budget.daily_anthropic_usd.budget_amount)}
                          {Number(telemetry.data.budget.daily_anthropic_usd.budget_amount) <= 0 ? ' · LIVE DISABLED' : ''}
                        </p>
                        <div>
                          <p className="mb-1 text-[9px] text-slate-500">IDR tier allocation</p>
                          <div className="space-y-1">
                            {telemetry.data.budget.idr_tiers.map((tier) => (
                              <div key={tier.tier} className="flex items-center justify-between gap-2 text-[9px]">
                                <span className="text-slate-400">{tier.tier}</span>
                                <span className="tabular-nums text-slate-200">{displayAmount(tier.projected_cost)} / {displayAmount(tier.budget_amount)} {tier.budget_reached ? '· LIMIT' : ''}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="mb-1 text-[9px] text-slate-500">Workforce cost attribution</p>
                          {telemetry.data.budget.worker_breakdown.slice(0, 4).map((worker) => (
                            <div key={worker.worker_id + worker.currency} className="flex items-center justify-between text-[9px]">
                              <span className="text-slate-400">{worker.worker_id} · {worker.currency}</span>
                              <span className="tabular-nums text-slate-200">{displayAmount(worker.projected_cost)}</span>
                            </div>
                          ))}
                          {telemetry.data.budget.recent_task_costs.slice(0, 3).map((task) => (
                            <div key={task.task_id + task.currency} className="flex items-center justify-between gap-2 text-[9px]">
                              <span className="truncate text-slate-500">{task.task_id} · {task.worker_id}</span>
                              <span className="shrink-0 tabular-nums text-slate-300">{task.currency} {displayAmount(task.projected_cost)}</span>
                            </div>
                          ))}
                          {telemetry.data.budget.worker_breakdown.length === 0 && (
                            <p className="text-[9px] text-slate-600">No workforce-attributed provider cost yet.</p>
                          )}
                        </div>
                      </div>
                    )}
                    {telemetry.data?.currencies.length === 0 && (
                      <p className="text-[10px] text-slate-500">No usage records returned.</p>
                    )}
                    {!telemetry.data && <p className="text-[10px] text-slate-500">Waiting for validated telemetry.</p>}
                  </div>
                  <ResourceError resource={telemetry} />
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-2.5" data-testid="live-audit-card">
                <ResourceHeading title="Decision audit" resource={audit} />
                <p className="mt-2 text-xs font-semibold text-white">{audit.data ? displayNumber(audit.data.total_returned) : '—'} records returned</p>
                <div className="mt-1 space-y-1">
                  {audit.data?.decisions.slice(0, 3).map((decision) => (
                    <div key={decision.audit_id} className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="truncate text-slate-300">#{decision.audit_id} · {decision.new_status}</span>
                      <span className={decision.decision === 'APPROVED' ? 'text-emerald-300' : 'text-rose-300'}>
                        {decision.decision}
                      </span>
                    </div>
                  ))}
                  {audit.data?.decisions.length === 0 && (
                    <p className="text-[10px] text-slate-500">No audit decisions returned.</p>
                  )}
                  {!audit.data && <p className="text-[10px] text-slate-500">Waiting for audit data.</p>}
                </div>
                <ResourceError resource={audit} />
              </div>

              <p className="text-[9px] leading-4 text-slate-500">
                LIVE figures come only from the authenticated Python API through the BFF. Simulation counters in the top bar remain separate and are never used as fallback data.
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
