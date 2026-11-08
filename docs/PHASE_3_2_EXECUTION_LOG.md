# SIREADER Phase 3.2 — Execution Ledger

**Purpose:** Durable hand-off and anti-hallucination record. This file is the concise source for where implementation stopped, what is proven, and what must happen next. Update it on every accepted work unit.

## Repository and branch

- Virtual Office repository: `awandhani22-boop/SIREADER`
- Phase 3.2 implementation branch: `phase-3-2-batch-1-bff-foundation`
- Phase 3.2 closeout/documentation branch: `phase-3-2-closeout-phase-3-3-sse-plan`
- Phase 3.3 implementation branch: `phase-3-3-sse-implementation` (separate, unmerged in both repositories).
- Latest verified implementation commit: `9641d18f773d8a35e14f0c5224289d8d8cfc4ea5` (`fix(serving): keep cross-platform launcher valid JavaScript`). Later commits only update current-state documentation.
- Previous docs checkpoint before Batch 3: `94228186e22e548cc61f05909bc10f4cd9a79bae`
- Python backend repository: `awandhani22-boop/SIREADER-Python-Backend`, branch `phase-3-1-api-gateway`, reviewed baseline `76b968fce399a5f591b1bd48e1501e9baa45c92a`
- Never merge to `main` without owner approval. No destructive Git operations. Preserve untracked/local-only files.

## Product authority and repository boundaries

SIREADER is a real human-supervised AI workforce platform. Python Backend is the operational source of truth for LIVE runtime/task/provider/usage/persistence data. The existing React/Three.js Virtual Office is its human-facing observability and later permitted operations surface. Do not replace the frontend. Keep SIMULATED and LIVE data completely separate. No MT5 order, SL/TP or approval bypass authority is added to the office.

## Locked Phase 3.2 topology

Development:
`Browser 127.0.0.1:3000 -> Vite 127.0.0.1:3000 -> Express BFF 127.0.0.1:3001 -> Python API 127.0.0.1:8000`

Production:
`Browser 127.0.0.1:3000 -> Express BFF 127.0.0.1:3000 (dist + /api) -> Python API 127.0.0.1:8000`

All binds literal `127.0.0.1`; no LAN/public listening, no port fallback. Browser Host/Origin fixed `127.0.0.1:3000`. No CORS middleware/headers.

## Security decisions

- Five upstream API routes only: `GET /api/v1/system/status`, `/api/v1/telemetry/usage`, `/api/v1/pipeline/active`, `/api/v1/market-watches/active`, `/api/v1/audit/decisions`.
- No arbitrary upstream URL/path forwarding. Fixed upstream `http://127.0.0.1:8000`.
- Server builds upstream headers from scratch: server-only `Authorization: Bearer …` and `Accept: application/json`. Do not forward browser Cookie, Authorization, X-Forwarded or other headers.
- Timeout <= 5 seconds. Stream response with strict 1 MiB maximum; reject redirects; sanitize all errors and logs.
- Validate payloads against backend Pydantic DTOs in `app/api/schemas.py` at backend branch `phase-3-1-api-gateway`; do not invent properties.
- Operator auth: one operator, scrypt password hash, server-memory session store, random session IDs, rotation on login, 1-hour idle / 8-hour absolute expiration, rate limit, constant-time CSRF check, logout revocation. Session cookie `__Host-sireader_sid`; HttpOnly; Secure; SameSite=Strict; Path=/; no Domain; Max-Age=28800. CSRF token stays in frontend memory. In-memory sessions are lost at BFF restart.
- No secret values in chat, source control, frontend bundle, browser storage, URL or logs. Use presence-only environment checks.
- Backend remains read-only for Phase 3.2. No live trading or task execution through this phase.

## Progress ledger

