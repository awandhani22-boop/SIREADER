# Phase 7 — Controlled Worker Runtime Activation

**Current status (2026-11-11): 7.1–7.3 COMPLETE — 7.4 LOCAL STAGING SECURITY ACCEPTANCE PASS; PRODUCTION ROLLOUT BLOCKED.**
**Original plan date:** 2026-11-10

## Original plan rationale (historical context)

Phases 1–6 establish the Virtual Office, LIVE observability, persistent task orchestration, human review/governance, and the local operating baseline. The remaining product gap before a meaningful v1.0 is not more UI: it is proving that the Python worker process can safely claim, execute, and complete a task using the backend source of truth.

The Python worker already has an explicit CLI (`python -m app.workers.process --worker <id>`), a deterministic `MockWorkerProvider`, an opt-in runtime switch, and an independent live-provider switch. However, the current backend test inventory does not contain a dedicated `tests/workers` suite for the provider, policy and process runtime. Phase 7 closes this verification gap before any real provider is considered.

## Non-negotiable safety gates

- First prove the worker in unit tests with no database and no network.
- Then run a single MOCK worker against a newly created disposable local PostgreSQL test cluster/database, never against `sireader_disposable` or a populated database.
- Keep `WORKER_PROVIDER_MODE=MOCK`, `WORKER_LIVE_PROVIDER_ENABLED=false`, both per-task cost caps at zero, and the existing trading execution safeguards unchanged.
- Only general-purpose workers Haiku, Sonnet, and Opus may be considered for provider work. Decision Engineer and Market Monitor must remain excluded from general-purpose LIVE provider routing.
- No trading task, broker action, Telegram execution, MT5/HFM order, or use of the trading Decision Engine as a substitute is permitted.
- A mock response must be labelled SIMULATED and must never be presented as an AI answer from an external model.
- Do not use real user files, secrets, credentials, personal data or trading signals as pilot task inputs.
- No real provider call, paid API reservation, secret rotation, scheduler registration, Supabase LIVE migration, GitHub push or merge without separate explicit approval.

## Phase 7 workstreams

### 7.1 — Offline Worker Runtime Assurance

**Goal:** verify policy, provider factory, deterministic mock provider and runtime fail-closed behavior without a database or network.

Implementation:
- Add isolated unit tests for MockWorkerProvider determinism and cancellation.
- Test provider factory default/unknown modes and independent runtime/live-provider switches.
- Test OmniRoute boundary guards: missing credential, wrong tier, zero task cost cap, invalid usage, known-not-charged error, and uncertain outcome handling. All external HTTP calls must be replaced with local fakes.
- Test policy decisions for capability mismatch, unknown capability, personal-data redaction/review, forbidden private-key/trade instructions, worker restrictions and model-tier ceilings.
- Test that `run_worker_once`, `run_worker_forever`, and the CLI remain disabled by default and fail closed before any DB access.

Exit gate:
- No test makes a real network request or reads the production/local `.env` secret.
- Runtime remains disabled by default.
- Mock mode returns only SIMULATED source and no billing/provider usage.
- All new tests pass with the existing backend suite.

### 7.2 — One-Worker Local MOCK Pilot

**Goal:** validate end-to-end claim → execute mock → complete → read-only LIVE observability on a fresh disposable PostgreSQL 16.6 cluster.

Pilot boundaries:
- Start with one worker only: Haiku.
- Use one benign synthetic task such as summarizing a generated sample paragraph.
- Use a fresh temporary PostgreSQL cluster and throwaway database with the full supported migration/privilege fixture.
- Use an isolated worker login with only the privileges required by the existing worker claim/heartbeat/task completion path.
- Start the worker in a single foreground PowerShell window with environment variables scoped to that process only.
- Verify exactly one task is completed with `source=SIMULATED`, provider request ID NULL, no usage/cost reservation, a real process heartbeat, and a complete audit/event trail.
- Stop the foreground worker with Ctrl+C; verify the process heartbeat becomes STOPPED and the API view becomes stale/offline as designed.
- Drop only the known temporary cluster/database after verifying its exact name, path and port. Never run cleanup against the application PostgreSQL cluster.

Exit gate:
- One real OS worker process is visible through the backend observability API while it runs.
- A benign synthetic task transitions QUEUED → CLAIMED → RUNNING → COMPLETED.
- The result is SIMULATED, not LIVE; no external provider call occurs.
- Stop/restart and stale-heartbeat behavior are verified.
- Temporary cluster and test artifacts are cleaned up; the existing local application database is untouched.

### 7.3 — Single-Worker LIVE Provider Canary (separately gated)

