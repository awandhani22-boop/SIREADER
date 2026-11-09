# Phase 5 — Human-Supervised Operations & Governance

**Status:** Phase 5.1 implementation + automated CI PASS; owner local acceptance pending  
**Working branch:** `phase-5-implementation`  
**Baseline:** accepted Phase 4 branch; no merge to `main`.

## Scope and order

Phase 5 follows the master roadmap in order:

1. **5.1 Human-Supervised Worker and Task Operations**
2. **5.2 Review, Audit, Budgets & Governance**

Phase 5.2 must not be used to bypass an unfinished 5.1 security or acceptance gate.

## 5.1 command surface

The first command release is deliberately narrow:

- Enqueue bounded generic work only from an explicit non-trading task/capability allowlist.
- Pause/resume task intake for eligible workers. Pausing means the scheduler stops assigning new tasks; it does not kill the worker or interrupt an in-flight provider request.
- Cancel a task using the existing backend lifecycle transition. If a provider request may have been sent, the result must be `WAITING_REVIEW` / `UNKNOWN`, never falsely reported as cancelled.
- Retry only a failed, known-pre-provider task with an intact input payload and a terminal failed attempt that proves no provider request was made. Retry creates a new task linked by correlation and audited reference; it never changes a failed task back to QUEUED. `WAITING_REVIEW`, `UNKNOWN`, purged, and provider-requested tasks are not retryable.

Trading-adjacent capabilities (Decision Engineer / Market Monitor task categories), Telegram, MT5, HFM, order/position, SL/TP, broker, and existing trading approval endpoints are not exposed through this command surface.

## Security topology

- Keep the existing Python observability API on `127.0.0.1:8000`, its `sireader_api_ro` connection, and its read-only token unchanged.
- Run command API separately on `127.0.0.1:8010`, with a dedicated `SIREADER_WORKFORCE_COMMAND_AUTH_TOKEN` and a dedicated `SIREADER_WORKFORCE_COMMAND_DATABASE_URL` authenticating as `sireader_workforce_cmd`.
- Command DB access is granted only to the minimum workforce tables/columns needed by command handlers. It receives no privileges on Telegram, approval, market/trade, runtime-control, or AI pipeline tables. The append-only command audit table allows INSERT/SELECT but not UPDATE/DELETE.
- The command service fails closed if either command token or dedicated database URL is missing, the host is not exactly `127.0.0.1`, or the database role does not meet the privilege contract. It must never fall back to `DATABASE_URL` or the Phase 4 read-only API connection.
- The BFF exposes only fixed command paths. Every write requires the existing operator session and CSRF token. The browser never receives a backend bearer credential, database URL, or actor override.
- The BFF uses a separate server-side command token; the existing read-only token is never reused for write operations.
- Request bodies and responses are bounded and strictly validated. Commands require an `Idempotency-Key`; the audit ledger records actor, command, target, request fingerprint, correlation ID, outcome, and timestamp. A replay with the same key and same request returns the original result; a different request with the same key is rejected.
- Rate limits are enforced server-side. CORS remains disabled and every listener remains loopback-only.

## Frontend behavior

- LIVE commands are enabled only for an authenticated operator session and the LIVE mode.
- DEMO mode remains local simulation only. It must not call the command API or silently use LIVE commands.
- Display command states distinctly: submitting/pending, accepted, rejected, and final observed state.
- Refresh authoritative runtime/task snapshots after an accepted command; do not optimistically invent backend state.
- Disable controls while the matching request is pending. Treat 401/session expiry, CSRF failure, 409 conflict, 429 rate limit, timeout, and unavailable command service distinctly.
- Worker scheduling state is separate from worker process/heartbeat state.

## 5.2 governance (after 5.1 exit gate)

- Distinguish a human content/output review from the existing trading `WAITING_REVIEW` used for uncertain provider outcomes.
- Reconstruct an auditable task lifecycle from enqueue, attempts, provider reservation, review/escalation, and final outcome.
- Present token/cost and budget state only from backend records; do not blend simulation estimates with LIVE billing.
- Define escalation, provider fallback, sensitive-task rejection, and manual intervention as explicit policies before implementing automation.

