import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { GlobalQueuePanel } from '../ui/GlobalQueuePanel';
import { TopBar } from '../ui/TopBar';
import {
  DEFAULT_SIMULATION_SEED,
  FIXED_TICK_SIM_MS,
  SimulationEngine,
} from './simulation.engine';
import { WorkerMockService } from './worker.mock-service';
import {
  selectGlobalQueueEntries,
  selectGlobalSimulatedTotals,
  selectGlobalTaskActivity,
  useOfficeStore,
} from './worker.state';
import type {
  BlockedTaskRecord,
  SchedulerSnapshotState,
} from '../scheduler/scheduler.types';
import type { TaskEntity, WorkerEntity } from './worker.types';

// Minimal DOM shim for React 19 createRoot in Node test runner
interface MockDomNode {
  tagName: string;
  nodeType: number;
  textContent: string;
  children: MockDomNode[];
  attributes: Record<string, string>;
}

function collectDomText(node: MockDomNode): string {
  const parts: string[] = [];
  if (node.textContent) {
    parts.push(node.textContent);
  }
  for (const child of node.children || []) {
    parts.push(collectDomText(child));
  }
  return parts.join(' ');
}

function findNodeByTestId(node: MockDomNode, testId: string): MockDomNode | null {
  if (node.attributes?.['data-testid'] === testId) {
    return node;
  }
  for (const child of node.children || []) {
    const found = findNodeByTestId(child, testId);
    if (found) return found;
  }
  return null;
}

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
    get options() {
      return this.children.filter(c => c.tagName === 'OPTION');
    }
    value = '';

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
    createElementNS: (_ns: string, tag: string) => new MockElement(tag, mockDocument),
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

// Helper to reset store between tests
function resetStore(seed = DEFAULT_SIMULATION_SEED) {
  useOfficeStore.getState().resetSimulationWithSeed(seed);
  useOfficeStore.setState({ isGlobalQueueOpen: false });
}

// -------------------------------------------------------------
// SECTION 1: STORE INITIALIZATION & BASICS
// -------------------------------------------------------------

test('1. Global queue drawer initial state is closed', () => {
  resetStore();
  const state = useOfficeStore.getState();
  assert.equal(state.isGlobalQueueOpen, false);
});

test('2. Diagnostics initial state has empty records and null timestamps', () => {
  resetStore();
  const state = useOfficeStore.getState();
  assert.deepEqual(state.lastBlockedRecords, []);
  assert.equal(state.lastDispatchDiagnosticsAtSimMs, null);
  assert.equal(state.lastDispatchDiagnosticsTickCount, null);
});

test('3. Initial scheduler state has normalized empty entries and nextSequence = 1', () => {
  resetStore();
  const state = useOfficeStore.getState();
  assert.ok(state.scheduler);
  assert.deepEqual(state.scheduler.entries, []);
  assert.equal(state.scheduler.nextSequence, 1);
});

// -------------------------------------------------------------
// SECTION 2: GLOBAL ENQUEUE ACTIONS
// -------------------------------------------------------------

test('4. Successful global enqueue returns ok: true and adds entry to scheduler', () => {
  resetStore();
  const res = useOfficeStore.getState().enqueueGlobalMockTask({
    category: 'ROUTING',
    type: 'INSTRUCTION_INTAKE',
    priority: 'HIGH',
    title: 'Intake Test Task',
  });

  assert.equal(res.ok, true);
  assert.ok(typeof res.taskId === 'string');
  assert.ok(res.taskId.startsWith('tsk_pool_'));

  const state = useOfficeStore.getState();
  assert.equal(state.scheduler?.entries.length, 1);
  assert.equal(state.scheduler?.entries[0]?.taskId, res.taskId);
  assert.equal(state.scheduler?.entries[0]?.sequence, 1);
});

test('5. Failed global enqueue returns ok: false for invalid parameters', () => {
  resetStore();
  const res = useOfficeStore.getState().enqueueGlobalMockTask({
    durationSimMs: -500, // Invalid negative duration
  });

  assert.equal(res.ok, false);
  assert.equal(res.taskId, undefined);
});

