# SIREADER Phase 3.3 — SSE Execution Log

**State:** CODE IMPLEMENTED ON ISOLATED BRANCHES; CORE OWNER MANUAL SSE ACCEPTANCE PASSED; SUPPLEMENTARY GATES OPEN  
**Date:** 2026-11-09  
**Do not merge to main without owner approval.

## Repository branches

- Virtual Office: phase-3-3-sse-implementation
- Python Backend: phase-3-3-sse-implementation
- Phase 3.2 remains complete on its accepted branch/documentation baseline. Phase 3.3 code has not been merged to either repository's main branch.

## Implemented scope

### 3.3-A — Event contract and database migration

Python Backend:
- Added migration 2026_11_09_observability_events.sql and matching rollback.
- Six fixed resource keys map to the six existing observability source tables.
- AFTER INSERT/UPDATE/DELETE row triggers on source tables; audit decisions are INSERT-only.
- AFTER TRUNCATE statement triggers are included for all six sources.
- No row values enter pg_notify; only fixed resource keys.
- Trigger function has a fixed pg_catalog search path and is not SECURITY DEFINER.
- Migration is idempotent and has rollback SQL.
- Disposable PostgreSQL integration test covers trigger mapping, idempotency, rollback semantics, TRUNCATE notification, and LISTEN while default_transaction_read_only=on.

### 3.3-B — Python listener and SSE route

- Added app/api/event_stream.py with one dedicated Psycopg 3 async LISTEN connection using the existing read-only database URL.
- Listener connection explicitly sets default_transaction_read_only=on, search_path=public, application name, a 5-second connect timeout, and TCP keepalive. It verifies six row triggers, six TRUNCATE triggers, zero SECURITY DEFINER functions, and fixed search_path=pg_catalog before marking stream ready; without the migration the route stays 503 and snapshot polling is not demoted.
- Listener reconnect uses bounded exponential backoff and jitter. Snapshot API startup and GET routes remain independent of listener readiness.
- Added an in-memory EventHub: 512-event replay ring, 64-item per-subscriber queue, max four subscribers, 100ms coalescing, 15-second heartbeat, process epoch + monotonic sequence IDs.
- Cursor validation handles malformed, foreign-epoch, future, and expired cursors with reset/resnapshot semantics.
- Overflow and listener disconnect close the subscriber with a reset event; no unbounded queue.
- Added authenticated GET /api/v1/events/stream; it returns 503 until the listener is ready. Existing five GET snapshots remain authoritative.

### 3.3-C — Express BFF stream proxy

Virtual Office:
- Added one exact GET allowlist route /api/v1/events/stream.
- Reuses operator session and Host/Origin/Fetch-Metadata guards.
- Injects the server-only bearer token and validated Last-Event-ID; does not forward browser Cookie, browser Authorization, query tokens, or arbitrary headers.
- Fixed loopback upstream path/origin; 5-second connection-establishment timeout, maximum four active streams, redirect and content-type validation.
- Pipes the upstream response with Node stream backpressure; aborts upstream on browser disconnect. Does not buffer the full SSE response.
- Sets no-cache/no-transform, keep-alive, anti-buffering, and nosniff headers; no CORS headers.

### 3.3-D — Frontend EventSource and snapshot fallback

Virtual Office:
- Opens same-origin EventSource only after authenticated session bootstrap.
- Strictly validates the versioned event schema, event ID, timestamp, and allowlisted resource names.
- Ignores duplicate sequence IDs; full-resyncs on epoch change or sequence gap; targeted refreshes for normal resource invalidations.
- Preserves invalidations that occur while a snapshot request is in flight.
- When SSE is healthy, continues 60-second snapshot reconciliation.
- On stream failure/reset, falls back to original 10s system/pipeline/market and 30s telemetry/audit polling with bounded reconnect attempts.
- Closing the poller closes EventSource and clears retry timers; existing session/logout flow remains the owner of private LIVE data clearing.
- SSE events never enter the simulation store or drive the 3D render loop.

## CI evidence

### Virtual Office
- Implementation code commit: 57e3f2d1d1eb3a616eb6792f69294f0d3072e261 (current documentation branch head may be later)
- GitHub Actions run: 42534082388
- Result: **367/367 tests passed, 0 failed; TypeScript check passed; production build passed.**
- This includes SSE BFF proxy integration/security tests, frontend event schema tests, poller invalidation/fallback tests, and existing regression suite.

