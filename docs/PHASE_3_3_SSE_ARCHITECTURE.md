# SIREADER Phase 3.3 — Real-Time Observability (SSE) Architecture

**Document status:** IMPLEMENTATION IN PROGRESS — code and CI are present on isolated branches; owner acceptance remains  
**Repository:** `awandhani22-boop/SIREADER` (BFF/frontend) and `awandhani22-boop/SIREADER-Python-Backend` (authoritative event source)  
**Virtual Office branch:** `phase-3-3-sse`  
**Python Backend branch:** `phase-3-3-sse-backend`  
**Prerequisite:** Phase 3.2 owner acceptance recorded on 2026-11-09  
**Purpose:** Define a bounded, authenticated, recoverable server-sent event stream without weakening the Phase 3.1 read-only database boundary or the Phase 3.2 BFF security model.

---

## 1. Decision summary

Use **PostgreSQL LISTEN/NOTIFY as a lightweight change signal**, consumed by one dedicated Psycopg 3 asynchronous listener in the Python API process. The API process publishes allowlisted resource-invalidation events through an in-memory bounded event hub. Express BFF exposes one fixed authenticated SSE route to the browser. The browser uses native `EventSource` on the same origin and continues to reconcile through the existing five snapshot GET endpoints.

The stream carries **invalidation metadata only**, not database rows, trading data, model output, credentials, or task payloads. The snapshot GET endpoints remain authoritative. An event means “refresh this snapshot”; it does not mean that a worker is alive, a task is executing, or a decision is approved.

PostgreSQL notifications are not a durable event log. Replay is best-effort within the current API process epoch and bounded ring buffer. Any restart, replay gap, unknown cursor, or queue overflow produces a reset/resync path; the client must fetch authoritative snapshots. Do not claim at-least-once or exactly-once delivery.

### Architecture

```text
Business writers / SIREADER backend transactions
        |
        | row triggers after successful transaction changes
        v
PostgreSQL pg_notify('sireader_observability_v1', resource-key)
        |
        | dedicated Psycopg 3 AsyncConnection (autocommit, LISTEN)
        v
Python API EventHub (one process, bounded ring + bounded subscriber queues)
        |
        | authenticated GET /api/v1/events/stream
        | server-only SIREADER_API_AUTH_TOKEN
        v
Express BFF GET /api/v1/events/stream
        |
        | authenticated operator session; bounded streaming proxy
        v
Same-origin browser EventSource
        |
        | allowlisted resource invalidations only
        v
Existing LiveController / snapshot GET endpoints
        |
        v
Independent LIVE Zustand store and existing Observability Dock

Periodic snapshot reconciliation remains enabled.
The deterministic 3D SIMULATED state remains independent.
```

## 2. Existing source constraints verified

- Phase 3.1 Python API currently exposes five authenticated GET snapshot routes: system status, telemetry usage, active pipeline, active market watches, and audit decisions.
- The API uses a dedicated PostgreSQL read-only role and a dedicated read-only SQLAlchemy session factory; no event stream or event outbox currently exists.
- The backend dependency set already includes `psycopg[binary]>=3.2,<4.0`; Psycopg 3 provides `AsyncConnection` and async notification iteration.
- Phase 3.2 BFF has a fixed route/method allowlist, operator-session middleware, a server-only upstream bearer token, strict Host/Origin/Fetch-Metadata guards, and a same-origin frontend API client.
- Existing frontend polling already has timeout, no-overlap, retry/backoff, STALE/OFFLINE handling, session clearing, and late-response guards.

Implementation status: backend, BFF, and frontend SSE code plus automated tests are present on the two branches. Latest CI evidence is recorded in `docs/PHASE_3_3_EXECUTION_LOG.md`. The owner's Supabase project has not been migrated, and the owner's Chrome/network acceptance has not yet been performed.

## 3. Event source and PostgreSQL boundary

### 3.1 Channel and payload

Use one fixed channel name:

`sireader_observability_v1`

The notification payload is a tiny static resource key only. Allowed keys:

| Source table | Resource key | Snapshot to refresh |
|---|---|---|
| `runtime_control_state` | `system` | `/api/v1/system/status` |
| `ai_usage_logs` | `telemetry` | `/api/v1/telemetry/usage` |
| `ai_analysis_logs` | `pipeline` | `/api/v1/pipeline/active` |
| `ai_pending_messages` | `pipeline` | `/api/v1/pipeline/active` |
| `trade_decision_watches` | `market_watches` | `/api/v1/market-watches/active` |
| `approval_decisions` | `audit` | `/api/v1/audit/decisions` |

