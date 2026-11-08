# SIREADER Phase 3.3 — Execution Log

**Status:** IN PROGRESS — implementation and CI are present on isolated branches; owner Supabase/Chrome acceptance remains.  
**Last updated:** 2026-11-09  
**Design:** `docs/PHASE_3_3_SSE_ARCHITECTURE.md`

## Repositories and branches

| Repository | Branch | Latest verified HEAD |
|---|---|---|
| Virtual Office | `phase-3-3-sse` | latest SSE code commit `1f73a6990d3ec71d8d581fb4dc27af07ab52e04b` (later commits update documentation) |
| Python Backend | `phase-3-3-sse-backend` | latest listener/migration code commit `6d928cc037666a14096c2b2d9f4020d0198b01b8` (later commits update runbook/tests/documentation) |

Both branches are isolated from `main`. The Phase 3.2 implementation branch and the documentation closeout branch have not been overwritten or merged. No migration has been applied to the owner's Supabase project.

## Implementation record

| Batch | Scope | Current state | Evidence |
|---|---|---|---|
| 3.3-A | Versioned invalidation event contract; trigger migration and rollback; PostgreSQL trigger tests | IMPLEMENTED IN BRANCH; CI PASS | Static allowlisted resource payloads; append-only approval audit trigger is INSERT-only; migration idempotency, commit/rollback behavior and resource mapping tests |
| 3.3-B | Psycopg async listener; bounded EventHub; replay/reset; authenticated FastAPI SSE route | IMPLEMENTED IN BRANCH; CI PASS | Dedicated autocommit LISTEN connection; ring buffer 512; subscriber queue 64; max 4 subscribers; process epoch/sequence; cursor replay and reset; heartbeat; shutdown cleanup |
| 3.3-C | Fixed authenticated Express BFF SSE proxy | IMPLEMENTED IN BRANCH; CI PASS | Exact allowlisted route; server-only upstream bearer; no browser cookie/authorization/header forwarding; establishment timeout; bounded concurrent streams; backpressure; disconnect abort; sanitized failures/logs |
| 3.3-D | Same-origin EventSource client and snapshot invalidation/fallback | IMPLEMENTED IN BRANCH; CI PASS | Strict runtime schema; duplicate/gap/reset handling; targeted snapshot refresh; in-flight dirty refresh; 60-second reconciliation while connected; existing 10s/30s polling restored on disconnect; logout/session cleanup |
| 3.3-E | Owner end-to-end Supabase/Chrome/reliability acceptance | NOT STARTED / OPEN | Requires local owner environment and DB-owner-controlled migration application |

## Automated CI evidence

### Virtual Office / BFF / frontend