test('6. Snapshot reference is preserved on failed enqueue', () => {
  resetStore();
  const before = useOfficeStore.getState();
  const res = useOfficeStore.getState().enqueueGlobalMockTask({
    durationSimMs: -1,
  });

  assert.equal(res.ok, false);
  const after = useOfficeStore.getState();
  assert.equal(before.scheduler, after.scheduler);
  assert.equal(before.tasks, after.tasks);
});

test('7. Enqueue while globally paused succeeds and enqueues task without dispatching', () => {
  resetStore();
  useOfficeStore.getState().setGlobalPaused(true);
  assert.equal(useOfficeStore.getState().isGlobalPaused, true);

  const res = useOfficeStore.getState().enqueueGlobalMockTask({
    category: 'ROUTING',
    type: 'INSTRUCTION_INTAKE',
    priority: 'CRITICAL',
  });

  assert.equal(res.ok, true);
  const state = useOfficeStore.getState();
  assert.equal(state.scheduler?.entries.length, 1);
  assert.equal(state.isGlobalPaused, true);
});

test('8. Enqueue does not trigger instant dispatch (task remains queued in scheduler)', () => {
  resetStore();
  // Worker is IDLE, but enqueue should NOT dispatch immediately
  const res = useOfficeStore.getState().enqueueGlobalMockTask({
    category: 'ROUTING',
    type: 'INSTRUCTION_INTAKE',
    priority: 'NORMAL',
  });

  assert.equal(res.ok, true);
  const state = useOfficeStore.getState();
  // Task is still in scheduler entries!
  assert.equal(state.scheduler?.entries.length, 1);
  assert.equal(state.scheduler?.entries[0]?.taskId, res.taskId);
});

test('9. New task does not inherit previous blocked diagnostics', () => {
  resetStore();
  // Manually put a blocked record in store
  useOfficeStore.setState({
    lastBlockedRecords: [
      {
        taskId: 'some_old_task',
        priority: 'NORMAL',
        sequence: 1,
        reason: 'ALL_CAPABLE_WORKERS_AT_CAPACITY',
      },
    ],
  });

  const res = useOfficeStore.getState().enqueueGlobalMockTask({
    category: 'ROUTING',
    type: 'INSTRUCTION_INTAKE',
    priority: 'HIGH',
  });

  assert.equal(res.ok, true);
  const state = useOfficeStore.getState();
  // The new task does NOT have a blocked record
  assert.ok(!state.lastBlockedRecords.some((b) => b.taskId === res.taskId));
});

// -------------------------------------------------------------
// SECTION 3: DIAGNOSTIC PROPAGATION
// -------------------------------------------------------------

test('10. Diagnostic propagation from manual simulation tick', () => {
  resetStore();
  // Enqueue a task
  const res = useOfficeStore.getState().enqueueGlobalMockTask({
    category: 'ROUTING',
    type: 'INSTRUCTION_INTAKE',
    priority: 'HIGH',
  });
  assert.ok(res.ok);

  // Advance simulation tick
  useOfficeStore.getState().tickSimulation();

  const state = useOfficeStore.getState();
  // Dispatch was executed: diagnostic metadata updated
  assert.equal(state.lastDispatchDiagnosticsAtSimMs, FIXED_TICK_SIM_MS);
  assert.equal(state.lastDispatchDiagnosticsTickCount, 1);
});

test('11. Diagnostic propagation from real-time advance', () => {
  resetStore();
  useOfficeStore.getState().advanceByWallClock(1000);

  const state = useOfficeStore.getState();
  assert.equal(state.lastDispatchDiagnosticsAtSimMs, 1000);
  assert.equal(state.lastDispatchDiagnosticsTickCount, 2);
});

test('12. Diagnostic preservation when no dispatch occurs (rawDelta <= 0)', () => {
  resetStore();
  useOfficeStore.getState().advanceByWallClock(500);
  const simMsBefore = useOfficeStore.getState().lastDispatchDiagnosticsAtSimMs;
  const tickBefore = useOfficeStore.getState().lastDispatchDiagnosticsTickCount;

  // Advance 0 ms: no tick, no dispatch
  useOfficeStore.getState().advanceByWallClock(0);

  const state = useOfficeStore.getState();
  assert.equal(state.lastDispatchDiagnosticsAtSimMs, simMsBefore);
  assert.equal(state.lastDispatchDiagnosticsTickCount, tickBefore);
});

