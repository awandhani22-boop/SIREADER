# SIREADER Virtual Office — Phase 4 Execution Plan

**Branch:** phase-4-implementation in both repositories.
**Baseline:** Virtual Office fc7f2366c594c774bbe786d730437d7aee4ea488; Python Backend b8dac552decc0c25a9aca176d81cd6b387d6bc4a.
**Start:** 2026-11-09. **Status:** Phase 4.1 IN PROGRESS.

This is the execution ledger for the complete Phase 4 scope. docs/ROADMAP.md remains the scope and phase-order authority.

## 0. Guardrails
- Continue the existing React/Three.js Virtual Office and separate Python Backend. No replacement app.
- Python Backend is the only source of truth for LIVE worker, task, attempt, heartbeat, provider usage, and persistence.
- Existing frontend simulation scheduler remains authoritative for SIMULATED data only. It must not dispatch LIVE tasks.
- Phase 4 introduces no MT5 order place/close/modify, no SL/TP changes, no approval bypass, no trading control route, and no reuse of Telegram trading-analysis tasks as generic office tasks.
- No secrets in frontend, Vite variables, responses, screenshots, commits, or logs. Provider credentials remain in the backend environment.
- Provider execution is disabled by default. CI uses deterministic fake/mock providers. No paid request is permitted during tests.
- Existing Cost Guard is the only billing authority. Reuse its atomic reservations, IDR/USD separation, unknown-cost retention, and budget limits; do not add a parallel budget counter.
- New schema changes are delivered as reviewed SQL migrations and disposable-PostgreSQL tests. Do not apply them to the owner's live Supabase instance from this work.
- Read-only API credentials remain read-only. Additions must be allowlisted views only; never grant the API reader table writes.
- Do not merge to main, force-push, delete user files, use destructive Git commands, or modify local .env.
- A lease timeout after a provider request may have been sent is an UNKNOWN outcome. It must not automatically execute another paid request. Route the task to safe review/reconciliation.
- Every task input/output has a schema version, correlation ID, deduplication key, bounded size, explicit provenance, and retention policy.

## 1. Phase 4.1 — Real Worker Runtime Contract & Registry
**Status:** IN PROGRESS

Deliverables:
1. Versioned domain contract for Worker, Capability, Task, TaskAttempt, ActivityEvent, and RuntimeHealth.
2. Stable worker IDs for supervisor, haiku-worker, sonnet-worker, opus-worker, decision-engineer, market-monitor, and data-archivist.
3. Capability catalog and normalized worker-to-capability registry with per-worker concurrency limits.
4. Explicit state machines and timestamps. Configured worker, process heartbeat, provider request, and task lifecycle remain independent facts.
5. Contract validation, status transition rules, idempotency/correlation rules, and backward-compatible version policy.
6. No provider credentials, trade signals, broker IDs, or .env values in runtime DTOs.

Acceptance: contract rejects unknown versions/states, malformed IDs, oversized values and invalid transitions; seven-worker registry is deterministic; capability/concurrency and ownership are explicit; tests run without database/provider.

## 2. Phase 4.2 — AI Provider Routing, Execution & Cost Guard
**Status:** PLANNED / mock provider until owner configuration approval

Deliverables:
1. Provider interface with deterministic mock implementation and server-side OmniRoute adapter.
2. Typed task-to-tier/model policy; provider model IDs selected only from backend allowlist/config.
3. Reuse app.ai.omniroute_client.call_ai and app.ai.cost_guard; no direct bypass.
4. Reserve cost before sending; finalize from provider usage; retain UNKNOWN reservation when outcome is uncertain; currency-aware budget reporting.
5. Explicit timeout, cancellation, bounded retries, rate limit, error mapping, idempotency, and no hidden fallback.
6. Provider execution disabled unless WORKER_RUNTIME_ENABLED and live provider enablement are explicitly configured; both default false.
7. Dry-run execution produces clearly marked SIMULATED output and never calls provider.

Acceptance: fake-provider tests cover success, usage missing, refusal/error, timeout, known-not-charged failure, uncertain outcome, budget blocking, duplicate request and cancellation. Existing Cost Guard reservation is the accounting record. Live smoke/canary is not claimed until owner configures credentials and explicitly approves a bounded budget.

## 3. Phase 4.3 — Persistent Backend Task Orchestration
**Status:** PLANNED

