# SIREADER Phase 3.3 — SSE Execution Log

**State:** IMPLEMENTATION AND AUTOMATED ACCEPTANCE PASSED ON ISOLATED BRANCHES; OWNER CHROME ACCEPTANCE OPEN  
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
- Initial Phase 3.3 implementation code commit: `57e3f2d1d1eb3a616eb6792f69294f0d3072e261`.
- Initial GitHub Actions run: `42534082388`; **367/367 tests passed, TypeScript check passed, and production build passed.**
- Follow-up BFF disconnect/capacity test commit: `e1a91a0cc018269b4d830568c402e7958ee32389`; GitHub Actions run `42572749792` completed with **success** (full test suite, TypeScript, production build). The HTTP integration test keeps one SSE stream open with a one-stream test cap, asserts a second connection receives 503 + Retry-After, destroys the browser response, verifies the BFF aborts the upstream signal and cancels its body, then verifies a new stream is accepted after the slot is released.
- Follow-up active-session-expiry test commit: `51fe17fe06b16f1766e9c4abdf26a4adcf5bd4d4`; GitHub Actions run `42572901195` completed with **success** (full test suite, TypeScript, production build). The fake-clock test opens SSE, simulates the snapshot endpoint returning SESSION_REQUIRED at the healthy-SSE 60-second reconciliation, and asserts the poller stops, EventSource closes, private LIVE snapshots clear, and timers are removed.
- Together with the original suite, this covers SSE BFF proxy integration/security, browser event schema validation, targeted invalidation, polling fallback, stream reset/reconnect, upstream cancellation/capacity release, and active-session expiry cleanup.

### Python Backend
- Backend heartbeat-test commit: `b8dac552decc0c25a9aca176d81cd6b387d6bc4a`.
- GitHub Actions run: `42572336352` completed with **success** on that exact SHA; API tests (including disposable PostgreSQL integration), API compile checks, and core regressions passed.
- The SSE route's idle heartbeat is 15 seconds. The new `test_idle_event_stream_emits_heartbeat_comment_and_unsubscribes` exercises the actual response generator: it asserts the initial retry directive, the `: ping` comment after an idle timeout, and subscriber cleanup after disconnect. This is automated server-side heartbeat-frame evidence; no manual Chrome comment-frame capture was supplied.
- The workflow provisions a disposable PostgreSQL 16 service and sets `SIREADER_TEST_POSTGRES_URL`. The preceding privilege test provisions the six source tables; `test_event_migration_postgres.py` applies the event migration twice, asserts six row-trigger tables and six TRUNCATE-trigger tables with zero SECURITY DEFINER/unsafe-search-path functions, inserts into all six source tables and checks the expected resource payloads (`system`, `telemetry`, `pipeline`, `pipeline`, `market_watches`, `audit`), verifies rollback transactions emit no notification, and verifies `approval_decisions` TRUNCATE emits `audit`. This confirms trigger mapping in disposable CI PostgreSQL, not in the live Supabase database.
- The implementation did not itself apply the live Supabase migration. During owner-run local acceptance, the authenticated SSE route returned 200; by route contract this only happens after the listener's database connection, LISTEN registration, and migration-inventory/security checks pass. The startup `SSE_LISTENER_READY` line was not captured in the supplied terminal transcript.

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


## Follow-up reliability hardening (2026-11-09)

The following code-level gaps were addressed after the owner acceptance review:

- Added `server/shutdown.ts` and wired it into the BFF process signal handler. Shutdown now stops accepting new HTTP requests with `server.close()`, then force-closes remaining HTTP connections with `server.closeAllConnections()`. This is required because long-lived SSE responses otherwise keep active HTTP connections open. The resulting response-close path is expected to abort the upstream Fetch request and destroy its streaming body through the existing BFF SSE cleanup handler.
- Added a BFF integration regression test in `server/sse.test.ts` that opens a real loopback HTTP SSE response, invokes the same shutdown helper used by the process entrypoint, and asserts server closure, upstream AbortSignal, and upstream body cancellation.
- Added a frontend regression test in `src/live/live.poller.test.ts` that simulates a browser network interruption, proves normal 10-second/30-second polling resumes, then simulates native EventSource reconnection and proves the 60-second reconciliation cadence returns.
- Added a cross-store isolation regression test in `src/live/live.poller.test.ts`: a LIVE SSE invalidation refreshes the LIVE pipeline snapshot without mutating the SIMULATED worker/task/time/event state; a later deterministic SIMULATED step does not mutate LIVE snapshots.
- Added a poller/controller regression test for the expected BFF-restart session lifecycle: a lost in-memory operator session stops SSE and clears private LIVE data; after operator re-authentication, the poller re-fetches all five snapshots and opens a fresh EventSource.
- Added a real loopback HTTP integration test that creates an authenticated BFF app, opens a cookie-authenticated SSE stream, shuts down that BFF server, verifies the old stream/upstream are cancelled, creates a fresh BFF app with a new in-memory session store, verifies the old cookie receives `401 SESSION_REQUIRED`, logs in again, and opens a new authenticated SSE stream.
- Fixed a recovery gap: a successful native EventSource `open` after one or more stream failures now immediately refreshes all five authoritative snapshots. It no longer waits for the 60-second healthy-SSE reconciliation cadence before clearing a stale OFFLINE state. The network-failure regression test now actually makes all five API requests fail with `OFFLINE`, verifies fallback retries continue, then restores the API and asserts all five snapshots are refreshed immediately and global connection returns to `LIVE` before the next 60-second interval.