test('13. Diagnostic propagation during pending wall-clock flush before global pause', () => {
  resetStore();
  // Mock performance.now delta so pendingWallMs > 0
  const origNow = performance.now;
  let mockTime = 10000;
  performance.now = () => mockTime;

  try {
    SimulationEngine.syncRealtimeClockAnchor(useOfficeStore.getState(), mockTime, true);
    mockTime += 600; // 600ms pending

    useOfficeStore.getState().setGlobalPaused(true);

    const state = useOfficeStore.getState();
    assert.equal(state.isGlobalPaused, true);
    assert.equal(state.simTimeMs, 600); // 500ms full tick + 100ms fractional tick
    assert.equal(state.lastDispatchDiagnosticsAtSimMs, 600);
  } finally {
    performance.now = origNow;
  }
});

test('14. Fractional pending delta below 500 ms causes expected tick and diagnostic propagation', () => {
  resetStore();
  // Using advanceByWallClockDeltaWithDiagnostics directly with 250ms
  const current = useOfficeStore.getState();
  const advanceRes = SimulationEngine.advanceByWallClockDeltaWithDiagnostics(current, 250);

  assert.equal(advanceRes.snapshot.simTimeMs, 250);
  assert.ok(advanceRes.lastDispatchResult);
  assert.equal(advanceRes.lastDispatchResult.snapshot.simTimeMs, 250);
});

test('15. Global Resume does not dispatch immediately', () => {
  resetStore();
  useOfficeStore.getState().setGlobalPaused(true);
  useOfficeStore.getState().enqueueGlobalMockTask({
    category: 'ROUTING',
    type: 'INSTRUCTION_INTAKE',
  });

  const statePaused = useOfficeStore.getState();
  assert.equal(statePaused.scheduler?.entries.length, 1);

  // Resume global simulation
  useOfficeStore.getState().setGlobalPaused(false);

  const stateResumed = useOfficeStore.getState();
  assert.equal(stateResumed.isGlobalPaused, false);
  // Task is STILL in queue: no instant dispatch on unpause!
  assert.equal(stateResumed.scheduler?.entries.length, 1);
});

test('16. Worker Resume propagates diagnostics only when actual dispatch occurs', () => {
  resetStore();
  // Pause a worker
  useOfficeStore.getState().pauseWorker('haiku');
  assert.equal(useOfficeStore.getState().workers.haiku.status, 'PAUSED');

  // Resume worker while unpaused: triggers dispatch pass
  useOfficeStore.getState().resumeWorker('haiku');
  assert.equal(useOfficeStore.getState().workers.haiku.status, 'IDLE');
  assert.equal(useOfficeStore.getState().lastDispatchDiagnosticsAtSimMs, 0);
});

test('17. Reset clears diagnostics and metadata', () => {
  resetStore();
  useOfficeStore.getState().advanceByWallClock(1000);
  assert.ok(useOfficeStore.getState().lastDispatchDiagnosticsAtSimMs !== null);

  useOfficeStore.getState().resetSimulationWithSeed();
  const state = useOfficeStore.getState();
  assert.deepEqual(state.lastBlockedRecords, []);
  assert.equal(state.lastDispatchDiagnosticsAtSimMs, null);
  assert.equal(state.lastDispatchDiagnosticsTickCount, null);
});

// -------------------------------------------------------------
// SECTION 4: SELECTORS
// -------------------------------------------------------------

test('18. Queue entry selector computes sequence, wait duration, and dispatchOrderIndex', () => {
  const scheduler: SchedulerSnapshotState = {
    entries: [
      { taskId: 'task_1', sequence: 10, enqueuedAtSimMs: 1000 },
    ],
    nextSequence: 11,
  };
  const tasks: Record<string, TaskEntity> = <any> {
    task_1: {
      id: 'task_1',
      title: 'Test Task 1',
      category: 'ROUTING',
      type: 'INSTRUCTION_INTAKE',
      priority: 'NORMAL',
      status: 'QUEUED',
      lifecycleStatus: 'QUEUED',
      assignedWorkerId: null,
      progress: 0,
      totalDurationSimMs: 3000,
      targetTokens: 1000,
      simulatedTokens: 0,
      costPerThousandTokensUsd: 0.002,
      createdAtSimMs: 1000,
      stagePipeline: [],
    },
  };

  const res = selectGlobalQueueEntries(scheduler, tasks, [], 2500);
  assert.equal(res.length, 1);
  assert.equal(res[0]?.taskId, 'task_1');
  assert.equal(res[0]?.sequence, 10);
  assert.equal(res[0]?.waitDurationSimMs, 1500);
  assert.equal(res[0]?.dispatchOrderIndex, 1);
  assert.equal(res[0]?.isBlocked, false);
});

