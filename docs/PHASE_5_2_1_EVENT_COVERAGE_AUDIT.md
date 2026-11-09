# SIREADER Phase 5.2.1-A — Event Coverage Audit
**Subsystem:** Workforce Lifecycle Audit Ledger & Timeline  
**Date:** November 9, 2026  
**Status:** COMPLETE (Gap Analysis & Action Plan Formulated)  
**Target Branches:** `phase-5-implementation` (SIREADER & SIREADER-Python-Backend)  
**Auditor:** Antigravity (Pair Programmer) & ChatGPT (Lead Architect)

---

## 1. Executive Summary

As part of Checkpoint 5.2.1-A, we audited all canonical task and attempt state transitions across `SIREADER-Python-Backend` (`app/workers/repository.py`, `app/command_api/routes.py`, `app/workers/runtime.py`). 

The objective is to ensure that every lifecycle state change generates a deterministic, immutable, and fully attributable audit event within the exact same database transaction, preserving complete chain of custody without rewriting historical records.

---

## 2. Canonical Lifecycle Transitions Audit Matrix

| Transition (State From $\rightarrow$ To) | Current Event Type | Emitting Function | Transaction Boundary | Current Actor Attribution | Missing Evidence / Gaps | Required Fix (Checkpoint 5.2.1-B/C) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Task: `None` $\rightarrow$ `QUEUED`** (Operator / System Enqueue) | `TASK_ENQUEUED` | `enqueue_task()` | Same DB session (`db.flush()`) | None (untracked) | No `actor_type` or `actor_id`; no `related_task_id` for retry-enqueued tasks | Add `actor_type` (`OPERATOR`/`SYSTEM`), `actor_id`, and `related_task_id` if retry |
| **Task: `QUEUED` $\rightarrow$ `CLAIMED`** (Worker Claims Task) | `TASK_CLAIMED` | `claim_task()` | Same DB session (`with_for_update()`, `flush()`) | `worker_id` recorded in row, but no `actor_type` | `actor_type` missing; ordering by timestamp only | Attribute `actor_type='WORKER'`, `actor_id=worker_id`; order by `event_seq` |
| **Attempt: `None` $\rightarrow$ `CLAIMED`** (Attempt Record Created) | Correlated with `TASK_CLAIMED` | `claim_task()` | Same DB session | Worker | Attempt status is `CLAIMED`; no separate attempt event | Sufficient via `TASK_CLAIMED` containing `attempt_id` and `attempt_number` |
| **Task: `CLAIMED` $\rightarrow$ `RUNNING`** | `TASK_STARTED` | `start_attempt()` | Same DB session | `worker_id` | `actor_type` missing | Set `actor_type='WORKER'`, `actor_id=worker_id` |
| **Attempt: `CLAIMED` $\rightarrow$ `STARTED`** | `TASK_STARTED` | `start_attempt()` | Same DB session | `worker_id` | Untracked actor enum | Set `actor_type='WORKER'` |
| **Attempt: `STARTED` $\rightarrow$ `PROVIDER_REQUESTED`** | `PROVIDER_REQUESTED` | `record_provider_request()` | Same DB session | `worker_id` | Untracked actor enum | Set `actor_type='WORKER'`, store `provider_request_id` in sanitized summary |
| **Task: `RUNNING` $\rightarrow$ `COMPLETED`** | `TASK_COMPLETED` | `complete_task()` | Same DB session | `worker_id` | Untracked actor enum | Set `actor_type='WORKER'`, `actor_id=worker_id` |
| **Attempt: `PROVIDER_REQUESTED` $\rightarrow$ `COMPLETED`** | Correlated with `TASK_COMPLETED` | `complete_task()` | Same DB session | `worker_id` | Attempt cost amount recorded, but not in view | View must sanitize payloads while exposing sanitized status |
| **Task: `RUNNING` $\rightarrow$ `RETRY_WAIT`** (Auto Backoff) | `TASK_RETRIED` | `fail_attempt()` | Same DB session | `worker_id` | Automatic worker retry; no explicit operator attribution | Distinguish auto-retry (`SYSTEM`) from operator retry (`OPERATOR`) |
| **Attempt: `STARTED` $\rightarrow$ `FAILED`** (Deterministic Fail) | Correlated with `TASK_FAILED` / `TASK_RETRIED` | `fail_attempt()` | Same DB session | `worker_id` | Attempt status set to `FAILED` | Keep attempt `FAILED`; ensure `error_code` recorded |
| **Task: `RUNNING` $\rightarrow$ `WAITING_REVIEW`** (Provider Timeout/Uncertain) | `TASK_WAITING_REVIEW` | `fail_attempt()` | Same DB session | `worker_id` | Untracked actor enum | Set `actor_type='WORKER'` or `'SYSTEM'` (if reaper) |
| **Attempt: `PROVIDER_REQUESTED` $\rightarrow$ `UNKNOWN`** | Correlated with `TASK_WAITING_REVIEW` | `fail_attempt()` | Same DB session | `worker_id` | Attempt status set to `UNKNOWN` | Preserve `UNKNOWN` for Cost Guard exposure accounting |
| **Task: `RETRY_WAIT` $\rightarrow$ `DEAD_LETTERED`** (Max Attempts) | `TASK_DEAD_LETTERED` | `fail_attempt()` / `reap_deadlines()` | Same DB session | None / System | Missing `actor_type='SYSTEM'` | Explicitly attribute to `actor_type='SYSTEM'` |
| **Task: `RUNNING` / `QUEUED` $\rightarrow$ `CANCELLED`** (Operator Cancel) | `TASK_CANCELLED` | `cancel_task()` | Same DB session | None (caller context lost) | Emitted without operator actor attribution | Pass `actor_type='OPERATOR'`, `actor_id=command_actor` into repository |
| **Task: `FAILED` $\rightarrow$ Operator Manual Retry** | **MISSING!** | `command_api/routes.py:284` | Separate command transaction | **NO EVENT EMITTED** for original task | Old task remains `FAILED`, but no `TASK_RETRIED` event records that retry was initiated; new task not linked in DB column | **CRITICAL FIX:** Emit `TASK_RETRIED` on original task linking new task ID; store `related_task_id` in new task record and events |
| **Worker State: `ACCEPTING` $\leftrightarrow$ `PAUSED`** | `WORKER_STATE_CHANGED` | `set_worker_accepting_tasks()` | Same DB session | None | Missing `actor_type` (`OPERATOR` / `SYSTEM`) | Set `actor_type='OPERATOR'`, `actor_id=command_actor` |

