# SIREADER Virtual Office — AI Developer Rules

## Role
Act as a senior frontend engineer, Three.js technical artist, interaction designer, and test engineer. Build a maintainable futuristic isometric 3D virtual office. Do not behave as a one-shot code generator.

## Canonical product mission — read before every task
- `docs/PRODUCT_VISION.md` is the canonical explanation of what SIREADER originally set out to build and what the final product must become. Read it before planning or implementing any task.
- `docs/ROADMAP.md` is the canonical phase order, scope, dependencies, and v1.0 acceptance plan.
- `docs/PROJECT_STATE.md` records the actual current phase, verified progress, and known limitations.
- Read those three files before code inspection. If conversation memory conflicts with repository evidence, inspect the current branch and resolve the discrepancy explicitly.

## Product objective
Build a real AI workforce platform, not a 3D office game or decorative dashboard. The existing Virtual Office is the human-facing 3D environment for observing and supervising specialized AI workers; the Python backend is the operational brain and source of truth. Initial roster: Supervisor, Haiku, Sonnet, Opus, Decision Engineer, Market Monitor, and Data Archivist. The architecture must be data-driven and support 50–100 workers later without duplicating scene code. A moving avatar is not proof of real work; LIVE worker activity requires authoritative backend task/runtime evidence. Keep DEMO/SIMULATED data strictly separate from LIVE data.

## Current execution scope (Phase 3.2 through Phase 4.4)
- The active phase and next work unit are defined only by `docs/PROJECT_STATE.md` and `docs/ROADMAP.md`; older Phase 1/2 scope statements in historical docs do not override them.
- Continue the existing React/Three.js Virtual Office. Never replace it, create a competing frontend, or restart accepted phases.
- Phase 3.3 owner acceptance was confirmed 2026-11-09. The active scope is Phase 4.1–4.4 in strict order: define versioned worker/runtime contracts and registry; implement server-side provider routing through the existing Cost Guard; implement persistent generic task orchestration; then integrate read-only LIVE runtime data into this existing frontend. Follow `docs/PHASE_4_EXECUTION_PLAN.md` and the master roadmap. Do not start a later phase while an earlier exit gate is open.
- Keep repositories separate: `awandhani22-boop/SIREADER` is the Virtual Office; `awandhani22-boop/SIREADER-Python-Backend` is the operational backend. Never treat a change in one repository as proof that the other changed.
- Python backend is the source of truth for LIVE worker/task/runtime/provider/usage/persistence state. Frontend simulation remains deterministic and SIMULATED. Never merge LIVE and SIMULATED state or present mock activity as live.
- BFF, Vite and Python API listeners must use only the approved loopback topologies in the execution ledger. Do not expose them on LAN/public interfaces or add permissive host/CORS/fallback behavior.
- Browser-facing API routes are fixed allowlist routes. Server-to-server bearer credentials remain server-only; never use `VITE_*`, browser storage, URL parameters, client logs, or response payloads for secrets.
- Treat backend data as untrusted: validate runtime DTOs, bound payloads, timeouts, and retries; fail visibly on schema or auth errors; never render backend strings as HTML.
- Keep trading safeguards in Python. Virtual Office must never place/close/modify MT5 orders, SL/TP, or bypass manual approval/Decision Engine boundaries.
- Do not read, request, print, or commit the contents of `.env`, tokens, passwords, database URLs, broker credentials, Telegram credentials, or AI-provider keys. Use safe presence-only diagnostics.
- No paid AI provider calls, production credentials, Supabase mutations, live API smoke tests, or external workload execution without explicit owner-side setup/approval. Use mock upstream servers for development tests.
- At the end of each coherent Phase 4 unit: update `docs/PROJECT_STATE.md`, `docs/ROADMAP.md` when status changes, and `docs/PHASE_4_EXECUTION_PLAN.md`; run relevant backend/frontend tests, typecheck, build, migration integration tests, and security checks; report exact evidence and gaps; commit/push only to `phase-4-implementation`. Never push to or merge into `main` without explicit authorization.
- Do not claim local tests, browser QA, live service checks, or CI passed unless actual evidence exists. GitHub source inspection is not execution evidence.
- Preserve untracked personal files and local-only artifacts. Never run destructive Git commands or `git add .`; stage explicit paths only.
- Use a compact plan and smallest coherent implementation. Do not skip security, data migrations, failure recovery, auditability, acceptance tests, or documentation for speed.

