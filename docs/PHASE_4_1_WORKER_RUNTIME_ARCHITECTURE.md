# SIREADER Phase 4.1 — Real Worker Runtime Contract & Registry

**Document status:** PREPARATORY ARCHITECTURE DRAFT — Phase 4.1 has not started  
**Roadmap dependency:** Phase 3.3 must pass owner end-to-end acceptance before Phase 4.1 implementation starts  
**Repository boundary:** Python Backend owns runtime truth; Virtual Office consumes typed snapshots/events  
**Purpose:** Define the generic workforce contract without conflating logical workers, OS processes, provider requests, analysis records, or trading decisions.

---

## 1. Design decision

SIREADER needs a backend-owned, versioned worker/task domain that can support the existing seven logical worker identities and scale toward 50–100 workers.

The contract must separate five concepts:

1. **Worker definition** — stable logical identity, description, capabilities, allowed task types, concurrency policy, and configuration version.
2. **Worker runtime instance** — one actual process/agent instance with its own stable instance ID, startup time, heartbeat, runtime version, and process state.
3. **Task** — one unit of requested work with stable identity, idempotency/correlation metadata, explicit lifecycle, policy context, and safe references to source records.
4. **Task attempt** — one worker's bounded attempt to execute a task, with a claim/lease, attempt number, timestamps, outcome, and sanitized failure code.
5. **Provider request** — a model/provider invocation linked to a task attempt and tracked by the existing AI usage/cost system. A model call is not the task itself.

A 3D avatar is only a view of a logical worker. It is not a process, heartbeat, provider request, or task.

## 2. Existing backend baseline and gaps

The current Python Backend already contains domain-specific records:

- `AIAnalysisLog` records Telegram mentor-message analysis, including `PROCESSING` and result/checkpoint data.
- `AIPendingMessage` records messages blocked from analysis because of budget policy, with claim/retry fields.
- `AIUsageLog` records provider requests, model/tier, request ID, usage, billing currency, reserved cost and final cost.
- `TradeEpisode`, `TradeDecisionWatch`, `TradePendingEntry`, Telegram messages/edits, and approval records capture the existing trading-message domain and its guardrails.

These records must remain authoritative for their existing domain behavior. They are **not** a generic multi-worker registry or task execution system.

Missing generic concepts include:

- Stable logical worker definitions and normalized capabilities.
- Actual runtime process instances and process heartbeat freshness.
- Generic task records independent of the Telegram analysis pipeline.
- Per-task attempts, lease ownership and expiry, retry classification and recovery.
- A worker/runtime activity timeline with correlation IDs.
- A contract that makes worker configuration, process liveness, model invocation and task lifecycle independently observable.

Do not infer a real process is alive from `AIAnalysisLog.status = PROCESSING`, an avatar animation, a queue row, an open SSE stream, or a recent provider usage record.

## 3. Initial logical roster

Use stable IDs that do not depend on model/provider names:

| Worker ID | Display name | Initial responsibility | Notes |
|---|---|---|---|
| `supervisor` | Supervisor AI | Decompose requests, coordinate eligible work, observe completion | A logical coordinator; does not imply a continuously running OS process |
| `haiku` | Haiku Worker | Fast, bounded, low-complexity work | Provider/model mapping belongs to Phase 4.2 |
| `sonnet` | Sonnet Worker | Analysis, reasoning and planning | Provider/model mapping belongs to Phase 4.2 |
| `opus` | Opus Worker | Difficult reasoning and explicitly approved escalation | Never escalate around cost policy |
| `decision-engineer` | Decision Engineer | Validate structured decisions and domain rules | Cannot bypass Python Decision Engine or manual approval |
| `market-monitor` | Market Monitor | Observe approved market/watch data | No order placement or MT5 write access |
| `data-archivist` | Data Archivist | Preserve task/evidence references and summaries | Sensitive source text remains protected by backend policy |