**The original plan required a separate owner authorization.** That gate was subsequently satisfied for exactly one synthetic Haiku request on 2026-11-11. The single-use authorization is consumed; it does not authorize any additional request or continuing worker execution.

Required owner decisions:
- Which provider endpoint/account is intended (the current backend uses the server-side OmniRoute adapter).
- Which exact model/tier to test, initially FAST/Haiku only.
- Maximum cost per task, maximum daily cost, monthly budget, and a hard stop condition.
- Whether a dedicated provider credential is available; it must remain server-side and must not be copied into frontend environment variables.
- Which synthetic task and expected output schema will be used.

Required controls:
- A separate environment/process-scoped credential, with no secret printed to logs or terminal history.
- Explicit positive per-task cap and verified existing Cost Guard budget before any request.
- `WORKER_RUNTIME_ENABLED=true`, `WORKER_PROVIDER_MODE=OMNIROUTE`, and `WORKER_LIVE_PROVIDER_ENABLED=true` only in a dedicated, reviewed canary process; never in the general app `.env` as a casual permanent default.
- One request only; no automatic retry or tier escalation after UNKNOWN.
- Reconcile reservation, usage, and audit record before any second request.
- Manual review for outputs where the backend policy requires it.

### 7.4 — Limited General-Purpose Worker Rollout

Only after a canary passes: consider one additional general-purpose worker at a time, enforce tier ceilings and concurrency, use only allowlisted non-trading capabilities, and monitor budgets and human review. Do not start all seven roles as a group. Decision Engineer and Market Monitor remain excluded from generic provider execution.

## Current verified state

| Control | Current code/default |
|---|---|
| Worker runtime | `WORKER_RUNTIME_ENABLED=false` by default |
| Provider mode | `WORKER_PROVIDER_MODE=MOCK` by default |
| Live provider | `WORKER_LIVE_PROVIDER_ENABLED=false` by default |
| Per-task cost caps | IDR 0 / USD 0 by default; live provider rejects zero cap |
| Provider credential | `AI_API_KEY` is not configured in the backend `.env` at the time of this audit |
| Process entrypoint | `python -m app.workers.process --worker haiku` (explicit opt-in only) |
| Current worker processes | No new worker process was started as part of planning |

These defaults are intentionally retained.

## How Phase 7 relates to v1.0

Phase 7 is the remaining operational validation toward the existing FINAL v1.0 gate. A local MOCK pilot proves process/runtime integration but does not satisfy the real provider execution requirement by itself. The product remains unreleased until the required LIVE provider, Cost Guard, human review, and owner acceptance gates are separately passed—or the owner explicitly revises the v1.0 scope.

## Recommended model split

- **Sonnet:** review the architecture, safety boundaries, exact pilot runbook and acceptance evidence.
- **Argon:** implement the isolated unit tests and mock pilot tooling after the design is accepted.

Phase 7 starts with 7.1 only. Do not jump to 7.2 or 7.3 until the previous gate passes.


## Phase 7.1 execution evidence — 2026-11-10

**Status: COMPLETE.** The backend now has a dedicated `tests/workers/` unit-test harness for provider, policy and runtime safeguards.

New test files:
- `tests/workers/test_provider_unit.py`: deterministic mock behavior, cancellation, factory switches, missing credential, model-tier ceiling, zero task cap, fake OmniRoute success, invalid/missing usage as UNKNOWN. All outbound provider interactions are replaced by in-process fakes.
- `tests/workers/test_policy_unit.py`: capability/task matching, PII review/redaction, private-key and live-trading instruction rejection, provider worker allowlist, model-tier ceilings and unknown mode.
- `tests/workers/test_runtime_guards.py`: disabled one-shot/continuous runtime fails before heartbeat or database access; invalid polling intervals fail before startup.
- `tests/workers/test_runtime_mock_flow.py`: executes the real `run_worker_once` orchestration function with fake DB sessions and the deterministic `MockWorkerProvider`; verifies one SIMULATED completion, empty queue behavior and trade-instruction rejection.
- `tests/workers/conftest.py`: process-local synthetic settings and an intentionally unused loopback PostgreSQL URL. It does not read or copy the user's real `.env` secrets and does not connect to the database.

Verification:
- New focused unit tests: **31 passed**.
- Full backend local suite: **216 passed, 44 skipped, 0 failed**, one existing Starlette/httpx deprecation warning.
- Worker-directory suite: 77 passed, 17 skipped; the skips are existing PostgreSQL integration tests requiring `SIREADER_TEST_POSTGRES_URL`.
- No OS worker process was started; no provider HTTP request was made; no DB connection or mutation was performed by the new tests.

## Phase 7.2 readiness

