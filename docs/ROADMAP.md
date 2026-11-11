## Current execution status — 2026-11-12 (supersedes the 2026-11-11 snapshot)

| Workstream | Status |
|---|---|
| Phase 5 implementation and applicable acceptance | COMPLETE |
| Phase 6.1–6.3 — personal local security, 3D scale baseline, operations | COMPLETE for local single-user scope |
| Phase 7.1 — offline worker runtime assurance | COMPLETE |
| Phase 7.2 — one-worker local MOCK pilot | COMPLETE — foreground process, heartbeat, task/audit, restart and stale checks accepted |
| Phase 7.3 — single-worker LIVE provider canary | COMPLETE — exactly one owner-authorized synthetic Haiku request; authorization consumed |
| Phase 7.4 — worker command boundary and limited rollout preparation | LOCAL IMPLEMENTATION + MANAGED-LIKE NON-SUPERUSER PG17 FORWARD/ROLLBACK/FORWARD + ACTUAL LOGIN/HTTP ACCEPTANCE PASS; hosted managed-staging step SKIPPED BY OWNER; production cutover remains BLOCKED |
| SIREADER Virtual Office v1.0 | NOT RELEASED |

Phase 7.4 local technical acceptance is complete. The final authority migration passed on a fresh local PostgreSQL 17.11 restore using a NOSUPERUSER migration login with the managed-like CREATEROLE/CREATEDB/BYPASSRLS capabilities. The final permission matrix passed: all seven worker lifecycle surfaces; provider reservation only for Haiku/Sonnet/Opus; four Command, two Review and one Maintenance functions; zero PUBLIC EXECUTE; zero direct worker/operator base-table privileges; nine RLS workforce tables; fourteen security-barrier API views. The actual database LOGIN and FastAPI HTTP smoke tests passed using separate Command, Review and Maintenance identities; the spoofed operator header did not override the database actor. SQL worker and operator/review/maintenance acceptance passed. Backend regression passed 327 tests with 47 environment-gated skips; Virtual Office passed 422 tests, TypeScript and production build passed.

