import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ClipboardCheck, RefreshCw, X } from 'lucide-react';
import { LiveApiError } from '../live/live.api';
import { liveController } from '../live/live.controller';
import { useLiveStore } from '../live/live.state';
import type {
  AdjudicateWorkforceReviewRequest,
  WorkforceTaskReviewDetailDto,
  WorkforceTaskReviewSummaryDto,
} from '../live/live.contracts';

function friendlyError(error: unknown): string {
  if (!(error instanceof LiveApiError)) return 'Review request failed. Check the local BFF service.';
  if (error.code === 'SESSION_REQUIRED' || error.code === 'CSRF_INVALID') return 'Sesi operator berakhir. Login kembali.';
  if (error.code === 'BACKEND_ERROR') return 'Review berubah atau sudah diproses. Muat ulang daftar sebelum mencoba lagi.';
  if (error.code === 'SCHEMA_INVALID') return 'Format review dari backend tidak sesuai kontrak.';
  if (error.code === 'UNREACHABLE' || error.code === 'TIMEOUT' || error.code === 'OFFLINE') return 'Backend review tidak dapat dijangkau.';
  return 'Review request gagal: ' + error.code;
}

function displayDate(value: string): string {
  return new Date(value).toLocaleString('id-ID');
}

function jsonText(value: Readonly<Record<string, unknown>> | null): string {
  return value === null ? '' : JSON.stringify(value, null, 2);
}

