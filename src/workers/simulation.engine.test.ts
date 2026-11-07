import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { RosterWorkerItem } from '../app/OfficeApp';
import {
  advanceAvatarAnimClock,
  computeGlbMixerTimeScale,
  computeHumanoidPose,
  computeWorkerInitialPhaseSec,
  createAvatarSimClockState,
  GlbAvatarAnimationController,
  stepAvatarClockFromEngine,
  updateGlbMixerWithSimClock,
} from '../scene/avatarAnimation';
import {
  AvatarModelErrorBoundary,
  resolveAvatarRenderMode,
} from '../scene/avatarErrorBoundary';
import { WorldWorkerBadgeItem } from '../scene/WorldLabelsOverlay';
import {
  getWorkerComponentRenderCount,
  resetWorkerRenderCounts,
} from '../utils/renderProfiler';
import {
  DEFAULT_SIMULATION_SEED,
  FIXED_TICK_SIM_MS,
  SimulationEngine,
} from './simulation.engine';
import { WorkerMockService } from './worker.mock-service';
import { useOfficeStore } from './worker.state';

interface MockDomNode {
  tagName: string;
  nodeType: number;
  textContent: string;
  children: MockDomNode[];
  attributes: Record<string, string>;
}

function collectDomTextAndIds(node: MockDomNode): string {
  const parts: string[] = [];
  if (node.attributes?.id) {
    parts.push(`#${node.attributes.id}`);
  }
  if (node.textContent) {
    parts.push(node.textContent);
  }
  for (const child of node.children || []) {
    parts.push(collectDomTextAndIds(child));
  }
  return parts.join(' ');
}

/**
 * Minimal DOM shim for React 19 createRoot in Node test runner
 * Used by Test 12, Test 13, and Test 14 to verify component error boundaries
 * and granular Zustand selector re-render isolation.
 */
function ensureMinimalDomEnvironment() {
  if (typeof globalThis.document !== 'undefined') {
    return;
  }

  class MockElement implements MockDomNode {
    tagName: string;
    nodeType = 1;
    style: Record<string, string> = {};
    children: MockElement[] = [];
    parentNode: MockElement | null = null;
    textContent = '';
    attributes: Record<string, string> = {};
    ownerDocument: unknown;
    namespaceURI = 'http://www.w3.org/1999/xhtml';

    constructor(tagName: string, ownerDoc: unknown) {
      this.tagName = tagName.toUpperCase();
      this.ownerDocument = ownerDoc;
    }
    appendChild(child: MockElement) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    }
    removeChild(child: MockElement) {
      const idx = this.children.indexOf(child);
      if (idx >= 0) {
        this.children.splice(idx, 1);
        child.parentNode = null;
      }
      return child;
    }
    insertBefore(newChild: MockElement, refChild: MockElement | null) {
      newChild.parentNode = this;
      if (!refChild) {
        this.children.push(newChild);
        return newChild;
      }
      const idx = this.children.indexOf(refChild);
      if (idx >= 0) {
        this.children.splice(idx, 0, newChild);
      } else {
        this.children.push(newChild);
      }
      return newChild;
    }
    setAttribute(name: string, val: string) {
      this.attributes[name] = String(val);
    }
    removeAttribute(name: string) {
      delete this.attributes[name];
    }
    addEventListener() {}
    removeEventListener() {}
  }

  const mockDocument = {
    nodeType: 9,
    createElement: (tag: string) => new MockElement(tag, mockDocument),
    createElementNS: (_ns: string, tag: string) =>
      new MockElement(tag, mockDocument),
    createTextNode: (text: string) => {
      const node = new MockElement('#text', mockDocument);
      node.nodeType = 3;
      node.textContent = text;
      return node;
    },
    createComment: (text: string) => {
      const node = new MockElement('#comment', mockDocument);
      node.nodeType = 8;
      node.textContent = text;
      return node;
    },
    documentElement: null as unknown,
    body: null as unknown,
    addEventListener() {},
    removeEventListener() {},
  };
  mockDocument.documentElement = new MockElement('html', mockDocument);
  mockDocument.body = new MockElement('body', mockDocument);

  (globalThis as Record<string, unknown>).document = mockDocument;
  (globalThis as Record<string, unknown>).window = {
    document: mockDocument,
    navigator: { userAgent: 'node-test' },
    addEventListener() {},
    removeEventListener() {},
    HTMLElement: MockElement,
    HTMLIFrameElement: MockElement,
  };
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
}

// 1. Global Pause freezes simulation time.
test('1. Global Pause freezes simulation time, task progress, worker transitions, and event generation', () => {
  let snapshot = SimulationEngine.createInitialSnapshot(DEFAULT_SIMULATION_SEED);
  snapshot = SimulationEngine.setGlobalPaused(snapshot, true);
  assert.equal(snapshot.isGlobalPaused, true);

  const timeBefore = snapshot.simTimeMs;
  const tickBefore = snapshot.tickCount;
  const eventsBefore = snapshot.events.length;
  const prngBefore = snapshot.prngState;
  const opusProgressBefore =
    snapshot.tasks[snapshot.workers.opus.currentTaskId!].progress;

  // Attempt both fixed tick and wall-clock advancement while globally paused
  snapshot = SimulationEngine.stepSimulationTick(snapshot, FIXED_TICK_SIM_MS);
  snapshot = SimulationEngine.advanceByWallClockDelta(snapshot, 2000);

  assert.equal(snapshot.simTimeMs, timeBefore);
  assert.equal(snapshot.tickCount, tickBefore);
  assert.equal(snapshot.events.length, eventsBefore);
  assert.equal(snapshot.prngState, prngBefore);
  assert.equal(
    snapshot.tasks[snapshot.workers.opus.currentTaskId!].progress,
    opusProgressBefore,
  );
});