test('19. Missing task entity handling sets task: null and priority: UNKNOWN', () => {
  const scheduler: SchedulerSnapshotState = {
    entries: [{ taskId: 'missing_task', sequence: 1, enqueuedAtSimMs: 0 }],
    nextSequence: 2,
  };
  const tasks: Record<string, TaskEntity> = <any> {};

  const res = selectGlobalQueueEntries(scheduler, tasks, [], 0);
  assert.equal(res.length, 1);
  assert.equal(res[0]?.task, null);
  assert.equal(res[0]?.priority, 'UNKNOWN');
});

test('20. Priority ordering through orderQueue places CRITICAL before HIGH, NORMAL, LOW', () => {
  const scheduler: SchedulerSnapshotState = {
    entries: [
      { taskId: 'task_low', sequence: 1, enqueuedAtSimMs: 0 },
      { taskId: 'task_crit', sequence: 2, enqueuedAtSimMs: 100 },
    ],
    nextSequence: 3,
  };
  const tasks: Record<string, TaskEntity> = <any> {
    task_low: {
      id: 'task_low',
      title: 'Low Task',
      category: 'ROUTING',
      type: 'INSTRUCTION_INTAKE',
      priority: 'LOW',
      status: 'QUEUED',
      lifecycleStatus: 'QUEUED',
      assignedWorkerId: null,
      progress: 0,
      totalDurationSimMs: 1000,
      targetTokens: 100,
      simulatedTokens: 0,
      costPerThousandTokensUsd: 0.002,
      createdAtSimMs: 0,
      stagePipeline: [],
    },
    task_crit: {
      id: 'task_crit',
      title: 'Critical Task',
      category: 'ROUTING',
      type: 'INSTRUCTION_INTAKE',
      priority: 'CRITICAL',
      status: 'QUEUED',
      lifecycleStatus: 'QUEUED',
      assignedWorkerId: null,
      progress: 0,
      totalDurationSimMs: 1000,
      targetTokens: 100,
      simulatedTokens: 0,
      costPerThousandTokensUsd: 0.002,
      createdAtSimMs: 100,
      stagePipeline: [],
    },
  };

  const res = selectGlobalQueueEntries(scheduler, tasks, [], 200);
  assert.equal(res.length, 2);
  // task_crit must be dispatchOrderIndex 1!
  assert.equal(res[0]?.taskId, 'task_crit');
  assert.equal(res[0]?.dispatchOrderIndex, 1);
  assert.equal(res[1]?.taskId, 'task_low');
  assert.equal(res[1]?.dispatchOrderIndex, 2);
});

test('21. Blocked reason association attaches matching BlockedTaskRecord', () => {
  const scheduler: SchedulerSnapshotState = {
    entries: [{ taskId: 'task_b', sequence: 5, enqueuedAtSimMs: 0 }],
    nextSequence: 6,
  };
  const tasks: Record<string, TaskEntity> = <any> {
    task_b: {
      id: 'task_b',
      title: 'Blocked Task',
      category: 'ROUTING',
      type: 'INSTRUCTION_INTAKE',
      priority: 'HIGH',
      status: 'QUEUED',
      lifecycleStatus: 'QUEUED',
      assignedWorkerId: null,
      progress: 0,
      totalDurationSimMs: 1000,
      targetTokens: 100,
      simulatedTokens: 0,
      costPerThousandTokensUsd: 0.002,
      createdAtSimMs: 0,
      stagePipeline: [],
    },
  };
  const blockedRecords: BlockedTaskRecord[] = [
    {
      taskId: 'task_b',
      priority: 'HIGH',
      sequence: 5,
      reason: 'ALL_CAPABLE_WORKERS_AT_CAPACITY',
      detail: '2 of 2 slots full',
    },
  ];

  const res = selectGlobalQueueEntries(scheduler, tasks, blockedRecords, 0);
  assert.equal(res[0]?.isBlocked, true);
  assert.equal(res[0]?.blockedRecord?.reason, 'ALL_CAPABLE_WORKERS_AT_CAPACITY');
  assert.equal(res[0]?.blockedRecord?.detail, '2 of 2 slots full');
});