The next implementation task is the one-worker MOCK pilot using a fresh disposable PostgreSQL 16.6 cluster on a separate port and a throwaway database. The existing app database `sireader_disposable` is prohibited for fixtures and pilot writes. The current API/BFF services may remain running; the pilot must point its worker process and test `DATABASE_URL` only at the dedicated temporary cluster. Phase 7.2 is not marked complete until an actual foreground Haiku worker process completes one synthetic task and its heartbeat/task/audit trail is verified, then the worker is stopped and the temporary cluster is safely removed.


## Evidence reconciliation update — 2026-11-11

The later backend report `backend/docs/PHASE_7_AI_HARNESS.md` and `backend/docs/PHASE_5_OPERATIONS_RUNBOOK.md` record that the one-cycle Haiku `run_worker_once` function was executed on an isolated disposable PostgreSQL 16.6 database. Both synthetic policy branches completed as SIMULATED, quarantine/release guards passed, no cost/provider call occurred, and heartbeat was returned to STOPPED.

This proves the one-cycle MOCK database orchestration test. It does **not** by itself prove the full Phase 7.2 exit gate stated above, which requires a separately visible foreground OS worker process, API-observed heartbeat/task/audit while running, followed by stop/restart and stale-heartbeat verification. Until that process-level evidence is recorded, Phase 7.2 status is **PARTIAL — one-cycle MOCK database acceptance passed; process-level gate open**. Phase 7.3 remains NOT AUTHORIZED.


## Phase 7.2 closeout — foreground MOCK worker (2026-11-11)

**Status: COMPLETE.** This update supersedes the earlier “7.2 readiness / NEXT” status above.

The full local process-level acceptance passed on a fresh SSL-enabled PostgreSQL 16.6 `sireader_test` cluster isolated to loopback port 55441. A real foreground Haiku worker ran in MOCK mode under a temporary non-superuser test role restricted by RLS. A separate read-only API on port 18000 observed:
- Worker READY while the OS process was alive.
- One benign synthetic QUICK_RESEARCH task and attempt COMPLETED, source SIMULATED, one attempt, no provider request ID/billing/cost.
- Four audit timeline events including TASK_CLAIMED, TASK_STARTED, HUMAN_REVIEW_QUEUED and TASK_COMPLETED.
- PENDING review visible through the API while task result_payload remained NULL and output stayed in quarantine.
- Graceful CTRL+C to STOPPED; a restart with a new instance ID returned READY then STOPPED; a forced two-minute-old heartbeat was reported as STALE.

The test exposed a missing `sireader_view_owner` RLS SELECT policy in the legacy local migration `2026_11_10_workforce_reviews_v1.sql`. That migration now creates view-owner SELECT policies for review metadata and payload tables. The API role continues to have no direct base-table access. The privilege regression fixture seeds a PENDING review/payload, asserts view visibility and denies direct API base-table reads; focused PostgreSQL tests passed 22/22.

The test-only DB/role/API/token/certificates and temp directory were removed; ports 55441/18000 are free. The existing application database and Supabase LIVE were not touched. No paid provider request, Telegram, MT5/HFM or trading action occurred. Phase 7.3 remains not authorized and 7.4 remains blocked.


## Phase 7.3 offline preflight hardening — 2026-11-11

An independent Anthropic USD daily hard cap is now enforced by the shared backend Cost Guard. The setting AI_ANTHROPIC_DAILY_BUDGET_USD defaults to 0.00 and fails closed: no USD reservation/provider call can proceed until a positive owner-approved value is configured. The guard checks actual plus reserved usage under the shared advisory lock, alongside the existing per-task USD cap and rolling monthly budget.

The read-only telemetry API and Virtual Office dashboard now expose a separate daily_anthropic_usd window. The strict frontend DTO and fixtures have been updated. The owner .env was not edited.

Verification after the update: backend tests/ 237 passed / 46 skipped; focused billing + telemetry API tests 82 passed; frontend 422 passed; TypeScript check and production build passed. The earlier worker/provider offline focus suite was 78/78. No live model call was made.

**7.3 remains PREPARATION COMPLETE / LIVE CANARY NOT AUTHORIZED.** Current per-task cap is zero and daily USD cap defaults to zero. OmniRoute's network/auth/encryption preflight is now verified: durable user data `.env` stores the recovered encryption key plus loopback bind and API-key enforcement; an existing encrypted DB value decrypts successfully. The listener is only `127.0.0.1:20128`; no-key request returns 401 and the SIREADER key returns 200. Windows Firewall exposure remains unverified. Still required: positive per-task and daily caps, confirmation of the existing $5 monthly ceiling, and explicit authorization for exactly one paid request.


