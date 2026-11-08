# SIREADER Phase 3.2 — Execution Ledger

**Purpose:** Durable hand-off and anti-hallucination record. This file is the concise source for where implementation stopped, what is proven, and what must happen next. Update it on every accepted work unit.

## Repository and branch

- Virtual Office repository: `awandhani22-boop/SIREADER`
- Active branch: `phase-3-2-batch-1-bff-foundation`
- Latest verified remote HEAD: `8dfa50421f30bc888d22c880dcb5bd496f201d0e`
- Latest verified commit: `fix(auth): enforce concurrent login attempt limits and correct expiry test`
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
| Phase 3.1 | Python read-only API | CODE/DB work recorded complete by roadmap; owner local credential + HTTP smoke step remains pending in backend runbook | Backend runbook and Phase 3.1 contract |
| 3.2 Batch 1 | Express BFF foundation, allowlist, guards, safe errors/logs, fixed topology ports | PUSHED; source audit complete; prior Argon local report retained | Commit `8b5c7a09ec82e83e8bd81a25a2e8034dbe16713e`; final four simultaneous-env port cases are source-audited. Included in Batch2 full CI run. |
| 3.2 Batch 2 | Fixed upstream proxy and Pydantic schema validation | IMPLEMENTED, PUSHED, CI PASS | Commit `428a051fe18d48a64267b1dbe41b4cc42d8d76de`; fixed five-path proxy, server-only token, timeout <=5s, redirect rejection, streamed 1MiB cap, strict DTO checks, safe errors; mock tests; GitHub Actions run `42482847460` passed 323/323 tests, TypeScript check, and production build. No real backend/Supabase calls. |
| 3.2 Batch 3 | Operator password/session/CSRF | IMPLEMENTED, PUSHED, CI PASS | Commit `6c10ddf` added scrypt login, memory sessions, secure cookie, CSRF logout, password-hash helper and tests. CI first run exposed an incorrect absolute-timeout test; follow-up commit `8dfa504` corrected the test and reserves login attempts before scrypt to prevent concurrent brute-force race. GitHub Actions run `42483616073`: 331/331 tests, TypeScript check and build passed. Real operator hash remains owner-local and not configured in repo. |
| 3.2 Batch 4 | Frontend live API contracts/state adapter | PLANNED | Not implemented |
| 3.2 Batch 5 | Polling/backoff/staleness and observability presentation | PLANNED | Not implemented |
| 3.2 Batch 6 | Vite proxy, production static serving, local browser/security acceptance | PLANNED | Not implemented |
| Phase 3.3 | Shared SSE through BFF | PLANNED | Must follow stable 3.2 |
| Phase 4.1 | Worker runtime contract/registry/health | PLANNED | Backend-authoritative |
| Phase 4.2 | AI provider execution/routing/cost guard | PLANNED | Server-only credentials; budget approval required |
| Phase 4.3 | Persistent backend task orchestration | PLANNED | Idempotent claims, retry/cancel/recovery |
| Phase 4.4 | Frontend LIVE runtime adapter and DEMO/LIVE separation | PLANNED | Existing 3D scene retained |

## Verification truth table

- Confirmed on GitHub: remote branch HEAD equals `8b5c7a09ec82e83e8bd81a25a2e8034dbe16713e`; commit changes only `server/config.ts` and `server/app.test.ts` relative to its parent.
- Reported by Argon (not independently run by assistant): 29/29 BFF tests and 311/311 repository tests, TypeScript typecheck, npm lint script, Vite build, and diff check.
- Verified by assistant source inspection on GitHub: strict mode-to-port mapping; independent rejection of mismatched `BFF_PORT` and `overrides.port`; four simultaneous-setting regression cases with environment restoration.
- Not verified: GitHub Actions result (no status checks returned); local Chrome browser/session integration; local live Python API HTTP smoke tests; production launch/static serving; API secret presence in local env.
- No claim of Phase 3.2 or Phase 4 completion is valid yet.

## Next action — Batch 4: Frontend API Contracts & Runtime State

1. Re-read `docs/PRODUCT_VISION.md`, `docs/ROADMAP.md`, `docs/PROJECT_STATE.md`, this ledger and the current branch HEAD.
2. Inspect existing frontend Zustand stores, API panels, worker/task types, React app composition, and simulation selectors. Preserve the working 3D office.
3. Implement a separate typed LIVE API client/repository and validated DTO boundary for the five fixed BFF GET endpoints; no bearer token or password in frontend.
4. Add independent LIVE observability state with provenance and connection states: CONNECTING, LIVE, STALE, OFFLINE, ERROR, SESSION_REQUIRED. Do not reuse or merge SIMULATED worker/task/token/cost data with LIVE results.
5. Add frontend auth/session bootstrap: GET session; show login when SESSION_REQUIRED; POST password as same-origin JSON; store CSRF token in component/store memory only; logout posts X-CSRF-Token and clears private LIVE state.
6. Keep 3D scheduler and SIMULATED interactions untouched. Do not map backend PROCESSING to a real worker BUSY without actual runtime/heartbeat authority.
7. Add tests for API DTO parsing, unknown/extra fields, no-secret handling, auth bootstrap, private data clearing, and strict LIVE/SIMULATED separation. Run full CI tests/typecheck/build.
8. Commit/push a coherent unit to `phase-3-2-batch-1-bff-foundation`, update all current-state docs and verify the remote HEAD/CI. Do not merge `main`.

**Owner-side local requirements still pending:** run the masked local password hash helper, place its output only in the ignored local `.env`, complete the Python Backend Phase3.1 credential/API smoke checks privately, then verify actual HttpOnly cookie behavior and BFF/Vite/production routing in Chrome on Windows. Never paste secret values into chat.