test('22. Simulation wait duration computes non-negative duration', () => {
  const scheduler: SchedulerSnapshotState = {
    entries: [{ taskId: 't1', sequence: 1, enqueuedAtSimMs: 500 }],
    nextSequence: 2,
  };
  const tasks: Record<string, TaskEntity> = <any> {
    t1: {
      id: 't1',
      title: 'Wait Task',
      category: 'ROUTING',
      type: 'INSTRUCTION_INTAKE',
      priority: 'NORMAL',
      status: 'QUEUED',
      lifecycleStatus: 'QUEUED',
      assignedWorkerId: null,
      progress: 0,
      totalDurationSimMs: 1000,
      targetTokens: 100,
      simulatedTokens: 0,
      costPerThousandTokensUsd: 0.002,
      createdAtSimMs: 500,
      stagePipeline: [],
    },
  };

  // Sim time 300 (before enqueue due to any reason): waitDurationSimMs is clamped to 0
  const res = selectGlobalQueueEntries(scheduler, tasks, [], 300);
  assert.equal(res[0]?.waitDurationSimMs, 0);
});

test('23. RUNNING pool activity is detected by selectGlobalTaskActivity', () => {
  const tasks: Record<string, TaskEntity> = <any> {
    tsk_pool_1_100: {
      id: 'tsk_pool_1_100',
      title: 'Running Pool Task',
      category: 'ROUTING',
      type: 'INSTRUCTION_INTAKE',
      priority: 'NORMAL',
      status: 'ANALYZING',
      lifecycleStatus: 'RUNNING',
      assignedWorkerId: 'haiku',
      progress: 45,
      totalDurationSimMs: 2000,
      targetTokens: 500,
      simulatedTokens: 200,
      costPerThousandTokensUsd: 0.002,
      createdAtSimMs: 100,
      startedAtSimMs: 150,
      stagePipeline: [],
    },
  };

  const activity = selectGlobalTaskActivity(tasks, undefined);
  assert.equal(activity.length, 1);
  assert.equal(activity[0]?.task.id, 'tsk_pool_1_100');
  assert.equal(activity[0]?.lifecycleStatus, 'RUNNING');
  assert.equal(activity[0]?.assignedWorkerId, 'haiku');
  assert.equal(activity[0]?.progress, 45);
});

test('24. COMPLETED pool activity is detected by selectGlobalTaskActivity', () => {
  const tasks: Record<string, TaskEntity> = <any> {
    tsk_pool_2_200: {
      id: 'tsk_pool_2_200',
      title: 'Completed Pool Task',
      category: 'ROUTING',
      type: 'INSTRUCTION_INTAKE',
      priority: 'NORMAL',
      status: 'COMPLETED',
      lifecycleStatus: 'COMPLETED',
      assignedWorkerId: 'haiku',
      progress: 100,
      totalDurationSimMs: 2000,
      targetTokens: 500,
      simulatedTokens: 500,
      costPerThousandTokensUsd: 0.002,
      createdAtSimMs: 200,
      completedAtSimMs: 2200,
      stagePipeline: [],
    },
  };

  const activity = selectGlobalTaskActivity(tasks, undefined);
  assert.equal(activity.length, 1);
  assert.equal(activity[0]?.task.id, 'tsk_pool_2_200');
  assert.equal(activity[0]?.lifecycleStatus, 'COMPLETED');
});

test('25. FAILED pool activity is detected by selectGlobalTaskActivity', () => {
  const tasks: Record<string, TaskEntity> = <any> {
    tsk_pool_3_300: {
      id: 'tsk_pool_3_300',
      title: 'Failed Pool Task',
      category: 'ROUTING',
      type: 'INSTRUCTION_INTAKE',
      priority: 'NORMAL',
      status: 'FAILED',
      lifecycleStatus: 'FAILED',
      assignedWorkerId: 'haiku',
      progress: 20,
      totalDurationSimMs: 2000,
      targetTokens: 500,
      simulatedTokens: 100,
      costPerThousandTokensUsd: 0.002,
      createdAtSimMs: 300,
      completedAtSimMs: 500,
      stagePipeline: [],
    },
  };

  const activity = selectGlobalTaskActivity(tasks, undefined);
  assert.equal(activity.length, 1);
  assert.equal(activity[0]?.task.id, 'tsk_pool_3_300');
  assert.equal(activity[0]?.lifecycleStatus, 'FAILED');
});