- Latest run: [GitHub Actions 42534665071](https://github.com/awandhani22-boop/SIREADER/actions/runs/42534665071)
- Branch HEAD: `5f556003c2840c874e6aa12ce14e963d75741936`; SSE code commit: `1f73a6990d3ec71d8d581fb4dc27af07ab52e04b`
- Result: **SUCCESS**
- Automated tests: **371 passed, 0 failed**
- TypeScript check: PASS
- Production build: PASS
- Coverage added for strict event payload validation, invalid IDs, duplicate/gap/reset handling, snapshot refresh coalescing, in-flight invalidation, polling fallback, fixed BFF path, server-only upstream token, browser-header stripping, malformed upstream content type, safe 503 mapping, stream cap and browser disconnect abort.

### Python Backend

- Latest run: [GitHub Actions 42534566453](https://github.com/awandhani22-boop/SIREADER-Python-Backend/actions/runs/42534566453)
- Branch HEAD: `dbfffe5d5b3e4cc4f29200245d9f77a964656555`
- Latest listener code commit: `6d928cc037666a14096c2b2d9f4020d0198b01b8`
- Result: **SUCCESS**
- API/PostgreSQL tests: **100 passed**
- Python API compileall: PASS
- Existing core decision/service regression tests: **50 passed**
- PostgreSQL integration used the disposable CI PostgreSQL service, not the owner's Supabase project.
- A prior intermediate run (42534308384) exposed that the rollback script did not yet drop the newly added TRUNCATE triggers; the rollback was corrected, the catalog verification query was expanded to include both trigger names, and subsequent full CI runs passed.
- Integration covers migration idempotency, six resource notifications, static payload allowlist, no-op update suppression, append-only audit behavior, statement-level TRUNCATE invalidation, no notification on rollback, async Psycopg LISTEN receipt, stream shutdown cleanup, replay, cursor reset, subscriber bounds and authentication. TCP keepalive is configured for the long-lived listener. A safe owner-side LISTEN probe is available at `app/api/event_listener_probe.py`.

## Important implementation semantics

1. SSE events are resource invalidations only. They do not contain business rows, message text, trading prices, token/cost totals, decision details, provider output, IDs, credentials or database content.
2. Snapshot GET endpoints remain authoritative. An event only requests a fresh snapshot; it does not establish worker liveness, task execution, approval or task completion.
3. PostgreSQL NOTIFY is not a durable event log. Replay is limited to the current Python process epoch and retained ring buffer. A process restart, old/invalid cursor, replay gap or queue overflow causes reset and snapshot reconciliation. No exactly-once or cross-restart delivery guarantee is claimed.
4. The Python listener uses a dedicated autocommit Psycopg async connection and does not broaden the `sireader_api_ro` table privileges. The BFF injects the bearer token server-side only.
5. The browser connects only to the same-origin BFF using EventSource session cookies. The existing polling remains the fallback and snapshot reconciliation remains enabled.
6. SIMULATED state and the 3D render loop are not written by SSE events.

Owner acceptance runbook in the Python Backend repository: [`docs/PHASE_3_3_SSE_OWNER_ACCEPTANCE_RUNBOOK.md`](https://github.com/awandhani22-boop/SIREADER-Python-Backend/blob/phase-3-3-sse-backend/docs/PHASE_3_3_SSE_OWNER_ACCEPTANCE_RUNBOOK.md).

## Owner acceptance still required

The following must be performed in the owner's local environment before Phase 3.3 can be marked COMPLETE:

- Verify the actual Supabase Session Pooler connection mode supports a persistent session-level `LISTEN` connection. The owner previously reported use of the Session Pooler on port 5432; empirical support for this long-lived listener is still to be confirmed.
- Review and apply `migrations/2026_11_09_phase_3_3_observability_notify.sql` through the approved database migration owner process. Never run it using the runtime `sireader_api_ro` login. Verify the intended 12 triggers (6 row-level and 6 TRUNCATE statement-level) exist and use the rollback script if needed.
- Verify a real application write produces a committed resource invalidation from the owner's Supabase project, while rolled-back writes do not. Do not create artificial trading or approval actions to test this.
- Run Python API and BFF against the owner database and inspect Chrome Network: only same-origin `/api/v1/events/stream`, no Bearer token in browser headers/URL/bundle/storage/logs.
- Verify reconnect, Last-Event-ID replay, replay-gap reset, listener/API restart, BFF restart, browser disconnect, stream cap, and polling fallback.
- Verify SSE unavailable does not break the dashboard; all five snapshot panels retain explicit LIVE/STALE/OFFLINE/ERROR states.
- Confirm logout/session expiry closes the stream and clears private LIVE data.
- Record sanitized logs and resource/performance observations. No cookies, secrets, tokens, message data, or private trading details in evidence.

## Next action

Finish Batch 3.3-E owner acceptance. If the owner's pooler does not preserve session-level LISTEN, stop and revise the source architecture rather than shipping a pseudo-real-time heartbeat-only implementation.

Phase 3.3 remains **IN PROGRESS** until the owner acceptance above is complete. Phase 4.1–6.3 remain planned and must follow the locked roadmap order. No trading order, SL/TP modification, or manual-approval bypass is authorized.


## Prepared future-phase design work (not started)

- Phase 4.1: `docs/PHASE_4_1_WORKER_RUNTIME_ARCHITECTURE.md`
- Phase 4.2: `docs/PHASE_4_2_PROVIDER_ROUTING_COST_ARCHITECTURE.md`
- Phase 4.3: `docs/PHASE_4_3_TASK_ORCHESTRATION_ARCHITECTURE.md`
- Phase 4.4: `docs/PHASE_4_4_FRONTEND_LIVE_RUNTIME_ARCHITECTURE.md`
- Phase 5.1–6.3: `docs/PHASE_5_6_READINESS_ARCHITECTURE.md`

These are preparation documents only. Phases 4–6 must not begin implementation until preceding phase acceptance gates pass and the owner authorizes any required provider, budget or operations scope.