// 2. Global Pause freezes placeholder animation time.
test('2. Global Pause freezes placeholder animation time and articulated humanoid joint angles', () => {
  let animClockSec = 1.25;

  // Advance while running at 1x (rawDeltaSec = 0.08 <= MAX_ANIM_FRAME_DELTA_SEC)
  animClockSec = advanceAvatarAnimClock({
    currentAnimTimeSec: animClockSec,
    rawDeltaSec: 0.08,
    isGlobalPaused: false,
    workerStatus: 'BUSY',
    reducedMotion: false,
    simSpeedMultiplier: 1,
  });
  assert.equal(Number(animClockSec.toFixed(4)), 1.33);

  const poseAtPause = computeHumanoidPose('typing', animClockSec, true);

  // Advance 60 frames while isGlobalPaused === true -> clock and pose must remain identical
  for (let frame = 0; frame < 60; frame++) {
    animClockSec = advanceAvatarAnimClock({
      currentAnimTimeSec: animClockSec,
      rawDeltaSec: 1 / 60,
      isGlobalPaused: true,
      workerStatus: 'BUSY',
      reducedMotion: false,
      simSpeedMultiplier: 4,
    });
  }

  assert.equal(
    Number(animClockSec.toFixed(4)),
    1.33,
    'Placeholder animation clock must not advance during Global Pause',
  );
  const poseAfterPausedFrames = computeHumanoidPose('typing', animClockSec, true);
  assert.deepEqual(poseAfterPausedFrames, poseAtPause);
});

// 3. Global Pause freezes GLB animation updates.
test('3. Global Pause freezes GLB AnimationMixer timeScale and frame delta updates', () => {
  const mixerCalls: number[] = [];
  const mockMixer = {
    timeScale: 1,
    update(deltaSec: number) {
      mixerCalls.push(deltaSec);
    },
  };

  // Running at 2x speed -> mixer timeScale = 2 and mixer.update is invoked with scaled delta
  const activeDelta = updateGlbMixerWithSimClock(mockMixer, {
    rawDeltaSec: 0.016,
    isGlobalPaused: false,
    workerStatus: 'BUSY',
    reducedMotion: false,
    simSpeedMultiplier: 2,
  });
  assert.equal(mockMixer.timeScale, 2);
  assert.equal(Number(activeDelta.toFixed(4)), 0.032);
  assert.equal(mixerCalls.length, 1);

  // Global Pause -> mixer timeScale = 0 and mixer.update is NOT invoked
  const pausedDelta = updateGlbMixerWithSimClock(mockMixer, {
    rawDeltaSec: 0.016,
    isGlobalPaused: true,
    workerStatus: 'BUSY',
    reducedMotion: false,
    simSpeedMultiplier: 2,
  });
  assert.equal(
    computeGlbMixerTimeScale({
      isGlobalPaused: true,
      workerStatus: 'BUSY',
      reducedMotion: false,
      simSpeedMultiplier: 2,
    }),
    0,
  );
  assert.equal(mockMixer.timeScale, 0);
  assert.equal(pausedDelta, 0);
  assert.equal(
    mixerCalls.length,
    1,
    'GLB mixer.update() must not be called while globally paused',
  );
});

// 4. Resume continues from the previous state.
test('4. Resume continues simulation and animation clock from exact previous state', () => {
  let snapshot = SimulationEngine.createInitialSnapshot(DEFAULT_SIMULATION_SEED);
  snapshot = SimulationEngine.stepSimulationTick(snapshot, FIXED_TICK_SIM_MS);

  const exactSimTimeAtPause = snapshot.simTimeMs;
  const exactOpusTask = snapshot.tasks[snapshot.workers.opus.currentTaskId!];
  const exactProgressAtPause = exactOpusTask.progress;
  const exactElapsedAtPause = exactOpusTask.elapsedSimMs;

  let animClockSec = advanceAvatarAnimClock({
    currentAnimTimeSec: 0,
    rawDeltaSec: 0.05,
    isGlobalPaused: false,
    workerStatus: 'BUSY',
    reducedMotion: false,
    simSpeedMultiplier: 1,
  });
  assert.equal(animClockSec, 0.05);

  // Pause globally and pass wall time
  snapshot = SimulationEngine.setGlobalPaused(snapshot, true);
  snapshot = SimulationEngine.advanceByWallClockDelta(snapshot, 5000);
  animClockSec = advanceAvatarAnimClock({
    currentAnimTimeSec: animClockSec,
    rawDeltaSec: 0.08,
    isGlobalPaused: true,
    workerStatus: 'BUSY',
    reducedMotion: false,
    simSpeedMultiplier: 1,
  });

  // Global Resume
  snapshot = SimulationEngine.setGlobalPaused(snapshot, false);
  assert.equal(snapshot.simTimeMs, exactSimTimeAtPause);
  assert.equal(
    snapshot.tasks[snapshot.workers.opus.currentTaskId!].progress,
    exactProgressAtPause,
  );
  assert.equal(
    snapshot.tasks[snapshot.workers.opus.currentTaskId!].elapsedSimMs,
    exactElapsedAtPause,
  );
  assert.equal(animClockSec, 0.05);

  // Next tick continues smoothly from previous state
  snapshot = SimulationEngine.stepSimulationTick(snapshot, FIXED_TICK_SIM_MS);
  animClockSec = advanceAvatarAnimClock({
    currentAnimTimeSec: animClockSec,
    rawDeltaSec: 0.05,
    isGlobalPaused: false,
    workerStatus: 'BUSY',
    reducedMotion: false,
    simSpeedMultiplier: 1,
  });

  assert.equal(snapshot.simTimeMs, exactSimTimeAtPause + FIXED_TICK_SIM_MS);
  assert.ok(
    snapshot.tasks[snapshot.workers.opus.currentTaskId!].progress >
      exactProgressAtPause,
  );
  assert.equal(Number(animClockSec.toFixed(4)), 0.1);
});