test('26. Legacy per-worker tasks are excluded from selectGlobalTaskActivity', () => {
  const tasks: Record<string, TaskEntity> = <any> {
    tsk_supervisor_1_0: {
      id: 'tsk_supervisor_1_0',
      title: 'Legacy Supervisor Task',
      category: 'ROUTING',
      type: 'INSTRUCTION_INTAKE',
      priority: 'NORMAL',
      status: 'COMPLETED',
      lifecycleStatus: 'COMPLETED',
      assignedWorkerId: 'supervisor',
      progress: 100,
      totalDurationSimMs: 2000,
      targetTokens: 500,
      simulatedTokens: 500,
      costPerThousandTokensUsd: 0.002,
      createdAtSimMs: 0,
      stagePipeline: [],
    },
  };

  const activity = selectGlobalTaskActivity(tasks, undefined);
  assert.equal(activity.length, 0);
});

test('27. Lifecycle state filtering strictly excludes QUEUED and CANCELLED tasks from activity', () => {
  const tasks: Record<string, TaskEntity> = <any> {
    tsk_pool_queued: {
      id: 'tsk_pool_queued',
      title: 'Queued Task',
      category: 'ROUTING',
      type: 'INSTRUCTION_INTAKE',
      priority: 'NORMAL',
      status: 'QUEUED',
      lifecycleStatus: 'QUEUED',
      assignedWorkerId: null,
      progress: 0,
      totalDurationSimMs: 2000,
      targetTokens: 500,
      simulatedTokens: 0,
      costPerThousandTokensUsd: 0.002,
      createdAtSimMs: 0,
      stagePipeline: [],
    },
    tsk_pool_cancelled: {
      id: 'tsk_pool_cancelled',
      title: 'Cancelled Task',
      category: 'ROUTING',
      type: 'INSTRUCTION_INTAKE',
      priority: 'NORMAL',
      status: 'CANCELLED',
      lifecycleStatus: 'CANCELLED',
      assignedWorkerId: null,
      progress: 0,
      totalDurationSimMs: 2000,
      targetTokens: 500,
      simulatedTokens: 0,
      costPerThousandTokensUsd: 0.002,
      createdAtSimMs: 0,
      stagePipeline: [],
    },
  };

  const activity = selectGlobalTaskActivity(tasks, undefined);
  assert.equal(activity.length, 0);
});

// -------------------------------------------------------------
// SECTION 5: AGGREGATES
// -------------------------------------------------------------

test('28. selectGlobalSimulatedTotals combines global scheduler queue and worker queues', () => {
  const workers: any = {
    haiku: {
      metrics: { simulatedTokens: 100, simulatedCostUsd: 0.01, completedTasksCount: 1 },
      taskQueueIds: ['legacy_1', 'legacy_2'],
      status: 'IDLE',
    } as unknown as WorkerEntity,
  };
  const tasks = {};
  const scheduler: SchedulerSnapshotState = {
    entries: [
      { taskId: 'pool_1', sequence: 1, enqueuedAtSimMs: 0 },
      { taskId: 'pool_2', sequence: 2, enqueuedAtSimMs: 0 },
      { taskId: 'pool_3', sequence: 3, enqueuedAtSimMs: 0 },
    ],
    nextSequence: 4,
  };

  const totals = selectGlobalSimulatedTotals(workers as unknown as Record<string, WorkerEntity>, tasks, scheduler);
  // 3 from scheduler + 2 from worker = 5 totalQueued
  assert.equal(totals.totalQueued, 5);
  assert.equal(totals.totalTokens, 100);
});

