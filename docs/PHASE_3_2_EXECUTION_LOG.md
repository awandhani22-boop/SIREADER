# SIREADER Phase 3.2 — Execution Ledger

**Purpose:** Durable hand-off and anti-hallucination record. This file is the concise source for where implementation stopped, what is proven, and what must happen next. Update it on every accepted work unit.

## Repository and branch

- Virtual Office repository: `awandhani22-boop/SIREADER`
- Active branch: `phase-3-2-batch-1-bff-foundation`
- Latest verified remote HEAD: `e504abf3d7cd8781559275eb4243431a88df57ad`
- Latest verified commit: `fix(live): construct validated auth DTOs without unsafe casts`
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
| 3.2 Batch 4 | Frontend API contracts, independent LIVE Zustand state, same-origin client, session/CSRF controller | IMPLEMENTED, PUSHED, CI PASS | Commits `2e5778d` and `e504abf`; GitHub Actions run `42485169977`: 343/343 tests, TypeScript check and production build passed. First run `42485110003` caught two unsafe casts; correction is recorded in `e504abf`. UI presentation/polling are explicitly deferred to Batch 5. |
| 3.2 Batch 5 | Polling/backoff/staleness and observability presentation | PLANNED | Not implemented |
| 3.2 Batch 6 | Vite proxy, production static serving, local browser/security acceptance | PLANNED | Not implemented |
| Phase 3.3 | Shared SSE through BFF | PLANNED | Must follow stable 3.2 |
| Phase 4.1 | Worker runtime contract/registry/health | PLANNED | Backend-authoritative |
| Phase 4.2 | AI provider execution/routing/cost guard | PLANNED | Server-only credentials; budget approval required |
| Phase 4.3 | Persistent backend task orchestration | PLANNED | Idempotent claims, retry/cancel/recovery |
| Phase 4.4 | Frontend LIVE runtime adapter and DEMO/LIVE separation | PLANNED | Existing 3D scene retained |

## Verification truth table

- Confirmed on GitHub: remote branch HEAD equals `8b5c7a09ec82e83e8bd81a25a2e8034dbe16713e`; commit changes only `server/config.ts` and `server/app.test.ts` relative to its parent.
- Historical Batch 1 report: 29/29 BFF tests and 311/311 repository tests, TypeScript typecheck, build and diff check were reported by Argon. Batch 4 verification is stronger: GitHub Actions run `42485169977` directly confirms 343/343 tests, TypeScript check and Vite production build passed.
- Verified by assistant source inspection on GitHub: Batch 1 strict mode-to-port mapping and simultaneous-setting regression cases. Batch 4 code is present in the remote commit and its full GitHub Actions run passed.
- Not verified: owner Windows test/build; local Chrome browser/session integration; local generated operator password hash; local live Python API HTTP smoke tests; dev Vite proxy and production static serving; visible LIVE UI/polling; API secret presence in local env.
- No claim of Phase 3.2 or Phase 4 completion is valid yet.

## Next action — Batch 5: Polling & Observability Presentation

1. Re-read `docs/PRODUCT_VISION.md`, `docs/ROADMAP.md`, `docs/PROJECT_STATE.md`, this ledger and verify the branch HEAD (`e504abf3d7cd8781559275eb4243431a88df57ad`).
2. Inspect the existing OfficeApp composition, TopBar, panels, and the Batch 4 LIVE adapter/controller. Preserve the working 3D scene and all deterministic simulation behavior.
3. Add one polling coordinator: system status, active pipeline and market watches every 10 seconds; telemetry usage and audit decisions every 30 seconds.
4. Enforce 5-second request timeout, bounded jittered backoff capped at 60 seconds, OFFLINE after two consecutive transport failures, STALE after three expected polling intervals, and keep last-known values visibly stale/offline rather than fresh.
5. Clear private LIVE data on SESSION_REQUIRED; schema/backend errors must remain ERROR and never fall back to SIMULATED.
6. Add fake-clock/fake-timer tests for cadence, overlapping-request prevention, backoff bounds, staleness thresholds, OFFLINE threshold, recovery to LIVE, and session-required clearing.
7. Integrate panels/login into the existing UI with explicit LIVE/SIMULATED labels and loading/empty/error states. Never infer OS worker BUSY from a PROCESSING pipeline record.
8. Run tests/typecheck/build; update this ledger with evidence. Do not connect live credentials before the owner has completed the backend API smoke checks.

**Owner-side local requirements still pending:** generate operator hash locally using the masked helper and place it only in ignored local environment; complete Python Backend Phase 3.1 authenticated HTTP smoke checks privately; verify real HttpOnly cookie/CSRF behavior in Chrome and local dev/production serving on Windows. Never paste secret values into chat.