---

## 3. Identified Gaps & Required Hardening

### Gap 1: Manual Operator `TASK_RETRY` Event & Lineage Omission
- **Current Behavior:** In `app/command_api/routes.py`, `retry_failed_non_trading_task()` validates that the original task is `FAILED` with no provider leakage, then calls `enqueue_task()` to create a new task.
- **Defect:** 
  1. The original failed task receives **zero** audit events indicating it was retried.
  2. `TASK_RETRIED` event is only emitted during automatic internal backoff in `fail_attempt()`.
  3. The new task row has no foreign key or column referencing the parent task (`retry_of_task_id` only existed in API JSON response).
- **Required Fix:**
  - Add `related_task_id varchar(64)` column to `workforce_tasks` and `workforce_activity_events`.
  - Atomically emit `TASK_RETRIED` on the original task, referencing the new `task_id` and operator attribution (`actor_type='OPERATOR'`, `actor_id='local_operator'`).
  - Pass `related_task_id=original.task_id` to `enqueue_task()` for the new task.

### Gap 2: Lack of Monotonic Event Sequence
- **Current Behavior:** `workforce_activity_events` orders solely by `occurred_at DESC`. `event_id` is a random UUIDv4 string.
- **Defect:** Multiple events occurring within the same millisecond/transaction (e.g. `TASK_CLAIMED` and `TASK_STARTED`, or retry events) can experience non-deterministic sorting across queries.
- **Required Fix:**
  - Add `event_seq BIGINT GENERATED ALWAYS AS IDENTITY` column.
  - Sort timeline deterministically by `event_seq ASC`.

### Gap 3: Missing Immutability Protection on Event Table
- **Current Behavior:** `workforce_command_audit` has append-only trigger protection, but `workforce_activity_events` does not.
- **Defect:** A rogue or compromised query could modify or delete activity events.
- **Required Fix:**
  - Add PostgreSQL function and trigger denying `UPDATE`, `DELETE`, and `TRUNCATE` on `workforce_activity_events`.

### Gap 4: Missing Actor Attribution
- **Current Behavior:** `workforce_activity_events` lacks `actor_type` and `actor_id` columns.
- **Defect:** Timeline cannot distinguish whether a transition was triggered by `SYSTEM` (reaper/scheduler), `WORKER` (haiku/sonnet/opus), or `OPERATOR` (authenticated command).
- **Required Fix:**
  - Add `actor_type VARCHAR(32) NOT NULL DEFAULT 'LEGACY_UNKNOWN'`.
  - Add `actor_id VARCHAR(128)`.
  - Add check constraint: `actor_type IN ('SYSTEM', 'WORKER', 'OPERATOR', 'LEGACY_UNKNOWN')`.

### Gap 5: No Sanitized Security-Barrier View for Read-Only Timeline
- **Current Behavior:** Read-only API (`sireader_api_ro`) does not have a sanitized timeline view.
- **Defect:** Reading raw activity events could expose unpurged payloads or internal tokens.
- **Required Fix:**
  - Create `workforce_task_timeline_view` with `SECURITY BARRIER`.
  - Grant `SELECT` strictly to `sireader_api_ro`. Exclude raw JSON payloads, secrets, and bearer tokens.

---

## 4. Checkpoint 5.2.1 Execution Roadmap

1. **5.2.1-B/C (Backend DDL & Repository Hardening):**
   - Migration `2026_11_09_workforce_events_v2.sql` + rollback.
   - Update `app/workers/models.py`, `app/workers/repository.py`, and `app/command_api/routes.py`.
2. **5.2.1-D (Sanitized Database View):**
   - Implement `workforce_task_timeline_view` in migration.
3. **5.2.1-E (Timeline API & BFF):**
   - Implement `GET /api/v1/workforce/tasks/{task_id}/timeline` in `app/api/server.py` (port 8000).
   - Implement BFF route `/api/v1/workforce/tasks/:taskId/timeline` in `SIREADER/server/index.ts`.
4. **5.2.1-F (Tests & Verification):**
   - Pytest suite covering append-only denial, sequence determinism, retry lineage, actor attribution, 404, and view sanitization.
   - Jest/Vitest suite covering BFF proxying, validation, and error states.