export function ReviewInbox() {
  const session = useLiveStore((state) => state.session);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<readonly WorkforceTaskReviewSummaryDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<WorkforceTaskReviewDetailDto | null>(null);
  const [editText, setEditText] = useState('');
  const [notes, setNotes] = useState('');
  const [reasonCode, setReasonCode] = useState('QUALITY_REJECTED');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Invalidate in-flight read/write completions on logout or a newer selection.
  const requestEpoch = useRef(0);
  const isCurrentRequest = useCallback((epoch: number) =>
    epoch === requestEpoch.current &&
    useLiveStore.getState().session === 'AUTHENTICATED',
  []);

  const load = useCallback(async (nextOffset = 0, preferredId: string | null = null) => {
    if (session !== 'AUTHENTICATED') return;
    const epoch = ++requestEpoch.current;
    setLoading(true);
    setError(null);
    try {
      const page = await liveController.getPendingWorkforceReviews(25, nextOffset);
      if (!isCurrentRequest(epoch)) return;
      setItems(page.reviews.filter((item) => item.status === 'PENDING'));
      setOffset(page.offset);
      setTotal(page.total_count);
      const nextId = preferredId && page.reviews.some((item) => item.review_id === preferredId && item.status === 'PENDING')
        ? preferredId
        : page.reviews.find((item) => item.status === 'PENDING')?.review_id ?? null;
      setSelectedId(nextId);
      if (nextId) {
        const record = await liveController.getWorkforceReview(nextId);
        if (!isCurrentRequest(epoch)) return;
        setDetail(record);
        setEditText(jsonText(record.original_output));
      } else {
        setDetail(null);
        setEditText('');
      }
    } catch (requestError) {
      if (!isCurrentRequest(epoch)) return;
      setError(friendlyError(requestError));
      setDetail(null);
    } finally {
      if (isCurrentRequest(epoch)) setLoading(false);
    }
  }, [isCurrentRequest, session]);

  useEffect(() => {
    if (session !== 'AUTHENTICATED') {
      requestEpoch.current += 1;
      setItems([]);
      setSelectedId(null);
      setDetail(null);
      setEditText('');
      setNotes('');
      setReasonCode('QUALITY_REJECTED');
      setOffset(0);
      setTotal(0);
      setLoading(false);
      setSubmitting(false);
      setOpen(false);
      setError(null);
      setNotice(null);
    }
  }, [session]);

  useEffect(() => {
    if (open && session === 'AUTHENTICATED') void load(0, null);
  }, [open, session, load]);

  async function selectReview(reviewId: string) {
    const epoch = ++requestEpoch.current;
    setSelectedId(reviewId);
    setDetail(null);
    setEditText('');
    setError(null);
    try {
      const record = await liveController.getWorkforceReview(reviewId);
      if (!isCurrentRequest(epoch)) return;
      setDetail(record);
      setEditText(jsonText(record.original_output));
      setNotes('');
    } catch (requestError) {
      if (!isCurrentRequest(epoch)) return;
      setError(friendlyError(requestError));
    }
  }

  async function adjudicate(decision: AdjudicateWorkforceReviewRequest['decision']) {
    if (!detail || submitting || detail.status !== 'PENDING') return;
    let adjusted: Readonly<Record<string, unknown>> | null = null;
    if (decision === 'EDITED') {
      try {
        const parsed: unknown = JSON.parse(editText);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          setError('Output revisi harus berupa JSON object.');
          return;
        }
        adjusted = parsed as Record<string, unknown>;
      } catch {
        setError('Output revisi bukan JSON yang valid.');
        return;
      }
    }
    const request: AdjudicateWorkforceReviewRequest = {
      review_id: detail.review_id,
      decision,
      expected_original_sha256: detail.original_output_sha256,
      adjusted_output: adjusted,
      reason_code: decision === 'REJECTED' ? reasonCode : null,
      notes: notes.trim() || null,
    };
    const epoch = requestEpoch.current;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const result = await liveController.sendWorkforceCommand('/api/v1/commands/reviews/adjudicate', request);
      if (!isCurrentRequest(epoch)) return;
      setNotice('Review ' + decision + ' berhasil dicatat. Audit command: ' + result.command_id);
      await load(offset, null);
    } catch (requestError) {
      if (!isCurrentRequest(epoch)) return;
      setError(friendlyError(requestError));
    } finally {
      if (isCurrentRequest(epoch)) setSubmitting(false);
    }
  }

  if (session !== 'AUTHENTICATED') return null;

  return (
    <div className="absolute top-16 right-3 z-30 pointer-events-auto">
      <button
        type="button"
        data-testid="review-inbox-toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-md border border-violet-500/40 bg-[#0B1220] px-3 py-2 text-[11px] font-semibold text-violet-200 shadow-xl hover:border-violet-400"
      >
        <ClipboardCheck className="h-3.5 w-3.5" />
        Review Inbox
      </button>
      {open && (
        <section
          data-testid="review-inbox-panel"
          aria-label="Human Review Inbox"
          className="mt-2 flex h-[min(680px,calc(100vh-132px))] w-[min(820px,calc(100vw-24px))] flex-col overflow-hidden rounded-xl border border-slate-700 bg-[#07101E]/98 shadow-2xl backdrop-blur"
        >
          <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <div>
              <h2 className="text-sm font-bold text-white">Human Review Inbox</h2>
              <p className="text-[10px] text-slate-400">{total} review record · hanya status PENDING yang dapat diproses</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" data-testid="review-inbox-refresh" onClick={() => void load(offset, selectedId)} disabled={loading || submitting}
                className="rounded border border-slate-700 p-2 text-slate-300 disabled:opacity-40" aria-label="Refresh reviews">
                <RefreshCw className={'h-3.5 w-3.5 ' + (loading ? 'animate-spin' : '')} />
              </button>
              <button type="button" onClick={() => setOpen(false)} className="rounded border border-slate-700 p-2 text-slate-300" aria-label="Close review inbox">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </header>
          {error && <p role="alert" className="border-b border-rose-900/70 bg-rose-950/40 px-4 py-2 text-xs text-rose-200">{error}</p>}
          {notice && <p role="status" className="border-b border-emerald-900/70 bg-emerald-950/40 px-4 py-2 text-xs text-emerald-200">{notice}</p>}
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(190px,0.8fr)_minmax(0,1.8fr)]">
            <aside className="min-h-0 overflow-y-auto border-r border-slate-800">
              {loading && items.length === 0 && <p className="p-4 text-xs text-slate-400">Memuat review…</p>}
              {!loading && items.length === 0 && <p className="p-4 text-xs text-slate-500">Tidak ada review PENDING.</p>}
              {items.map((item) => (
                <button key={item.review_id} type="button" onClick={() => void selectReview(item.review_id)}
                  className={'block w-full border-b border-slate-800/80 p-3 text-left hover:bg-slate-900 ' +
                    (selectedId === item.review_id ? 'bg-violet-950/40' : 'bg-transparent')}
                  data-testid={'review-row-' + item.review_id}>
                  <span className="block truncate font-mono text-[10px] text-violet-200">{item.review_id}</span>
                  <span className="mt-1 block truncate text-[10px] text-slate-400">Task {item.task_id}</span>
                  <span className="mt-1 block text-[9px] text-amber-300">Expires {displayDate(item.review_expires_at)}</span>
                </button>
              ))}
              <div className="flex items-center justify-between p-2">
                <button type="button" disabled={offset <= 0 || loading} onClick={() => void load(Math.max(0, offset - 25), null)}
                  className="rounded border border-slate-700 px-2 py-1 text-[10px] disabled:opacity-30">Previous</button>
                <button type="button" disabled={offset + 25 >= total || loading} onClick={() => void load(offset + 25, null)}
                  className="rounded border border-slate-700 px-2 py-1 text-[10px] disabled:opacity-30">Next</button>
              </div>
            </aside>
            <div className="min-h-0 overflow-y-auto p-4">
              {!detail && <p className="text-xs text-slate-500">Pilih satu review untuk memeriksa output yang dikarantina.</p>}
              {detail && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-bold text-white">{detail.review_id}</h3>
                      <p className="text-[10px] text-slate-400">Task {detail.task_id} · Attempt {detail.attempt_id}</p>
                    </div>
                    <span className="rounded border border-amber-500/40 bg-amber-950/40 px-2 py-1 font-mono text-[9px] text-amber-200">{detail.status}</span>
                  </div>
                  <div className="rounded border border-slate-800 bg-slate-950/80 p-2">
                    <p className="text-[9px] uppercase tracking-wider text-slate-500">Original output SHA-256</p>
                    <code className="break-all text-[10px] text-slate-300">{detail.original_output_sha256}</code>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label htmlFor="review-original-output" className="text-[10px] font-semibold text-slate-300">Quarantined original output</label>
                      <span className="text-[9px] text-slate-500">read-only</span>
                    </div>
                    <pre id="review-original-output" className="max-h-44 overflow-auto whitespace-pre-wrap break-words rounded border border-slate-800 bg-slate-950 p-3 text-[10px] text-slate-300">{jsonText(detail.original_output)}</pre>
                  </div>
                  {detail.payload_purged_at && <p className="text-[10px] text-amber-300">Payload purged at {displayDate(detail.payload_purged_at)}. Output detail is unavailable.</p>}
                  <div>
                    <label htmlFor="review-edit-output" className="mb-1 block text-[10px] font-semibold text-slate-300">Edited output (JSON object)</label>
                    <textarea id="review-edit-output" data-testid="review-edit-output" value={editText} onChange={(event) => setEditText(event.target.value)}
                      rows={8} spellCheck={false} className="w-full rounded border border-slate-700 bg-slate-950 p-2 font-mono text-[10px] text-slate-200 outline-none focus:border-violet-500" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label htmlFor="review-reject-reason" className="mb-1 block text-[10px] text-slate-400">Reject reason code</label>
                      <input id="review-reject-reason" value={reasonCode} onChange={(event) => setReasonCode(event.target.value.slice(0, 48))}
                        className="w-full rounded border border-slate-700 bg-slate-950 p-2 text-[10px] text-slate-200" />
                    </div>
                    <div>
                      <label htmlFor="review-notes" className="mb-1 block text-[10px] text-slate-400">Operator notes (optional)</label>
                      <input id="review-notes" value={notes} onChange={(event) => setNotes(event.target.value.slice(0, 500))}
                        className="w-full rounded border border-slate-700 bg-slate-950 p-2 text-[10px] text-slate-200" />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 border-t border-slate-800 pt-3">
                    <button type="button" data-testid="review-approve" disabled={submitting || detail.status !== 'PENDING' || !detail.original_output}
                      onClick={() => void adjudicate('APPROVED')}
                      className="inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-950/40 px-3 py-2 text-[10px] font-semibold text-emerald-200 disabled:opacity-40">
                      <Check className="h-3 w-3" /> Approve
                    </button>
                    <button type="button" data-testid="review-edit" disabled={submitting || detail.status !== 'PENDING' || !detail.original_output}
                      onClick={() => void adjudicate('EDITED')}
                      className="rounded border border-sky-500/40 bg-sky-950/40 px-3 py-2 text-[10px] font-semibold text-sky-200 disabled:opacity-40">
                      Save edit & approve
                    </button>
                    <button type="button" data-testid="review-reject" disabled={submitting || detail.status !== 'PENDING'}
                      onClick={() => void adjudicate('REJECTED')}
                      className="rounded border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-[10px] font-semibold text-rose-200 disabled:opacity-40">
                      Reject
                    </button>
                    {submitting && <span className="self-center text-[10px] text-slate-400">Saving decision…</span>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