Deliverables:
1. Versioned persistent tables for worker registry/capabilities, process heartbeats, generic work tasks, attempts, and append-only activity.
2. Idempotent task enqueue and deduplication; stable external task key and correlation ID.
3. Transactional claim with FOR UPDATE SKIP LOCKED, worker row lock, lease token, expiry and heartbeat renewal.
4. Capability-aware scheduler, max concurrency, explicit priority, aging/fairness, not-before and deadline handling.
5. Bounded retry/backoff for outcomes known safe to retry; UNKNOWN provider outcome is never blindly retried.
6. Restart recovery: expired pre-provider leases can be safely requeued; in-flight/unknown provider requests enter review/uncertain status.
7. Cancellation and dead-letter states as backend domain functions only. No browser command endpoints in Phase 4.
8. Isolated generic workforce queue. Do not repurpose ai_pending_messages, telegram_notification_outbox, or trading ai_analysis_logs.

Acceptance: concurrent PostgreSQL claims never double-assign; duplicate enqueue returns original task; worker concurrency is respected; lease recovery, unknown provider outcome, retry, deadline, cancellation and dead-letter are tested; audit reconstructs lifecycle.

## 4. Phase 4.4 — Frontend LIVE Runtime Adapter & Demo/Live Separation
**Status:** PLANNED

Deliverables:
1. Versioned read-only API contracts and BFF fixed allowlist routes for workers, tasks, attempts/activity, health and runtime usage.
2. Frontend WorkerRepository interface and LIVE adapter. Transport isolated from UI/3D rendering.
3. Explicit data mode DEMO/LIVE and provenance. DEMO uses only deterministic simulation store; LIVE uses only backend snapshots/SSE and never falls back to DEMO values.
4. Typed state mapper from backend state to avatar/UI animation state. Unknown state/schema is ERROR, never guessed.
5. Missing worker, stale/offline, session expiry, reconnect, pagination, and 7→50 worker behavior.
6. Scene remains data-driven; no duplicated worker-specific JSX and no 60-FPS Zustand writes from backend events.
7. LIVE task and worker presentation; retain existing read-only observability dock and deterministic simulation reset.

Acceptance: DEMO reset/seed repeatability unchanged; LIVE/DEMO state stores bidirectionally isolated; API DTO/BFF auth/security on all new routes; missing workers and stream outages show STALE/OFFLINE/ERROR; 7-worker baseline and 50-worker fixture work, 100-worker contract fixture validated where supported; frontend tests/typecheck/build pass.

## 5. Dependency and gate table
| Work | Dependency | Gate |
|---|---|---|
| 4.1 Contract/registry | Existing roster and Python backend | Contract + pure tests |
| 4.2 Provider/cost | 4.1 task/provider contracts | Mock tests; live disabled pending owner approval |
| 4.3 Persistence/orchestration | 4.1 contracts and 4.2 budget preflight | Disposable PostgreSQL concurrency/recovery tests |
| 4.4 API/BFF/UI | 4.1–4.3 contracts and persistence | API/BFF/frontend integration + browser acceptance |

## 6. Owner-side gates that cannot be fabricated
- Review/apply new SQL migration to actual Supabase after diff, least-privilege grants, RLS/view rules, and rollback have been reviewed. This execution never applies it to live Supabase.
- Configure a backend-only provider credential and explicitly approve a bounded live canary budget before paid inference. Tests use mocks.
- Perform local Windows end-to-end acceptance (Python, BFF, Vite, browser, restart/recovery) after branch sync.
- Supply physical-device/Chrome performance evidence if required. GitHub source review is not local execution.

## 7. Progress ledger
| Subphase | Implementation | Automated verification | Owner/live gate |
|---|---|---|---|
| 4.1 | IN PROGRESS | PENDING | Contract review |
| 4.2 | PENDING | PENDING | Provider credential + budget approval |
| 4.3 | PENDING | PENDING | Live migration approval/application |
| 4.4 | PENDING | PENDING | Local browser acceptance |

## 8. Definition of Phase 4 COMPLETE
Phase 4 is complete only when every Phase 4.1–4.4 deliverable and test gate passes, backend schema migrations/rollback are prepared and verified against disposable PostgreSQL, read-only APIs and BFF/frontend integration work, the DEMO/LIVE boundary is proven, and owner-controlled live gates are either actually completed or explicitly recorded as non-release blockers. No item may be silently skipped or relabeled complete because a mock passed.