| Unit | Scope | State | Evidence |
|---|---|---|---|
| Phase 1 | Existing 3D office foundation | COMPLETE | Prior project-state and phase audit docs |
| Phase 2.1–2.3 | Worker intelligence, deterministic scheduler, browser QA | COMPLETE WITH DOCUMENTED DEFERRED ITEMS | `docs/PROJECT_STATE.md`, Phase 2.3 audit |
| Phase 3.1 | Python read-only API | COMPLETE; owner-provided local credential/read-only DB verification and five authenticated GET smoke checks reported successful | Backend runbook, Phase 3.1 contract, owner local report (2026-11-08) |
| 3.2 Batch 1 | Express BFF foundation, allowlist, guards, safe errors/logs, fixed topology ports | PUSHED; source audit complete; prior Argon local report retained | Commit `8b5c7a09ec82e83e8bd81a25a2e8034dbe16713e`; final four simultaneous-env port cases are source-audited. Included in Batch2 full CI run. |
| 3.2 Batch 2 | Fixed upstream proxy and Pydantic schema validation | IMPLEMENTED, PUSHED, CI PASS | Commit `428a051fe18d48a64267b1dbe41b4cc42d8d76de`; fixed five-path proxy, server-only token, timeout <=5s, redirect rejection, streamed 1MiB cap, strict DTO checks, safe errors; mock tests; GitHub Actions run `42482847460` passed 323/323 tests, TypeScript check, and production build. No real backend/Supabase calls. |
| 3.2 Batch 3 | Operator password/session/CSRF | IMPLEMENTED, PUSHED, CI PASS | Commit `6c10ddf` added scrypt login, memory sessions, secure cookie, CSRF logout, password-hash helper and tests. CI first run exposed an incorrect absolute-timeout test; follow-up commit `8dfa504` corrected the test and reserves login attempts before scrypt to prevent concurrent brute-force race. GitHub Actions run `42483616073`: 331/331 tests, TypeScript check and build passed. Real operator hash remains owner-local and not configured in repo. |
| 3.2 Batch 4 | Frontend API contracts, independent LIVE Zustand state, same-origin client, session/CSRF controller | IMPLEMENTED, PUSHED, CI PASS | Commits `2e5778d` and `e504abf`; GitHub Actions run `42485169977`: 343/343 tests, TypeScript check and production build passed. First run `42485110003` caught two unsafe casts; correction is recorded in `e504abf`. |
| 3.2 Batch 5 | Polling/backoff/staleness and LIVE observability dock presentation | IMPLEMENTED, PUSHED, CI PASS | Commits `c25cf29`, `482397c`, `95bbe461`, `f15f7430`; GitHub Actions run `42486162630`: 353/353 tests, TypeScript check and production build passed. Includes cadence, no-overlap, bounded jitter, OFFLINE/STALE, session clear/late-response guards and TopBar dock. |
| 3.2 Batch 6 | Vite loopback proxy, dotenv-first BFF entrypoint, cross-platform dev launcher, production static/SPA serving, local runbook | IMPLEMENTED, CI PASS; OWNER LOCAL ACCEPTANCE CONFIRMED | Commits `f24a59a` and `9641d18`; GitHub Actions run `42486731963`: 358/358 tests, TypeScript check, production build passed. First run `42486677113` passed 358 tests but typecheck caught TS syntax in `.mjs`; fixed in `9641d18`. |
| Phase 3.3 | Python LISTEN/NOTIFY + EventHub, authenticated SSE API, BFF stream proxy, frontend EventSource invalidation/fallback | IMPLEMENTATION IN PROGRESS | See `docs/PHASE_3_3_SSE_EXECUTION_LOG.md`; migration and owner E2E acceptance pending |
| Phase 4.1 | Worker runtime contract/registry/health | PLANNED | Backend-authoritative |
| Phase 4.2 | AI provider execution/routing/cost guard | PLANNED | Server-only credentials; budget approval required |
| Phase 4.3 | Persistent backend task orchestration | PLANNED | Idempotent claims, retry/cancel/recovery |
| Phase 4.4 | Frontend LIVE runtime adapter and DEMO/LIVE separation | PLANNED | Existing 3D scene retained |

## Verification truth table

