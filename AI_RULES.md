# SIREADER Virtual Office — AI Developer Rules

## Role
Act as a senior frontend engineer, Three.js technical artist, interaction designer, and test engineer. Build a maintainable futuristic isometric 3D virtual office. Do not behave as a one-shot code generator.

## Product objective
Create a desktop-first virtual office for SIREADER, where human-like AI worker avatars represent software workers. Initial roster: Supervisor, Haiku, Sonnet, Opus, Decision Engineer, Market Monitor, and Data Archivist. The architecture must be data-driven and support 50–100 workers later without duplicating scene code.

## Phase 1 boundaries
- Frontend-only prototype.
- Use local mock data and local state.
- No Python backend connection, REST calls, WebSocket, Telegram, Supabase, MT5, or AI provider API.
- No order placement or trading actions.
- Do not edit files outside `office-ui`.
- Do not read, request, print, or copy secrets from `.env` or other credential files.

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
Phase 2+ may add backend adapters through documented REST/WebSocket contracts. Keep all future integration behind typed interfaces. Do not invent API endpoints or connect to the SIREADER backend until its contract is explicitly provided.