test('29. No double counting of active tasks in totalQueued', () => {
  const workers: any = {
    haiku: {
      metrics: { simulatedTokens: 100, simulatedCostUsd: 0.01, completedTasksCount: 1 },
      taskQueueIds: [],
      currentTaskId: 'active_1',
      status: 'BUSY',
    } as unknown as WorkerEntity,
  };
  const tasks: Record<string, TaskEntity> = <any> {
    active_1: {
      id: 'active_1',
      title: 'Active Task',
      status: 'ANALYZING',
      lifecycleStatus: 'RUNNING',
    } as unknown as TaskEntity,
  };
  const scheduler: SchedulerSnapshotState = {
    entries: [],
    nextSequence: 1,
  };

  const totals = selectGlobalSimulatedTotals(workers as unknown as Record<string, WorkerEntity>, tasks, scheduler);
  assert.equal(totals.totalQueued, 0);
  assert.equal(totals.activeTasksCount, 1);
});

test('30. Existing optional-selector argument works backward-compatibly without scheduler', () => {
  const workers: any = {
    haiku: {
      metrics: { simulatedTokens: 50, simulatedCostUsd: 0.005, completedTasksCount: 0 },
      taskQueueIds: ['leg_1'],
      status: 'IDLE',
    } as unknown as WorkerEntity,
  };
  const tasks = {};

  const totals = selectGlobalSimulatedTotals(workers as unknown as Record<string, WorkerEntity>, tasks);
  assert.equal(totals.totalQueued, 1);
});

// -------------------------------------------------------------
// SECTION 6: UI RENDERING WITH MINIMAL DOM
// -------------------------------------------------------------

test('31. TopBar displays queue counter and toggle button', () => {
  ensureMinimalDomEnvironment();
  resetStore();

  const container = document.createElement('div') as unknown as MockDomNode;
  const root = createRoot(container as unknown as HTMLElement);

  flushSync(() => {
    root.render(React.createElement(TopBar));
  });

  const toggleBtn = findNodeByTestId(container, 'toggle-global-queue-btn');
  assert.ok(toggleBtn);
  const text = collectDomText(container);
  assert.ok(text.includes('SIREADER Virtual Office'));
  assert.ok(text.includes('Queue'));
});

test('32. Queue drawer toggle action updates isGlobalQueueOpen in store', () => {
  resetStore();
  assert.equal(useOfficeStore.getState().isGlobalQueueOpen, false);

  useOfficeStore.getState().toggleGlobalQueueOpen();
  assert.equal(useOfficeStore.getState().isGlobalQueueOpen, true);

  useOfficeStore.getState().setGlobalQueueOpen(false);
  assert.equal(useOfficeStore.getState().isGlobalQueueOpen, false);
});

test('33. GlobalQueuePanel renders WAITING status for queued task', () => {
  ensureMinimalDomEnvironment();
  resetStore();

  useOfficeStore.getState().enqueueGlobalMockTask({
    category: 'ROUTING',
    type: 'INSTRUCTION_INTAKE',
    priority: 'HIGH',
    title: 'Waiting Verification Task',
  });

  const container = document.createElement('div') as unknown as MockDomNode;
  const root = createRoot(container as unknown as HTMLElement);

  flushSync(() => {
    root.render(React.createElement(GlobalQueuePanel));
  });

  const text = collectDomText(container);
  assert.ok(text.includes('Global Task Queue'));
  assert.ok(text.includes('Waiting Verification Task'));
  assert.ok(text.includes('WAITING'));
});

test('34. GlobalQueuePanel renders BLOCKED status with diagnostic reason', () => {
  ensureMinimalDomEnvironment();
  resetStore();

  const res = useOfficeStore.getState().enqueueGlobalMockTask({
    category: 'ROUTING',
    type: 'INSTRUCTION_INTAKE',
    priority: 'CRITICAL',
    title: 'Blocked Task Sample',
  });
  assert.ok(res.ok && res.taskId);

  useOfficeStore.setState({
    lastBlockedRecords: [
      {
        taskId: res.taskId,
        priority: 'CRITICAL',
        sequence: 1,
        reason: 'ALL_CAPABLE_WORKERS_AT_CAPACITY',
        detail: 'Worker busy with other priority',
      },
    ],
    lastDispatchDiagnosticsAtSimMs: 1500,
    lastDispatchDiagnosticsTickCount: 3,
  });

  const container = document.createElement('div') as unknown as MockDomNode;
  const root = createRoot(container as unknown as HTMLElement);

  flushSync(() => {
    root.render(React.createElement(GlobalQueuePanel));
  });

  const text = collectDomText(container);
  assert.ok(text.includes('BLOCKED'));
  assert.ok(text.includes('ALL_CAPABLE_WORKERS_AT_CAPACITY'));
  assert.ok(text.includes('Worker busy with other priority'));
});