- Confirmed on GitHub: implementation commit `9641d18f773d8a35e14f0c5224289d8d8cfc4ea5`, Batch 5/6 tests and local runbook are present on the active branch. The exact current branch HEAD must be re-read from GitHub before starting the next task.
- GitHub Actions Batch 4 run `42485169977`: 343/343 tests, TypeScript check and production build passed. Batch 5 run `42486162630`: 353/353 tests, TypeScript check and production build passed. Batch 6 run `42486731963`: 358/358 tests, TypeScript check and production build passed (Vite build completed in 653 ms).
- Verified on remote source: Vite loopback bind and exact regex `/api` proxy with Host preserved (`changeOrigin: false`); BFF static serving uses the same Host/Fetch/Origin guards, never serves API paths from SPA fallback, denies dotfiles, uses no-store for HTML and immutable caching only for content-hashed assets. CI integration tests cover root/SPA/assets, hidden files, unknown API paths, missing dist, and Vite topology config.
- Owner-reported local acceptance (2026-11-09): Windows development launcher and production-like launcher were reported safe; Python Backend and BFF were active on the documented loopback ports; five authenticated GET endpoints had previously returned successfully and unauthenticated access was rejected; operator hash was valid and the server-to-server token remained configured; Chrome login succeeded; the host-only `__Host-sireader_sid` cookie was visible in Application with HttpOnly/Secure/SameSite=Strict/Path=/ and was not readable through `document.cookie`; LIVE observability loaded and refresh restored the LIVE view; SIMULATION did not contaminate LIVE data; logout/reload/session revocation were reported safe.
- Evidence qualification: the owner confirmed these outcomes conversationally; a sanitized terminal/browser transcript was not attached. Do not present these owner-reported results as GitHub CI evidence or independently reproduced tests.
- Production-like launcher qualification: the owner responded that the production test was safe after being given the runbook checks. No exact build output, HTTP status transcript, or production-browser screenshot was supplied; repeat the checks when preparing formal release evidence.
- Transient Pipeline `LOADING` during a request is not a failure by itself. Empty result collections are valid when the authenticated snapshot endpoint validates successfully.
- Phase 3.2 owner acceptance is recorded as PASSED. This does not complete any Phase 4 or later work.

## Next action — Phase 3.3 owner-controlled migration and end-to-end acceptance

Phase 3.2 is **COMPLETE — OWNER ACCEPTANCE PASSED (2026-11-09)**. Phase 3.3 implementation is isolated on `phase-3-3-sse-implementation` in both repositories; neither branch has been merged to `main`.

The event design and code are recorded in [`docs/PHASE_3_3_SSE_ARCHITECTURE.md`](PHASE_3_3_SSE_ARCHITECTURE.md) and [`docs/PHASE_3_3_SSE_EXECUTION_LOG.md`](PHASE_3_3_SSE_EXECUTION_LOG.md). The Virtual Office CI run `42534082388` passed 367/367 tests, TypeScript check, and production build. Python Backend run `42534573937` passed on exact commit `9c76a804eb6bb1c7c6838bc5ba0dcb8f7d677fb1` (98 API tests, compileall, 50 core regression tests).

Remaining work:
1. Have the owner/DBA review and apply `migrations/2026_11_09_observability_events.sql` to Supabase; do not run it as `sireader_api_ro`.
3. Restart Python API and Virtual Office on the owner's local machine; verify the listener becomes ready without changing read-only grants.
4. Verify Chrome same-origin EventSource, event payload contains only allowlisted invalidation metadata, and the snapshot GET endpoint refreshes the intended resource.
5. Test disconnect, reconnect, replay gap, process restart, SSE unavailable fallback, logout/session expiry cleanup, and ensure the Simulation store is unchanged.
6. Record owner acceptance and performance evidence before Phase 3.3 is marked COMPLETE.

Phase 4.1–6.3 remain planned and must be completed in roadmap order. No trading, MT5 order, SL/TP, or manual-approval bypass capability is authorized.

