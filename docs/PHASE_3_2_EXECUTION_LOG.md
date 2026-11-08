# SIREADER Phase 3.2 — Execution Ledger

**Purpose:** Durable hand-off and anti-hallucination record. This file is the concise source for where implementation stopped, what is proven, and what must happen next. Update it on every accepted work unit.

## Repository and branch

- Virtual Office repository: `awandhani22-boop/SIREADER`
- Active branch: `phase-3-2-batch-1-bff-foundation`
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
| Phase 3.1 | Python read-only API | CODE/DB work recorded complete by roadmap; owner local credential + HTTP smoke step remains pending in backend runbook | Backend runbook and Phase 3.1 contract |
| 3.2 Batch 1 | Express BFF foundation, allowlist, guards, safe errors/logs, fixed topology ports | PUSHED; source audit complete; prior Argon local report retained | Commit `8b5c7a09ec82e83e8bd81a25a2e8034dbe16713e`; final four simultaneous-env port cases are source-audited. Included in Batch2 full CI run. |
| 3.2 Batch 2 | Fixed upstream proxy and Pydantic schema validation | IMPLEMENTED, PUSHED, CI PASS | Commit `428a051fe18d48a64267b1dbe41b4cc42d8d76de`; fixed five-path proxy, server-only token, timeout <=5s, redirect rejection, streamed 1MiB cap, strict DTO checks, safe errors; mock tests; GitHub Actions run `42482847460` passed 323/323 tests, TypeScript check, and production build. No real backend/Supabase calls. |
| 3.2 Batch 3 | Operator password/session/CSRF | IMPLEMENTED, PUSHED, CI PASS | Commit `6c10ddf` added scrypt login, memory sessions, secure cookie, CSRF logout, password-hash helper and tests. CI first run exposed an incorrect absolute-timeout test; follow-up commit `8dfa504` corrected the test and reserves login attempts before scrypt to prevent concurrent brute-force race. GitHub Actions run `42483616073`: 331/331 tests, TypeScript check and build passed. Real operator hash remains owner-local and not configured in repo. |
| 3.2 Batch 4 | Frontend API contracts, independent LIVE Zustand state, same-origin client, session/CSRF controller | IMPLEMENTED, PUSHED, CI PASS | Commits `2e5778d` and `e504abf`; GitHub Actions run `42485169977`: 343/343 tests, TypeScript check and production build passed. First run `42485110003` caught two unsafe casts; correction is recorded in `e504abf`. |
| 3.2 Batch 5 | Polling/backoff/staleness and LIVE observability dock presentation | IMPLEMENTED, PUSHED, CI PASS | Commits `c25cf29`, `482397c`, `95bbe461`, `f15f7430`; GitHub Actions run `42486162630`: 353/353 tests, TypeScript check and production build passed. Includes cadence, no-overlap, bounded jitter, OFFLINE/STALE, session clear/late-response guards and TopBar dock. |
| 3.2 Batch 6 | Vite loopback proxy, dotenv-first BFF entrypoint, cross-platform dev launcher, production static/SPA serving, local runbook | IMPLEMENTED, PUSHED, CI PASS; OWNER LOCAL ACCEPTANCE PENDING | Commits `f24a59a` and `9641d18`; GitHub Actions run `42486731963`: 358/358 tests, TypeScript check, production build passed. First run `42486677113` passed 358 tests but typecheck caught TS syntax in `.mjs`; fixed in `9641d18`. |
| Phase 3.3 | Shared SSE through BFF | PLANNED | Must follow stable 3.2 |
| Phase 4.1 | Worker runtime contract/registry/health | PLANNED | Backend-authoritative |
| Phase 4.2 | AI provider execution/routing/cost guard | PLANNED | Server-only credentials; budget approval required |
| Phase 4.3 | Persistent backend task orchestration | PLANNED | Idempotent claims, retry/cancel/recovery |
| Phase 4.4 | Frontend LIVE runtime adapter and DEMO/LIVE separation | PLANNED | Existing 3D scene retained |

## Verification truth table

- Confirmed on GitHub: implementation commit `9641d18f773d8a35e14f0c5224289d8d8cfc4ea5`, Batch 5/6 tests and local runbook are present on the active branch. The exact current branch HEAD must be re-read from GitHub before starting the next task.
- GitHub Actions Batch 4 run `42485169977`: 343/343 tests, TypeScript check and production build passed. Batch 5 run `42486162630`: 353/353 tests, TypeScript check and production build passed. Batch 6 run `42486731963`: 358/358 tests, TypeScript check and production build passed (Vite build completed in 653 ms).
- Verified on remote source: Vite loopback bind and exact regex `/api` proxy with Host preserved (`changeOrigin: false`); BFF static serving uses the same Host/Fetch/Origin guards, never serves API paths from SPA fallback, denies dotfiles, uses no-store for HTML and immutable caching only for content-hashed assets. CI integration tests cover root/SPA/assets, hidden files, unknown API paths, missing dist, and Vite topology config.
- Not verified locally by owner: Windows start/stop of `bun run dev`; production `bun run start` against the real built `dist/`; actual Chrome HttpOnly/Secure/SameSite cookie and CSRF/logout behavior; locally generated operator hash; privately configured `SIREADER_API_AUTH_TOKEN`; Python Backend authenticated five-endpoint smoke tests; real end-to-end LIVE data session. CI does not prove local credentials, user machine behavior, Chrome cookie semantics, or live Supabase connectivity.
- No claim of Phase 3.2 or Phase 4 completion is valid yet.

## Next action — owner-side Phase 3.2 local acceptance

Implementation Batches 1–6 are pushed and CI-passed. **Do not start Phase 3.3 SSE until these local acceptance gates are completed.**

1. On Windows, from the Virtual Office repository root, run:
   ```powershell
   bun install --frozen-lockfile
   bun run test
   bun run lint
   bun run build
   ```
2. Generate the operator password hash only in the local terminal with `bun run hash:operator`. Store the resulting `OPERATOR_PASSWORD_HASH` line in the ignored local `.env`; never share the value in chat, screenshots, or Git.
3. Start both local development processes using `bun run dev`; open exactly `http://127.0.0.1:3000`. Confirm Vite is on loopback port 3000 and BFF on loopback port 3001. Confirm a port conflict fails rather than selecting another port.
4. Verify successful login sets `__Host-sireader_sid` as HttpOnly, Secure, SameSite=Strict, Path=/, host-only/no Domain. Confirm it is not readable through `document.cookie`. Verify logout revokes it and clears all private LIVE state.
5. Complete Python Backend Phase 3.1's authenticated five-endpoint HTTP smoke checks privately. Only after they pass, configure the separate `SIREADER_API_AUTH_TOKEN` in ignored local configuration. Never paste the token into chat.
6. Build and test the production BFF with `bun run build` followed by `bun run start`. Confirm the existing `dist/` is served from loopback port 3000 and API routes remain JSON while browser SPA routes return the frontend.
7. Record pass/fail results without secret values. After this gate passes, update the project state to close Phase 3.2 and only then plan Phase 3.3 SSE.

No trading, MT5 order, approval or write API is introduced by Phase 3.2.
