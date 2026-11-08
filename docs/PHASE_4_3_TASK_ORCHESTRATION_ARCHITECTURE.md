# SIREADER Phase 4.3 — Persistent Backend Task Orchestration

**Status:** PREPARATORY ARCHITECTURE DRAFT — not started  
**Dependencies:** Phase 4.1 worker/task contracts and Phase 4.2 provider/cost lifecycle must pass.

## 1. Authority

Python Backend is the only authority for LIVE task creation, queue ordering, claims, worker assignment, retries, cancellation, lease expiry and terminal outcomes. Frontend scheduler remains deterministic SIMULATED scheduler only. Never run two schedulers for one LIVE task.

## 2. Core flow

Authenticated request -> validate schema/caller/capability/policy/idempotency -> persist Task + ActivityEvent + Outbox atomically -> dispatcher claims task -> select healthy eligible runtime instance -> create TaskAttempt and lease -> trusted runtime executes -> validate output/budget -> finalize attempt and task + ActivityEvent + Outbox atomically -> SSE invalidates resources -> Virtual Office refreshes authoritative snapshots.

Phase 4.3 must not implement provider calls outside the Phase 4.2 execution service.

## 3. Atomic claim and lease

- Use PostgreSQL transactions and SELECT FOR UPDATE SKIP LOCKED (or an equivalently proven claim strategy).
- Verify worker enabled state, heartbeat freshness, capability match, concurrency slots, priority and policy before claim.
- Create TaskAttempt and lease ownership in the same transaction as task transition.
- Lease token is random, task/attempt-scoped and hashed at rest.
- Heartbeat/finish requires the active lease and current unexpired attempt.
- A stale attempt cannot renew or finalize after expiry/reassignment.
- A reaper marks expired attempts explicitly, records reasons/events and requeues only when retry policy and billing state allow.
- Crash/restart recovery must be deterministic and idempotent.

## 4. Queue policy

- Initial priority: CRITICAL > HIGH > NORMAL > LOW.
- Add fairness/aging to prevent indefinite starvation of LOW priority.
- Bound queue length, caller quotas, concurrency, attempts, task lifetime and payload size.
- Capability selection must be deterministic and explainable.
- Supervisor does not bypass worker eligibility, budget or policy.

## 5. Idempotency and transactional outbox

- Caller-scoped idempotency key plus canonical request hash.
- Same key and same hash returns existing task; same key and different hash returns conflict.
- State transition, append-only ActivityEvent and Outbox insert happen in one DB transaction.
- Outbox publisher sends resource invalidations through the Phase 3.3 event path after commit. Duplicate delivery is expected and consumers tolerate duplicates.
- Outbox retries use capped backoff, sanitized failure state and retention policy.
- An in-memory queue is never the durable source of truth.

## 6. Retry, timeout, cancellation and dead letter

- Explicit retry matrix by failure code and billing uncertainty.
- Max attempts and deadlines enforced by backend, not frontend.
- Cancelling a running task requests cancellation; terminal CANCELLED requires worker acknowledgement or conclusive lease expiry.
- Timeout after provider invocation preserves uncertain billing when cost may have occurred.
- Dead-letter history is preserved; manual replay is an audited new attempt/action.
- Retry never erases prior attempts or silently creates a duplicate task.

## 7. Runtime safety

- Runtime workers receive task-scoped input references and allowlisted capabilities.
- No DB superuser credentials in workers.
- Process heartbeat, attempt heartbeat and provider request status are separate.
- Bounded runtime CPU/memory/time, graceful drain and shutdown.
- Trading-domain workers remain analysis/validation/observation only. No MT5 order or SL/TP operations.

## 8. Acceptance

- Parallel claim race proves at most one active lease.
- Crash/restart and lease-expiry recovery tests.
- Idempotency replay/conflict and duplicate outbox tests.
- Priority/fairness tests under sustained load.
- Capability/health/concurrency selection tests.
- Timeout/cancel/retry/dead-letter tests including uncertain billing.
- No duplicate provider execution after retry.
- Existing Telegram, budget, market-watch, approval and decision regressions pass.
- LIVE snapshots and audit history remain correct after SSE reconnect/fallback.

**Status:** PLANNED. Do not implement before Phase 4.1 and 4.2 exit gates pass.
