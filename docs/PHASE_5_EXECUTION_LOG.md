# Phase 5.1 — Execution Log

**Date:** 2026-11-09  
**Branch:** phase-5-implementation  
**Scope:** Human-supervised operations for generic non-trading worker tasks.

## Security and backend

- Preserved the Phase 4 observability API on loopback port 8000 with its read-only role/token.
- Added a separate FastAPI command process on 127.0.0.1:8010, requiring the dedicated sireader_workforce_cmd PostgreSQL login and a separate bearer token. There is no fallback to the read-only token or core DATABASE_URL.
- Added strict startup verification of role identity, exact table/column grants, row-level security enablement, expected command policies, sequence access, and append-only audit privileges.
- Added RLS allowlists for the five generic workers (Supervisor, Haiku, Sonnet, Opus, Data Archivist), non-trading capabilities/task types, associated attempts, and activity events. Decision Engineer / Market Monitor rows are not visible or mutable by the command role, even through direct SQL.
- Added the four command types: TASK_ENQUEUE, WORKER_SCHEDULING_SET, TASK_CANCEL, and TASK_RETRY.
- Pause/resume changes only accepting_tasks, not worker enabled/process/heartbeat state. A paused worker stops claiming new tasks but may finish current work.
- Cancel before provider reservation becomes CANCELLED. Cancel after provider reservation becomes WAITING_REVIEW with an UNKNOWN attempt.
- Retry requires a terminal FAILED task, intact payload, last failed attempt, and no provider request ID/reservation timestamp. It creates a new task linked by correlation and does not rewrite the original failed task.
- All commands require bounded bodies, explicit allowlists, backend rate limiting, same-actor idempotency, and append-only command audit rows.

## BFF and frontend

- Added exactly four fixed POST routes to the BFF allowlist. Each write requires the existing operator session, CSRF token, exact same-origin Origin, JSON content type, and the separate server-side command token.
- Browser code never receives the backend command bearer or database URL. Request paths are fixed; redirects are rejected; request/response sizes are bounded; responses are schema-validated.
- Added a LIVE-only console for bounded non-trading enqueue, worker scheduling pause/resume, safe cancel, and safe retry. DEMO mode remains local-only and does not call command endpoints.
- The browser preserves an idempotency key after timeout/unreachable/ambiguous response. It never evicts an unresolved key to allow a different command to proceed.

## Automated verification

