# SIREADER Virtual Office — Project State

## Current phase
Phase 1.1 (Technical Fix & Stabilization + Final Audit Corrections — Complete & Verified) — Futuristic isometric 3D virtual office with 7 interactive AI workers, unified SimulationEngine & avatar animation time source, direct `THREE.AnimationMixer` synchronization (`GlbAvatarAnimationController`), isolated GLB error boundaries, granular Zustand selectors, and deterministic baseline reset.

## Working features
- **Unified SimulationEngine & Avatar Animation Clock (`src/workers/simulation.engine.ts`, `src/scene/avatarAnimation.ts`, `src/scene/WorkerAvatar.tsx`, `src/scene/Workstation.tsx`, `src/app/OfficeApp.tsx`)**:
  - `SimulationEngine` is the single source of truth for simulation time (`simTimeMs` and `SimulationEngine.getUnifiedSimTimeMs`).
  - `stepAvatarClockFromEngine` advances each worker's `AvatarSimClockState` strictly by the simulation-time delta (`deltaSimMs / 1000`) derived from `SimulationEngine`, eliminating drift between `SimulationEngine` time and 3D avatar animation time even across severe browser FPS drops (`0.000000s` drift).
  - Global Pause (`isGlobalPaused === true`) freezes simulation time, placeholder joint poses, overhead beacon rotation, workstation selection rings, and GLB `THREE.AnimationMixer` updates at the exact frame without 60Hz React state updates.
  - Individual Worker Pause (`worker.status === 'PAUSED'`) freezes only that worker's task progress and animation clock while unpaused workers continue normally, and preserves `PAUSED` across Global Pause/Resume.
  - Speed multipliers (`1x`, `2x`, `4x`), manual `Step +0.5s` (`tickSimulation(500)`), and deterministic `Reset` (`resetToBaseline`, restoring `initialPhaseSec` for placeholders and `mixer.time = 0` for GLB avatars) operate from the same engine clock.
- **Direct GLB `THREE.AnimationMixer` Synchronization (`GlbAvatarAnimationController` in `src/scene/avatarAnimation.ts` & `src/scene/WorkerAvatar.tsx`)**:
  - Replaced `@react-three/drei`'s `useAnimations` (which registered an internal `useFrame((state, delta) => mixer.update(delta))` before component `useFrame` callbacks, causing an unintended extra mixer update on Global Pause).
  - `GlbAvatarAnimationController` directly manages `new THREE.AnimationMixer(root)` and updates it exclusively via `stepFromSimulation` after checking pause/freeze state (`0` extra updates on Global Pause).
  - Tracks `activeClipName` and `actionStartCount` so pausing, resuming, or changing speed (`1x`/`2x`/`4x`) never restarts a running `THREE.AnimationAction` unless `animationState` maps to a different clip name.
- **Isolated GLB Error Boundary & Fallback (`src/scene/avatarErrorBoundary.tsx`, `src/scene/WorkerAvatar.tsx`, `src/ui/WorkerPanel.tsx`)**:
  - Each worker avatar wraps its GLB model loader in an isolated `AvatarModelErrorBoundary` with `resolveAvatarRenderMode` and `isValidGlbModelUrl`.
  - Missing, invalid, or corrupted `.glb`/`.gltf` URLs fall back cleanly to that worker's `ArticulatedHumanoidPlaceholder` while preserving `fallbackType`, `accentColor`, `modelUrl`, and `animationMap`.
- **Granular Zustand Selectors & Render Isolation (`src/scene/OfficeScene.tsx`, `src/scene/WorldLabelsOverlay.tsx`, `src/app/OfficeApp.tsx`, `src/ui/WorkerPanel.tsx`, `src/utils/renderProfiler.ts`)**:
  - Memoized per-worker components (`WorkerAvatarSceneItem`, `WorkstationSceneItem`, `RoomSceneItem`, `WorldWorkerBadgeItem`, `RosterWorkerItem`) subscribe only to their own worker slice (`s.workers[workerId]`), resulting in `0` re-renders on the other 6 workers when one worker updates.