Do not include primary keys, message text, symbol prices, costs, token counts, account data, exception text, or any row values in NOTIFY payloads. The event hub must validate every payload against this closed enum and ignore/log only a sanitized rejection code for unknown values.

### 3.2 Trigger migration

Add a separate, reviewed migration in the Python Backend repository. It must:

- Be applied by the database migration owner/DBA, never by the runtime API role.
- Add narrowly scoped AFTER INSERT/UPDATE/DELETE triggers only to the six source tables listed above (use the operation scope actually needed by each table; audit decisions are append-only and should notify on INSERT).
- Use a fixed channel and constant payloads. No dynamic SQL and no user-controlled channel or payload.
- Use a non-SECURITY-DEFINER trigger function unless a later security review proves it necessary. Fix the function search path and ownership explicitly.
- Avoid changing the grants of `sireader_api_ro`. It remains read-only and receives no INSERT/UPDATE/DELETE/TRIGGER rights.
- Avoid sending notifications for no-op updates when a safe OLD/NEW comparison is practical.
- Be idempotent and include safe rollback SQL.
- Include migration tests and a live Supabase verification procedure.

The runtime listener uses the already-configured read-only connection only to `LISTEN`; it must not query base tables or acquire write privileges.

### 3.3 Delivery semantics and database limitations

PostgreSQL NOTIFY is delivered after the notifying transaction commits; payloads are limited (under 8 KB in the default configuration), and notifications are not a durable replay log. Keep payloads to one short resource key. The listener must stay in autocommit mode and continuously consume notifications so that the PostgreSQL notification queue can be reclaimed. Do not put a long-running transaction around LISTEN.

The deployment connection must support session-level `LISTEN`. Verify the actual Supabase connection-pooler mode; a transaction-pooling connection must not be assumed to preserve LISTEN session state. Use a dedicated listener connection, separate from the two-connection SQLAlchemy snapshot pool. If listener connection setup fails, snapshot GET routes continue operating and the SSE route reports an unavailable/degraded stream; the app falls back to polling.

## 4. Python API EventHub

### 4.1 Process model

The current API contract runs one Uvicorn worker process. Keep that invariant for this in-memory event hub. The listener starts and stops through FastAPI lifespan; shutdown cancels the task, closes the dedicated async connection, and closes all subscribers. A failed listener reconnects with capped exponential backoff and jitter without logging the DSN or payload contents.

If multi-worker or multi-host deployment is later required, replace the in-memory fan-out/replay layer with a shared broker or durable outbox before scaling. Do not silently run multiple independent event epochs and imply global replay.

### 4.2 Event hub bounds

Initial bounded defaults (tune only with recorded measurements):

- Replay ring: maximum 512 events.
- Per-subscriber queue: maximum 64 events.
- Concurrent API subscribers: maximum 4.
- Heartbeat interval: 15 seconds.
- Listener reconnect: exponential backoff with jitter, capped at 30 seconds.
- Event debounce/coalescing window: 100 ms; combine pending resource keys into one invalidation event when multiple table notifications arrive together.

On subscriber overflow, discard that subscriber's pending queue, enqueue a `stream.reset` signal if it can be written, and close the stream. The client must resync snapshots. Never grow memory to retain a slow consumer.

### 4.3 Event envelope

Each process startup creates a random `stream_epoch` UUID. The event ID is `<stream_epoch>:<monotonic_sequence>`. The sequence increases within that process only.

SSE event name: `resources.invalidated`

JSON data:

```json
{
  "schema_version": 1,
  "occurred_at": "2026-11-09T00:00:00Z",
  "resources": ["pipeline", "telemetry"]
}
```

The SSE `id:` field carries the event ID; the data does not repeat it. The resource list is deduplicated and sorted using the canonical order: system, telemetry, pipeline, market_watches, audit. An event contains no snapshot data.

Reset event name: `stream.reset`. Its data contains `schema_version` and a closed reason enum such as `cursor_expired`, `epoch_changed`, `replay_gap`, `subscriber_overflow`, or `listener_recovered`. The reset causes a full snapshot reconciliation and a fresh EventSource connection.

Heartbeat is an SSE comment (for example `: ping\n\n`), not a business event. Send a `retry: 3000` hint at stream start. Do not increment the sequence for heartbeats.

### 4.4 Cursor and replay behavior