// 5. Worker Pause affects only the selected worker.
test('5. Worker Pause affects only the selected worker while other workers continue moving and progressing', () => {
  let snapshot = SimulationEngine.createInitialSnapshot(DEFAULT_SIMULATION_SEED);

  const sonnetTaskId = snapshot.workers.sonnet.currentTaskId!;
  const opusTaskId = snapshot.workers.opus.currentTaskId!;
  const sonnetProgressStart = snapshot.tasks[sonnetTaskId].progress;
  const opusProgressStart = snapshot.tasks[opusTaskId].progress;

  // Pause only sonnet
  snapshot = SimulationEngine.pauseWorker(snapshot, 'sonnet');
  assert.equal(snapshot.workers.sonnet.status, 'PAUSED');
  assert.equal(snapshot.workers.opus.status, 'BUSY');

  // Advance 4 simulation ticks
  for (let i = 0; i < 4; i++) {
    snapshot = SimulationEngine.stepSimulationTick(snapshot, FIXED_TICK_SIM_MS);
  }

  // Sonnet is frozen; Opus progressed
  assert.equal(snapshot.tasks[sonnetTaskId].progress, sonnetProgressStart);
  assert.ok(snapshot.tasks[opusTaskId].progress > opusProgressStart);

  // Animation clock check: Sonnet's clock freezes while Opus's clock advances
  const sonnetAnim = advanceAvatarAnimClock({
    currentAnimTimeSec: 2.0,
    rawDeltaSec: 0.05,
    isGlobalPaused: false,
    workerStatus: snapshot.workers.sonnet.status,
    reducedMotion: false,
    simSpeedMultiplier: 1,
  });
  const opusAnim = advanceAvatarAnimClock({
    currentAnimTimeSec: 2.0,
    rawDeltaSec: 0.05,
    isGlobalPaused: false,
    workerStatus: snapshot.workers.opus.status,
    reducedMotion: false,
    simSpeedMultiplier: 1,
  });

  assert.equal(sonnetAnim, 2.0);
  assert.equal(Number(opusAnim.toFixed(4)), 2.05);
});

// 6. A previously paused worker remains paused after Global Resume.
test('6. A worker individually paused before Global Pause remains PAUSED after Global Resume', () => {
  let snapshot = SimulationEngine.createInitialSnapshot(DEFAULT_SIMULATION_SEED);

  // Step 1: Individually pause Sonnet
  snapshot = SimulationEngine.pauseWorker(snapshot, 'sonnet');
  assert.equal(snapshot.workers.sonnet.status, 'PAUSED');
  const sonnetTaskId = snapshot.workers.sonnet.currentTaskId!;
  const sonnetProgressBefore = snapshot.tasks[sonnetTaskId].progress;

  // Step 2: Activate Global Pause
  snapshot = SimulationEngine.setGlobalPaused(snapshot, true);
  assert.equal(snapshot.isGlobalPaused, true);
  assert.equal(snapshot.workers.sonnet.status, 'PAUSED');

  // Step 3: Global Resume
  snapshot = SimulationEngine.setGlobalPaused(snapshot, false);
  assert.equal(snapshot.isGlobalPaused, false);
  assert.equal(
    snapshot.workers.sonnet.status,
    'PAUSED',
    'Sonnet must still be PAUSED after Global Resume',
  );

  // Step 4: Advance ticks after Global Resume -> Sonnet must still not progress
  snapshot = SimulationEngine.stepSimulationTick(snapshot, FIXED_TICK_SIM_MS);
  assert.equal(snapshot.workers.sonnet.status, 'PAUSED');
  assert.equal(snapshot.tasks[sonnetTaskId].progress, sonnetProgressBefore);
});

// 7. FIFO task order is preserved.
test('7. FIFO task queue order is strictly preserved when multiple tasks are queued on a worker', () => {
  let snapshot = SimulationEngine.createBaselineSnapshot(DEFAULT_SIMULATION_SEED);

  // Assign 3 tasks to IDLE worker haiku: Task 1 becomes active, Task 2 and Task 3 queue in FIFO order
  snapshot = WorkerMockService.assignTask(snapshot, {
    workerId: 'haiku',
    title: 'FIFO First Active Task',
  });
  snapshot = WorkerMockService.assignTask(snapshot, {
    workerId: 'haiku',
    title: 'FIFO Second Queued Task',
  });
  snapshot = WorkerMockService.assignTask(snapshot, {
    workerId: 'haiku',
    title: 'FIFO Third Queued Task',
  });

  const haikuInitial = snapshot.workers.haiku;
  const firstId = haikuInitial.currentTaskId!;
  const [secondId, thirdId] = haikuInitial.taskQueueIds;

  assert.equal(snapshot.tasks[firstId].title, 'FIFO First Active Task');
  assert.equal(snapshot.tasks[secondId].title, 'FIFO Second Queued Task');
  assert.equal(snapshot.tasks[thirdId].title, 'FIFO Third Queued Task');
  assert.equal(snapshot.tasks[secondId].status, 'QUEUED');
  assert.equal(snapshot.tasks[thirdId].status, 'QUEUED');

  // Step until firstId completes and Haiku finishes COMPLETED celebration to promote secondId
  for (let i = 0; i < 45; i++) {
    snapshot = SimulationEngine.stepSimulationTick(snapshot, FIXED_TICK_SIM_MS);
    if (
      snapshot.tasks[firstId].status === 'COMPLETED' &&
      snapshot.workers.haiku.currentTaskId === secondId
    ) {
      break;
    }
  }

  assert.equal(snapshot.tasks[firstId].status, 'COMPLETED');
  assert.equal(
    snapshot.workers.haiku.currentTaskId,
    secondId,
    'Second task in FIFO queue must become active after first task completes',
  );
  assert.deepEqual(snapshot.workers.haiku.taskQueueIds, [thirdId]);
});