## Files modified / added in Phase 1.1 & Final Audit
- `src/scene/avatarAnimation.ts` (Added & Updated — `stepAvatarClockFromEngine`, `createAvatarSimClockState`, `GlbAvatarAnimationController`)
- `src/scene/avatarErrorBoundary.tsx` (Added)
- `src/utils/renderProfiler.ts` (Added)
- `src/scene/WorkerAvatar.tsx` (Modified — unified engine clock + `GlbAvatarAnimationController`)
- `src/scene/Workstation.tsx` (Modified — unified engine clock for selection ring)
- `src/scene/OfficeScene.tsx` (Modified — granular memoized scene items)
- `src/scene/WorldLabelsOverlay.tsx` (Modified — granular memoized badge items)
- `src/app/OfficeApp.tsx` (Modified — granular `RosterWorkerItem` + `SimulationEngine.syncRealtimeClockAnchor`)
- `src/ui/WorkerPanel.tsx` (Modified — granular selectors + GLB fallback diagnostics)
- `src/workers/worker.registry.ts` (Modified — zero-state deterministic baseline)
- `src/workers/simulation.engine.ts` (Modified — `getUnifiedSimTimeMs`, `syncRealtimeClockAnchor`, `resetToBaseline`)
- `src/workers/worker.state.ts` (Modified — flushes pending real-time wall delta on pause/speed transitions)
- `src/workers/simulation.engine.test.ts` (Modified — 16 automated tests including unified clock FPS-drop regression & real `THREE.AnimationMixer` integration)
- `docs/PROJECT_STATE.md` (Modified)

## Architecture constraints
- Strictly 100% Frontend-only (`Phase 1.1`). Python backend, databases, migrations, `.env`, Telegram, MetaTrader 5, and live trading execution are untouched.
- Stack: React 19, TypeScript, Vite, Three.js (`^0.187.0`), `@react-three/fiber` (`^9.8.2`), `@react-three/drei` (`^10.7.9`), `zustand` (`^5.0.16`), Tailwind CSS v4.

## Known limitations
- All tasks, queues, events, token counts, and USD costs are local deterministic simulations explicitly labeled `SIMULATED`.
- Workers default to the 12-part `articulated-humanoid` placeholder (`PLACEHOLDER AVATAR — GLB READY`) until licensed rigged `.glb` files are placed under `public/models/` and configured via `avatarConfig.modelUrl`.

## Last verified checks (Exact commands & actual results)
1. **Automated Unit, Component & Three.js AnimationMixer Integration Tests**:
   - Command: `npx --yes tsx --test src/workers/simulation.engine.test.ts`
   - Result: **Passed (`1..16`, `pass 16`, `fail 0`, exit code `0`)** — covers all 14 core Phase 1.1 tests plus Test 15 (unified `SimulationEngine` clock & zero FPS-drop drift) and Test 16 (real `THREE.AnimationMixer` integration via `GlbAvatarAnimationController`).
2. **TypeScript Typecheck**:
   - Command: `npm run lint` (`tsc --noEmit`)
   - Result: **Passed (`0` errors, exit code `0`)**.
3. **Production Build**:
   - Command: `npm run build` (`vite build`)
   - Result: **Passed (`Build succeeded - the applet is compiled`, exit code `0`)**.
4. **Headless Chromium Browser Verification**:
   - Command: `playwright-cli open http://localhost:3000` (`1440x900`)
   - Result: **Passed (`0` console errors)** — verified Global Pause clock & progress freeze (`globalPauseFrozen: true`), manual `Step +0.5s` (`00:06` -> `00:07`), Worker Pause isolation across Global Pause/Resume (`PAUSED` preserved), speed transitions (`4x` -> `2x` -> `1x`), and deterministic `Reset` (`00:00`, `0` tokens, `$0.000`, `IDLE`).

## Next task
Stop after Phase 1.1 Final Audit corrections and await owner review before Phase 2.
