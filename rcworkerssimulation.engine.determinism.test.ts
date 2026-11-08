warning: in the working copy of 'src/scheduler/scheduler.state.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/workers/simulation.engine.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/workers/worker.state.test.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/workers/worker.state.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/workers/worker.types.ts', LF will be replaced by CRLF the next time Git touches it
[1mdiff --git a/src/scheduler/scheduler.state.ts b/src/scheduler/scheduler.state.ts[m
[1mindex 44e224e..204fb1a 100644[m
[1m--- a/src/scheduler/scheduler.state.ts[m
[1m+++ b/src/scheduler/scheduler.state.ts[m
[36m@@ -243,12 +243,24 @@[m [mexport function normalizeSimulationSnapshot([m
   const normalizedScheduler = normalizeSchedulerState(snapshot.scheduler);[m
   const schedulerChanged = normalizedScheduler !== snapshot.scheduler;[m
 [m
[31m-  if (!workersChanged && !schedulerChanged) {[m
[32m+[m[32m  const rawAcc = snapshot.accumulatorMs;[m
[32m+[m[32m  const hasValidAccumulator =[m
[32m+[m[32m    typeof rawAcc === 'number' &&[m
[32m+[m[32m    Number.isFinite(rawAcc) &&[m
[32m+[m[32m    rawAcc >= 0;[m
[32m+[m[32m  const normalizedAccumulatorMs = hasValidAccumulator[m
[32m+[m[32m    ? Number(rawAcc.toFixed(3))[m
[32m+[m[32m    : 0;[m
[32m+[m[32m  const accumulatorChanged =[m
[32m+[m[32m    !hasValidAccumulator || rawAcc !== normalizedAccumulatorMs;[m
[32m+[m
[32m+[m[32m  if (!workersChanged && !schedulerChanged && !accumulatorChanged) {[m
     return snapshot;[m
   }[m
 [m
   return {[m
     ...snapshot,[m
[32m+[m[32m    accumulatorMs: normalizedAccumulatorMs,[m
     workers: workersChanged ? nextWorkers : snapshot.workers,[m
     scheduler: normalizedScheduler,[m
   };[m
[1mdiff --git a/src/workers/simulation.engine.ts b/src/workers/simulation.engine.ts[m
[1mindex f1c66f3..dc3ec2a 100644[m
[1m--- a/src/workers/simulation.engine.ts[m
[1m+++ b/src/workers/simulation.engine.ts[m
[36m@@ -141,12 +141,13 @@[m [mexport class SimulationEngine {[m
     nowWallTimeMs: number,[m
     isRealtimeLoopActive: boolean,[m
   ): void {[m
[32m+[m[32m    const committedSimMs = snapshot.simTimeMs + (snapshot.accumulatorMs ?? 0);[m
     clockAnchor.baseSimTimeMs = snapshot.simTimeMs;[m
     clockAnchor.anchorWallTimeMs = nowWallTimeMs;[m
     clockAnchor.isRealtimeLoopActive = isRealtimeLoopActive && !snapshot.isGlobalPaused;[m
     clockAnchor.highWaterSimTimeMs = Math.max([m
       clockAnchor.highWaterSimTimeMs,[m
[31m-      snapshot.simTimeMs,[m
[32m+[m[32m      committedSimMs,[m
     );[m
   }[m
 [m
[36m@@ -177,16 +178,14 @@[m [mexport class SimulationEngine {[m
     snapshot: SimulationSnapshot,[m
     nowWallTimeMs?: number,[m
   ): number {[m
[31m-    if (snapshot.simTimeMs === 0 && snapshot.tickCount === 0) {[m
[31m-      return 0;[m
[31m-    }[m
[32m+[m[32m    const committedSimMs = snapshot.simTimeMs + (snapshot.accumulatorMs ?? 0);[m
 [m
     if ([m
       snapshot.isGlobalPaused ||[m
       !clockAnchor.isRealtimeLoopActive ||[m
       nowWallTimeMs === undefined[m
     ) {[m
[31m-      return Math.max(snapshot.simTimeMs, clockAnchor.highWaterSimTimeMs);[m
[32m+[m[32m      return Math.max(committedSimMs, clockAnchor.highWaterSimTimeMs);[m
     }[m
 [m
     const elapsedWallMs = Math.max([m
[36m@@ -194,11 +193,11 @@[m [mexport class SimulationEngine {[m
       Math.min(nowWallTimeMs - clockAnchor.anchorWallTimeMs, FIXED_TICK_SIM_MS),[m
     );[m
     const interpolatedSimMs =[m
[31m-      snapshot.simTimeMs + elapsedWallMs * snapshot.simSpeedMultiplier;[m
[32m+[m[32m      committedSimMs + elapsedWallMs * snapshot.simSpeedMultiplier;[m
 [m
     clockAnchor.highWaterSimTimeMs = Math.max([m
       clockAnchor.highWaterSimTimeMs,[m
[31m-      snapshot.simTimeMs,[m
[32m+[m[32m      committedSimMs,[m
       interpolatedSimMs,[m
     );[m
     return clockAnchor.highWaterSimTimeMs;[m
[36m@@ -222,6 +221,7 @@[m [mexport class SimulationEngine {[m
       prngState: seed,[m
       simTimeMs: 0,[m
       tickCount: 0,[m
[32m+[m[32m      accumulatorMs: 0,[m
       isGlobalPaused: false,[m
       simSpeedMultiplier: 1,[m
       workers,[m
[36m@@ -283,31 +283,30 @@[m [mexport class SimulationEngine {[m
       return { snapshot };[m
     }[m
 [m
[31m-    // Clamp wall-clock delta to MAX_DELTA_CLAMP_MS before applying speed multiplier[m
[32m+[m[32m    const currentNormalized = normalizeSimulationSnapshot(snapshot);[m
     const clampedBaseMs = Math.max(0, Math.min(rawElapsedMs, MAX_DELTA_CLAMP_MS));[m
[31m-    const totalSimMsToAdvance = clampedBaseMs * snapshot.simSpeedMultiplier;[m
[32m+[m[32m    const addedSimMs = Number((clampedBaseMs * currentNormalized.simSpeedMultiplier).toFixed(3));[m
[32m+[m[32m    let accumulator = Number(((currentNormalized.accumulatorMs ?? 0) + addedSimMs).toFixed(3));[m
 [m
[31m-    let current = normalizeSimulationSnapshot(snapshot);[m
[31m-    let remainingMs = totalSimMsToAdvance;[m
[32m+[m[32m    let current = currentNormalized;[m
     let lastDispatchResult: DispatchPassResult<SimulationSnapshot> | undefined;[m
 [m
[31m-    while (remainingMs >= FIXED_TICK_SIM_MS) {[m
[32m+[m[32m    while (accumulator >= FIXED_TICK_SIM_MS) {[m
       const tickResult = this.stepSimulationTickWithDiagnostics(current, FIXED_TICK_SIM_MS);[m
       current = tickResult.snapshot;[m
       lastDispatchResult = tickResult.dispatchResult;[m
[31m-      remainingMs -= FIXED_TICK_SIM_MS;[m
[32m+[m[32m      accumulator = Number((accumulator - FIXED_TICK_SIM_MS).toFixed(3));[m
     }[m
 [m
[31m-    if (remainingMs > 0) {[m
[31m-      const tickResult = this.stepSimulationTickWithDiagnostics(current, remainingMs);[m
[31m-      current = tickResult.snapshot;[m
[31m-      lastDispatchResult = tickResult.dispatchResult;[m
[31m-    }[m
[32m+[m[32m    current = {[m
[32m+[m[32m      ...current,[m
[32m+[m[32m      accumulatorMs: Math.max(0, accumulator),[m
[32m+[m[32m    };[m
 [m
     clockAnchor.baseSimTimeMs = current.simTimeMs;[m
     clockAnchor.highWaterSimTimeMs = Math.max([m
       clockAnchor.highWaterSimTimeMs,[m
[31m-      current.simTimeMs,[m
[32m+[m[32m      current.simTimeMs + (current.accumulatorMs ?? 0),[m
     );[m
     return {[m
       snapshot: current,[m
[36m@@ -330,25 +329,31 @@[m [mexport class SimulationEngine {[m
     snapshot: SimulationSnapshot,[m
     stepSimMs: number = FIXED_TICK_SIM_MS,[m
   ): SimulationTickResult {[m
[31m-    if (snapshot.isGlobalPaused || stepSimMs <= 0) {[m
[32m+[m[32m    if (stepSimMs !== FIXED_TICK_SIM_MS) {[m
[32m+[m[32m      throw new RangeError([m
[32m+[m[32m        `stepSimulationTick only accepts exact ${FIXED_TICK_SIM_MS} ms ticks, received: ${stepSimMs}`,[m
[32m+[m[32m      );[m
[32m+[m[32m    }[m
[32m+[m
[32m+[m[32m    if (snapshot.isGlobalPaused) {[m
       return { snapshot };[m
     }[m
 [m
     const normalizedSnapshot = normalizeSimulationSnapshot(snapshot);[m
 [m
     // 1. Advance simulation clock (bounded so stage transitions are never skipped)[m
[31m-    const boundedStepMs = Math.min(stepSimMs, MAX_DELTA_CLAMP_MS);[m
     let nextSnapshot: SimulationSnapshot = {[m
       ...normalizedSnapshot,[m
[31m-      simTimeMs: Number((normalizedSnapshot.simTimeMs + boundedStepMs).toFixed(3)),[m
[32m+[m[32m      simTimeMs: Number((normalizedSnapshot.simTimeMs + FIXED_TICK_SIM_MS).toFixed(3)),[m
       tickCount: normalizedSnapshot.tickCount + 1,[m
[32m+[m[32m      accumulatorMs: normalizedSnapshot.accumulatorMs,[m
       workers: { ...normalizedSnapshot.workers },[m
       tasks: { ...normalizedSnapshot.tasks },[m
     };[m
 [m
     // 2. Step all workers and their active tasks in canonical workerOrder[m
     for (const workerId of nextSnapshot.workerOrder) {[m
[31m-      nextSnapshot = this.stepSingleWorker(nextSnapshot, workerId, boundedStepMs);[m
[32m+[m[32m      nextSnapshot = this.stepSingleWorker(nextSnapshot, workerId, FIXED_TICK_SIM_MS);[m
     }[m
 [m
     // 3. Deterministic demo task generator: every 12 ticks, if queue cap permits,[m
[36m@@ -382,7 +387,7 @@[m [mexport class SimulationEngine {[m
     clockAnchor.baseSimTimeMs = nextSnapshot.simTimeMs;[m
     clockAnchor.highWaterSimTimeMs = Math.max([m
       clockAnchor.highWaterSimTimeMs,[m
[31m-      nextSnapshot.simTimeMs,[m
[32m+[m[32m      nextSnapshot.simTimeMs + (nextSnapshot.accumulatorMs ?? 0),[m
     );[m
     return {[m
       snapshot: nextSnapshot,[m
[1mdiff --git a/src/workers/worker.state.test.ts b/src/workers/worker.state.test.ts[m
[1mindex a0ba987..e10b73f 100644[m
[1m--- a/src/workers/worker.state.test.ts[m
[1m+++ b/src/workers/worker.state.test.ts[m
[36m@@ -366,14 +366,15 @@[m [mtest('13. Diagnostic propagation during pending wall-clock flush before global p[m
 [m
   try {[m
     SimulationEngine.syncRealtimeClockAnchor(useOfficeStore.getState(), mockTime, true);[m
[31m-    mockTime += 600; // 600ms pending[m
[32m+[m[32m    mockTime += 600; // 600ms pending: 500ms full tick + 100ms in accumulator[m
 [m
     useOfficeStore.getState().setGlobalPaused(true);[m
 [m
     const state = useOfficeStore.getState();[m
     assert.equal(state.isGlobalPaused, true);[m
[31m-    assert.equal(state.simTimeMs, 600); // 500ms full tick + 100ms fractional tick[m
[31m-    assert.equal(state.lastDispatchDiagnosticsAtSimMs, 600);[m
[32m+[m[32m    assert.equal(state.simTimeMs, 500); // 1 full tick committed[m
[32m+[m[32m    assert.equal(state.accumulatorMs, 100); // 100ms preserved in accumulator[m
[32m+[m[32m    assert.equal(state.lastDispatchDiagnosticsAtSimMs, 500);[m
   } finally {[m
     performance.now = origNow;[m
   }[m
[36m@@ -385,9 +386,19 @@[m [mtest('14. Fractional pending delta below 500 ms causes expected tick and diagnos[m
   const current = useOfficeStore.getState();[m
   const advanceRes = SimulationEngine.advanceByWallClockDeltaWithDiagnostics(current, 250);[m
 [m
[31m-  assert.equal(advanceRes.snapshot.simTimeMs, 250);[m
[31m-  assert.ok(advanceRes.lastDispatchResult);[m
[31m-  assert.equal(advanceRes.lastDispatchResult.snapshot.simTimeMs, 250);[m
[32m+[m[32m  // Delta < 500ms does NOT advance simTimeMs or tickCount; only accumulates[m
[32m+[m[32m  assert.equal(advanceRes.snapshot.simTimeMs, 0);[m
[32m+[m[32m  assert.equal(advanceRes.snapshot.tickCount, 0);[m
[32m+[m[32m  assert.equal(advanceRes.snapshot.accumulatorMs, 250);[m
[32m+[m[32m  assert.equal(advanceRes.lastDispatchResult, undefined);[m
[32m+[m
[32m+[m[32m  // Advancing another 250ms reaches 500ms: triggers exactly 1 full tick[m
[32m+[m[32m  const advanceRes2 = SimulationEngine.advanceByWallClockDeltaWithDiagnostics(advanceRes.snapshot, 250);[m
[32m+[m[32m  assert.equal(advanceRes2.snapshot.simTimeMs, 500);[m
[32m+[m[32m  assert.equal(advanceRes2.snapshot.tickCount, 1);[m
[32m+[m[32m  assert.equal(advanceRes2.snapshot.accumulatorMs, 0);[m
[32m+[m[32m  assert.ok(advanceRes2.lastDispatchResult);[m
[32m+[m[32m  assert.equal(advanceRes2.lastDispatchResult.snapshot.simTimeMs, 500);[m
 });[m
 [m
 test('15. Global Resume does not dispatch immediately', () => {[m
[1mdiff --git a/src/workers/worker.state.ts b/src/workers/worker.state.ts[m
[1mindex 5a98c68..4d9f2e9 100644[m
[1m--- a/src/workers/worker.state.ts[m
[1m+++ b/src/workers/worker.state.ts[m
[36m@@ -108,6 +108,7 @@[m [mfunction applySnapshotPatch([m
   | 'prngState'[m
   | 'simTimeMs'[m
   | 'tickCount'[m
[32m+[m[32m  | 'accumulatorMs'[m
   | 'isGlobalPaused'[m
   | 'simSpeedMultiplier'[m
   | 'workers'[m
[36m@@ -121,6 +122,7 @@[m [mfunction applySnapshotPatch([m
     prngState: snapshot.prngState,[m
     simTimeMs: snapshot.simTimeMs,[m
     tickCount: snapshot.tickCount,[m
[32m+[m[32m    accumulatorMs: snapshot.accumulatorMs,[m
     isGlobalPaused: snapshot.isGlobalPaused,[m
     simSpeedMultiplier: snapshot.simSpeedMultiplier,[m
     workers: snapshot.workers,[m
[36m@@ -368,12 +370,12 @@[m [mexport const useOfficeStore = create<OfficeStoreState>((set, get) => ({[m
           const advanceRes = SimulationEngine.advanceByWallClockDeltaWithDiagnostics(current, pendingWallMs);[m
           current = advanceRes.snapshot;[m
           latestDispatch = advanceRes.lastDispatchResult;[m
[31m-          SimulationEngine.syncRealtimeClockAnchor([m
[31m-            { ...current, simSpeedMultiplier: speed },[m
[31m-            now,[m
[31m-            true,[m
[31m-          );[m
         }[m
[32m+[m[32m        SimulationEngine.syncRealtimeClockAnchor([m
[32m+[m[32m          { ...current, simSpeedMultiplier: speed },[m
[32m+[m[32m          now,[m
[32m+[m[32m          true,[m
[32m+[m[32m        );[m
       }[m
       const diagPatch = syncDiagnostics(state, current, latestDispatch);[m
       return {[m
[1mdiff --git a/src/workers/worker.types.ts b/src/workers/worker.types.ts[m
[1mindex 42603de..27b88d3 100644[m
[1m--- a/src/workers/worker.types.ts[m
[1m+++ b/src/workers/worker.types.ts[m
[36m@@ -42,6 +42,9 @@[m [mimport type {[m
   SchedulerSnapshotState,[m
 } from '../scheduler/scheduler.types';[m
 [m
[32m+[m[32mexport const FIXED_TICK_SIM_MS = 500;[m
[32m+[m[32mexport const MAX_DELTA_CLAMP_MS = 1000;[m
[32m+[m
 export {[m
   PERMANENT_WORKER_IDS,[m
   TASK_CATEGORIES,[m
[36m@@ -301,6 +304,7 @@[m [mexport interface SimulationSnapshot {[m
   prngState: number;[m
   simTimeMs: number;[m
   tickCount: number;[m
[32m+[m[32m  accumulatorMs?: number;[m
   isGlobalPaused: boolean;[m
   simSpeedMultiplier: 1 | 2 | 4;[m
   workers: Record<WorkerId, WorkerEntity>;[m
