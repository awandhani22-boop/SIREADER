# SIREADER Phase 4.4 — Frontend LIVE Runtime Adapter & Demo/Live Separation

**Status:** PREPARATORY ARCHITECTURE DRAFT — not started  
**Dependencies:** Phase 4.1 worker contracts, Phase 4.2 provider/cost policy and Phase 4.3 persistent orchestration.

## 1. Preserve the existing Virtual Office

Extend the existing React 19/TypeScript/Three.js/R3F/Zustand project. Do not create a second frontend. Keep the office scene, camera, initial seven worker identities, rooms, interactions and deterministic scheduler for DEMO mode.

Python Backend is the source of truth for LIVE workers, runtime instances, task queue, attempts, activity, health, usage and costs. Frontend maps backend DTOs to visual representations only.

## 2. Adapter architecture

Authenticated BFF API + Phase 3.3 SSE invalidation -> strict runtime DTO parser -> WorkerRepository/TaskRepository/RuntimeHealthRepository -> independent LIVE Zustand state -> tested backend-state-to-view mapper -> existing roster, scene and panels.

Transport and schema parsing stay outside 3D scene components. Components never make ad hoc API calls or infer worker state.

## 3. Mode separation

- SIMULATED: existing deterministic SimulationEngine, WorkerMockService and scheduler only.
- LIVE: backend snapshots only.
- Mode switch is explicit and visibly labelled.
- Never merge task queues, counts, tokens, costs, health or activity between modes.
- LIVE unavailable means STALE/OFFLINE/ERROR; never substitute simulation while showing LIVE.
- Demo reset/step/speed/pause cannot change LIVE snapshots.
- LIVE polling/SSE cannot advance simulation time or mutate scheduler state.

## 4. Mapping rules

- Logical WorkerDefinition maps to stable workerId; missing definitions are not fabricated.
- WorkerRuntimeInstance determines process lifecycle/health; heartbeat determines freshness.
- An active TaskAttempt maps to BUSY only when the lease is current and attempt is RUNNING.
- Provider request status is displayed separately from process and task status.
- Disabled definition, missing process, stale heartbeat, healthy idle process, blocked task and failed task are distinct.
- Avatar animation is a projection of mapped state only; it never writes domain state.
- Seven-worker baseline renders from registry data; additional workers use data-driven layout, not per-worker JSX.

## 5. Performance

- SSE events invalidate resources; they do not drive 60-FPS writes.
- Zustand updates are batched at meaningful lifecycle transitions and bounded metric cadence.
- Stable selectors and memoized mappers; Three.js frame loop stays local.
- Benchmark 7-worker baseline and representative 50-worker scene; measure 100-worker data model separately.
- Preserve reduced-motion/lower-graphics support.
- Worker/room layout handles overflow and collisions through data-driven placement.

## 6. Acceptance

- DTO parser rejects unknown statuses/schema and invalid identity references.
- LIVE provenance demonstrably backend-only.
- DEMO/LIVE switch and reset/step/pause isolation tests.
- All seven workers map correctly.
- Missing/disabled/offline/stale workers are not fabricated.
- Task/attempt state is consistent across scene, detail panel, queue, activity and audit.
- SSE reconnect and snapshot fallback retain correct state.
- 7/50/100-worker performance measurements recorded.
- No meaningful frame-time/memory regression.
- Existing browser/responsive/reduced-motion checks pass.

**Status:** PLANNED. Do not implement before Phase 4.1–4.3 acceptance.
