# SIREADER Virtual Office — Project State

## Current phase
Phase 1.1 (Technical Fix & Stabilization — Complete & Verified) — Futuristic isometric 3D virtual office with 7 interactive AI workers, controlled simulation animation clock, isolated GLB error boundaries, granular Zustand selectors, and deterministic baseline reset.

## Working features
- **Fix A — Controlled Avatar Animation Clock (`src/scene/avatarAnimation.ts`, `src/scene/WorkerAvatar.tsx`, `src/scene/Workstation.tsx`)**:
  - Replaced Three.js wall-clock `state.clock.elapsedTime` with a ref-driven controlled animation clock (`advanceAvatarAnimClock`, `computeHumanoidPose`, `computeGlbMixerTimeScale`, `updateGlbMixerWithSimClock`).
  - Global Pause (`isGlobalPaused === true`) freezes simulation clock advancement, worker movement, articulated humanoid joint animations, overhead beacon rotation, workstation selection ring rotation, GLB `AnimationMixer` updates (`timeScale = 0`), task progress, worker state transitions, and simulated activity generation without mutating React state at 60Hz.
  - Individual Worker Pause (`worker.status === 'PAUSED'`) freezes only that worker's task progress and visual animation while unpaused workers continue normally.
  - Global Resume (`setGlobalPaused(false)`) preserves any worker that was individually `PAUSED` prior to Global Pause.
- **Fix B — Isolated GLB Error Boundary & Fallback (`src/scene/avatarErrorBoundary.tsx`, `src/scene/WorkerAvatar.tsx`, `src/ui/WorkerPanel.tsx`)**:
  - Each worker avatar wraps its GLB model loader (`GlbModelAvatar`) in an isolated `AvatarModelErrorBoundary` with `resolveAvatarRenderMode` and `isValidGlbModelUrl`.
  - Missing, invalid, or corrupted `.glb`/`.gltf` URLs fall back cleanly to that worker's `ArticulatedHumanoidPlaceholder` while preserving `fallbackType`, `accentColor`, `modelUrl`, and `animationMap`, logging a diagnostic warning once without infinite reload loops or crashing sibling avatars / `OfficeScene`.
- **Fix C — Granular Zustand Selectors & Render Isolation (`src/scene/OfficeScene.tsx`, `src/scene/WorldLabelsOverlay.tsx`, `src/app/OfficeApp.tsx`, `src/ui/WorkerPanel.tsx`, `src/utils/renderProfiler.ts`)**:
  - Extracted memoized per-worker components (`WorkerAvatarSceneItem`, `WorkstationSceneItem`, `RoomSceneItem`, `WorldWorkerBadgeItem`, `RosterWorkerItem`) subscribing only to their own worker slice (`s.workers[workerId]`).
  - Preserved object reference equality in `SimulationEngine.stepSingleWorker` for unchanged workers so mutating one worker causes `0` re-renders on the other 6 worker components.
- **Fix D — Deterministic Reset & Simulation Clock Consistency (`src/workers/simulation.engine.ts`, `src/workers/worker.registry.ts`, `src/workers/worker.state.ts`)**:
  - Added `SimulationEngine.createBaselineSnapshot(seed)` and `SimulationEngine.resetToBaseline(seed)`.
  - `Reset` restores a clean zero-task deterministic baseline (`simTimeMs = 0`, `tickCount = 0`, `prngState = seed`, `tasks = {}`, `events = []`, all 7 workers `IDLE` with empty queues and zeroed `SIMULATED` token/cost metrics) whether invoked while running, while globally paused, with active tasks, or with queued tasks.
  - Speed multipliers (`1x`, `2x`, `4x`) and manual `Step +0.5s` (`tickSimulation(500)`) advance simulation time and animation clocks consistently.

## Files modified / added in Phase 1.1
- `src/scene/avatarAnimation.ts` (Added)
- `src/scene/avatarErrorBoundary.tsx` (Added)
- `src/utils/renderProfiler.ts` (Added)
- `src/scene/WorkerAvatar.tsx` (Modified)
- `src/scene/Workstation.tsx` (Modified)
- `src/scene/OfficeScene.tsx` (Modified)
- `src/scene/WorldLabelsOverlay.tsx` (Modified)
- `src/app/OfficeApp.tsx` (Modified)
- `src/ui/WorkerPanel.tsx` (Modified)
- `src/workers/worker.registry.ts` (Modified)
- `src/workers/simulation.engine.ts` (Modified)
- `src/workers/worker.state.ts` (Modified)
- `src/workers/simulation.engine.test.ts` (Modified — expanded to 14 automated tests)
- `docs/PROJECT_STATE.md` (Modified)

## Architecture constraints
- Strictly 100% Frontend-only (`Phase 1.1`). Python backend, databases, migrations, `.env`, Telegram, MetaTrader 5, and live trading execution are untouched.
- Stack: React 19, TypeScript, Vite, Three.js (`^0.187.0`), `@react-three/fiber` (`^9.8.2`), `@react-three/drei` (`^10.7.9`), `zustand` (`^5.0.16`), Tailwind CSS v4.

## Known limitations
- All tasks, queues, events, token counts, and USD costs are local deterministic simulations explicitly labeled `SIMULATED`.
- Workers default to the 12-part `articulated-humanoid` placeholder (`PLACEHOLDER AVATAR — GLB READY`) until licensed rigged `.glb` files are placed under `public/models/` and configured via `avatarConfig.modelUrl`.

## Last verified checks (Exact commands & actual results)
1. **Unit & Component Tests**:
   - Command: `npx --yes tsx --test src/workers/simulation.engine.test.ts`
   - Result: **Passed (14/14 tests passing, 0 failures)**.
2. **TypeScript Typecheck**:
   - Command: `npm run lint` (`tsc --noEmit`)
   - Result: **Passed (0 errors)**.
3. **Production Build**:
   - Command: `npm run build` (`vite build`)
   - Result: **Passed**.
4. **Headless Browser Verification**:
   - Command: `playwright-cli open http://localhost:3000` (`1440x900`)
   - Result: **Passed** — verified Global Pause/Resume clock & progress freeze, manual Step (`+0.5s`), Worker Pause isolation across Global Pause/Resume, `4x` speed control, FIFO task queueing, isolated GLB load failure fallback & recovery (`FALLBACK ACTIVE — GLB FAILED` -> `PLACEHOLDER AVATAR — GLB READY`), and deterministic `Reset` (`00:00`, `0` tokens, `$0.000`, `IDLE`).

## Next task
Await owner approval of Phase 1.1 stabilization before any future phase.
