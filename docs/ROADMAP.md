## Current execution status — 2026-11-09

| Workstream | Status |
|---|---|
| Phase 3.3 — SSE observability | COMPLETE (owner confirmed) |
| Phase 4.1 — Worker contracts and registry | Implemented; backend CI PASS |
| Phase 4.2 — Provider and Cost Guard integration | Implemented; backend CI PASS; live provider disabled pending owner approval |
| Phase 4.3 — Durable task runtime | Implemented; disposable PostgreSQL migration/privilege/recovery, multi-process heartbeat, and bounded payload-retention CI PASS |
| Phase 4.4 — LIVE presentation and workforce operations | Implemented; frontend CI PASS; owner-run Windows/Chrome acceptance PASS |
| Phase 4 overall | COMPLETE — automated CI and owner-run browser acceptance PASS (2026-11-09) |
| Phase 5.1 — Human-supervised operations | COMPLETE — automated CI and owner-run browser acceptance PASS (2026-11-09) |
| Phase 5.2.1 — Lifecycle audit ledger & timeline API | COMPLETE — hardened ledger, append-only trigger, deterministic sequence, actor attribution, safe timeline API & BFF (2026-11-09) |
| Phase 5.2.2 — Human output review | ACTIVE — review inbox, approve/edit/reject, human decision audit |
| Phase 5.2.3 — Budget governance & Cost Guard visibility | PENDING 5.2.2 |
| Phase 5.2.4 — Policy & model tier escalation | PENDING 5.2.3 |
| Phase 5.2.5 — UI integration & acceptance | PENDING 5.2.4 |

Phase 5.1 source implementation and automated CI now pass on the isolated phase-5-implementation branches. The remaining exit gate is owner-side local database setup and Windows/Chrome acceptance; the work is not yet operator-ready for LIVE writes. No live database migration, paid provider request, trading order, or merge to `main` is implied.

See [PHASE_4_EXECUTION_LOG.md](./PHASE_4_EXECUTION_LOG.md).

---

# SIREADER Virtual Office — Master Roadmap to v1.0

**Document status:** ROADMAP LOCKED — source of truth for phase order, scope, and acceptance gates  
**Repository:** `awandhani22-boop/SIREADER`  
**Current implementation branch:** `phase-5-implementation` (isolated from `main`; matching branch exists in both SIREADER repositories). The accepted Phase 4 branch remains the baseline.  
**Last roadmap review:** 2026-11-09

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
| 1 | Project Foundation & 3D Office Visualization | COMPLETE per current project state |
| 2.1 | Worker Intelligence Foundation | COMPLETE |
| 2.2 | Global Task Dispatcher & Deterministic Simulation | COMPLETE |
| 2.3 | Browser QA, Visual Closure & Simulation UX Stabilization | COMPLETE WITH DEFERRED ITEM |
| 3.1 | Read-Only Observability API Gateway | COMPLETE in Python backend repository |
| 3.2 | Secure BFF & Frontend Observability Integration | COMPLETE — Batches 1–6 CI-passed; owner-reported local development, LIVE, auth/session, isolation, logout, and production-like acceptance confirmed 2026-11-09 |
| 3.3 | Real-Time Observability (SSE) | IMPLEMENTATION IN PROGRESS — core owner manual event-delivery, targeted refresh, backend-restart recovery, and four-stream five-minute smoke passed; supplementary gates remain open |
| 4.1 | Real Worker Runtime Contract & Registry | IMPLEMENTED — BACKEND CI PASS |
| 4.2 | AI Provider Routing, Execution & Cost Guard | IMPLEMENTED, LIVE DISABLED — BACKEND CI PASS |
| 4.3 | Persistent Backend Task Orchestration | IMPLEMENTED — DISPOSABLE POSTGRES CI PASS |
| 4.4 | Frontend Live Runtime Adapter & Demo/Live Separation | IMPLEMENTED IN CODE — FRONTEND CI PASS; OWNER BROWSER ACCEPTANCE PENDING |
| 5.1 | Human-Supervised Worker and Task Operations | COMPLETE |
| 5.2 | Review, Audit, Budgets & Governance | ACTIVE |
| 6.1 | Security, Reliability & Failure Recovery | PLANNED |
| 6.2 | 3D Asset, Performance & Scale Readiness | PLANNED |
| 6.3 | Packaging, Deployment & Release Acceptance | PLANNED |
| FINAL | SIREADER Virtual Office v1.0 | NOT RELEASED |

Status labels are evidence-based. A phase is not complete because its files exist; its acceptance criteria must pass and its result must be recorded in `docs/PROJECT_STATE.md`.

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

## Phase 6.1 — Security, Reliability & Failure Recovery
**Status: PLANNED.**

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

## Phase 6.2 — 3D Asset, Performance & Scale Readiness
**Status: PLANNED.**

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

## Phase 6.3 — Packaging, Deployment & Release Acceptance
**Status: PLANNED.**

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
6. **Phase 6.1 → 6.2 → 6.3** — harden security, assets, performance, packaging, and release.
7. **FINAL v1.0** — release only after all applicable acceptance gates pass.

Phase 3.1 is already complete in the separate Python backend repository and does not mean Phase 2.3 can be skipped.

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