// 8. Reset clears active and queued task state.
test('8. Reset clears active tasks, queued tasks, events, and SIMULATED metrics while running or paused', () => {
  // Case A: Reset while running with active + queued tasks
  let snapshot = SimulationEngine.createInitialSnapshot(DEFAULT_SIMULATION_SEED);
  snapshot = WorkerMockService.assignTask(snapshot, {
    workerId: 'sonnet',
    title: 'Extra Queued Task Before Reset',
  });
  snapshot = SimulationEngine.stepSimulationTick(snapshot, FIXED_TICK_SIM_MS);

  const resetFromRunning = SimulationEngine.resetToBaseline(DEFAULT_SIMULATION_SEED);
  assert.equal(resetFromRunning.simTimeMs, 0);
  assert.equal(resetFromRunning.tickCount, 0);
  assert.equal(resetFromRunning.isGlobalPaused, false);
  assert.equal(Object.keys(resetFromRunning.tasks).length, 0);
  assert.equal(resetFromRunning.events.length, 0);

  for (const wid of resetFromRunning.workerOrder) {
    const w = resetFromRunning.workers[wid];
    assert.equal(w.status, 'IDLE');
    assert.equal(w.currentTaskId, null);
    assert.deepEqual(w.taskQueueIds, []);
    assert.deepEqual(w.completedTaskIds, []);
    assert.equal(w.metrics.simulatedTokens, 0);
    assert.equal(w.metrics.simulatedCostUsd, 0);
    assert.equal(w.metrics.completedTasksCount, 0);
    assert.equal(w.metrics.isSimulated, true);
  }

  // Case B: Reset via Zustand store while globally paused with active and queued tasks
  useOfficeStore.getState().setGlobalPaused(true);
  useOfficeStore.getState().assignMockTask({
    workerId: 'opus',
    title: 'Task Assigned While Paused',
  });
  useOfficeStore.getState().resetSimulationWithSeed(DEFAULT_SIMULATION_SEED);

  const storeState = useOfficeStore.getState();
  assert.equal(storeState.simTimeMs, 0);
  assert.equal(storeState.tickCount, 0);
  assert.equal(storeState.isGlobalPaused, false);
  assert.equal(Object.keys(storeState.tasks).length, 0);
  assert.equal(storeState.events.length, 0);
  assert.equal(storeState.workers.opus.status, 'IDLE');
  assert.equal(storeState.workers.opus.currentTaskId, null);
  assert.equal(storeState.workers.opus.taskQueueIds.length, 0);
});

// 9. Reset restores deterministic random state.
test('9. Reset restores deterministic PRNG state and produces identical subsequent simulation sequences', () => {
  const seed = 774411;
  let firstRun = SimulationEngine.resetToBaseline(seed);
  assert.equal(firstRun.seed, seed);
  assert.equal(firstRun.prngState, seed);

  // Advance 15 ticks in first run
  for (let i = 0; i < 15; i++) {
    firstRun = SimulationEngine.stepSimulationTick(firstRun, FIXED_TICK_SIM_MS);
  }

  // Reset to same seed and advance 15 ticks in second run
  let secondRun = SimulationEngine.resetToBaseline(seed);
  assert.equal(secondRun.prngState, seed);

  for (let i = 0; i < 15; i++) {
    secondRun = SimulationEngine.stepSimulationTick(
      secondRun,
      FIXED_TICK_SIM_MS,
    );
  }

  assert.equal(firstRun.simTimeMs, secondRun.simTimeMs);
  assert.equal(firstRun.prngState, secondRun.prngState);
  assert.deepEqual(
    firstRun.events.map((e) => e.message),
    secondRun.events.map((e) => e.message),
  );
});

// 10. 1x, 2x, and 4x speed behave consistently.
test('10. Speed multipliers (1x, 2x, 4x) scale simulation clock and avatar animation clock proportionally', () => {
  const base1x = {
    ...SimulationEngine.resetToBaseline(DEFAULT_SIMULATION_SEED),
    simSpeedMultiplier: 1 as const,
  };
  const base2x = {
    ...SimulationEngine.resetToBaseline(DEFAULT_SIMULATION_SEED),
    simSpeedMultiplier: 2 as const,
  };
  const base4x = {
    ...SimulationEngine.resetToBaseline(DEFAULT_SIMULATION_SEED),
    simSpeedMultiplier: 4 as const,
  };

  const after1x = SimulationEngine.advanceByWallClockDelta(base1x, 500);
  const after2x = SimulationEngine.advanceByWallClockDelta(base2x, 500);
  const after4x = SimulationEngine.advanceByWallClockDelta(base4x, 500);

  assert.equal(after1x.simTimeMs, 500);
  assert.equal(after2x.simTimeMs, 1000);
  assert.equal(after4x.simTimeMs, 2000);

  // Avatar animation clock also scales proportionally by 1x, 2x, and 4x
  const anim1x = advanceAvatarAnimClock({
    currentAnimTimeSec: 0,
    rawDeltaSec: 0.05,
    isGlobalPaused: false,
    workerStatus: 'BUSY',
    reducedMotion: false,
    simSpeedMultiplier: 1,
  });
  const anim2x = advanceAvatarAnimClock({
    currentAnimTimeSec: 0,
    rawDeltaSec: 0.05,
    isGlobalPaused: false,
    workerStatus: 'BUSY',
    reducedMotion: false,
    simSpeedMultiplier: 2,
  });
  const anim4x = advanceAvatarAnimClock({
    currentAnimTimeSec: 0,
    rawDeltaSec: 0.05,
    isGlobalPaused: false,
    workerStatus: 'BUSY',
    reducedMotion: false,
    simSpeedMultiplier: 4,
  });

  assert.equal(Number(anim1x.toFixed(4)), 0.05);
  assert.equal(Number(anim2x.toFixed(4)), 0.1);
  assert.equal(Number(anim4x.toFixed(4)), 0.2);
});

