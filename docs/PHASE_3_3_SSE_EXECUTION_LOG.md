# SIREADER Phase 3.3 — SSE Execution Log

**State:** CODE IMPLEMENTED ON ISOLATED BRANCHES; OWNER ACCEPTANCE PENDING  
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
- Listener connection explicitly sets default_transaction_read_only=on, search_path=public, application name, a 5-second connect timeout, and TCP keepalive.
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
- Branch commit: 57e3f2d1d1eb3a616eb6792f69294f0d3072e261
- GitHub Actions run: 42534082388
- Result: **367/367 tests passed, 0 failed; TypeScript check passed; production build passed.**
- This includes SSE BFF proxy integration/security tests, frontend event schema tests, poller invalidation/fallback tests, and existing regression suite.

### Python Backend
- Branch commit: cead3a4ce2aa70371d29d72c56f36df1193fcf45
- Prior successful implementation run: 42533930184 on preceding backend commit 6792ed30d79733cc0337eeff825816294137c4a9.
- The latest branch commit adds TRUNCATE triggers, rollback coverage, and TCP keepalive. Its workflow run is being verified; do not mark backend CI final until that exact SHA's run concludes SUCCESS.
- No live Supabase migration was executed by this implementation.

## Owner acceptance still required

1. Verify the latest Python Backend CI result on the exact branch HEAD.
2. Review and apply the migration through the Supabase/database-owner process. The sireader_api_ro role must remain read-only.
3. Restart the local Python API and Virtual Office; confirm the EventHub listener becomes ready with the configured Session pooler connection.
4. In Chrome, confirm same-origin GET /api/v1/events/stream returns 200 and text/event-stream; browser request must contain no bearer token.
5. Verify a harmless controlled test notification refreshes only the mapped snapshot, and verify the trigger mapping in staging/disposable PostgreSQL.
6. Test network disconnect/reconnect, backend restart/epoch reset, replay gap, stream-unavailable polling fallback, BFF restart, logout/session expiry, and no late writes after stop.
7. Confirm SIMULATED worker/task activity never changes LIVE snapshot/event data.
8. Record performance/memory evidence for 4 concurrent streams and sustained idle heartbeats. Do not increase capacities without measurements.

**Phase 3.3 is not COMPLETE yet.** The remaining gates require access to the owner's Supabase project and local Windows/Chrome runtime. Do not start Phase 4 until these gates pass.