## Phase 7.3 one-shot canary — final execution evidence — 2026-11-11

**COMPLETE.** Owner approved USD 0.01 per-task reservation, USD 0.01 daily cap, USD 5 monthly ceiling, and exactly one synthetic Haiku request. A fresh SSL-enabled PostgreSQL 16.6 cluster on loopback port 55442 hosted one QUICK_RESEARCH task for Haiku with max_attempts=1. No second worker accepted work.

One successful run_worker_once completed the task in one attempt. Timeline: ENQUEUED → CLAIMED → STARTED → PROVIDER_REQUESTED → COMPLETED. OmniRoute independently logged one successful `POST /v1/messages` for claude-haiku-5-5, API-key label SIREADER_CLAUDE, 249 input/33 output tokens, 0 cache tokens. SIREADER Cost Guard calculated USD 0.000042 actual, USD 0 reserved. OmniRoute provider_cost_usd was NULL, so this is price-based accounting, not independently confirmed invoice data. No retries were made after any uncertain provider outcome.

A pre-provider claim transaction initially exposed an ORM/database FK-order mismatch. Event task_id/attempt_id mappings now mirror database foreign keys and the newly-created attempt is flushed before its TASK_CLAIMED event. The PG16.6 claim/rollback probe passed; tests/workers: 97 passed, 17 skipped; compileall and diff check passed.

Persistent backend .env flags remain OFF/MOCK/zero and the global application ledger was not mutated; it remains 0 actual/reserved with daily cap 0. Carry USD 0.000042 separately into future budget reconciliation. The isolated canary database and cluster are removed after evidence is recorded. OmniRoute remains loopback-only with API-key auth.

This pass does not approve Phase 7.4 or any additional live worker/provider activity. The locked v1.0 release state remains NOT RELEASED.


## Latest Phase 7 closeout status — 2026-11-11

This status supersedes the earlier planning snapshot and readiness paragraphs above.

- **7.1 COMPLETE:** offline provider, policy and runtime fail-closed unit coverage.
- **7.2 COMPLETE:** isolated foreground Haiku MOCK worker process, synthetic task, API-observed heartbeat/audit, graceful stop/restart, and stale-heartbeat acceptance on disposable PostgreSQL 16.6.
- **7.3 COMPLETE:** exactly one owner-authorized synthetic Haiku 5.5 request was completed and reconciled at a price-table estimate of USD 0.000042. The provider did not independently report invoice cost. This single-use authorization is consumed.
- **7.4 local technical implementation COMPLETE:** global provider slot/UNKNOWN quarantine, worker database command layer, Python adapter and isolated PostgreSQL 17.11 acceptance are recorded.
- **7.4 security-review remediation COMPLETE for the staged worker boundary:** trading-related provider capability denial, LIVE reservation/billing provenance, policy metadata/model-tier validation, truncated LIVE output quarantine, maintenance session_user retention authorization, and Python/PostgreSQL review-policy parity (40 rules, 56 capability/task pairs, 1,120 decisions) all passed local staging acceptance.
- Latest regression: backend 670 passed / 47 skipped; Virtual Office 422 passed; TypeScript and production build passed. Separate PG17 staging SQL and adapter integration passed. The 47 root-suite skips still require SIREADER_TEST_POSTGRES_URL; they are not claimed as passing database integration tests.
- **Production readiness remains BLOCKED:** production-specific forward/rollback migration, per-worker production LOGIN/pooler role provisioning, production maintenance procedures, Command API and review-operator database boundaries, hosted-Supabase-equivalent staging, production backup/recovery approval, API target reconciliation, and new owner authorization for any additional paid LIVE execution remain open.
- Runtime remains OFF/MOCK; live provider OFF; worker database URL unset; per-task/daily USD budgets zero; trading DRY_RUN; automatic execution OFF.
- No production Supabase DDL, credentials, further paid request, Telegram listener, MT5/HFM action or trading order occurred. v1.0 remains NOT RELEASED.

The complete findings are in the [backend security review closeout](https://github.com/awandhani22-boop/SIREADER-Python-Backend/blob/phase-5-implementation/docs/WORKER_DATABASE_SECURITY_REVIEW_CLOSEOUT_2026-11-11.md) and the [PG17 staging acceptance report](https://github.com/awandhani22-boop/SIREADER-Python-Backend/blob/phase-5-implementation/docs/WORKER_DATABASE_COMMAND_LAYER_STAGING_ACCEPTANCE_2026-11-11.md). The earlier “7.2 NEXT / 7.3 NOT AUTHORIZED” statements above are historical and must not be used as the current phase position.