// 11. Step advances exactly the intended simulation interval.
test('11. Step control advances simulation by the exact FIXED_TICK_SIM_MS (500ms) interval', () => {
  useOfficeStore.getState().resetSimulationWithSeed(DEFAULT_SIMULATION_SEED);
  const beforeSimTime = useOfficeStore.getState().simTimeMs;
  const beforeTicks = useOfficeStore.getState().tickCount;

  // Step once while running
  useOfficeStore.getState().tickSimulation(FIXED_TICK_SIM_MS);
  assert.equal(
    useOfficeStore.getState().simTimeMs,
    beforeSimTime + FIXED_TICK_SIM_MS,
  );
  assert.equal(useOfficeStore.getState().tickCount, beforeTicks + 1);

  // Step once more
  useOfficeStore.getState().tickSimulation(FIXED_TICK_SIM_MS);
  assert.equal(
    useOfficeStore.getState().simTimeMs,
    beforeSimTime + FIXED_TICK_SIM_MS * 2,
  );
  assert.equal(useOfficeStore.getState().tickCount, beforeTicks + 2);
});

// 12. A failed GLB model displays its placeholder.
test('12. A failed or invalid GLB model URL cleanly falls back to placeholder while preserving worker avatarConfig', () => {
  ensureMinimalDomEnvironment();
  useOfficeStore.getState().resetSimulationWithSeed(DEFAULT_SIMULATION_SEED);

  const workerBefore = useOfficeStore.getState().workers.sonnet;
  const originalFallbackType = workerBefore.avatarConfig.fallbackType;
  const originalAccentColor = workerBefore.avatarConfig.accentColor;
  const originalAnimationMap = { ...workerBefore.avatarConfig.animationMap };

  // Set a failing GLB URL on sonnet and record load error
  const brokenUrl = '/models/corrupted-sonnet-rig.glb';
  useOfficeStore.getState().setWorkerModelUrl('sonnet', brokenUrl);
  useOfficeStore
    .getState()
    .recordAvatarModelError('sonnet', brokenUrl, 'HTTP 404 Not Found');

  const sonnetAfter = useOfficeStore.getState().workers.sonnet;
  const errorsMap = useOfficeStore.getState().avatarLoadErrors;

  // Resolver must switch to fallback-after-error placeholder mode
  const resolution = resolveAvatarRenderMode(
    'sonnet',
    sonnetAfter.avatarConfig,
    errorsMap,
  );
  assert.equal(resolution.mode, 'fallback-after-error');
  assert.ok(resolution.errorDetail?.includes('HTTP 404 Not Found'));

  // Preserved config assertions required by Fix B
  assert.equal(sonnetAfter.avatarConfig.fallbackType, originalFallbackType);
  assert.equal(sonnetAfter.avatarConfig.accentColor, originalAccentColor);
  assert.equal(sonnetAfter.avatarConfig.modelUrl, brokenUrl);
  assert.deepEqual(sonnetAfter.avatarConfig.animationMap, originalAnimationMap);
});

// 13. One avatar failure does not crash other avatars or the scene.
test('13. AvatarModelErrorBoundary isolates a throwing GLB child so sibling avatars and scene remain mounted', () => {
  ensureMinimalDomEnvironment();

  const capturedErrors: Array<{ workerId: string; url: string; msg: string }> =
    [];
  const ThrowingGlbChild = (): React.ReactElement => {
    throw new Error('Failed to parse GLB binary header');
  };

  const container = document.createElement('div');
  const root = createRoot(container);

  // Silence React's expected error boundary console output during the test
  const origConsoleError = console.error;
  const origConsoleWarn = console.warn;
  console.error = () => {};
  console.warn = () => {};
  try {
    flushSync(() => {
      root.render(
        React.createElement(
          'div',
          { id: 'scene-root' },
          React.createElement(
            AvatarModelErrorBoundary,
            {
              workerId: 'sonnet',
              workerName: 'Claude Sonnet Worker',
              modelUrl: '/models/broken-sonnet.glb',
              fallback: React.createElement(
                'span',
                { id: 'sonnet-fallback' },
                'SONNET_PLACEHOLDER_HUMANOID',
              ),
              onModelError: (wid, url, errMsg) => {
                capturedErrors.push({
                  workerId: wid,
                  url,
                  msg: errMsg,
                });
              },
              children: React.createElement(ThrowingGlbChild),
            },
          ),
          React.createElement(
            AvatarModelErrorBoundary,
            {
              workerId: 'opus',
              workerName: 'Claude Opus Analyst',
              modelUrl: '/models/valid-opus.glb',
              fallback: React.createElement(
                'span',
                { id: 'opus-fallback' },
                'OPUS_PLACEHOLDER_HUMANOID',
              ),
              children: React.createElement(
                'span',
                { id: 'opus-glb' },
                'OPUS_GLB_MOUNTED',
              ),
            },
          ),
        ),
      );
    });
  } finally {
    console.error = origConsoleError;
    console.warn = origConsoleWarn;
  }

  // Sonnet caught the error once and rendered its fallback; Opus remained mounted
  assert.equal(capturedErrors.length, 1);
  assert.equal(capturedErrors[0].workerId, 'sonnet');
  assert.ok(capturedErrors[0].msg.includes('Failed to parse GLB'));

  const renderedText = collectDomTextAndIds(container as unknown as MockDomNode);
  assert.ok(
    renderedText.includes('SONNET_PLACEHOLDER_HUMANOID'),
    'Failed avatar must render its placeholder fallback',
  );
  assert.ok(
    renderedText.includes('OPUS_GLB_MOUNTED'),
    'Sibling avatar Opus must remain mounted without crashing',
  );

  flushSync(() => {
    root.unmount();
  });
});

