# SIREADER Virtual Office — Master Roadmap to v1.0

**Document status:** ROADMAP LOCKED — source of truth for phase order, scope, and acceptance gates  
**Repository:** `awandhani22-boop/SIREADER`  
**Current development branch:** `phase-2-2-task-dispatcher`  
**Last roadmap review:** 2026-11-08

This document governs the SIREADER Virtual Office project from the existing 3D frontend through the final v1.0 release. Keep this roadmap and `docs/PROJECT_STATE.md` aligned after every milestone. Do not create a replacement frontend or restart completed phases.

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
| 2.3 | Browser QA, Visual Closure & Simulation UX Stabilization | NEXT |
| 3.1 | Read-Only Observability API Gateway | COMPLETE in Python backend repository |
| 3.2 | Secure BFF & Frontend Observability Integration | PLANNED |
| 3.3 | Real-Time Observability (SSE) | PLANNED |
| 4.1 | Real Worker Runtime Contract & Registry | PLANNED |
| 4.2 | AI Provider Routing, Execution & Cost Guard | PLANNED |
| 4.3 | Persistent Backend Task Orchestration | PLANNED |
| 4.4 | Frontend Live Runtime Adapter & Demo/Live Separation | PLANNED |
| 5.1 | Human-Supervised Worker and Task Operations | PLANNED |
| 5.2 | Review, Audit, Budgets & Governance | PLANNED |
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
**Status: NEXT — do this before frontend/backend integration.**

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
**Status: PLANNED — after Phase 2.3 sign-off.**

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
**Status: PLANNED — only after Phase 3.2 is stable.**

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
- No measurable scene performance regression.

## Phase 4.1 — Real Worker Runtime Contract & Registry
**Status: PLANNED.**

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
**Status: PLANNED — requires explicit budget and provider configuration approval.**

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
**Status: PLANNED.**

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
**Status: PLANNED.**

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
**Status: PLANNED.**

Goal: add authenticated, narrowly scoped operations for managing AI worker tasks.

Possible commands, subject to separate API contract and security review:
- Enqueue an approved non-trading work task.
- Pause/resume an eligible worker or task.
- Cancel a task safely.
- Request retry for a failed task when idempotency rules allow.

Requirements:
- Every command has authentication, authorization, validation, idempotency, rate limits, and audit history.
- UI shows pending, accepted, rejected, and completed command outcomes distinctly.
- Commands are unavailable in DEMO mode unless explicitly labelled as local simulation controls.
- Read-only observability credentials are never reused for command endpoints.

Explicit prohibition:
- No place/close/modify MT5 order, SL/TP, or bypass of the existing trading approval process.

Exit gate:
- Negative authorization and replay tests pass.
- Every command is traceable to an actor and task.
- Safe failure and cancellation behavior are verified.

## Phase 5.2 — Review, Audit, Budgets & Governance
**Status: PLANNED.**

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