This remains local managed-like acceptance, not hosted Supabase certification or deployment. The hosted target is unchanged and still has no workforce schema/roles. CLI local configuration has been initialized and the four applied hosted migration files have been restored from the actual migration ledger. The organization is on Supabase Free, which has no automatic daily database backups or PITR; the existing 2026-11-11 PG17.11 local dump passed archive integrity and local restore rehearsal but is not off-site or a fresh pre-cutover backup. A new Supabase-aware manual backup plus off-site copy and restore verification remain required before any production migration. **Owner decision (2026-11-12): the hosted development-branch / managed-equivalent staging step is skipped to avoid the quoted US$0.01344/hour compute charge. This is a waived/skipped validation gate, not a PASS or hosted certification.** No production credentials, additional paid inference, worker activation, Telegram, MT5/HFM, trading order or v1.0 release occurred. Production deployment remains blocked pending its separate backup/recovery, change-window, credential and owner approvals. See [the Phase 7.4 production migration rehearsal](https://github.com/awandhani22-boop/SIREADER-Python-Backend/blob/phase-5-implementation/docs/PHASE_7_4_PRODUCTION_MIGRATION_REHEARSAL_2026-11-11.md).

---

# SIREADER Virtual Office — Master Roadmap to v1.0

**Document status:** ROADMAP LOCKED — source of truth for phase order, scope, and acceptance gates  
**Repository:** `awandhani22-boop/SIREADER`  
**Current implementation branch:** `phase-5-implementation` (isolated from `main`; matching branch exists in both SIREADER repositories). The accepted Phase 4 branch remains the baseline.  
**Last roadmap review:** 2026-11-12

This document governs the SIREADER Virtual Office project from the existing 3D frontend through the final v1.0 release. **The canonical product mission and meaning of the final product are in [`docs/PRODUCT_VISION.md`](PRODUCT_VISION.md); read that before every task.** Keep this roadmap and `docs/PROJECT_STATE.md` aligned after every milestone. Do not create a replacement frontend or restart completed phases.

---

## 1. Product goal

Deliver a desktop-first, futuristic isometric 3D office that visualizes SIREADER's AI workers, tasks, queue, activity, usage, operational health, and human-supervised work controls.

The product evolves in deliberate steps:

1. A reliable and visually complete 3D office with deterministic local simulation.
2. Secure observability integration with the existing SIREADER Python backend.
3. Real-time worker runtime and task orchestration, with the Python backend as the source of truth.
4. Human-supervised operational controls, governance, and an auditable release.
5. A tested, documented, recoverable SIREADER Virtual Office v1.0.

The existing React/Three.js project is the product. Preserve and extend it; do not replace it with a new starter application or a second frontend.

## 2. Scope and non-negotiable boundaries

### In scope
- Existing React 19, TypeScript, Vite, Three.js, React Three Fiber v9, compatible Drei, and Zustand architecture.
- Seven initial workers: Supervisor, Haiku, Sonnet, Opus, Decision Engineer, Market Monitor, and Data Archivist.
- Data-driven worker/room/workstation models, task lifecycle, scheduler, UI, animation, and activity history.
- Growth path to 50–100 workers without duplicating scene components.
- Secure read-only observability first; real worker execution only in later phases with explicit backend contracts and controls.
- Explicit separation of LIVE, SIMULATED, STALE, OFFLINE, and ERROR data.

### Out of scope unless a separate, explicit project decision is approved
- Placing, closing, or modifying MT5 orders.
- Bypassing the Python Decision Engine, manual approval, or existing trading safeguards.
- Exposing database, Supabase service-role, broker, Telegram, or AI-provider credentials to the browser.
- Treating a frontend animation, mock worker, PROCESSING row, or delayed API response as proof that a real OS process/model worker is BUSY.
- Rebuilding the existing frontend in a different framework or repository.

### Source-of-truth rules
- During the local simulation phases, the deterministic simulation engine and `src/scheduler/` remain authoritative for DEMO data.
- After real runtime integration, Python backend services become authoritative for LIVE worker/task state, task dispatch, AI provider usage, and persistence.
- The frontend is a visualization and permitted control surface, never the authority for trading decisions.
- Never mix LIVE and SIMULATED values in one metric or silently substitute demo data when LIVE data is unavailable. Show provenance and connection state.

## 3. Phase summary and current status

| Phase | Name | Status |
|---|---|---|
| 1 | Project Foundation & 3D Office Visualization | COMPLETE |
| 2.1 | Worker Intelligence Foundation | COMPLETE |
| 2.2 | Global Task Dispatcher & Deterministic Simulation | COMPLETE |
| 2.3 | Browser QA, Visual Closure & Simulation UX Stabilization | COMPLETE WITH DEFERRED ITEM |
| 3.1 | Read-Only Observability API Gateway | COMPLETE |
| 3.2 | Secure BFF & Frontend Observability Integration | COMPLETE |
| 3.3 | Real-Time Observability (SSE) | COMPLETE |
| 4.1 | Real Worker Runtime Contract & Registry | COMPLETE |
| 4.2 | AI Provider Routing, Execution & Cost Guard | IMPLEMENTED; LIVE PROVIDER DISABLED |
| 4.3 | Persistent Backend Task Orchestration | COMPLETE |
| 4.4 | Frontend Live Runtime Adapter & Demo/Live Separation | COMPLETE |
| 5.1 | Human-Supervised Worker and Task Operations | COMPLETE |
| 5.2 | Review, Audit, Budgets & Governance | COMPLETE |
| 5 | Human-Supervised Operations Closeout | COMPLETE FOR IMPLEMENTATION AND APPLICABLE ACCEPTANCE |
| 6.1 | Personal Security & Reliability | COMPLETE — personal local scope |
| 6.2 | 3D Scene Scale & Performance Readiness | COMPLETE — layout tests 7/50/100; GPU profiling deferred |
| 6.3 | Local Packaging & Operations | COMPLETE — local runbook and diagnostics |
| 7.1 | Offline Worker Runtime Assurance | COMPLETE |
| 7.2 | One-Worker Local MOCK Pilot | COMPLETE — foreground process and restart/stale acceptance recorded |
| 7.3 | Single-Worker LIVE Provider Canary | COMPLETE — exactly one owner-authorized synthetic Haiku request; authorization consumed |
| 7.4 | Limited General-Purpose Worker Rollout | LOCAL IMPLEMENTATION + SECURITY ACCEPTANCE + RESTORED-BACKUP FORWARD/ROLLBACK/FORWARD REHEARSAL PASS; hosted managed-equivalent staging SKIPPED BY OWNER; production cutover and further LIVE rollout BLOCKED |
| FINAL | SIREADER Virtual Office v1.0 | NOT RELEASED |

Status labels are evidence-based. Phases 1–7.3 are complete within their recorded scope. Phase 7.4 local worker-command implementation, Python/SQL policy parity and isolated PG17.11 staging security acceptance are complete; this does not approve production DDL or further paid provider execution.
---

## 4. Phase definitions and acceptance gates

## Phase 1 — Project Foundation & 3D Office Visualization
**Status: COMPLETE (as recorded in the existing project state).**

Scope:
- React/Vite/TypeScript application foundation.
- Three.js/R3F office scene and isometric/orthographic camera.
- Office building, rooms, workstations, UI layout, worker registry, and initial seven-worker roster.
- Separation between scene rendering, domain data, UI, and local simulation services.

Exit gate:
- Existing app boots and production build passes.
- Office scene and core controls are present.
- Architecture remains data-driven and extensible.
- No real backend/provider integration is implied.

## Phase 2.1 — Worker Intelligence Foundation
**Status: COMPLETE (per current project state).**

Scope:
- Stable worker identities and capability registry.
- Worker eligibility and multi-task concurrency invariants.
- Deterministic task-stage progression and worker-state transitions.

Exit gate:
- Worker matching and state transitions are covered by automated tests.
- Worker identity and animation state are independent of model rendering.

## Phase 2.2 — Global Task Dispatcher & Deterministic Simulation
**Status: COMPLETE (per current project state).**

Scope:
- Global unassigned task queue.
- Deterministic priority ordering and capability-aware worker selection.
- Atomic dispatch pass, concurrency/load handling, diagnostics, and blocked reasons.
- Runtime, store, queue panel, TopBar metrics, and activity integration.
- Demo generator migration to the global queue.

Recorded evidence in the current project state:
- 256 automated tests passing across 13 test files.
- TypeScript typecheck and production build reported clean.
- Browser QA is partial; remaining manual checks are explicitly carried into Phase 2.3.

Important rules:
- `src/scheduler/` remains the canonical owner of priority, matching, selection, dispatch, and blocked reasons.
- `DEMO_MAX_QUEUE_CAP` limits automatic demo generation only; it is not global scheduler capacity.
- Dependencies remain metadata until a future phase explicitly implements dependency evaluation.
- No real AI provider, backend worker, persistence, or external execution is connected in this phase.

## Phase 2.3 — Browser QA, Visual Closure & Simulation UX Stabilization
**Status: COMPLETE WITH DEFERRED ITEM — acceptance audit completed 2026-11-08.**

Goal: close the visual and interaction gaps that the current project state lists as unverified, without reopening or rewriting the completed scheduler.

Required checks and fixes:
1. Verify the complete isometric scene visually in the target browser and record viewport/device context.
2. Verify camera pan/zoom/rotate (where supported) and reset-camera behavior.
3. Manually verify worker/avatar selection and worker detail panel.
4. Verify Assign Task/manual global enqueue form submission, validation, and feedback.
5. Verify Pause, Resume, simulation controls, and 1x/2x/4x speed behavior.
6. Verify FAILED activity card rendering and activity ordering.
7. Verify all seven initial workers and status-to-animation mappings.
8. Verify empty, loading, error, reduced-motion, and lower-graphics behavior where implemented.
9. Record any avatar asset that is still a placeholder honestly; confirm source/license/attribution for every third-party final asset.

Constraints:
- Frontend simulation only. Do not call Python API, Supabase, Telegram, MT5, or AI providers in this phase.
- Do not change the scheduler policy unless a reproducible defect is found and covered by a focused test.
- Do not replace the project or redesign the architecture.

Exit gate:
- All currently listed unverified browser interactions are manually tested or explicitly recorded as deferred with reason.
- Reproducible defects are fixed with regression coverage.
- Typecheck, all relevant automated tests, production build, and `git diff --check` pass.
- Update `docs/PROJECT_STATE.md` with evidence, screenshots if useful, and the next phase.

## Phase 3.1 — Read-Only Observability API Gateway
**Status: COMPLETE in `awandhani22-boop/SIREADER-Python-Backend` (2026-11-08).**

Scope delivered in the separate Python backend:
- Supabase public-schema lockdown and RLS enabled for 15 public tables.
- Dedicated non-admin read-only API login `sireader_api_ro`.
- Six allowlisted observability views with restricted view owner access.
- Five authenticated GET routes for system status, telemetry usage, active pipeline, active market watches, and audit decisions.
- Fail-closed startup privilege/role/view checks and local loopback binding.

Recorded local acceptance evidence (2026-11-08):
- API startup succeeded against the connected Supabase project.
- Five GET endpoints returned HTTP 200.
- No-token request returned 401.
- POST, PUT, PATCH, DELETE returned 405.
- 74 API tests and 50 core regression tests passed locally; API package compilation passed.
- Backend GitHub Actions run 42397323807 completed successfully.

Reference:
- Backend repository: https://github.com/awandhani22-boop/SIREADER-Python-Backend
- Backend runbook: `docs/PHASE_3_1_API_GATEWAY_RUNBOOK.md`
- Backend contract: `PHASE_3_1_API_CONTRACT.md`

Boundary:
- Phase 3.1 is an observability API, not a real-worker command API.
- It does not authorize frontend token exposure or browser-to-database access.
- It does not enable AI inference or trading execution.

## Phase 3.2 — Secure BFF & Frontend Observability Integration
**Status: COMPLETE — owner acceptance confirmed 2026-11-09.** Implementation Batches 1–6 are present on the Phase 3.2 implementation branch and CI-passed. Batch 5 CI run `42486162630` passed 353/353 tests, TypeScript check and production build. Batch 6 CI run `42486731963` passed 358/358 tests, TypeScript check and production build. The owner subsequently confirmed local backend/BFF startup, authenticated API smoke checks, Chrome operator login and cookie behavior, LIVE observability, SIMULATION/LIVE isolation, logout/session behavior, and production-like launcher checks. These manual results are owner-reported; no sanitized terminal transcript was attached.

### Execution batches and gates
1. **Batch 1 — BFF Foundation & Security Guards:** COMPLETE IN CODE; pushed and source-audited. Includes canonical route allowlist, fixed loopback config, strict Host/Fetch-Metadata/Origin/raw-path/method guards, scoped auth parser, safe errors/logger, and mode-specific dev/prod ports. Batch 1 was included in the later full CI run.
2. **Batch 2 — Fixed Upstream Proxy:** COMPLETE IN CODE AND CI. Server-only bearer injection; five fixed GET mappings; no arbitrary URL/path forwarding; outbound headers constructed from scratch; 5-second timeout; redirect rejection; streamed 1 MiB cap; safe error mapping; exact DTO validation against Python API Pydantic schemas. Mock HTTP tests only; no live Supabase/API calls. Latest fix: `428a051fe18d48a64267b1dbe41b4cc42d8d76de`. GitHub Actions run `42482847460`: 323/323 tests, typecheck, and production build all passed.
3. **Batch 3 — Operator Authentication & Session Lifecycle:** COMPLETE IN CODE AND CI. scrypt password verification; single-operator login; server-memory sessions; cryptographically random session and CSRF tokens; session rotation; idle 1-hour and absolute 8-hour expiry; pre-scrypt bounded login-attempt reservation; constant-time CSRF validation; HttpOnly Secure SameSite=Strict host cookie; logout revocation; startup/restart invalidation. Password hash helper uses a masked interactive terminal prompt. GitHub Actions run `42483616073` on `8dfa504`: 331/331 tests, typecheck, and production build passed. Owner later confirmed the local password hash was configured and valid and that Chrome cookie/session checks passed; secret values remain local and undisclosed.
4. **Batch 4 — Frontend API Contracts & Runtime State:** COMPLETE IN CODE AND CI. Added strict typed/runtime-validated DTOs for all five endpoints, fixed same-origin BFF client, in-memory CSRF closure, session/login/logout controller, 5-second browser request timeout, explicit transport/auth/schema classifications, and independent LIVE Zustand store/provenance. Simulation store remains untouched. GitHub Actions run `42485169977` passed 343/343 tests, TypeScript check and production build.
5. **Batch 5 — Polling & Observability Presentation:** COMPLETE IN CODE AND CI. System/pipeline/market polling every 10 seconds; usage/audit every 30 seconds; 5-second request timeout; STALE after 3 intervals; OFFLINE after 2 transport failures; bounded jittered backoff capped at 60 seconds; retain last-known LIVE values while marking stale/offline; clear private data on SESSION_REQUIRED; no overlap and late-response/logout guards. LIVE dock is integrated into TopBar without replacing the 3D office. GitHub Actions run `42486162630`: 353/353 tests, TypeScript check and production build passed.
6. **Batch 6 — Vite/Production Serving & E2E Code Harness:** COMPLETE IN CODE AND CI; owner-local acceptance still pending. Vite binds `127.0.0.1:3000` with strict port and regex-bounded `/api` proxy to BFF `127.0.0.1:3001`, `changeOrigin: false`; production Express binds `127.0.0.1:3000`, serves the existing `dist/`, handles SPA HTML navigation and reserves `/api` for JSON routes; cross-platform dual-process development launcher; dotenv loads before BFF config; static missing-dist startup fails closed; no LAN bind or fallback ports. Automated static/proxy configuration tests. GitHub Actions run `42486731963`: 358/358 tests, TypeScript check and production build passed. Owner later confirmed development and production-like local startup, Python API connectivity, Chrome cookie/session checks, and LIVE dashboard operation. Treat these as owner-reported manual acceptance.

Batch acceptance is sequential. Phase 3.2 owner acceptance is now recorded based on the owner's direct confirmation. The remote record distinguishes GitHub CI evidence from local owner-reported checks. Production-like local test details were not supplied as a sanitized transcript and should be repeated for a formal release audit.

**Status: COMPLETE — OWNER ACCEPTANCE PASSED (2026-11-09).** Phase 3.3 may now proceed to architecture and event-contract design. No Phase 3.3 implementation is implied by this status.

Goal: connect the existing Three.js frontend to the five Phase 3.1 GET endpoints without exposing the API Bearer Token.

Design requirements:
- Browser requests a same-origin, allowlisted BFF endpoint.
- BFF stores and supplies the SIREADER API Bearer Token server-side only.
- Browser bundle, React state, localStorage/sessionStorage, URL, logs, and `VITE_*` variables must never contain the token or database URL.
- BFF must use a fixed route allowlist mapped to the five approved GET paths; no arbitrary URL/path proxying.
- BFF accepts read-only GET requests only, applies timeouts, bounded response sizes, safe error mapping, and no secret/header logging.
- BFF and API Gateway remain bound to loopback for the local single-user deployment. Do not expose port 8000 publicly.
- Use runtime payload validation and typed response contracts; fail visibly on schema mismatch.
- Separate transport/API adapter from React components, Zustand state, and 3D rendering.
- Add explicit connection state: CONNECTING, LIVE, STALE, OFFLINE, ERROR.
- Mark every backend-sourced datum LIVE; simulation data remains SIMULATED. Never silently fall back from LIVE to SIMULATED.

Initial mapping:
- `GET /api/v1/system/status` → system/runtime status panel.
- `GET /api/v1/telemetry/usage` → AI usage/token/cost telemetry.
- `GET /api/v1/pipeline/active` → active/in-flight task view (never infer an OS worker is BUSY solely from PROCESSING).
- `GET /api/v1/market-watches/active` → market watch panel.
- `GET /api/v1/audit/decisions` → read-only decision audit timeline.

Exit gate:
- The five backend routes are consumed through the BFF and displayed in the existing UI.
- Bearer token is absent from built frontend assets and browser network requests.
- Authentication failure, API offline, stale response, timeout, schema mismatch, and empty data states are tested.
- Simulation remains available as a clearly labelled separate demo mode.
- Frontend typecheck, tests, build, security checks, and manual browser acceptance pass.

## Phase 3.3 — Real-Time Observability (SSE)
**Status: COMPLETE — owner acceptance explicitly confirmed 2026-11-09.** The owner supplied a final acceptance report and subsequently confirmed that all remaining items were safe. The report records 374/374 automated tests, TypeScript/typecheck, production build, authenticated browser SSE, Offline→Online recovery, all five snapshot refreshes, LIVE/SIMULATED isolation, and clean service shutdown. It does not contain the six raw Chrome Performance Monitor samples specified in the runbook; the owner attestation is accepted for phase progression, while the exact numeric performance evidence remains a release-audit limitation. Do not fabricate sample values.

Design reference: [`docs/PHASE_3_3_SSE_ARCHITECTURE.md`](PHASE_3_3_SSE_ARCHITECTURE.md). Durable implementation ledger: [`docs/PHASE_3_3_SSE_EXECUTION_LOG.md`](PHASE_3_3_SSE_EXECUTION_LOG.md). Owner setup: [`docs/PHASE_3_3_SSE_SETUP.md`](PHASE_3_3_SSE_SETUP.md).

Current implementation includes a bounded Python EventHub and Psycopg LISTEN listener, six-table invalidation migration (including TRUNCATE notifications), authenticated Python SSE route, fixed authenticated BFF streaming proxy, and browser EventSource resource invalidation with the existing snapshot polling as fallback. Virtual Office initial CI run `42534082388` and follow-up BFF-disconnect/session-expiry runs `42572749792` and `42572901195` passed the full test suite, TypeScript, and production build. Backend heartbeat/migration integration CI run `42572336352` passed on commit `b8dac552decc0c25a9aca176d81cd6b387d6bc4a`; detailed evidence is in the execution log. Owner closeout was confirmed 2026-11-09. Preserve the above evidence qualification in later release audits.

The owner-reported Supabase connection uses the Session pooler on port 5432. Supabase distinguishes Session mode from Transaction mode (commonly port 6543); the listener requires session semantics for LISTEN. The implementation did not apply the live migration itself. During local owner acceptance, the SSE route returned 200; by code contract this requires the listener to have passed its database connection, LISTEN, and migration-inventory/security checks. The runtime `sireader_api_ro` role remains read-only. A manual `pg_notify` test reached the browser and triggered the system snapshot refresh. The backend CI provisions disposable PostgreSQL 16 and verifies migration idempotency, six row/six TRUNCATE trigger inventory, safe function properties, insert-to-resource mapping for all six source tables, rollback behavior, and an audit notification on `approval_decisions` TRUNCATE. A new backend CI test verifies idle `: ping` heartbeat-frame generation and subscriber cleanup. Additional Virtual Office CI verifies upstream abort/body cancellation and capacity release after browser disconnect, plus EventSource closure/private-data clearing when snapshot reconciliation detects SESSION_REQUIRED. A separate four-stream, five-minute owner process sample recorded very low CPU and nearly flat Working Set; numeric Chrome JS heap/browser performance and a formal resource budget remain outstanding.

Goal: replace frequent client polling with bounded, server-mediated event updates where they add meaningful value.

Requirements:
- Define and version an event contract before implementation.
- SSE must pass through the server-side BFF; never expose the Bearer Token to EventSource/browser code.
- Include heartbeat, event IDs/reconnect behavior, bounded buffering, backoff, stale detection, and graceful fallback to snapshot GET.
- Do not use WebSocket unless a documented requirement cannot be met by SSE.
- Do not drive React/Zustand or the 3D render loop at 60 FPS from backend events.
- Distinguish event delivery from authoritative persisted state; periodically reconcile with the snapshot endpoints.

Exit gate:
- Reconnect, duplicate/out-of-order event, network interruption, stale connection, and fallback behavior are tested.
- Snapshot and stream state reconcile correctly.
- Four simultaneous streams remain stable under sustained idle heartbeat; idle heartbeat-frame generation is covered by backend CI and process-level CPU/memory sampling has been recorded, while numeric Chrome JavaScript heap/browser scene performance and a formal resource budget still require measurement and acceptance.
- BFF upstream cancellation/capacity release and frontend session-expiry EventSource cleanup are covered by Virtual Office CI; the combined BFF restart/network-interruption browser scenario and post-SSE SIMULATED/LIVE interaction remain owner-manual acceptance items.
- Owner manual evidence and residual gates are recorded in `docs/PHASE_3_3_SSE_EXECUTION_LOG.md`.

## Phase 4.1 — Real Worker Runtime Contract & Registry
**Status: IMPLEMENTED; backend CI PASS (2026-11-09).**

Goal: define the backend source of truth for real workers, capabilities, task ownership, runtime state, and health.

Requirements:
- Versioned typed contract for Worker, Capability, Task, TaskAttempt, ActivityEvent, and RuntimeHealth.
- Stable IDs and explicit state machines, timestamps, ownership, and failure reasons.
- Distinguish configured worker, process heartbeat, model request, and task lifecycle; never infer one from another.
- Document capability matching and concurrency limits.
- Define idempotency, deduplication, correlation IDs, and backward-compatible schema changes.
- Keep contracts independent from 3D avatar asset and animation names.

Exit gate:
- Contract reviewed and tested independently of UI.
- Backend data source and ownership of each field are explicit.
- No secrets or provider-specific credentials in the contract.

## Phase 4.2 — AI Provider Routing, Execution & Cost Guard
**Status: IMPLEMENTED; backend CI PASS. Live provider remains disabled pending explicit budget and provider configuration approval.**

Goal: allow approved backend workers to perform real AI tasks through the existing server-side routing and cost-control layer.

Requirements:
- Provider/model credentials stay server-side.
- Route selection, fallback, timeout, retry, cancellation, rate limit, and error normalization are explicit.
- Estimate/reserve/finalize usage and cost with currency-aware accounting.
- Enforce daily soft/hard budget and per-task limits before provider calls.
- Record usage and failures for observability.
- Never use browser-side provider SDKs or keys.

Exit gate:
- Provider contract and budget policy approved.
- Unit/integration tests cover success, timeout, retry, partial failure, budget exhaustion, and duplicate request safety.
- A controlled dry-run/canary path passes before real workload is enabled.

## Phase 4.3 — Persistent Backend Task Orchestration
**Status: COMPLETE — disposable PostgreSQL CI PASS; owner chose not to apply a live Supabase migration during Phase 4.**

Goal: move real task queueing and dispatch authority to the Python backend.

Requirements:
- Persistent queue, atomic claim/lease, worker capability matching, concurrency control, retry/backoff, timeout, cancellation, dead-letter handling, and idempotency.
- Backend scheduler is the only authority for LIVE task assignment.
- Preserve the current frontend scheduler as the deterministic SIMULATED adapter; do not run two schedulers for the same LIVE task.
- Define task priority/fairness/aging policy explicitly before implementation.
- Provide task and attempt history for audit and recovery.

Exit gate:
- Concurrent dispatch and crash/restart recovery are tested.
- No duplicate execution under retry/reconnect.
- Budget checks are performed before AI provider invocation.
- Persistent task lifecycle is exposed through a versioned read contract.

## Phase 4.4 — Frontend Live Runtime Adapter & Demo/Live Separation
**Status: COMPLETE — frontend CI PASS (390/390 tests, typecheck, production build) and owner-run Windows/Chrome acceptance PASS (2026-11-09).**

Goal: visualize real worker/task data while preserving the existing 3D scene and an explicit offline/demo mode.

Requirements:
- Implement a typed `WorkerRepository`/runtime adapter for backend data.
- Keep UI and 3D components independent from transport details.
- Map backend runtime states to visual/animation states through an explicit tested mapper.
- Show LIVE/SIMULATED provenance beside relevant panels and metrics.
- On disconnect, display OFFLINE/STALE; never fabricate LIVE activity.
- Preserve deterministic demo reset and repeatability.
- Support 7 workers first, then validate growth toward 50–100.

Exit gate:
- Switching DEMO/LIVE is explicit and cannot mix data.
- Real worker states remain consistent across scene, panel, queue, and activity feed.
- Reconnect and missing-worker behavior are tested.

## Phase 5.1 — Human-Supervised Worker and Task Operations
**Status: IMPLEMENTATION + AUTOMATED CI PASS — OWNER LOCAL ACCEPTANCE PENDING.**

Goal: provide authenticated, narrowly scoped operations for generic non-trading workforce tasks.

Implemented command surface:
- Enqueue a bounded task from an explicit non-trading task/capability/worker allowlist.
- Pause/resume scheduling intake for Supervisor, Haiku, Sonnet, Opus, and Data Archivist. This does not stop the process or interrupt in-flight work.
- Cancel an eligible task safely. If provider reservation may already have occurred, the task becomes WAITING_REVIEW and the attempt becomes UNKNOWN.
- Retry only a known pre-provider FAILED task with an intact payload. Retry creates a new task and preserves the original failure record.

Security boundary:
- Dedicated command API on 127.0.0.1:8010, separate bearer token and dedicated PostgreSQL role sireader_workforce_cmd; existing read-only observability API on 127.0.0.1:8000 remains unchanged.
- PostgreSQL grants and RLS restrict the command role to the five general-purpose workers and explicit non-trading capabilities/task types. Trading-adjacent workforce rows are invisible and not writable through direct SQL.
- BFF command paths are fixed and require the existing operator session, CSRF token, exact same-origin Origin, JSON content type, bounded body, and separate server-only command token.
- Commands are idempotent and append an immutable audit entry. An ambiguous browser timeout retains the same idempotency key for a safe retry.
- LIVE-only controls exist in the Workforce panel; DEMO mode does not call the command API.

Automated evidence (2026-11-09):
- Backend commit de1d16be631418fe17d61524d1b63e479374f1fb; CI run 42604536800 PASS: 144 API/command/PostgreSQL tests, compile check, 75 core regression tests.
- Frontend commit 884eabfcee884ae31e9d0dd06d8b9f79663441fd; CI run 42604707497 PASS: 398 tests, TypeScript check, production build.
- Owner local setup and Windows/Chrome acceptance are still required. No production migration, paid provider call, or trading operation is included in this PASS.

Exit gate (still open):
- Owner provisions the dedicated role/token and migration on a disposable local DB, starts the extra loopback command process, and validates authenticated LIVE controls in Chrome/Antigravity.
- Owner records that DEMO remains local-only, no credentials are exposed in browser storage/bundle, the command audit appears, and logout clears private LIVE state.
- Do not begin Phase 5.2 until this owner acceptance is recorded.

## Phase 5.2 — Review, Audit, Budgets & Governance
**Status: PLANNED — BLOCKED until Phase 5.1 owner local acceptance passes.**

Goal: make real worker operation understandable, bounded, and reviewable.

Requirements:
- Human review states for work outputs where required.
- Immutable or append-only audit events with actor, time, action, outcome, and correlation ID.
- Cost/token budget dashboards and alerts sourced from backend records.
- Policy for model escalation, provider fallback, sensitive task rejection, and manual intervention.
- Clear separation between approval of AI work output and existing trading signal approval.

Exit gate:
- Audit trace can reconstruct a task from enqueue to final outcome.
- Budget limit tests prevent disallowed provider calls.
- Human review and escalation paths are covered by tests.

## Phase 6.1 — Personal Security & Reliability
**Status: COMPLETE — personal local single-user scope (2026-11-10).**

Scope note: this app keeps loopback-only access, operator login/CSRF, server-side service tokens, narrow DB permissions, validation, safe logs, fail-closed states, dependency review and synthetic recovery tests. Strict CSP, public/LAN hosting, multi-user identity, enterprise monitoring and automated off-device backups are explicitly deferred. See [PHASE_6_1_SECURITY_RELIABILITY_PLAN.md](PHASE_6_1_SECURITY_RELIABILITY_PLAN.md).

Requirements:
- Threat model and least-privilege review across browser, BFF, API Gateway, backend, database, and provider boundaries.
- Secret rotation and safe configuration handling.
- Dependency and vulnerability review.
- Input validation, output filtering, safe logging, rate limiting, and bounded resource usage.
- Backup/restore and incident recovery procedures.
- Verify private-network/loopback deployment assumptions; do not expose local API ports directly.

Exit gate:
- Security review has no unresolved critical/high issue.
- Recovery and credential-rotation procedures are exercised.
- Failure modes do not silently switch to unsafe behavior.

## Phase 6.2 — 3D Scene Scale & Performance Readiness

Scope note: LIVE scene rendering now follows the validated backend roster. Automated tests cover 7/50/100-worker layouts, with a 175-worker single-floor cap and automatic DPR-1/no-shadow fallback above 25 LIVE avatars. The current procedural avatar remains in use; final GLB assets and actual 100-avatar Chrome FPS/heap profiling are deferred until there is a real need. See PHASE_6_CLOSEOUT.md.
**Status: COMPLETE — local personal-use scope (2026-11-10).**

Requirements:
- Audit GLB/glTF asset source, license, attribution, loading, animation clips, and fallback.
- Profile actual target hardware/browser before optimization.
- Test 7-worker baseline and a representative 50-worker scene; exercise 100-worker data model if supported.
- Measure frame time, memory, load time, and interaction responsiveness.
- Optimize instancing, shadows, LOD, textures, animation update cost, and asset disposal based on measurements.
- Provide lower-graphics and reduced-motion modes.

Exit gate:
- No critical console/runtime errors.
- Target-device performance budgets are recorded and met.
- Asset licenses and credits are complete.
- Worker scale does not duplicate scene JSX or cause uncontrolled rerenders.

## Phase 6.3 — Local Packaging & Operations

Scope note: LOCAL_INSTALL_AND_OPERATIONS.md documents setup, start/stop, production-like local launch, backup/restore, update and rollback. scripts/check-local.ps1 was executed successfully for all five local services. A signed installer, container/public deployment, remote access and multi-user support are outside the personal-use scope.
**Status: COMPLETE — local personal-use scope (2026-11-10).**

Requirements:
- Choose and document the supported deployment topology (local single-user first; remote/multi-user only with a separate security design).
- Provide reproducible install, configuration, startup, shutdown, update, backup, and rollback instructions.
- Provide health checks and user-facing diagnostics.
- Run full frontend and backend regression suites against disposable test infrastructure, not production.
- Verify browser compatibility, accessibility, security boundaries, and clean install from documented steps.
- Create a versioned release note and record known limitations.

Exit gate:
- A clean environment can install and start the app from the runbook.
- All required automated and manual acceptance checks pass.
- No unresolved critical/high release blocker remains.
- `docs/PROJECT_STATE.md` records the release commit and evidence.

## Phase 7 — Controlled Worker Runtime Activation
**Current status (2026-11-11): 7.1–7.3 COMPLETE; 7.4 local worker-command implementation and PG17.11 staging security acceptance PASS; production rollout BLOCKED.**

Phase 7 validates the Python worker process and its controlled provider/database boundary, not more UI. Detailed gates and safety rules are in `docs/PHASE_7_WORKER_RUNTIME_PLAN.md`.

- **7.1 Offline Worker Runtime Assurance — COMPLETE:** isolated provider/policy/runtime fail-closed tests pass.
- **7.2 One-Worker Local MOCK Pilot — COMPLETE:** foreground process, heartbeat, synthetic task, audit/review quarantine, stop/restart and stale-heartbeat evidence accepted on a disposable PG16.6 cluster.
- **7.3 Single-Worker LIVE Provider Canary — COMPLETE (single use):** exactly one owner-authorized synthetic Haiku 5.5 request succeeded; price-table Cost Guard estimate USD 0.000042, not an independently reported provider invoice. That authorization is consumed.
- **7.4 Limited General-Purpose Rollout — STAGING TECHNICAL ACCEPTANCE PASS; PRODUCTION BLOCKED:** worker command boundary, Python adapter, security remediations and Python/PostgreSQL policy parity passed isolated PG17.11 staging. Production-specific migration/rollback, production worker/maintenance/command/review roles, managed-platform staging, backup/recovery, API target reconciliation and fresh authorization for further LIVE execution remain open. Decision Engineer and Market Monitor remain excluded from provider execution.

Exit gate for local staged implementation is met. The production rollout gate is not met: do not deploy DDL, create credentials, activate LIVE workers or make another paid request without the separately reviewed deployment package and explicit owner approval.

## FINAL — SIREADER Virtual Office v1.0
**Status: NOT RELEASED.**

The product is v1.0 only when:
1. Existing 3D office and interactions are visually and functionally accepted.
2. Seven initial workers are supported; architecture is validated for 50–100.
3. Secure LIVE observability works through the BFF; SSE works if Phase 3.3 is retained in the release scope.
4. Real worker runtime and persistent task orchestration work with backend source-of-truth semantics.
5. AI provider execution is server-side, budget-controlled, and auditable.
6. Human-supervised task controls and governance are secure and tested.
7. DEMO mode is deterministic and separate from LIVE mode.
8. Installation, configuration, recovery, security, performance, and release documentation are complete.
9. No trading order execution or trading approval bypass is introduced by the Virtual Office.

A phase or release may be deferred only by recording the scope change and its reason here and in `docs/PROJECT_STATE.md`. Do not silently skip gates.

---

## 5. Execution order — no phase jumping

The approved order is:

1. **Phase 2.3** — finish existing frontend browser/visual QA. Do not rebuild the app.
2. **Phase 3.2** — integrate the existing five read-only endpoints through a server-side BFF.
3. **Phase 3.3** — add SSE only after snapshot integration is stable.
4. **Phase 4.1 → 4.2 → 4.3 → 4.4** — define and implement the real worker runtime, provider execution, backend orchestration, then frontend live adapter.
5. **Phase 5.1 → 5.2** — add safe human-supervised worker/task operations and governance.
6. **Phase 6.1 → 6.2 → 6.3** — harden security, 3D scale baseline, and local operations.
7. **Phase 7.1 → 7.2** — verify worker runtime offline, then run one worker in local MOCK mode on a disposable database.



8. **Phase 7.3 → 7.4** — only after explicit owner approval, run a capped LIVE provider canary and consider gradual rollout.
9. **FINAL v1.0** — release only after all applicable acceptance gates pass or the owner explicitly revises scope.

## 6. Project governance

- This document is the master scope/phase reference. `docs/PROJECT_STATE.md` is the concise live status record.
- Before starting a task, state its phase, goal, relevant files, constraints, and acceptance criteria.
- Work only in the existing SIREADER Virtual Office project for frontend tasks. Backend changes belong in `SIREADER-Python-Backend`.
- Never copy backend credentials or `.env` files into the frontend repo, prompts, assets, or screenshots.
- Do not create a second frontend or a replacement repository for the same product.
- Do not start a later phase while a prior phase's exit gate remains open, unless the dependency is explicitly independent and the exception is recorded.
- Use Sonnet for architecture planning/review and Argon for implementation when those models are available; model choice never overrides the acceptance gates.
- After each milestone, update `docs/PROJECT_STATE.md` and this roadmap only when the approved scope/status changes.
- Commit/push a milestone only after tests and diff review; include evidence, not claims.


## Latest verified execution — 2026-11-10

**Current position:** Phase 5.2.5 — Operations Finalization & Governance. Phase 5.2.1–5.2.5 implementation is present. **Final Phase 5 owner/browser acceptance remains OPEN; Phase 6 has not started.** This dated record supersedes the older status table at the beginning of this document where it conflicts.

Local PostgreSQL 16.6 was recovered and reused (no reinstall). The Phase 5 backend database URLs now point to the existing local `sireader_disposable` database. The local-only review security migration `2026_11_10_workforce_review_command_security_v1.sql` is applied there. Python API, command API, Vite and BFF are running on their established loopback ports 8000, 8010, 3000 and 3001.

A LIVE-contract mismatch was fixed: hardened Phase 5 task/activity fields (`related_task_id`, `event_seq`, `actor_type`, `actor_id`) are now accepted by both BFF and browser DTO validators. All nine BFF read routes passed real local-database smoke checks; task timeline and Review Inbox pending-list proxies also returned schema-valid responses. Frontend verification: 415 tests, TypeScript and production build pass. Backend regression: 172 passed, 42 skipped; local PostgreSQL integration remains unverified because `SIREADER_TEST_POSTGRES_URL` is unset.

**Remaining gates:** owner must sign in again after the in-memory BFF session reset, switch to LIVE and inspect the global status/Review Inbox; actual review adjudication requires an existing pending review (current pending count is zero); PostgreSQL integration tests should run only against a newly isolated scratch database; frontend bundle splitting is a non-blocking performance item; maintenance scheduling requires separate owner authorization after acceptance. No Supabase LIVE mutation, worker/provider execution, Telegram listener, trading execution, maintenance purge or Task Scheduler registration has been performed.


### Retry audit RLS follow-up — 2026-11-10

The follow-up migration `2026_11_10_workforce_review_command_security_v2.sql` adds the `TASK_RETRIED` activity event to the command-role allowlist. It requires both the original and new task IDs to be visible through the non-trading task RLS policy. Applied only to local `sireader_disposable`; a direct insert as `sireader_workforce_cmd` passed inside a transaction that was rolled back. CI PostgreSQL integration coverage was extended to apply v2 and test the retry event. Latest local backend suite: 172 passed, 43 skipped (PostgreSQL integration skipped because `SIREADER_TEST_POSTGRES_URL` is unset).


### Review adjudication transaction verification — 2026-11-10

The command-role database path now passes a transactional APPROVE and EDIT probe on local `sireader_disposable`: original output release, adjusted-output sanitization/release and human-review audit event inserts all succeeded under `sireader_workforce_cmd`. The initial blocker was `SELECT ... FOR UPDATE` on PENDING review payloads being filtered by the UPDATE policy. Migration `2026_11_10_workforce_review_command_security_v3.sql` now permits locking PENDING/EDITED payload rows while keeping `WITH CHECK` EDITED-only and preserving write-once triggers. Activity ORM mapping disables implicit RETURNING so the command role does not need SELECT on the append-only activity ledger. Synthetic records/events were rolled back. Local backend suite: 172 passed, 44 skipped; PostgreSQL integration remains gated on disposable CI URL.


### Final review-boundary verification — 2026-11-10

Local review-security migrations v1/v2/v3 are applied only to `sireader_disposable`. Transactional database verification as `sireader_workforce_cmd` passed APPROVE, EDIT, sanitization, result release and both audit-event inserts; synthetic rows/events were rolled back. Migration v3 permits PENDING payload row locks while keeping updates EDITED-only. Activity ORM insert no longer uses implicit RETURNING, preserving INSERT-only access to the immutable ledger. Backend tests: 172 passed, 44 skipped (PostgreSQL integration requires the disposable CI URL). The final owner browser acceptance gate remains open.


## Latest verified execution — 2026-11-10 (Phase 6 closeout)

**Current position: Phase 6.1, 6.2 and 6.3 COMPLETE for the personal local single-user scope.** This scope adjustment intentionally defers enterprise/public-hosting requirements; the detailed evidence and limitations are in PHASE_6_CLOSEOUT.md.

- Phase 6.1: local security baseline, BFF review-detail allowlist fix, standard security headers, dependency audit, synthetic password/token rotation tests, synthetic PostgreSQL backup/restore rehearsal, and local recovery documentation are complete. Strict CSP and enterprise controls are deferred.
- Phase 6.2: LIVE scene now builds avatars and world badges from the validated backend roster. Seven authored worker positions are preserved; 50- and 100-worker deterministic layout tests pass; the single-floor layout cap is 175. Above 25 LIVE avatars, renderer DPR falls to 1 and shadows are disabled. Final GLB assets and actual 100-avatar Chrome FPS/heap measurement are deferred and explicitly recorded.
- Phase 6.3: local install/operations runbook and read-only local diagnostics script are complete. The diagnostic script passed for loopback ports 3000, 3001, 8000, 8010 and 5432; browser UI returned HTTP 200.
- Frontend: 422 tests, 421 passed, 0 failed, 1 skipped because the active BFF owns the fixed port 3001; TypeScript and production build passed.
- Backend: current local suite 185 passed / 44 skipped because no disposable PostgreSQL test URL was configured. Earlier Phase 5 full suite on a temporary PostgreSQL 16.6 cluster passed 229/229 with no skips.
- Build warning remains: primary JS chunk approximately 1.51 MB minified / 405 KB gzip. React act(...) test notices and a Three.js CommonJS deprecation notice are non-failing.
- Final Virtual Office v1.0 remains NOT RELEASED: real worker/provider activation and actual 100-avatar runtime performance acceptance are not claimed.
- All changes remain local; no GitHub push/merge. Existing untracked patch files are preserved. No Supabase LIVE, provider, Telegram, MT5/HFM or trading action was performed.

See PHASE_6_CLOSEOUT.md, PHASE_6_1_SECURITY_RELIABILITY_PLAN.md and LOCAL_INSTALL_AND_OPERATIONS.md for the accepted scope, commands and evidence.


## Withdrawn assistant-authored V1 scope note — 2026-11-11

This section was written by the assistant without owner approval and is withdrawn. It did not authorize a V1 scope revision or remove any locked release gate. Official Virtual Office v1.0 remains NOT RELEASED; use the latest phase audit update at the end of this roadmap.

Phase 7.2 MOCK pilot evidence is in `backend/docs/PHASE_7_AI_HARNESS.md`; current verification, exact test counts, runtime caveats and known limitations are in `../SIREADER_V1_CLOSEOUT_2026-11-11.md`. Phase 7.3 LIVE provider canary, limited live-worker rollout, Supabase LIVE migration/cutover, production Telegram, MT5/HFM and trading execution remain separate workstreams requiring their own explicit scope, credentials, budget and authorization. This withdrawn note does not redefine the release scope or authorize those operations.

No additional V1 phase is planned. Any request to add deployment/live capabilities must first define a separate V2 scope; do not silently extend the V1 finish line.


V2 security precondition: the independent OmniRoute Node.js listener must require API-key authentication and have intentional restricted network exposure. Verified 2026-11-11: `OMNIROUTE_SERVER_HOST=127.0.0.1`, `REQUIRE_API_KEY=true`, listener only on `127.0.0.1:20128`, anonymous `GET /v1/models` returns 401, and the SIREADER key returns 200. Windows Firewall reachability is still unverified. Keep AI/worker runtime disabled until the separate spending authorization is approved.


## Authoritative phase status correction — 2026-11-11

This section supersedes stale Phase 7.2 “NEXT” entries and the prior assistant-generated “V1 Local Safe MVP COMPLETE” appendix. That assistant-added status was not owner-authorized and is withdrawn. **The official locked roadmap result remains: SIREADER Virtual Office v1.0 — NOT RELEASED.**

The latest cross-repository audit is `../SIREADER_V1_CLOSEOUT_2026-11-11.md`. It distinguishes:
- Phase 7.2's completed one-cycle MOCK `run_worker_once` database acceptance from the still-unproven foreground OS process/API-visible heartbeat/stop-restart gate. That earlier status is superseded: Phase 7.2 is now COMPLETE based on the fresh PG16.6 process-level acceptance recorded below.
- Phase 3.3 is COMPLETE — the owner explicitly confirmed completion on 2026-11-11; the stale remaining-gate entry in the detailed execution log is superseded by its owner-confirmation addendum.
- Phase 5/6 local acceptance from deployment to Supabase LIVE or a production workforce.
- Phase 7.3 NOT AUTHORIZED and Phase 7.4 BLOCKED.

Do not skip these gates or relabel v1.0 as released without explicit owner-approved scope revision and evidence.


## Latest phase audit update — 2026-11-11

This is the latest evidence-based status override. **SIREADER Virtual Office v1.0 remains NOT RELEASED.** This update does not change product scope or authorize paid/production operations.

- Phase 7.2 is now **COMPLETE**. A fresh isolated PostgreSQL 16.6 database named sireader_test on loopback port 55441 was used. A real foreground Haiku MOCK process was observed READY through a temporary read-only API, completed one benign synthetic task with SIMULATED provenance, emitted a complete four-event task timeline, exposed a PENDING review while the task result remained quarantined, shut down via Ctrl+C to STOPPED, restarted under a new instance ID, stopped cleanly again, and returned STALE when a test-only heartbeat timestamp was moved two minutes into the past. The temporary API, cluster, keys/certificates and temp directory were removed. Main sireader_disposable and Supabase LIVE were not touched.
- The legacy local Human Review migration was corrected to create the two sireader_view_owner RLS SELECT policies required by its security-barrier view. The PostgreSQL privilege fixture now seeds a PENDING review, checks that the read-only API role sees it only through the view, and verifies direct reads of review tables/payload are denied. Focused PG16.6 privilege/review regression: **22 passed**.
- After the changes: backend offline tests/ suite **237 passed, 46 skipped, 0 failed**; compileall and pip check pass. Skips require a separate disposable PostgreSQL URL.
- Phase 3.3 is COMPLETE — owner confirmed 2026-11-11. The detailed SSE execution log now contains the owner's confirmation; older manual-gate wording is historical and superseded.
- Phase 7.3 remains **NOT AUTHORIZED**. Phase 7.4 remains BLOCKED. OmniRoute binding/authentication and network exposure must be reviewed before any live provider canary.
- Supabase workforce cutover/full platform restore, production Telegram, MT5/HFM and trading execution remain not applied/not authorized. Runtime switches stay fail-closed; DRY_RUN and manual approval remain enabled.

Detailed cross-repository record: ../SIREADER_V1_CLOSEOUT_2026-11-11.md. Do not label v1.0 released on the basis of local MOCK acceptance.


## Phase 7.3 preflight update and owner confirmation — 2026-11-11

- Phase 3.3 is COMPLETE — owner confirmed. The owner explicitly corrected the prior assistant audit in this conversation; stale wording that called it open/ambiguous is superseded. No 3.3 work remains.
- Phase 7.3 offline readiness is hardened with an independent hard daily USD cap (default zero/fail-closed), daily USD observability in API and dashboard, and regression tests.
- Backend tests/: 237 passed / 46 skipped; focused billing + telemetry API tests: 82 passed; frontend: 422 passed; TypeScript and production build passed.
- The LIVE canary itself remains NOT AUTHORIZED / NOT RUN. Runtime is still MOCK/disabled, per-task USD cap is zero and daily USD cap is zero by default. OmniRoute is now loopback-bound and requires API-key auth; unauthenticated `/v1/models` returned 401 and the SIREADER key returned 200. Firewall exposure remains unverified. Require explicit per-task/daily/monthly budget approval and a one-request authorization before making a paid request.
- Phase 7.4 remains BLOCKED pending successful canary and cost reconciliation. Production Supabase, Telegram, MT5/HFM and trading are not activated. Virtual Office v1.0 remains NOT RELEASED.


## Phase 7.3 status override — 2026-11-11

Phase 7.3 is **COMPLETE**: the owner-approved one-request Haiku 5.5 canary passed on a disposable SSL PostgreSQL 16.6 database. One synthetic QUICK_RESEARCH task completed in one Haiku attempt. OmniRoute independently logged one successful `POST /v1/messages` with 249 input / 33 output tokens. Cost Guard calculated USD 0.000042 actual and zero remaining reservation within the approved 1-cent task/daily caps and $5 monthly test-ledger ceiling. OmniRoute did not provide an independent provider_cost_usd value; the amount is price-based accounting, not an invoice assertion.

The global application/Supabase ledger was checked read-only before and after and was not mutated; it remains at zero actual/reserved and daily cap zero. Carry the one-off USD 0.000042 manually into future budget reconciliation. Persistent backend flags remain fail-closed. No production DB, Telegram, broker, trading or additional live provider action occurred.

Phase 7.4 remains **BLOCKED / not authorized**; a single canary is not permission to roll out more workers. Virtual Office v1.0 remains **NOT RELEASED**.


## Phase 7.4 offline guard implementation — 2026-11-11

The Phase 7.4 preparation work adds a single global PostgreSQL-backed LIVE provider slot for AI workers, not a worker activation. Transaction advisory locking and durable `PROVIDER_REQUESTED` / `UNKNOWN` attempt states prevent overlapping paid requests across processes; unresolved UNKNOWN outcomes remain quarantined until explicit reconciliation. The SECURITY DEFINER gate is owned by `sireader_view_owner`, guarded to database `sireader_test`, executable by the local worker runtime `postgres` login, and denied to the separate Command API role, API read-only role, and PUBLIC.

Offline tests: backend `tests/` 251 passed / 47 skipped; full root backend suite 628 passed / 47 skipped / 0 failed; worker/provider focus 81 passed; compileall and diff check passed. PostgreSQL gate integration/rollback/concurrency coverage has been added but remains OPEN pending an isolated PostgreSQL test cluster. No paid request or worker was activated. Phase 7.4 LIVE remains BLOCKED pending those tests and separate explicit owner approval; Virtual Office v1.0 remains NOT RELEASED. See [Phase 7.4 limited worker rollout plan](PHASE_7_4_LIMITED_WORKER_ROLLOUT_PLAN.md).


### Root regression interpreter update — 2026-11-11

Using the pre-existing `C:\SIREADER\.venv` (which already includes MetaTrader5) to run the full backend root suite on the unified backend completed **628 passed, 47 skipped, 0 failed**. No package was installed. The system interpreter still lacks MetaTrader5; PostgreSQL integration tests remain skipped because no disposable test URL/complete local server is available. Phase 7.4 LIVE remains BLOCKED.


## Latest status override — Phase 7.4 technical validation — 2026-11-11

This is the newest status entry and supersedes earlier statements that PostgreSQL integration tests were unrun or skipped.

- Phase 7.4 implementation and local PostgreSQL verification: **PASS**. A disposable EDB PostgreSQL 18.6 cluster and database `sireader_test` were used only on loopback port 55442; 24 migration/privilege/RLS/concurrency integration tests passed, including rollback/forward and the cross-worker one-slot race.
- Full backend root suite: **675 passed, 0 skipped, 0 failed**; backend compileall passed.
- Frontend: **422 passed, 0 failed**; TypeScript check passed; Vite production build passed. Non-blocking bundle-size/deprecation warnings remain documented in PROJECT_STATE.md.
- Temporary database, binaries, archive, and data directory were removed; port 55442 is closed. No database service was installed.
- Persisted runtime remains OFF/MOCK, live provider OFF, per-task/daily budget zero, trading DRY_RUN, auto-execution OFF. No additional paid request, live worker, Supabase LIVE migration, Telegram, MT5/HFM, or trading operation occurred.

**Gate distinction:** Phase 7.4 code/database technical verification is complete. The actual limited LIVE worker rollout is still **NOT AUTHORIZED** and cannot be inferred from the earlier one-request Haiku canary. It needs a new owner authorization with exact worker/model, request count, synthetic task, cost limits, and time window. Supabase production cutover remains separate. **Virtual Office v1.0 remains NOT RELEASED.**


## Latest operational readiness clarification — 2026-11-11

The latest read-only workstation check confirms the Phase 7.4 test work is complete, but it does not make the current worker database deployment-ready:

- The tested gate migration is deliberately restricted to `sireader_test`; it is not to be applied to the configured worker database.
- Sanitized backend configuration classifies `DATABASE_URL` as a remote/pooler target, database `postgres`, using a `postgres.<project-ref>`-style identity. The dedicated Command API URL instead targets loopback `sireader_disposable` with role `sireader_workforce_cmd`.
- All documented local service ports (3000/3001/8000/8010/5432) were absent. The read-only diagnostics script made no changes; no service was started because the app's current DB targets are split between remote and local.
- Production/staging migration and least-privilege worker-role design, isolated staging rehearsal, production deployment approval, and new budgeted LIVE-run approval remain outstanding. Do not weaken the `sireader_test` migration guard or reuse the previous one-request Haiku authorization.

**The next safe step is architecture/security review plus a staging migration plan—not launching a live worker.** Phase 7.4 local technical acceptance remains PASS; LIVE rollout remains blocked and Virtual Office v1.0 remains NOT RELEASED.


## Latest worker DB hardening and release-gate clarification — 2026-11-11

A dedicated worker database boundary is now enforced in source:

- Non-MOCK or live-provider-enabled workers require `WORKER_DATABASE_URL` and the `sireader_worker_runtime` database identity (direct or pooler-style). Remote worker connections require TLS.
- The worker runtime no longer imports the broad core `DATABASE_URL` session factory. It fails before heartbeat/claim/start when the dedicated URL/identity/TLS contract is not met.
- Only local MOCK with live-provider disabled may use the old session factory. The real backend `.env` remains unchanged and `WORKER_DATABASE_URL` is unset.

Verification after this source change: **690 passed, 1 skipped, 0 failed** on a fresh disposable PostgreSQL 16.6 `sireader_test` cluster; 27 focused DB-guard/runtime tests passed; compileall and diff check passed. Temporary cluster cleaned, port 55444 closed.

The current effective `SIREADER_API_DATABASE_URL` is also remote/pooler with the read-only role, not local as described in older workspace notes. Historical production snapshot docs record six existing views; the 14-view workforce schema was verified only in isolated PostgreSQL 17.11 staging. The API startup audit must remain fail-closed until the production migration is approved/applied; local UI services are down.

A dedicated worker DB identity is not yet provisioned. The ORM writer path still needs an explicit RLS/column-grant/trusted-result-release design, and worker polling still includes maintenance/reaper/purge functions that must be separated from ordinary worker authority. No production writer migration, role, Supabase DDL, API cutover, additional paid inference, or worker activation was performed.

**Phase 7.4 code/local technical verification: PASS. Production writer/maintenance design and staging rehearsal: OPEN. Limited LIVE rollout: NOT AUTHORIZED. v1.0: NOT RELEASED.**


## Final worker connection boundary update — 2026-11-11

The final source boundary now blocks worker fallback to the remote core database even when provider mode is MOCK. Legacy core session fallback is limited to MOCK/live-provider-OFF and explicitly loopback disposable/test DB names. A dedicated `WORKER_DATABASE_URL` uses only the `sireader_worker_runtime` role direct/pooler identity, explicit database, no fragments or libpq target-override query options, one approved TLS mode, and bounded connection/pool timeouts.

Final tests after all guard changes: **42 focused worker tests passed; 702 backend tests passed, 1 skipped, 0 failed** on disposable PostgreSQL 16.6. The test cluster was stopped and removed; port 55448 is closed. Compileall and diff check pass.

The real `.env` remains without `WORKER_DATABASE_URL`; no worker production role or SQL migration was deployed. Production maintenance separation, RLS/column grants, trusted result-release boundary, staging rehearsal, Supabase API cutover, and fresh live/budget authorization remain unapproved. **Phase 7.4 local technical verification PASS; LIVE rollout BLOCKED; v1.0 NOT RELEASED.**


## 2026-11-11 — worker maintenance separation update

- Removed lease recovery, deadline expiry, stale-review expiry, and task/review payload purging from the normal worker polling path.
- Ordinary worker runtime no longer imports those maintenance repository functions; a regression test enforces this boundary.
- Maintenance remains a separate one-shot command with its existing local-only database identity guard. A production maintenance identity and database-enforced bounded operations are still NOT designed/approved/deployed.
- Verification after this code change: focused runtime/review suite 60 passed, 17 skipped. The previous full PostgreSQL 16 run (702 passed, 1 skipped) predates this change; it is not claimed as a post-change full-suite result. No PostgreSQL server binaries/service were available for a fresh full DB-backed run during this update.
- Release remains BLOCKED: production worker role/migration, production maintenance role, database-enforced lease/transition/review release boundary, staging rehearsal, recovery approval and limited rollout remain open. No Supabase LIVE, paid AI, Telegram, MT5/HFM or trading actions performed.


## Post-separation verification update — 2026-11-11

After removing the obsolete runtime fixture dependency on `_last_maintenance_at`, the full backend test suite was rerun without a PostgreSQL test service configured: **657 passed, 47 skipped, 0 failed**. The skipped tests include database-backed PostgreSQL integration/migration/security checks because `SIREADER_TEST_POSTGRES_URL` was intentionally unset and no local PostgreSQL service/binaries were available. Python compileall and `git diff --check` both passed. This is not a substitute for the PG16/PG17 migration, ACL, RLS, concurrency, and rollback rehearsal.


## Static writer-security review deliverable — 2026-11-11

Added backend/docs/PRODUCTION_WORKER_WRITER_SECURITY_REVIEW_2026-11-11.md. It records the ORM operation inventory, least-privilege role separation, staging negative-test matrix, and critical findings: direct ORM writes are not yet a production writer contract; the current normal-result trigger alone does not bind publication to the prior task lease/attempt; review inserts need a transaction-scoped completion proof; a shared worker DB login cannot independently attest per-worker identity; and activity-event actor integrity needs DB enforcement. These are design blockers, not production changes. Do not provision the worker role or deploy writer SQL until these are remediated and staging-tested.


## Worker DB command contract — 2026-11-11

Added backend/docs/WORKER_DATABASE_COMMAND_CONTRACT_V1_2026-11-11.md. This is the target API/role/migration/acceptance contract for replacing direct ORM mutations with narrow database functions. It defines separate worker runtime, maintenance, command API, review operator, read-only API and NOLOGIN view-owner authorities, including transaction-scoped lease/attempt validation and result quarantine/release. It is design-only, not executable SQL. Independent security review is still required before migration authoring.

Staging tooling check: Docker, Podman, PostgreSQL server/client binaries (postgres, initdb, pg_ctl, psql), and Supabase CLI were not found on the workstation during this continuation. Therefore a PG17 staging environment and DB-backed ACL/RLS/concurrency/rollback rehearsal cannot be honestly claimed. Production stays untouched and LIVE remains blocked.


## Superseding PG17.11 read-model/API staging acceptance — 2026-11-11

A fresh user-space PostgreSQL 17.11 environment is now available at `C:\SIREADER-STAGING\pg17` (EDB archive SHA-256 verified; no Windows service or Administrator install). Core production backup schemas were restored to loopback-only staging, four read-model/security-barrier migrations applied, and the actual API read-only privilege audit passed: 14/14 approved views, ownership and security barriers; no API base-table or write privileges; 24/24 public base tables have RLS. Fourteen authenticated API endpoint probes returned 200, unauthenticated probe returned 401, and the explicit SelectorEventLoop SSE listener check passed.

Backend 657 passed / 47 skipped; PG17 privilege tests 23 passed; Virtual Office tests 422 passed; TypeScript, production build, compileall and diff checks passed. The build reports a non-blocking large JavaScript chunk warning.

Detailed evidence: `backend/docs/SIREADER_PG17_STAGING_REHEARSAL_2026-11-11.md`. This supersedes the prior note that a PG17 environment could not be created. It does not validate the proposed production worker writer, command/maintenance/review identities, ORM adapter conversion, or trusted lease-bound result release. No production change or LIVE action. **Production rollout remains BLOCKED; v1.0 NOT RELEASED.**

## Latest Phase 7.4 worker database command-layer update ? 2026-11-11

This dated status supersedes earlier Phase 7.4 notes that described only the provider-slot test or said the worker database command layer was not yet staged.

- Phase 7.1, 7.2 and 7.3 are COMPLETE. Phase 7.4 worker command code, runtime adapter and disposable PostgreSQL technical acceptance are COMPLETE.
- The worker command SQL was applied to isolated PostgreSQL 17.11 sireader_stage; SQL acceptance and Python adapter smoke tests passed, with synthetic writes rolled back. The earlier separate PostgreSQL 18.6 sireader_test global provider-slot concurrency/ACL suite remains valid.
- Backend final regression after credential-boundary hardening: 670 passed, 47 skipped; compileall passed. The skipped tests require a dedicated PostgreSQL test URL; separate staging integration evidence is recorded in backend acceptance documents. Virtual Office: 422 passed; TypeScript and production build passed.
- Worker Anthropic execution now requires the explicit Anthropic provider mode and dedicated ANTHROPIC_API_KEY; it cannot use the legacy OmniRoute AI_API_KEY as a fallback.
- Production database login/role provisioning, production-specific writer/maintenance/command/review migration and rollback, final independent security approval, Supabase API cutover and fresh limited-LIVE authorization remain OPEN/BLOCKED. The one-request Phase 7.3 authorization is already consumed.
- **Next task:** independent security review and production-target migration/role design; keep the existing test-only SQL guards intact. Do not start a LIVE worker or alter Supabase production as part of this task.
- Runtime flags remain OFF/MOCK, provider LIVE OFF, spending caps zero, trading DRY_RUN and auto-execution OFF. **SIREADER Virtual Office v1.0 remains NOT RELEASED.**


## Latest Phase 7.4 security closeout — 2026-11-11 (authoritative)

This is the latest phase status and supersedes the older historical Phase 7.2 NEXT / Phase 7.3 NOT AUTHORIZED / Phase 7.4 initial BLOCKED statements retained above as dated evidence.

- Phase 7.1, 7.2 and 7.3 are COMPLETE within their recorded scopes. Phase 7.3 was exactly one owner-authorized synthetic Haiku 5.5 request; the USD 0.000042 figure is price-table Cost Guard accounting, not an independently reported provider invoice. The single-use authorization is consumed.
- Phase 7.4 worker database command implementation and isolated PostgreSQL 17.11 staging acceptance are COMPLETE for the staged worker command boundary.
- Second-pass security remediations passed: trading-related provider reservation denial, explicit LIVE reservation/billing provenance, worker policy/model-tier validation, truncated LIVE output review quarantine, session_user-based maintenance retention identity and Python/PostgreSQL policy parity (40 rules, 56 capability/task pairs, 1,120 decisions).
- Acceptance: worker SQL transaction PASS/ROLLBACK; Python adapter integration PASS/ROLLBACK; adapter tests 7 passed; backend 670 passed / 47 skipped; frontend 422 passed; TypeScript and Vite production build passed. The 47 skipped backend tests remain dedicated-PostgreSQL-URL gated; separate PG17 staging integrations passed as recorded.
- Local effective ACL review: worker permission roles have zero direct workforce base-table grants; provider reservation EXECUTE is limited to Haiku/Sonnet/Opus; all nine workforce tables have RLS; private functions use the NOLOGIN function owner and fixed pg_catalog search_path; no PUBLIC EXECUTE was found.
- Production migration/rollback, production login/role/credential provisioning, bounded maintenance functions, Command API and review-operator functions, hosted-Supabase-equivalent staging, production backup/recovery, API database topology reconciliation and new explicit approval for any further LIVE request remain OPEN/BLOCKED.
- No production Supabase DDL, production credentials, additional paid inference, Telegram operation, MT5/HFM action or trading order was performed. Runtime stays OFF/MOCK, provider LIVE OFF, worker database URL unset, budgets zero and trading DRY_RUN.
- **SIREADER Virtual Office v1.0 remains NOT RELEASED.**

Detailed security findings: [Worker Database Security Review](https://github.com/awandhani22-boop/SIREADER-Python-Backend/blob/phase-5-implementation/docs/WORKER_DATABASE_SECURITY_REVIEW_CLOSEOUT_2026-11-11.md). Detailed SQL/adapter acceptance: [Worker Database Staging Acceptance](https://github.com/awandhani22-boop/SIREADER-Python-Backend/blob/phase-5-implementation/docs/WORKER_DATABASE_COMMAND_LAYER_STAGING_ACCEPTANCE_2026-11-11.md). Do not promote the staging SQL to production or treat this local acceptance as authorization to run a LIVE worker.