// 14. Updating one worker does not unnecessarily rerender every worker component.
test('14. Updating one worker state re-renders only that worker component while the other 6 workers have 0 re-renders', () => {
  ensureMinimalDomEnvironment();
  useOfficeStore.getState().resetSimulationWithSeed(DEFAULT_SIMULATION_SEED);
  resetWorkerRenderCounts();

  const workerIds = useOfficeStore.getState().workerOrder;

  const container = document.createElement('div');
  const root = createRoot(container);

  flushSync(() => {
    root.render(
      React.createElement(
        'div',
        null,
        ...workerIds.map((wid) =>
          React.createElement(RosterWorkerItem, {
            key: `roster-${wid}`,
            workerId: wid,
          }),
        ),
        ...workerIds.map((wid) =>
          React.createElement(WorldWorkerBadgeItem, {
            key: `badge-${wid}`,
            workerId: wid,
          }),
        ),
      ),
    );
  });

  // Verify initial mount rendered each worker item once
  for (const wid of workerIds) {
    assert.equal(getWorkerComponentRenderCount(wid, 'roster'), 1);
    assert.equal(getWorkerComponentRenderCount(wid, 'badge'), 1);
  }

  // Reset profiler counters right before mutating ONLY 'sonnet'
  resetWorkerRenderCounts();

  flushSync(() => {
    useOfficeStore.getState().assignMockTask({
      workerId: 'sonnet',
      title: 'Isolated Sonnet Task Assignment',
    });
  });

  // Sonnet's roster and badge items must re-render
  assert.ok(
    getWorkerComponentRenderCount('sonnet', 'roster') >= 1,
    'Updated worker sonnet roster item should re-render',
  );
  assert.ok(
    getWorkerComponentRenderCount('sonnet', 'badge') >= 1,
    'Updated worker sonnet badge item should re-render',
  );

  // All other 6 workers MUST have 0 re-renders
  const otherWorkers = workerIds.filter((w) => w !== 'sonnet');
  for (const otherId of otherWorkers) {
    assert.equal(
      getWorkerComponentRenderCount(otherId, 'roster'),
      0,
      `Unchanged worker ${otherId} roster item must NOT re-render when sonnet updates`,
    );
    assert.equal(
      getWorkerComponentRenderCount(otherId, 'badge'),
      0,
      `Unchanged worker ${otherId} world badge item must NOT re-render when sonnet updates`,
    );
  }

  flushSync(() => {
    root.unmount();
  });
});

// 15. Fix 1 Audit Regression: Unified SimulationEngine & Avatar Animation Time (Zero FPS-Drop Drift & Deterministic Reset)
test('15. Unified SimulationEngine clock drives avatar animation without FPS-drop drift and restores initialPhaseSec on Reset', () => {
  // Run A: 60Hz smooth sampling across 4000ms of simulation time
  let snapSmooth = SimulationEngine.resetToBaseline(DEFAULT_SIMULATION_SEED);
  const clockSmooth = createAvatarSimClockState('sonnet', snapSmooth);
  const expectedInitialPhase = computeWorkerInitialPhaseSec('sonnet');
  assert.equal(clockSmooth.animTimeSec, expectedInitialPhase);

  for (let tick = 0; tick < 8; tick++) {
    snapSmooth = SimulationEngine.stepSimulationTick(
      snapSmooth,
      FIXED_TICK_SIM_MS,
    );
    stepAvatarClockFromEngine(clockSmooth, snapSmooth, 'sonnet', false);
  }

  // Run B: Severe browser FPS drops (only 2 uneven render frames across the same 4000ms simulation time)
  let snapLaggy = SimulationEngine.resetToBaseline(DEFAULT_SIMULATION_SEED);
  const clockLaggy = createAvatarSimClockState('sonnet', snapLaggy);

  // Advance 3 ticks (1500ms) before first frame renders (simulating a 1.5s frame stall)
  for (let tick = 0; tick < 3; tick++) {
    snapLaggy = SimulationEngine.stepSimulationTick(
      snapLaggy,
      FIXED_TICK_SIM_MS,
    );
  }
  stepAvatarClockFromEngine(clockLaggy, snapLaggy, 'sonnet', false);

  // Advance remaining 5 ticks (2500ms) before second frame renders
  for (let tick = 0; tick < 5; tick++) {
    snapLaggy = SimulationEngine.stepSimulationTick(
      snapLaggy,
      FIXED_TICK_SIM_MS,
    );
  }
  stepAvatarClockFromEngine(clockLaggy, snapLaggy, 'sonnet', false);

  // Both must equal initialPhaseSec + 4.000s with ZERO drift
  assert.equal(snapSmooth.simTimeMs, 4000);
  assert.equal(snapLaggy.simTimeMs, 4000);
  assert.equal(
    clockSmooth.animTimeSec,
    Number((expectedInitialPhase + 4.0).toFixed(4)),
  );
  assert.equal(
    clockLaggy.animTimeSec,
    clockSmooth.animTimeSec,
    'Browser FPS drops must never cause avatar animation time to drift away from SimulationEngine time',
  );

  // Verify Worker Pause freezes ONLY sonnet's unified clock while opus continues
  const clockOpus = createAvatarSimClockState('opus', snapSmooth);
  snapSmooth = SimulationEngine.pauseWorker(snapSmooth, 'sonnet');
  const sonnetFrozenTime = clockSmooth.animTimeSec;
  const opusBeforeTime = clockOpus.animTimeSec;

  snapSmooth = SimulationEngine.stepSimulationTick(
    snapSmooth,
    FIXED_TICK_SIM_MS,
  );
  stepAvatarClockFromEngine(clockSmooth, snapSmooth, 'sonnet', false);
  stepAvatarClockFromEngine(clockOpus, snapSmooth, 'opus', false);

  assert.equal(
    clockSmooth.animTimeSec,
    sonnetFrozenTime,
    'Paused worker sonnet animation clock must freeze',
  );
  assert.equal(
    clockOpus.animTimeSec,
    Number((opusBeforeTime + 0.5).toFixed(4)),
    'Unpaused worker opus animation clock must advance by +0.5s',
  );

  // Resume sonnet -> continues from sonnetFrozenTime without jumping over paused interval
  snapSmooth = SimulationEngine.resumeWorker(snapSmooth, 'sonnet');
  snapSmooth = SimulationEngine.stepSimulationTick(
    snapSmooth,
    FIXED_TICK_SIM_MS,
  );
  stepAvatarClockFromEngine(clockSmooth, snapSmooth, 'sonnet', false);
  assert.equal(
    clockSmooth.animTimeSec,
    Number((sonnetFrozenTime + 0.5).toFixed(4)),
  );

  // Reset -> restores deterministic initialPhaseSec
  const snapReset = SimulationEngine.resetToBaseline(DEFAULT_SIMULATION_SEED);
  const resetResult = stepAvatarClockFromEngine(
    clockSmooth,
    snapReset,
    'sonnet',
    false,
  );
  assert.equal(resetResult.didReset, true);
  assert.equal(clockSmooth.animTimeSec, expectedInitialPhase);
});

