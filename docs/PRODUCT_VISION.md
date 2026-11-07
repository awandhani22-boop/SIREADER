# SIREADER — Product Vision & Mission

**Document type:** Canonical product vision  
**Status:** LOCKED PRODUCT INTENT  
**Repository:** `awandhani22-boop/SIREADER`  
**Related documents:** [Master Roadmap](ROADMAP.md) · [Current Project State](PROJECT_STATE.md)

---

## 1. The actual product we are building

SIREADER is an **AI workforce platform**, not a 3D office game, decorative dashboard, or collection of animated avatars.

The product has two connected parts:

1. **SIREADER Python Backend** — the operational brain and source of truth. It receives work, collects and processes information, routes tasks to suitable AI models/workers, validates results, enforces budgets and safety rules, persists history, and exposes approved information through APIs.
2. **SIREADER Virtual Office** — the human-facing 3D command and observability environment. It visualizes the real workers, tasks, rooms, workload, activity, costs, health, and permitted human-supervised operations. It must represent backend reality accurately rather than inventing activity.

The Virtual Office is an extension of the existing SIREADER system. It must evolve from the existing React/Three.js project. **Do not replace it with a new frontend, restart completed work, or create a second competing Virtual Office.**

## 2. Why SIREADER exists

The original SIREADER project was created to read and understand mentor trading messages from Telegram with context and discipline, rather than blindly converting isolated messages into trading actions.

Its intended backend flow includes:

1. Telegram mentor messages, replies, and edit history are collected.
2. Message aggregation reconstructs the relevant conversation/trade context.
3. AI routing chooses an appropriate model/tier for the work, with cost awareness but quality and reasoning as priorities.
4. AI extraction/reasoning identifies direction, entry information, stop loss, take profits, conditions, and action instructions.
5. Evidence must be grounded in source messages; uncertainty must be surfaced rather than guessed.
6. Decision logic validates signal rules, entry distance, spread, market-clock freshness, and other configured constraints.
7. Human approval and notifications remain explicit safety boundaries.
8. Monitoring, usage accounting, and audit history make the process observable.

SIREADER's trading safeguards must remain in the Python backend and its existing decision/approval workflow. The Virtual Office must never bypass them.

## 3. Why the Virtual Office exists

As SIREADER grows, one monolithic AI process is not sufficient for visibility, specialization, coordination, and operational control.

The Virtual Office represents a coordinated workforce of specialized AI workers, led by a Supervisor. It lets a human understand:

- Which workers exist and what capabilities they have.
- Which work has been queued, assigned, started, completed, blocked, failed, or cancelled.
- Which model/provider is used for a task, when allowed to disclose it.
- Why a worker was selected and why work is blocked.
- What each worker is doing, based on authoritative state and observable evidence.
- Token consumption, cost, budgets, errors, and task history.
- Whether the system is LIVE, SIMULATED, STALE, OFFLINE, or ERROR.
- Which actions require human review or approval.

The 3D office is the spatial user interface for this operational system. Rooms, desks, workers, animation, queues, panels, and activity feeds must communicate meaningful system state. Visual polish is important, but it never substitutes for functional behavior or truthful data.

## 4. Initial workforce

The initial seven-worker roster is:

| Worker | Intended responsibility |
|---|---|
| Supervisor AI | Coordinates work, decomposes requests, delegates tasks, tracks completion, and reports outcomes. |
| Haiku Worker | Handles suitable fast, bounded, lower-complexity tasks. |
| Sonnet Worker | Handles analysis, reasoning, planning, and tasks requiring stronger judgment. |
| Opus Worker | Handles difficult reasoning, review, and explicitly approved escalation. |
| Decision Engineer | Validates structured decisions and domain rules; does not bypass backend safeguards. |
| Market Monitor | Monitors approved market and watch information; does not place or modify trades. |
| Data Archivist | Maintains task history, evidence references, records, and summaries under backend policy. |

This is an initial logical roster, not a requirement that every worker correspond to one permanently running OS process or one fixed provider account. Worker identity, capability, task state, runtime process, model invocation, and 3D avatar must remain separate concepts.

Architecture should support growth from 7 toward 50–100 workers without duplicating scene components or hardcoding worker-specific business logic.