## Required verification gates

### Security
- Unauthenticated command request rejected.
- Authenticated request without CSRF rejected at the BFF.
- Invalid/unknown command, worker, capability, task type, payload, content type, origin, method, or idempotency key rejected.
- Read-only credential cannot write; command credential cannot read or mutate non-workforce/trading/approval/Telegram tables.
- Audit mutation attempts denied at the database boundary.
- Replayed same command is idempotent; same key with a different body is rejected.
- Rate-limit exhaustion is bounded and does not partially execute a command.
- Browser bundle, localStorage, URL, response, and logs contain no backend credentials.
- No LIVE provider, Supabase production mutation, MT5/HFM, or trading approval side effect occurs.

### Lifecycle
- Pause stops new claims and leaves current task leases/provider requests intact.
- Resume permits later claims without reviving stale or terminal work.
- Cancel before provider request becomes CANCELLED.
- Cancel after provider request/unknown outcome becomes WAITING_REVIEW / UNKNOWN.
- Retry creates a new task only from a known-pre-provider FAILED task and preserves the original record; unsafe retry cases are rejected.

### Delivery
- Backend unit/API tests, disposable PostgreSQL migration/privilege tests, frontend BFF/API/UI tests, TypeScript, and production build pass on the exact commit.
- Owner-run Antigravity/Windows browser acceptance remains a separate evidence class and is requested only for checks that cannot be executed in CI.
- Update project state, roadmap, execution log, and runbooks as each milestone is verified.
- Commit each coherent unit on `phase-5-implementation`; never merge to `main` without explicit authorization.


## Automated implementation evidence — 2026-11-09

Backend source HEAD: de1d16be631418fe17d61524d1b63e479374f1fb  
Backend CI: https://github.com/awandhani22-boop/SIREADER-Python-Backend/actions/runs/42604536800 — PASS  
Frontend source HEAD: 884eabfcee884ae31e9d0dd06d8b9f79663441fd  
Frontend CI: https://github.com/awandhani22-boop/SIREADER/actions/runs/42604707497 — tests, typecheck and build passed

- Backend: 144 API/command and PostgreSQL tests passed; compileall passed; 75 core regression tests passed.
- PostgreSQL tests cover dedicated role privileges, required RLS policies, append-only audit, allowed generic workers, and direct-SQL denial for Decision Engineer / Market Monitor rows.
- Frontend: 398/398 automated tests passed, TypeScript check passed, production build passed.
- The browser keeps the command bearer server-side. Browser writes use the existing operator session + CSRF and a stable idempotency key. An ambiguous timeout preserves the same key for retry; unresolved keys are never evicted to make room for a new command.
- These runs use test SQLite / disposable PostgreSQL and local BFF mocks. They do not prove the owner's local environment files, PostgreSQL instance, Windows process topology, or real browser session is configured.

Source and CI for checkpoints 5.1.0–5.1.4 are complete. The Phase 5.1 exit gate remains open until owner-side local setup and Windows/Chrome/Antigravity acceptance is recorded. Phase 5.2 must not start before that acceptance.

## Implementation checkpoints

- [x] 5.1.0 — command security design and isolated branch baseline
- [x] 5.1.1 — backend command service, dedicated DB boundary, audited/idempotent commands
- [x] 5.1.2 — BFF fixed routes, operator session + CSRF, separate server-side token
- [x] 5.1.3 — frontend LIVE-only controls and explicit command outcomes
- [x] 5.1.4 — negative authorization, replay, lifecycle and PostgreSQL privilege verification
- [ ] 5.1 owner browser acceptance
- [ ] 5.2 — review, budgets, escalation and governance

## Known owner-side setup that will be required before local LIVE use

The owner must follow the local command API runbook in the Python Backend repository: provision the dedicated sireader_workforce_cmd login on a disposable local database, keep the DB URL and independently generated command token in ignored local environment files, apply the additive migration only to that local database, then start the command API on loopback. Never paste secret values into chat or commit them. Do not apply this migration to Supabase LIVE.