// 16. Fix 2 Audit Regression: Real Three.js AnimationMixer Integration (No Extra Update on Pause, Smooth Resume, Isolated Worker Pause, No Action Restarts)
test('16. GlbAvatarAnimationController with real THREE.AnimationMixer stops without extra update on Global Pause, isolates Worker Pause, and avoids action restarts', () => {
  // Build two real Three.js hierarchies with keyframe-animated child bone nodes
  const sonnetRoot = new THREE.Group();
  sonnetRoot.name = 'SonnetRig';
  const opencvTrackTyping = new THREE.VectorKeyframeTrack(
    '.position',
    [0, 10],
    [0, 0, 0, 10, 0, 0], // x moves linearly 1.0 unit per second
  );
  const clipTyping = new THREE.AnimationClip('Seated_Typing', 10, [
    opencvTrackTyping,
  ]);
  const clipWalking = new THREE.AnimationClip('Walk_Forward', 10, [
    new THREE.VectorKeyframeTrack('.position', [0, 10], [0, 0, 0, 0, 10, 0]),
  ]);
  const clipSeated = new THREE.AnimationClip('Seated_Idle', 10, [
    new THREE.VectorKeyframeTrack('.position', [0, 10], [0, 0, 0, 5, 0, 0]),
  ]);

  const opusRoot = new THREE.Group();
  opusRoot.name = 'OpusRig';

  const sonnetController = new GlbAvatarAnimationController(sonnetRoot, [
    clipTyping,
    clipWalking,
    clipSeated,
  ]);
  const opusController = new GlbAvatarAnimationController(opusRoot, [
    clipTyping,
    clipWalking,
    clipSeated,
  ]);

  let snapshot = SimulationEngine.resetToBaseline(DEFAULT_SIMULATION_SEED);
  snapshot = WorkerMockService.assignTask(snapshot, { workerId: 'sonnet' }, 0);
  snapshot = WorkerMockService.assignTask(snapshot, { workerId: 'opus' }, 0);

  const sonnetClock = createAvatarSimClockState('sonnet', snapshot);
  const opusClock = createAvatarSimClockState('opus', snapshot);

  // Sync initial clips -> actionStartCount becomes 1
  sonnetController.syncClip(
    'typing',
    snapshot.workers.sonnet.avatarConfig.animationMap,
  );
  opusController.syncClip(
    'typing',
    snapshot.workers.opus.avatarConfig.animationMap,
  );
  assert.equal(sonnetController.actionStartCount, 1);
  assert.equal(sonnetController.getActiveClipName(), 'Seated_Typing');

  // 1. Advance 2 simulation ticks at 1x (1000ms = 1.0s)
  snapshot = SimulationEngine.stepSimulationTick(snapshot, FIXED_TICK_SIM_MS);
  sonnetController.stepFromSimulation(sonnetClock, snapshot, 'sonnet', false);
  opusController.stepFromSimulation(opusClock, snapshot, 'opus', false);

  snapshot = SimulationEngine.stepSimulationTick(snapshot, FIXED_TICK_SIM_MS);
  sonnetController.stepFromSimulation(sonnetClock, snapshot, 'sonnet', false);
  opusController.stepFromSimulation(opusClock, snapshot, 'opus', false);

  assert.equal(sonnetController.updateCallCount, 2);
  assert.equal(Number(sonnetController.mixer.time.toFixed(4)), 1.0);
  assert.ok(
    sonnetRoot.position.x > 0.9,
    'Real THREE.AnimationMixer must interpolate bone position.x keyframe track',
  );

  // 2. Global Pause: must stop GLB mixer with ZERO extra unintended mixer.update calls
  snapshot = SimulationEngine.setGlobalPaused(snapshot, true);
  const updatesBeforePauseFrames = sonnetController.updateCallCount;
  const mixerTimeAtPause = sonnetController.mixer.time;
  const boneXAtPause = sonnetRoot.position.x;

  for (let frame = 0; frame < 30; frame++) {
    sonnetController.syncClip(
      'typing',
      snapshot.workers.sonnet.avatarConfig.animationMap,
    );
    sonnetController.stepFromSimulation(sonnetClock, snapshot, 'sonnet', false);
  }

  assert.equal(
    sonnetController.updateCallCount,
    updatesBeforePauseFrames,
    'Global Pause must not trigger even a single extra mixer.update()',
  );
  assert.equal(sonnetController.mixer.time, mixerTimeAtPause);
  assert.equal(sonnetRoot.position.x, boneXAtPause);
  assert.equal(
    sonnetController.actionStartCount,
    1,
    'Global Pause must not restart the AnimationAction',
  );

  // 3. Global Resume: restarts smoothly from exact previous mixer.time without restarting action
  snapshot = SimulationEngine.setGlobalPaused(snapshot, false);
  snapshot = SimulationEngine.stepSimulationTick(snapshot, FIXED_TICK_SIM_MS);
  sonnetController.syncClip(
    'typing',
    snapshot.workers.sonnet.avatarConfig.animationMap,
  );
  sonnetController.stepFromSimulation(sonnetClock, snapshot, 'sonnet', false);
  opusController.stepFromSimulation(opusClock, snapshot, 'opus', false);

  assert.equal(Number(sonnetController.mixer.time.toFixed(4)), 1.5);
  assert.equal(
    sonnetController.actionStartCount,
    1,
    'Global Resume must not restart the running AnimationAction',
  );

  // 4. Isolated Worker Pause: pausing sonnet freezes sonnet's mixer while opus's mixer advances
  snapshot = SimulationEngine.pauseWorker(snapshot, 'sonnet');
  const sonnetMixerTimePaused = sonnetController.mixer.time;
  const opusMixerTimeBefore = opusController.mixer.time;

  snapshot = SimulationEngine.stepSimulationTick(snapshot, FIXED_TICK_SIM_MS);
  sonnetController.stepFromSimulation(sonnetClock, snapshot, 'sonnet', false);
  opusController.stepFromSimulation(opusClock, snapshot, 'opus', false);

  assert.equal(
    sonnetController.mixer.time,
    sonnetMixerTimePaused,
    'Paused worker sonnet GLB mixer must remain frozen',
  );
  assert.equal(
    Number(opusController.mixer.time.toFixed(4)),
    Number((opusMixerTimeBefore + 0.5).toFixed(4)),
    'Unpaused worker opus GLB mixer must advance by +0.5s',
  );

  // Resume sonnet -> continues smoothly from sonnetMixerTimePaused without action restart
  snapshot = SimulationEngine.resumeWorker(snapshot, 'sonnet');
  snapshot = SimulationEngine.stepSimulationTick(snapshot, FIXED_TICK_SIM_MS);
  sonnetController.syncClip(
    'typing',
    snapshot.workers.sonnet.avatarConfig.animationMap,
  );
  sonnetController.stepFromSimulation(sonnetClock, snapshot, 'sonnet', false);

  assert.equal(
    Number(sonnetController.mixer.time.toFixed(4)),
    Number((sonnetMixerTimePaused + 0.5).toFixed(4)),
  );
  assert.equal(sonnetController.actionStartCount, 1);

  // 5. Speed multiplier 4x scales GLB mixer advancement consistently
  snapshot = { ...snapshot, simSpeedMultiplier: 4 };
  snapshot = SimulationEngine.advanceByWallClockDelta(snapshot, 500); // +2000ms = +2.0s at 4x
  sonnetController.stepFromSimulation(sonnetClock, snapshot, 'sonnet', false);
  assert.equal(
    Number(sonnetController.mixer.time.toFixed(4)),
    Number((sonnetMixerTimePaused + 2.5).toFixed(4)),
  );

  // 6. Changing animationState ('typing' -> 'walking') transitions clip cleanly
  sonnetController.syncClip(
    'walking',
    snapshot.workers.sonnet.avatarConfig.animationMap,
  );
  assert.equal(sonnetController.getActiveClipName(), 'Walk_Forward');
  assert.equal(sonnetController.actionStartCount, 2);

  // 7. Reset restores mixer.time to 0 deterministically
  snapshot = SimulationEngine.resetToBaseline(DEFAULT_SIMULATION_SEED);
  sonnetController.stepFromSimulation(sonnetClock, snapshot, 'sonnet', false);
  assert.equal(sonnetController.mixer.time, 0);

  sonnetController.dispose();
  opusController.dispose();
});

// 17. ActivityEvent ID uniqueness regression: no duplicate event keys when log exceeds MAX_EVENT_LOG_LENGTH (80)
test('17. ActivityEvent IDs remain strictly unique across concurrent same-tick events after exceeding MAX_EVENT_LOG_LENGTH (80)', () => {
  let snapshot = SimulationEngine.createInitialSnapshot(DEFAULT_SIMULATION_SEED);

  // Run 250 ticks with fractional wall-clock deltas and multiple concurrent tasks so events cap at 80
  for (let i = 0; i < 250; i++) {
    snapshot = SimulationEngine.advanceByWallClockDelta(snapshot, 500.3);
    if (i % 10 === 0) {
      snapshot = WorkerMockService.assignTask(snapshot, { workerId: 'haiku' });
      snapshot = WorkerMockService.assignTask(snapshot, { workerId: 'sonnet' });
    }
    const ids = snapshot.events.map((e) => e.id);
    const uniqueIds = new Set(ids);
    assert.equal(
      uniqueIds.size,
      ids.length,
      `Duplicate ActivityEvent ID detected at step ${i}: ${ids.join(', ')}`,
    );
  }
  assert.equal(snapshot.events.length, 80);
});