## 5. What "actually working" means

A worker is not real merely because its avatar moves or its UI status says WORKING.

A real worker/task lifecycle must be backed by the Python backend and observable evidence:
- A task has a stable ID, request/correlation ID, lifecycle timestamps, owner/attempt information, and explicit state.
- A backend scheduler or orchestrator makes authoritative assignment decisions.
- The worker runtime performs the task through an approved service/provider.
- Success, failure, timeout, cancellation, retry, and budget rejection are represented explicitly.
- Usage and costs come from provider/backend records, not frontend estimates presented as actual billing.
- Worker health/heartbeat is distinct from task state and model-request state.
- The UI never infers a real process is BUSY only because an analysis row is PROCESSING.

The completed Phase 2 local simulation remains useful as a deterministic demo/test adapter. It must be labelled SIMULATED and remain separate from LIVE backend data.

## 6. Human oversight and trading safety

SIREADER Virtual Office is an operational visualization and permitted task-management surface, not a trading terminal or autonomous trading authority.

Non-negotiable boundaries:
- The Python backend remains the source of truth for SIREADER decisions, approvals, market monitoring, persistence, and later worker execution.
- The existing Decision Engine and manual approval workflow must not be bypassed.
- No MT5 order placement, close, modification, SL/TP adjustment, or auto-trading capability is introduced by the Virtual Office roadmap.
- Read-only observability credentials are not reused for write/command endpoints.
- Any future non-trading task command requires a separate API contract, authentication, authorization, validation, idempotency, rate limiting, audit logging, and explicit acceptance tests.
- Human approval remains required anywhere the existing SIREADER policy requires it.

## 7. Truthful data and operation modes

Every data source must be explicit.

- **SIMULATED** — deterministic frontend demo state only.
- **LIVE** — data returned by the authenticated backend contract.
- **STALE** — previously valid LIVE data whose freshness threshold has expired.
- **OFFLINE** — backend cannot currently be reached.
- **ERROR** — request, schema, authorization, or service failure.

Rules:
- Never silently turn OFFLINE/STALE/ERROR into fake LIVE activity.
- Never merge simulated usage/cost into actual provider usage/cost.
- Never infer missing values or fabricate counts, worker identities, timestamps, or health.
- Keep transport, runtime contracts, application state, UI panels, and 3D rendering separated.

## 8. Final destination

The target release is **SIREADER Virtual Office v1.0**: an installable, usable, secure, maintainable application in which a human can observe and supervise a genuine multi-worker SIREADER system through the existing interactive 3D office.

At the final acceptance point, the application should:
- Launch reliably from a documented clean installation.
- Show the existing 3D office and seven initial workers with working interactions.
- Display truthful backend LIVE observability alongside clearly separated deterministic DEMO mode.
- Visualize real worker/task lifecycle only when the backend has authoritative records.
- Support backend-controlled task coordination and approved AI-provider execution with budget/cost governance.
- Provide auditable task history, error/recovery states, and human-supervised operations.
- Scale its data-driven architecture toward 50–100 workers.
- Protect all credentials and enforce security boundaries between browser, BFF, API, backend, database, and providers.
- Preserve the existing SIREADER Telegram, decision, approval, and trading safety architecture.

**v1.0 means a working AI workforce product—not just a completed roadmap, a successful frontend build, a 3D demo, or a set of API endpoints.** Every release claim must be supported by tests and acceptance evidence.

## 9. How every future task must use this document

Before planning or implementing any task:

1. Read this document to remember the product mission and system boundaries.
2. Read [`docs/ROADMAP.md`](ROADMAP.md) to confirm the allowed phase, scope, dependencies, and exit gate.
3. Read [`docs/PROJECT_STATE.md`](PROJECT_STATE.md) to confirm the actual current phase, branch, completed work, and known limitations.
4. Inspect only the files relevant to the task.
5. State the task's phase, intended result, constraints, and acceptance criteria before changing code.
6. Do not jump to a later phase, recreate completed work, or interpret a planned feature as implemented.
7. Update project state after a verified milestone.

If conversation memory conflicts with these repository documents, inspect the latest repository state and resolve the discrepancy explicitly. Never invent completion evidence.