- Accept only a bounded `Last-Event-ID` value matching the exact epoch UUID + positive decimal sequence format.
- If the cursor belongs to the current epoch and remains within the replay ring, replay events strictly after it in ascending sequence order.
- If the cursor belongs to another epoch, predates the retained ring, is ahead of the current sequence, or is malformed, send `stream.reset`; do not pretend the missed events were replayed.
- The event hub sequence is monotonic within a process; duplicate or out-of-order notifications are coalesced before publication.
- A process restart changes the epoch. Clients must reconcile snapshots; no cross-restart durable replay is promised.

## 5. Python SSE endpoint

Add exactly one fixed read-only route:

`GET /api/v1/events/stream`

Requirements:

- Require the same Bearer dependency as the five snapshot endpoints.
- Return `text/event-stream; charset=utf-8` with no-cache/no-transform and anti-buffering headers.
- Use FastAPI `StreamingResponse` with an async generator and explicit request-disconnect cleanup. Keep the implementation compatible with the current FastAPI dependency baseline rather than assuming an unverified convenience API.
- Do not expose any data beyond the versioned invalidation envelope.
- Enforce the subscriber cap, cursor validation, heartbeat, replay, reset, and bounded output.
- Return a sanitized 503 before stream headers if the listener is not ready or the subscriber cap is reached. Once headers are sent, terminate safely on unrecoverable stream failure; the browser reconnect/fallback logic handles recovery.
- Do not add write routes, task commands, worker controls, or trading operations.

## 6. Express BFF stream proxy

Add the same fixed route to the BFF canonical allowlist:

`GET /api/v1/events/stream`

Requirements:

- Require the existing operator session before opening the upstream stream.
- Preserve all existing Host, Origin, Fetch Metadata, raw path, and route/method guards.
- Build upstream headers from scratch: server-only `Authorization: Bearer …`, `Accept: text/event-stream`, and a validated `Last-Event-ID` only when present. Never forward browser Cookie, Authorization, arbitrary headers, or query-based tokens.
- Use the fixed upstream origin and exact stream path. No generic URL/path proxying.
- Use a short connection-establishment timeout only until upstream headers are received; do not apply the existing five-second JSON response timeout to the lifetime of an established stream.
- Validate upstream status and content type before writing browser response headers. Map pre-stream failures to the existing sanitized JSON error envelope.
- Stream bytes incrementally with bounded backpressure. Do not buffer the entire response. Abort the upstream fetch when the browser disconnects or the BFF shuts down.
- Set `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no`, and `X-Content-Type-Options: nosniff`; do not set CORS headers or Content-Length.
- Apply a small explicit concurrent stream cap and sanitized connection-open/close metrics. Never log token, cookie, Last-Event-ID, or payload contents.

## 7. Frontend EventSource and snapshot reconciliation

### 7.1 Connection lifecycle

- Start the EventSource only after `/api/auth/session` confirms the operator session.
- Use the same-origin BFF URL only. Native EventSource sends same-origin cookies; no bearer token or token query string exists in browser code.
- Stop and close EventSource immediately on logout, SESSION_REQUIRED, application teardown, or operator-session expiry.
- Let EventSource auto-reconnect for ordinary transport interruptions. Respect bounded reconnect behavior; on repeated failures mark the stream unavailable and use snapshot polling fallback.
- Treat event-stream connectivity separately from snapshot freshness. An open stream does not make all five snapshots LIVE.

### 7.2 Resource invalidation handling

Validate every event at runtime. Ignore duplicate IDs; detect sequence gaps within the same epoch. Unknown event types, unknown resource names, malformed JSON, or invalid schema must not update LIVE state; close/degrade the stream and perform snapshot reconciliation.

For a valid `resources.invalidated` event, queue a targeted refresh through the existing LiveController/poller for each named resource. Coalesce repeated pending refreshes. If a refresh is already in flight, mark that resource dirty and run one additional refresh immediately after the in-flight request finishes; do not lose the invalidation. Never write event payloads into the simulation store or drive the 3D render loop directly.

### 7.3 Fallback and reconciliation

- Keep the existing snapshot GET path as the source of truth.
- While SSE is healthy, run periodic full/targeted snapshot reconciliation at a slower bounded cadence (initial design target: 60 seconds; measure and tune).
- On stream disconnect, repeated reconnect failure, reset, replay gap, or invalid event, perform a full five-endpoint snapshot refresh and return to the existing polling cadence (system/pipeline/market every 10 seconds; telemetry/audit every 30 seconds) until the stream is healthy again.
- If SSE is unavailable, the dashboard remains usable through the existing polling. Do not show a false LIVE stream state.
- If any snapshot is STALE/OFFLINE/ERROR, keep its explicit state even when the event stream is connected.