## Required visual direction
- Futuristic premium technology office.
- Isometric / orthographic default camera.
- Dark architectural palette with restrained cyan, blue, and violet accent lighting.
- Glass partitions, clear room identity, desks, monitors, meeting space, reception, and archive.
- The office must read as a coherent building, not a collection of floating cards.
- UI overlays must remain legible and must not obstruct the main scene unnecessarily.

## Technical baseline
- React 19 + TypeScript + Vite.
- Three.js + React Three Fiber v9 + compatible Drei stable release.
- R3F v9 pairs with React 19. Do not upgrade to R3F v10 alpha without explicit approval.
- Use reusable scene components and typed data models.
- Keep 3D scene, worker data, UI panels, interactions, and simulation logic in separate modules.

## Human character requirements
- Prefer rigged GLB/glTF avatars with reusable skeleton/animation clips.
- Do not represent final workers as boxes, spheres, or unrelated static images.
- If no licensed human model is available, use a clearly labeled temporary placeholder and document the asset requirement; do not pretend it is a finished human avatar.
- Worker identity and animation state must be independent of the rendered model.
- Do not assume animation clip names; inspect available clips and map them explicitly.

## Interaction requirements
- Clicking an avatar or workstation opens a worker detail panel.
- Detail panel shows worker name, role, department, model/provider placeholder, current task, status, last activity, simulated usage/cost, success/error counts.
- Provide Assign Task, Pause, Resume, and Activity History controls.
- Controls must actually change local state in Phase 1; no decorative/inert buttons.
- Worker states: IDLE, WAITING, TASK_RECEIVED, WALKING, WORKING, COMPLETED, ERROR, PAUSED.
- Animations must derive from worker state, not random unrelated motion.
- Provide camera pan, zoom, rotate if compatible with isometric usability, and reset-camera control.

## Architecture rules
- Use a normalized worker registry keyed by stable worker ID.
- Keep room/workstation positions in data/configuration, not hard-coded throughout components.
- Separate `OfficeScene`, `OfficeBuilding`, `Room`, `Workstation`, `WorkerAvatar`, `WorkerPanel`, `ActivityFeed`, and `WorkerControls` where appropriate.
- Avoid giant components and duplicated worker-specific JSX.
- Keep mock services behind a small interface so future backend adapters can replace them.
- No direct backend integration during Phase 1.

## Quality gates
After each meaningful change:
1. Inspect relevant files before editing.
2. State a short plan and list files to change.
3. Make the smallest coherent change.
4. Run TypeScript checks and production build.
5. Fix errors introduced by the change.
6. Report changed files, commands run, test/build results, known limitations, and next step.

Never claim a build/test passed unless it was actually executed successfully.

## Change safety
- Preserve existing working features.
- Do not delete project files or replace configuration wholesale without explaining why.
- Do not update major dependencies casually.
- Do not introduce paid services, telemetry, external API calls, or authentication without asking first.
- Before large refactors, create a backup or explain the exact rollback plan.

## Performance
- Use instancing for repeated furniture/props when it materially helps.
- Keep shadow casters and shadow map resolution limited.
- Avoid unnecessary React state updates inside the render loop.
- Use demand/invalidated rendering where suitable for mostly static scenes.
- Dispose textures, geometries, and materials when dynamically unloading assets.
- Provide a lower-quality mode for weaker GPUs.

## Accessibility and UX
- Provide keyboard-accessible HTML controls for actions; do not rely only on 3D raycasting.
- Maintain readable text contrast and predictable panel behavior.
- Respect reduced-motion preference where feasible.

## Future integration boundary
Future phases may add backend adapters through documented REST/WebSocket contracts. Phases 2.2 and 2.3 remain frontend-only and do not authorize backend or provider integration. Phase 3.2 integration may begin only after the Phase 2.3 exit gate in `docs/ROADMAP.md` is satisfied. Keep any later integration behind typed interfaces. Do not invent API endpoints or connect to the SIREADER backend until its contract is explicitly provided.
