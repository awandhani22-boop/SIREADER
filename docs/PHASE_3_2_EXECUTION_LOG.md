# SIREADER Phase 3.2 — Execution Ledger

**Purpose:** Durable hand-off and anti-hallucination record. This file is the concise source for where implementation stopped, what is proven, and what must happen next. Update it on every accepted work unit.

## Repository and branch

- Virtual Office repository: `awandhani22-boop/SIREADER`
- Active branch: `phase-3-2-batch-1-bff-foundation`
- Last verified remote HEAD at ledger creation: `8b5c7a09ec82e83e8bd81a25a2e8034dbe16713e`
- Last verified commit: `fix(bff): enforce mode-specific port topology`
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
| 3.2 Batch 1 | Express BFF foundation, allowlist, guards, safe errors/logs, fixed topology ports | PUSHED; owner/local verification remains part of acceptance | Commit `8b5c7a09ec82e83e8bd81a25a2e8034dbe16713e`; Argon report: 29 BFF + 311 total tests after final additions; assistant source-audited port mapping and four simultaneous-env regression assertions; no CI status returned |
| 3.2 Batch 2 | Fixed upstream proxy and Pydantic schema validation | NEXT | Not implemented |
| 3.2 Batch 3 | Operator password/session/CSRF | PLANNED | Not implemented |
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

## Next action — Batch 2

1. Re-read the three canonical project docs and this ledger.
2. Re-read BFF `server/app.ts`, `allowlist.ts`, `errors.ts`, `guards.ts`, `log.ts`, `config.ts`, package scripts/lockfile.
3. Read the separate backend Pydantic schemas and five route handlers on `SIREADER-Python-Backend/phase-3-1-api-gateway`.
4. Implement only the fixed upstream transport in the Virtual Office repo; mock upstream server in tests. No credential values and no real Supabase/API calls.
5. Run tests/typecheck/build if local tool access is available; state exact outcomes. Add test output or owner-run verification evidence to the ledger.
6. Commit/push the complete unit to `phase-3-2-batch-1-bff-foundation`, update this ledger and `docs/PROJECT_STATE.md`, then verify the remote branch HEAD and file contents.

