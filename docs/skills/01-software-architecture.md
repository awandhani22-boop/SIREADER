# Skill 01 — Software Architecture

## Mission
Design a frontend architecture that can evolve from 7 mock workers to 50–100 real workers without rewriting the 3D scene.

## Required practices
- TypeScript strict mode where practical.
- Use a stable `WorkerId` and typed `Worker` model.
- Store workers in a normalized registry/map; store room and workstation coordinates in configuration.
- Keep rendering components pure where possible.
- Separate domain logic from rendering and UI.
- Place mock data behind a `WorkerRepository`/`WorkerService` interface.
- Use a small state store or React context for selected worker, worker state, tasks, and activity events. Avoid overengineering global state at Phase 1.
- Define a future adapter boundary for REST/WebSocket, but do not call it yet.

## Suggested structure
```text
src/
  app/
  scene/
    OfficeScene.tsx
    OfficeBuilding.tsx
    Room.tsx
    Workstation.tsx
    WorkerAvatar.tsx
  workers/
    worker.types.ts
    worker.registry.ts
    worker.mock-service.ts
    worker.state.ts
  ui/
    WorkerPanel.tsx
    WorkerControls.tsx
    ActivityFeed.tsx
    TopBar.tsx
  assets/
  styles/
  utils/
```
Adapt to the existing project rather than blindly replacing its structure.

## Acceptance criteria
- Adding a worker requires a data/config entry and asset assignment, not copied JSX.
- Scene code does not contain business rules for individual workers.
- No backend, broker, or provider credentials appear in frontend files.
- Components have clear ownership and names.