Implementation commits on this branch:
- `bd84cbb384bf16ad1bb763809dcf5858c4946bb7` — shutdown helper.
- `46a79aae2da74446a30669684e19c3706f743457` — process signal handler wiring.
- `abd2b7a52cd9286865ccfbdf14f95586cbcecfdb` — BFF shutdown regression test.
- `c5b7b5fec9d8be898ca2dca172ff2d8797a63942` — SSE test frame correction.
- `8cd8073655581f4a9bb1eccdd613943c03bcf4c8` and `2423cafa8434a2e938a1a322f1eb2eb6372d4e37` — LIVE/SIMULATED isolation regression test.
- `1d4882f1d80ffe640c0109bc46f4f1b9ae7664f4` — network interruption/reconnection regression test.
- `0af46ca1a0da2bbb4871585a7956b8ec1bdaaee6` — deterministic simulation-step setup for the isolation regression test.
- `3beea06ee8f1b11a8640d7425e04fdf95834e5be` — operator re-authentication and fresh EventSource regression test.
- `c6222f00eb5c76c9835fcf4d9fb70223d5ca28ba` — authenticated BFF restart + old-session rejection + fresh SSE integration test.
- `f96a21cb1675fc987b8072420ad5ea21cba159cd` — immediate full snapshot reconciliation on SSE recovery.
- `4030edf5ff66072fbd9c34132d9098135855ec3b`, `93f9b0affe684eda42426781ca0af85fc4a9d4e7`, `bb1a44dd84ce5f09d18ebe9a4f02d858995a1370` — network-offline regression and deterministic reconnection assertions.

These commits have been pushed to the isolated implementation branch only. Latest GitHub Actions run `42574780437` on commit `bb1a44dd84ce5f09d18ebe9a4f02d858995a1370` completed successfully: **374/374 tests passed, 0 failed; TypeScript check passed; production build passed** (774 ms). The run includes the authenticated BFF process-recreation integration test and the strengthened network-outage test; the latter proves fallback retries occur while all snapshot requests fail and that all five snapshots refresh immediately after SSE reconnect. Earlier run `42574528099` on commit `c6222f0` also passed 374/374 and introduced the real authenticated BFF lifecycle integration. These CI results do not replace owner-run Windows/Chrome acceptance: the browser's actual Offline/Online interaction and numeric Chrome Performance Monitor values remain unobserved on the owner's machine.

## Remaining acceptance gates

1. Table-trigger-to-resource mapping and migration safety are now verified by the disposable PostgreSQL 16 CI integration test described above. Do not repeat write/trigger tests against live trading, message, or audit rows.
2. Process-level CPU/Working Set/Private-memory sampling for the four-stream five-minute smoke has been recorded above, and the idle heartbeat frame is covered by the backend CI test. Numeric Chrome Performance Monitor evidence (CPU, JS heap, DOM nodes, JS event listeners) remains outstanding. Formal Phase 3.3 idle-browser acceptance budget is now defined in `docs/PHASE_3_3_SSE_SETUP.md`: with simulation paused and SSE healthy, average CPU ≤10%; final JS heap growth ≤15% from baseline; DOM nodes and JS event listeners each grow ≤5%; no sustained upward trend during the final three one-minute samples. These are acceptance thresholds, not claims that the owner's local Chrome already meets them.
3. Automated BFF lifecycle coverage is PASS: a real loopback HTTP test proves authenticated SSE closes and upstream cancels on BFF shutdown, a fresh BFF instance rejects the old cookie, and a new login opens a new authenticated SSE stream. Frontend tests separately prove network-error polling fallback, EventSource recovery, all-five-snapshot re-authentication, and SESSION_REQUIRED cleanup. Remaining owner gate: demonstrate the same combined scenario through the actual Chrome UI, including DevTools Offline → Online.
4. Duplicate IDs, sequence gaps, replay reset, subscriber overflow, and schema validation remain covered by CI tests.
5. LIVE/SIMULATED isolation is PASS, verified by an automated post-SSE regression test in both directions: SSE invalidation changes LIVE snapshots without mutating SIMULATED state, and a deterministic SIMULATED step does not mutate LIVE snapshots. Manual interaction is optional supplementary evidence.

**Phase 3.3 remains IMPLEMENTATION IN PROGRESS.** Core end-to-end event delivery, targeted snapshot refresh, backend restart recovery, four-stream five-minute no-error concurrency smoke, process-level resource sampling, disposable-PostgreSQL trigger integration, and automated heartbeat generation now have evidence. Do not start Phase 4 until the remaining owner browser/performance gates are closed and recorded.

## Read-only owner browser observation — 2026-11-11

The connected Chrome tab titled “SIREADER Virtual Office” was read without clicking or navigating. It displayed an authenticated operator session, LIVE/LIVE connection labels, API HEALTHY, database CONNECTED, the seven-worker LIVE roster, and the Review Inbox control. This is a read-only point-in-time observation of the local app. The combined BFF restart/network interruption/Chrome Offline→Online/re-authentication flow was **not** executed in this session because the available browser surface did not provide UI interaction controls. Keep the manual Phase 3.3 gate open; do not infer it passed from the dashboard snapshot.


## Owner status confirmation — Phase 3.3 complete (2026-11-11)

The project owner explicitly confirmed in this conversation that Phase 3.3 is already complete. The cross-repository closeout and current roadmap now record Phase 3.3 as COMPLETE — owner confirmed. This owner confirmation supersedes stale assistant audit wording above that described the browser recovery scenario as an open gate.

This entry records the owner's project-status confirmation only. It does not claim that a new Chrome restart/network-interruption scenario was independently executed during this session. No further Phase 3.3 work is requested or scheduled.