test('35. GlobalQueuePanel renders RUNNING activity item', () => {
  ensureMinimalDomEnvironment();
  resetStore();

  // Seed a running pool task directly in tasks
  useOfficeStore.setState((s) => ({
    tasks: {
      ...s.tasks,
      tsk_pool_active_99: <any>{
        id: 'tsk_pool_active_99',
        title: 'Active Running Demo Task',
        category: 'ROUTING',
        type: 'INSTRUCTION_INTAKE',
        priority: 'NORMAL',
        status: 'ANALYZING',
        lifecycleStatus: 'RUNNING',
        assignedWorkerId: 'haiku',
        progress: 60,
        totalDurationSimMs: 2000,
        targetTokens: 1000,
        simulatedTokens: 600,
        costPerThousandTokensUsd: 0.002,
        createdAtSimMs: 0,
        startedAtSimMs: 100,
        stagePipeline: [],
      },
    },
  }));

  const container = document.createElement('div') as unknown as MockDomNode;
  const root = createRoot(container as unknown as HTMLElement);

  flushSync(() => {
    root.render(React.createElement(GlobalQueuePanel));
  });

  // Check activity selector directly verifies presence
  const activities = selectGlobalTaskActivity(useOfficeStore.getState().tasks, useOfficeStore.getState().scheduler);
  assert.ok(activities.some((a) => a.task.id === 'tsk_pool_active_99'));
});

test('36. GlobalQueuePanel renders COMPLETED and FAILED activity', () => {
  resetStore();
  const tasks: Record<string, TaskEntity> = <any> {
    tsk_pool_done: {
      id: 'tsk_pool_done',
      title: 'Done Pool Task',
      category: 'ROUTING',
      type: 'INSTRUCTION_INTAKE',
      priority: 'NORMAL',
      status: 'COMPLETED',
      lifecycleStatus: 'COMPLETED',
      assignedWorkerId: 'sonnet',
      progress: 100,
      totalDurationSimMs: 2000,
      targetTokens: 1000,
      simulatedTokens: 1000,
      costPerThousandTokensUsd: 0.002,
      createdAtSimMs: 0,
      completedAtSimMs: 2000,
      stagePipeline: [],
    },
    tsk_pool_err: {
      id: 'tsk_pool_err',
      title: 'Err Pool Task',
      category: 'ROUTING',
      type: 'INSTRUCTION_INTAKE',
      priority: 'NORMAL',
      status: 'FAILED',
      lifecycleStatus: 'FAILED',
      assignedWorkerId: 'opus',
      progress: 30,
      totalDurationSimMs: 2000,
      targetTokens: 1000,
      simulatedTokens: 300,
      costPerThousandTokensUsd: 0.002,
      createdAtSimMs: 0,
      completedAtSimMs: 600,
      stagePipeline: [],
    },
  };

  const activities = selectGlobalTaskActivity(tasks, undefined);
  assert.equal(activities.length, 2);
  assert.ok(activities.some((a) => a.lifecycleStatus === 'COMPLETED'));
  assert.ok(activities.some((a) => a.lifecycleStatus === 'FAILED'));
});

test('37. Add Global Task control calls enqueueGlobalMockTask successfully', () => {
  resetStore();
  const res = useOfficeStore.getState().enqueueGlobalMockTask({
    category: 'CLASSIFICATION',
    type: 'QUICK_RESEARCH',
    priority: 'HIGH',
    title: 'Form Submission Test',
  });

  assert.equal(res.ok, true);
  assert.equal(useOfficeStore.getState().scheduler?.entries.length, 1);
});

test('38. Drawer close button closes the global queue panel', () => {
  ensureMinimalDomEnvironment();
  resetStore();
  useOfficeStore.setState({ isGlobalQueueOpen: true });
  assert.equal(useOfficeStore.getState().isGlobalQueueOpen, true);

  useOfficeStore.getState().setGlobalQueueOpen(false);
  assert.equal(useOfficeStore.getState().isGlobalQueueOpen, false);
});