Definitions and capabilities should be data-driven. Adding worker 8 must not require a new React component or scene-specific business logic. Logical identity remains stable when provider/model assignments change.

## 4. Versioned domain contract

Use a top-level `schema_version` on API DTOs and a `contract_version` for stored worker/task definitions. Unknown fields should be rejected at write/validation boundaries where compatibility policy allows; additive read DTO changes require explicit versioning or an agreed forward-compatible field policy.

### 4.1 WorkerDefinition

Suggested fields:

- `worker_id`: stable slug, primary identifier.
- `display_name`: human-readable label.
- `description`: bounded safe text.
- `enabled`: administrative configuration, not liveness.
- `definition_version`: monotonically increasing version.
- `capability_ids`: normalized references to capabilities.
- `allowed_task_types`: closed enum or registry reference.
- `max_concurrency`: validated positive integer with a conservative initial maximum.
- `created_at`, `updated_at`.

Do not store provider keys, credentials, raw prompt bodies, or arbitrary Python module paths in worker definitions. Worker definitions do not imply a worker process exists.

### 4.2 Capability

Suggested fields:

- `capability_id`: stable identifier such as `telegram-context-analysis`, `structured-signal-validation`, `market-watch-observation`, `audit-summary`.
- `display_name`.
- `description`.
- `contract_version`.
- `input_schema_ref` and `output_schema_ref`: allowlisted schema identifiers, not arbitrary import paths.
- `sensitivity_class`: closed enum (for example `PUBLIC`, `INTERNAL`, `RESTRICTED`).
- `requires_human_review`: policy metadata only; approval enforcement remains in backend policy.

A task's required capabilities are explicit. Capability matching is not inferred from worker names or avatar rooms.

### 4.3 WorkerRuntimeInstance

Suggested fields:

- `instance_id`: UUID generated at process start.
- `worker_id`: foreign key to logical WorkerDefinition.
- `runtime_version`.
- `started_at`, `last_heartbeat_at`.
- `lifecycle_state`: `STARTING`, `READY`, `DRAINING`, `STOPPING`, `STOPPED`, `CRASHED`.
- `health_state`: derived/read-only `HEALTHY`, `STALE`, `OFFLINE`, `ERROR`.
- `capability_snapshot_version`.
- Optional sanitized host/runtime labels only when they are needed; do not expose machine usernames, private paths, raw hostnames, process command lines or environment values to the browser.

Heartbeat freshness is separate from lifecycle state. A stopped instance can have a historical last heartbeat; a stale heartbeat does not mean the logical worker definition is disabled. An instance can be READY while it owns no task.

### 4.4 Task

Suggested fields:

- `task_id`: UUID/ULID with stable uniqueness.
- `task_type`: closed registry key.
- `contract_version`.
- `status`: explicit task lifecycle state.
- `priority`: closed enum `CRITICAL`, `HIGH`, `NORMAL`, `LOW`, with a documented fairness/aging policy before Phase 4.3 dispatch.
- `required_capability_ids`.
- `request_id` / `correlation_id`: trace a task across API, scheduler, worker, provider and audit.
- `idempotency_key`: unique per caller scope and task type.
- `requested_by`: actor/service identity, not arbitrary display text.
- `source_ref`: typed safe reference such as Telegram message DB ID, analysis log ID, or approved internal record ID.
- `input_ref`: reference to a protected backend payload; never put unrestricted raw Telegram text into public task DTOs.
- `result_ref`: protected result reference; frontend DTOs expose only authorized/redacted summaries.
- `created_at`, `queued_at`, `started_at`, `completed_at`, `deadline_at`.
- `attempt_count`, `max_attempts`, `cancel_requested_at`.
- `policy_decision_ref` and `human_review_state` where applicable.

Initial lifecycle enum proposal:

`CREATED -> QUEUED -> CLAIMED -> RUNNING -> SUCCEEDED`

Terminal/exceptional paths:

`FAILED`, `CANCELLED`, `TIMED_OUT`, `REJECTED_POLICY`, `BUDGET_BLOCKED`, `DEAD_LETTERED`.

No direct transition from `CREATED` to `SUCCEEDED`. Terminal records are immutable except for explicitly separate audit metadata. Retry creates another TaskAttempt under the same Task; it does not erase failure history.

### 4.5 TaskAttempt

Suggested fields:

- `attempt_id`: UUID.
- `task_id`, `attempt_number`: unique pair.
- `worker_id`, `worker_instance_id`.
- `claim_token_hash`: hash only; plaintext lease token is returned once to trusted internal worker runtime and never to Virtual Office.
- `claimed_at`, `lease_expires_at`, `started_at`, `finished_at`.
- `status`: `CLAIMED`, `RUNNING`, `SUCCEEDED`, `FAILED`, `TIMED_OUT`, `CANCELLED`, `LEASE_EXPIRED`.
- `failure_code`: bounded sanitized enum.
- `provider_request_ids`: references to AIUsageLog/request records when model invocation occurred.
- `result_ref` and bounded retry metadata.

Lease tokens must be unpredictable, scoped to one attempt, hashed at rest, checked on heartbeat/finish, and invalidated on lease expiry or reassignment. A stale worker must never be able to complete an attempt after another worker owns a newer lease.

### 4.6 ActivityEvent

Append-only event model for audit/debugging:

- `event_id`: monotonically ordered UUID/ULID or database sequence plus timestamp.
- `schema_version`, `event_type`.
- `occurred_at`, `recorded_at`.
- `task_id`, `attempt_id`, `worker_id`, `worker_instance_id`.
- `correlation_id`, `causation_id`.
- `actor_type`, `actor_id`.
- `reason_code`: sanitized closed enum.
- `metadata`: strict allowlisted structured fields only; no raw prompts, message body, tokens, credentials, database URLs, or arbitrary exception stacks.

Activity events are append-only audit evidence, not the only authoritative current-state store. A current-state Task/Attempt snapshot plus event history permits efficient queries and recovery.

### 4.7 RuntimeHealth

Health is independently derived from process heartbeats and startup/shutdown state:

- `worker_id`, `instance_id`, `last_heartbeat_at`.
- `heartbeat_interval_seconds`, `stale_after_seconds`, `offline_after_seconds`.
- `health_state`: `HEALTHY`, `STALE`, `OFFLINE`, `ERROR`.
- `last_health_reason_code`.

Thresholds must be configuration-backed, tested with a fake clock, and disclosed in the UI. Task state, provider request state, worker definition enabled state, and process health are separate fields. Never infer BUSY or ALIVE from one another.

## 5. State-machine invariants

1. One Task may have multiple attempts, but only one active unexpired lease may own execution at any time.
2. A WorkerRuntimeInstance may not exceed its configured concurrency.
3. WorkerDefinition `enabled=false` prevents new claims; it does not rewrite historical task or instance state.
4. A worker is not `BUSY` unless a current authoritative attempt is RUNNING and assigned to its instance. The UI should show process health independently.
5. A provider request is not a task; multiple provider requests may be associated with one attempt.
6. Lease expiry is recoverable and produces an explicit `LEASE_EXPIRED` attempt outcome before a new claim.
7. Task terminal states cannot be silently reopened; a retry uses a new attempt under the same task or an explicitly linked follow-up task.
8. Idempotency collision with a different canonical request hash is rejected, not silently treated as the same task.
9. Every transition carries actor, timestamp, correlation ID and reason code.
10. The current Telegram analysis pipeline remains protected and is not reinterpreted as a generic worker task until an explicit adapter is designed and tested.

## 6. Persistence proposal

Phase 4.1 should deliver reviewed SQLAlchemy models/migrations and contract validators, but not a scheduler or external worker execution loop.

Proposed normalized tables:

- `worker_definitions`
- `worker_capabilities`
- `worker_definition_capabilities`
- `worker_runtime_instances`
- `worker_tasks`
- `worker_task_capabilities`
- `worker_task_attempts`
- `worker_activity_events`

Indexes and constraints:
- Unique stable `worker_id`; unique `capability_id`.
- Unique `(task_type, requested_by, idempotency_key)` or equivalent caller-scoped key.
- Unique `(task_id, attempt_number)`.
- At most one active lease per task, enforced transactionally (partial unique index or equivalent).
- Foreign keys with deliberate ON DELETE RESTRICT for historical/audit records.
- UTC timestamps stored consistently; display timezone conversion remains a presentation concern.
- Strict DB constraints for status enums and positive counters.
- Do not use JSON blobs for relationships that require joins, uniqueness or FK enforcement.

Do not add RLS grants or browser-facing write routes in Phase 4.1. Use backend migrations owned by the database migration role. Existing observability API credentials remain read-only.

## 7. API contract outline (design only)

Initial Phase 4.1 API should be read-only until a separate command/dispatch contract is approved:

- `GET /api/v1/workers` — worker definitions and capability summaries.
- `GET /api/v1/workers/instances` — runtime instances and heartbeat-derived health.
- `GET /api/v1/tasks` — bounded, filtered task snapshots.
- `GET /api/v1/tasks/{task_id}` — one task and attempt summaries.
- `GET /api/v1/tasks/{task_id}/events` — bounded append-only activity page.

All endpoints require authenticated server-to-server access through BFF. Do not expose unrestricted payload/result blobs. Pagination is cursor-based, limits are capped, schemas are versioned, and error DTOs are sanitized. New worker/task endpoints must be separate from the Phase 3.1 five-view API contract; do not silently broaden the Phase 3.1 read-only DB role without a fresh least-privilege review.

## 8. Security, privacy and trading boundaries

- Worker runtimes receive only task-scoped, least-privilege credentials and approved capability access.
- No provider, Telegram, Supabase service-role, or broker credentials reach the browser or 3D client.
- Raw mentor messages, edit history, prompt content, account identifiers and private trade details remain backend-protected.
- Market Monitor is observation-only. Decision Engineer validates domain policy but cannot change trading outcomes or bypass approvals.
- No Virtual Office worker/task operation may place, close, modify or manage an MT5 order or SL/TP.
- Existing SIREADER manual approval and decision engine remain authoritative.
- Cancellation, retry and pause commands are out of Phase 4.1; later command APIs require separate authz, idempotency, rate limits and audit design.

## 9. Phase 4.1 scope and exit gate

**In scope for Phase 4.1 implementation after Phase 3.3 acceptance:**

1. Finalize and approve WorkerDefinition, Capability, RuntimeInstance, Task, TaskAttempt, ActivityEvent and RuntimeHealth DTOs.
2. Add schema validation and state-machine pure functions.
3. Add SQLAlchemy models/migrations, FK/index/check constraints and migration rollback.
4. Add backend repository tests for identity uniqueness, valid state transitions, concurrency caps, heartbeat freshness, attempt lease invariants and audit append-only behavior.
5. Document seven-worker registry seed/configuration without binding identities to provider/model names.
6. Add read-only APIs only if needed for independent contract tests; do not implement dispatch or provider execution yet.
7. Verify existing Telegram analysis, budget, watch, approval and decision-engine regressions remain unchanged.

Exit gate:
- Contract review complete and version recorded.
- Migrations apply/rollback on disposable PostgreSQL.
- All state transitions/invariants have positive and negative tests.
- 7-worker registry is data-driven and supports 50–100 without per-worker components.
- No heartbeat/PROCESSING/animation conflation.
- Existing backend regression suite passes.
- No provider execution or live task dispatch is claimed complete.

**Status:** PLANNED. This is a design draft only. Do not implement until Phase 3.3 owner acceptance is complete.
