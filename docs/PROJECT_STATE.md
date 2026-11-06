# SIREADER Virtual Office — Project State

## Current phase
Phase 1 (Complete & Verified) — Futuristic isometric 3D virtual office with 7 interactive AI workers and deterministic local simulation.

## Working features
- **3D Isometric Office (`src/scene/`)**: Orthographic camera with pan, zoom, and reset bounds; central spine corridor connecting 7 department rooms (`Reception`, `Research`, `Analysis`, `Strategy`, `Trading Operations`, `Market Monitoring`, `Archive Vault`), instanced structural pillars, and clickable workstations.
- **Modular Character System (`WorkerAvatar.tsx`)**: Supports rigged GLB/glTF loading (`modelUrl`, `animationMap`) and renders a 12-part Articulated Humanoid Placeholder (`fallbackType: 'articulated-humanoid'`) with state-driven animations (`idle`, `seated`, `typing`, `walking`, `talking`) via `useFrame` refs without 60Hz React state updates.
- **Separated Domain & Deterministic Simulation (`src/workers/`)**:
  - Distinct `WorkerEntity` (`IDLE`, `TASK_RECEIVED`, `WALKING`, `BUSY`, `PAUSED`, `COMPLETED`) and `TaskEntity` (`QUEUED`, `ROUTING`, `EXTRACTING`, `ANALYZING`, `VALIDATING`, `ARCHIVING`, `COMPLETED`).
  - Frame-rate independent `SimulationEngine` with seeded PRNG (`Mulberry32`) and clamped delta (`MAX_DELTA_CLAMP_MS`).
  - Global Pause stops the entire simulation clock; Worker Pause freezes only that worker's active task while others continue, and Resume continues from exact previous progress.
- **Command-Center UI (`src/ui/`)**: Accessible `TopBar`, collapsible 7-worker `Roster`, `WorkerPanel` profile drawer, `WorkerControls` (preset & custom mock task dispatch, pause/resume), and department-filtered `ActivityFeed`. All metrics are explicitly labeled `SIMULATED`.

## Architecture constraints
- 100% Frontend-only in Phase 1. Python backend, database, `.env`, Telegram, MT5, and live trading execution are untouched.
- Stack: React 19, TypeScript, Vite, Three.js (`^0.187.0`), `@react-three/fiber` (`^9.8.2`), `@react-three/drei` (`^10.7.9`), `zustand` (`^5.0.16`), Tailwind CSS v4.

## Known limitations
- Worker activity, token counts, and costs are simulated locally (`SIMULATED`).
- Workers currently use the honest 12-part `articulated-humanoid` placeholder (`PLACEHOLDER AVATAR — GLB READY`) until licensed rigged GLB character files are placed in `public/models/` and referenced in `avatarConfig.modelUrl`.

## Last verified checks
- Deterministic unit tests (`npx --yes tsx --test src/workers/simulation.engine.test.ts`): **7/7 passing**.
- TypeScript check (`npm run lint` / `tsc --noEmit`): **Passed (0 errors)**.
- Production build (`npm run build`): **Passed**.
- Headless Chromium browser verification (`1440x900`): **Passed (0 console errors)**; verified worker selection, worker pause/resume preservation, custom mock task queueing, and simulation stepping.

## Next task
Await owner review for Phase 1 sign-off or licensed GLB character asset drop-in.