### Python Backend
- Latest backend implementation commit: `b596de70e5f6dacb847fcd6bdf432907cf5e5f34`.
- GitHub Actions run: `42537576568` completed with **success** on that exact SHA; API tests, API compile checks, and core regressions passed.
- The implementation did not itself apply the live Supabase migration. During owner-run local acceptance, the listener became ready: the authenticated SSE route returned 200, which only happens after the listener's database connection, LISTEN registration, and migration-inventory/security checks pass. The startup `SSE_LISTENER_READY` line was not captured in the supplied terminal transcript.

## Owner manual acceptance evidence (2026-11-09)

The following results were reported and shown by the owner during local Windows/Chrome testing. They are manual owner-reported evidence, not independently captured telemetry artifacts:

- Python API launched on `127.0.0.1:8000` with the explicit Windows Selector event loop; the five snapshot endpoints returned HTTP 200.
- Authenticated `GET /api/v1/events/stream` returned HTTP 200. The route is fail-closed and only serves a subscriber when `EventHub.listener_ready` is true; that state is set after PostgreSQL connect, `LISTEN`, and the six-row/six-TRUNCATE-trigger plus function-safety inventory checks.
- A controlled `pg_notify('sireader_observability_v1', 'system')` produced a browser `resources.invalidated` event for `system`, followed by a fresh `GET /api/v1/system/status` returning 200. This proves the LISTEN → EventHub → BFF → EventSource → targeted snapshot-refresh path. It does **not** by itself prove table-trigger mapping.
- After stopping and restarting the Python API, the owner observed snapshot requests returning 200 again and confirmed a new SSE request returned 200/remaining open in Chrome. This is owner-confirmed backend-restart recovery; a separate BFF restart has not been tested.
- One app stream plus three temporary EventSource probes connected successfully (three `CONNECTED` console messages). The probes remained open for the five-minute test window and auto-closed without a reported `CONNECTION ERROR`; the app stream remained active.
- Owner-provided Windows process sampling ran for approximately five minutes at 10-second intervals while the four streams were active. No tracked process was reported missing. Results (CPU percentages normalized by logical processor count; peak is the maximum sampled 10-second interval average):
  | Process | PID | Avg CPU | Max sampled interval CPU | Working Set start → end | Working Set peak | Private memory peak |
  |---|---:|---:|---:|---:|---:|---:|
  | Python Backend | 17428 | 0.01% | 0.05% | 88.44 → 88.61 MB | 88.65 MB | 66.07 MB |
  | BFF | 18588 | 0.00% | 0.02% | 65.33 → 65.85 MB | 66.92 MB | 73.61 MB |
  | Vite | 25304 | 0.00% | 0.04% | 178.55 → 176.78 MB | 178.77 MB | 249.73 MB |
- Interpretation is limited to this owner-run sample: process CPU was very low and sampled Working Set stayed nearly flat. These are OS process metrics, not Chrome JavaScript heap or browser scene performance measurements; no formal numeric resource budget has yet been approved.
- Owner subsequently reported the five-minute browser resource observation as safe with no visible issue. Exact Performance Monitor values (CPU, JS heap, DOM nodes, JS event listeners) were not supplied, so this is qualitative evidence only and not a numeric browser-performance acceptance result.
- The earlier general five-minute stability observation was also reported as safe, but no browser performance trace or heartbeat comment-frame capture was supplied.

## Remaining acceptance gates

1. Verify actual table-trigger-to-resource mapping with controlled row changes in a disposable/staging database. The manual `pg_notify` test validates the listener path, not the triggers; keep the live trading/message/audit rows untouched.
2. Process-level CPU/Working Set/Private-memory sampling for the four-stream five-minute smoke has been recorded above. Still capture an idle heartbeat frame or equivalent server-side evidence, measure Chrome JavaScript heap/browser performance under four concurrent streams and sustained idle connections, and define an explicit resource budget before calling performance acceptance complete. Do not increase capacities without measurements.
3. Test BFF restart, browser/network interruption with polling fallback, logout/session expiry closing the EventSource, and no reconnect/late private-state writes after logout. Backend API restart recovery has passed by owner report.
4. Keep duplicate IDs, sequence gaps, replay reset, subscriber overflow/capacity, and schema validation covered by CI tests; add manual checks only if a regression or production issue warrants them.
5. Reconfirm SIMULATED activity cannot alter LIVE event/snapshot state; existing Phase 3.2 owner isolation acceptance and Phase 3.3 automated boundaries are evidence, but the post-SSE manual interaction was not separately demonstrated in this acceptance session.

**Phase 3.3 remains IMPLEMENTATION IN PROGRESS.** Core end-to-end event delivery, targeted snapshot refresh, backend restart recovery, and four-stream five-minute no-error concurrency smoke passed by owner report. Do not start Phase 4 until every remaining gate is closed and recorded.