## 8. Security and operational boundaries

- Python Backend remains the source of truth. Event delivery is an optimization/notification layer, not an alternate database or state machine.
- The Bearer token remains server-only between BFF and Python API. The browser only has the operator session cookie and in-memory CSRF token for existing auth flows.
- No credentials, SQL, raw row values, message text, symbol price, provider result, token counts, cost totals, or decision contents are placed in NOTIFY payloads or SSE events.
- The API remains loopback-only at `127.0.0.1:8000`; BFF remains loopback-only at the documented development/production ports.
- SSE is GET-only and has no business side effects. No command API or MT5 interaction is added.
- Preserve deterministic SIMULATED mode, LIVE provenance, STALE/OFFLINE/ERROR semantics, and manual trading approval.
- PostgreSQL notification triggers must not make application writes fail under routine operation. Validate trigger volume, event queue health, and migration rollback on a disposable database first.

## 9. Required tests and acceptance gates

### Python Backend
1. Event envelope schema and strict enum validation.
2. Trigger migration idempotency and safe rollback.
3. One notification per expected source/resource mapping; no payload data leakage.
4. Transaction rollback produces no visible notification.
5. Listener reconnect, listener unavailable, and graceful shutdown.
6. Replay from a retained cursor; reset for stale/unknown/future cursor and process epoch change.
7. Per-subscriber overflow, subscriber cap, heartbeat, and disconnect cleanup.
8. API Bearer auth; no token logs; no non-GET event route.
9. Integration test with PostgreSQL (not SQLite alone) for LISTEN/NOTIFY semantics and trigger behavior.

### Virtual Office BFF
1. Unauthenticated stream rejected; authenticated stream returns correct SSE content type.
2. Only the fixed event route is proxied; unknown paths remain JSON 404 and wrong methods 405.
3. Upstream token is injected server-side and absent from browser requests/bundles.
4. Invalid Last-Event-ID rejected or reset safely; arbitrary headers/path are never forwarded.
5. Slow browser backpressure stays bounded; disconnect aborts upstream.
6. Session logout/expiry closes stream and clears LIVE data.
7. Host/Origin/Fetch-Metadata guards remain active; no CORS headers.

### Frontend
1. Event schema validation; duplicate/out-of-order/gap behavior.
2. Multiple invalidations coalesce; in-flight refresh is not lost.
3. SSE reconnect and process epoch reset trigger snapshot reconciliation.
4. Fallback to existing polling after stream outage; resume slower reconciliation only after stable connection.
5. EventSource cleanup on logout/session-required/unmount.
6. Simulation store is unchanged by SSE events; no 60-FPS state writes.
7. Existing polling tests continue passing.

### Owner acceptance
- Confirm Supabase/session-pooler supports a persistent LISTEN session with the dedicated read-only API role.
- Apply the trigger migration through the approved DB owner process and verify only the intended six source tables have triggers.
- Run local end-to-end reconnect/disconnect/replay tests with Python API and BFF active.
- Inspect Chrome Network to verify same-origin EventSource, no bearer token, and correct session behavior.
- Confirm the dashboard still works with SSE disabled/unavailable and during API restart.
- Capture sanitized logs and timings; do not capture credentials or cookies.

## 10. Implementation batches

| Batch | Scope | Exit evidence |
|---|---|---|
| 3.3-A | Event contract + migration + PostgreSQL trigger tests in Python Backend | Contract review, migration/rollback, mapping tests |
| 3.3-B | Psycopg listener + bounded EventHub + FastAPI SSE route | Replay, reset, heartbeat, overflow, auth, shutdown tests |
| 3.3-C | Authenticated bounded SSE proxy in Express BFF | BFF integration/security/backpressure/disconnect tests |
| 3.3-D | EventSource client + invalidation coordinator + polling fallback | Frontend unit tests and simulation-isolation tests |
| 3.3-E | End-to-end reliability and owner acceptance | Local Supabase/Chrome evidence and documented limitations |

**Phase 3.3 exit rule:** Do not mark COMPLETE until all automated tests, PostgreSQL integration tests, BFF/frontend tests, owner local acceptance, reconnect/fallback checks, and performance checks pass. If a Supabase migration or pooler limitation blocks the event source, stop and revise the design rather than shipping heartbeat-only pseudo-real-time behavior.