- **Backend HEAD:** de1d16be631418fe17d61524d1b63e479374f1fb. [CI run 42604536800 PASS](https://github.com/awandhani22-boop/SIREADER-Python-Backend/actions/runs/42604536800): 144 API/command/PostgreSQL tests, compileall, and 75 core regression tests.
- **Frontend HEAD:** 04989b704deb5d9f2248341fc5d7d9bfab5c277d. [CI run 42605233370 PASS](https://github.com/awandhani22-boop/SIREADER/actions/runs/42605233370): 399 tests, TypeScript check, and production build.
- Backend runbook / retry-fixture documentation commit: 988bc32fc5dc83fe25bb29d8557f82a21ffc3842; [CI run 42605004720 PASS](https://github.com/awandhani22-boop/SIREADER-Python-Backend/actions/runs/42605004720).
- PostgreSQL verification uses disposable CI infrastructure. Frontend BFF tests use loopback mock servers. No local owner database, Supabase LIVE database, paid provider, MT5/HFM, or trading workflow was touched.

## Owner acceptance completion (2026-11-09)

The Phase 5.1 exit gate is officially **CLOSED and COMPLETE**.

1. Dedicated role sireader_workforce_cmd was provisioned and tested against local PostgreSQL 16.6 (127.0.0.1:5432) with full RLS enablement and least-privilege boundary.
2. Automated CDP browser suite validated all 9 acceptance scenarios: DEMO mode isolation, LIVE switch & operator authentication, non-trading generic task enqueue (Haiku), task cancel pre-provider, worker scheduling pause/resume, safe fixture task retry (phase5-retry-fixture-0001), DEMO mode isolation & zero command dispatch, operator logout with private live data clearing, and zero credential leakage.
3. Identified and remediated retry target ID mismatch on server/commands.ts and src/live/live.contracts.ts; committed as 96aa4a8755193e16e37b912dd3f14cf825fb2400 with GitHub Actions CI PASS (
un 42615872014).
4. Full evidence and test records are documented in [PHASE_5_1_OWNER_ACCEPTANCE_REPORT.md](./PHASE_5_1_OWNER_ACCEPTANCE_REPORT.md).

**Phase 5.2 (Review, Audit, Budgets & Governance) is now unblocked and active.**


---

# Phase 5.2 — Review, Budget Governance & Workforce Policy (2026-11-10)

## 5.2.2-E — Human Review Inbox

Frontend implementation head: `9919ef90a9464cc0e093e288353634884b6d3992`.

- Added fixed read-only BFF routes for workforce/governance review pending lists and detail.
- Added BFF adjudication command routing. It requires operator session + CSRF, an exact adjudication DTO, expected original-output SHA-256, and an idempotency key.
- Backend operator identity is injected server-side as `local_operator`; browser-supplied identity/auth/cookie headers are not forwarded. This reflects the current single-operator auth contract; it is not a multi-operator identity mapping.
- Added Review Inbox UI in authenticated LIVE mode with pagination, detail, expiry, original hash, APPROVE, EDIT, REJECT, and session cleanup.
- Added strict DTO/BFF tests for response size, exact keys, hashes, invalid IDs, bounded pagination, and trusted header behavior.
- [Frontend CI run 42666577263 PASS](https://github.com/awandhani22-boop/SIREADER/actions/runs/42666577263) and [integrated frontend run 42667733078 PASS](https://github.com/awandhani22-boop/SIREADER/actions/runs/42667733078). The latter reports 415 tests passed, TypeScript passed, and production build passed.

## 5.2.3 — Budget Governance & Cost Guard Observability

- Kept `app/ai/cost_guard.py` as the single usage/reservation ledger.
- Added read-only `v_api_workforce_ai_usage` projection joining provider request/usage records to workforce task attempts.
- Added budget DTOs and telemetry aggregation for daily IDR target/hard limit, rolling 30-day IDR, monthly Anthropic USD, FAST/REASONING/ESCALATION IDR allocations, usage status counts, and per-worker/per-task attribution.
- Preserved reserved and UNKNOWN amounts in projected usage. IDR and USD are never summed or converted.
- [Backend CI run 42667794174 PASS](https://github.com/awandhani22-boop/SIREADER-Python-Backend/actions/runs/42667794174): 177 API tests and 75 core tests passed.
- [Frontend CI run 42667733078 PASS](https://github.com/awandhani22-boop/SIREADER/actions/runs/42667733078): 415 tests, TypeScript, production build.

## 5.2.4 — Model Escalation & Sensitive Task Policy

- Added backend-owned capability/task validation and deterministic tier selection.
- FAST/REASONING/ESCALATION is selected before provider dispatch and must match the worker's registered model-tier ceiling.
- Credentials are scrubbed before provider dispatch. Personal identifiers are redacted and force the existing atomic human-output quarantine.
- Explicit trade/order/private-key signals, unknown capabilities, capability/task mismatches, trading-adjacent capabilities, and excluded worker identities fail closed.
- No automatic provider re-invocation or tier escalation occurs after an UNKNOWN outcome. This is intentional because one attempt/request ID is reserved once and an uncertain result must be reconciled, not replayed.
- Default runtime/provider gates remain MOCK/OFF.

## 5.2.5 — Operations Finalization

- Added `python -m app.workers.maintenance` as a one-shot transactional maintenance entry point. It does not instantiate a provider.
- Added `scripts/run_workforce_maintenance.ps1` for Windows Task Scheduler.
- Added test coverage for the expiry-before-purge call order and disposable PostgreSQL review/budget migration rollback-forward cycle.
- Updated the PostgreSQL lifecycle fixture to create an explicit quarantined review, verify PENDING review protection, expire it, then verify parent task and review payload purge after the database retention boundary.
- The schedule wrapper is not registered on the owner's OS/deployment; that remains a deployment operator task.
- Final policy hardening commit is pending its CI run at the time of this log update.

## Remaining Phase 5 release gate

A single comprehensive owner-run Chrome/Windows acceptance remains required after automated validation is green. The CI and this source log do not claim that the local browser, local command/read API environment, or local maintenance schedule has been operated in this session. No Supabase LIVE migration, paid provider call, MT5/HFM action, trading execution, or main merge was performed.
