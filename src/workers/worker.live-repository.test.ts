import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorkforceProcessStatus, WorkforceRuntimeResponseDto } from '../live/live.contracts';
import { createDemoWorkerRepository, createLiveWorkerRepository } from './worker.live-repository';
import { useWorkerDisplayModeStore, shouldRunSimulationClock } from './worker.display-mode';
import { useOfficeStore } from './worker.state';
import { SimulationEngine, DEFAULT_SIMULATION_SEED } from './simulation.engine';

function createSnapshot(count: number): WorkforceRuntimeResponseDto {
  const observedAt = '2026-11-09T10:00:00Z';
  return {
    server_time_utc: observedAt,
    runtime: {
      observed_at: observedAt,
      configured_workers: count,
      ready_workers: count,
      stale_workers: 0,
      offline_workers: 0,
      active_tasks: 0,
      queued_tasks: 0,
      waiting_review_tasks: 0,
      dead_lettered_tasks: 0,
      completed_last_24h: 0,
    },
    workers: Array.from({ length: count }, (_, index) => ({
      worker_id: index < 7
        ? ['supervisor', 'haiku', 'sonnet', 'opus', 'decision_engineer', 'market_monitor', 'data_archivist'][index]
        : 'worker_' + String(index + 1).padStart(3, '0'),
      display_name: 'Worker ' + (index + 1),
      role: 'Test role',
      department: 'Test department',
      enabled: true,
      max_concurrency: 1,
      model_tier: 'NONE' as const,
      capability_ids: ['quick_research'],
      process_status: 'READY' as const,
      heartbeat_at: observedAt,
      active_task_count: 0,
      in_flight_provider_requests: 0,
      schema_version: 1 as const,
      created_at: observedAt,
      updated_at: observedAt,
    })),
  };
}

test('LIVE display repository preserves backend process truth and explicit provenance', () => {
  const snapshot = createSnapshot(7);
  const repository = createLiveWorkerRepository(snapshot, 'LIVE', 'AUTHENTICATED', 'LIVE');
  const workers = repository.listWorkers();

  assert.equal(repository.source, 'LIVE');
  assert.equal(workers.length, 7);
  assert.equal(workers[0].workerId, 'supervisor');
  assert.equal(workers[0].processStatus, 'READY');
  assert.equal(workers[0].source, 'LIVE');
  assert.equal(workers[0].freshness, 'LIVE');
  assert.equal(workers[0].observedAt, snapshot.runtime.observed_at);
  assert.equal(Object.isFrozen(workers), true);
  assert.equal(Object.isFrozen(workers[0]), true);
  assert.equal(Object.isFrozen(workers[0].capabilityIds), true);
});

test('LIVE display repository supports 50 and 100 worker fixtures without worker-specific branching', () => {
  for (const count of [50, 100]) {
    const repository = createLiveWorkerRepository(createSnapshot(count), 'LIVE', 'AUTHENTICATED', 'LIVE');
    const workers = repository.listWorkers();

    assert.equal(workers.length, count);
    assert.equal(workers[count - 1].workerId, count === 50 ? 'worker_050' : 'worker_100');
    assert.equal(workers.every((worker) => worker.source === 'LIVE'), true);
  }
});

test('LIVE stale, error and unauthenticated states never borrow demo worker values', () => {
  const snapshot = createSnapshot(7);
  const stale = createLiveWorkerRepository(snapshot, 'STALE', 'AUTHENTICATED', 'STALE');
  assert.equal(stale.getWorker('haiku').freshness, 'STALE');
  assert.equal(stale.getWorker('haiku').activeTaskCount, null);
  assert.equal(stale.getWorker('haiku').visualStatus, 'ERROR');

  const error = createLiveWorkerRepository(null, 'ERROR', 'AUTHENTICATED', 'ERROR');
  assert.equal(error.getWorker('haiku').freshness, 'ERROR');
  assert.equal(error.getWorker('haiku').source, null);

  const unauthenticated = createLiveWorkerRepository(snapshot, 'LIVE', 'UNKNOWN', 'SESSION_REQUIRED');
  assert.equal(unauthenticated.listWorkers().length, 0);
  assert.equal(unauthenticated.getWorker('haiku').freshness, 'UNAUTHENTICATED');
});

test('DEMO display repository reads only deterministic simulation workers and labels SIMULATED', () => {
  const snapshot = SimulationEngine.createInitialSnapshot(DEFAULT_SIMULATION_SEED);
  const demo = createDemoWorkerRepository(snapshot.workerOrder.map((id) => snapshot.workers[id]));
  assert.equal(demo.source, 'SIMULATED');
  assert.equal(demo.listWorkers().length, 7);
  assert.ok(demo.listWorkers().every((worker) => worker.source === 'SIMULATED'));
  assert.ok(demo.listWorkers().every((worker) => worker.freshness === 'SIMULATED'));
});


test('LIVE visual mapping uses backend task count and fails closed on unknown process states', () => {
  const base = createSnapshot(1);
  const busyWorker = { ...base.workers[0], active_task_count: 2 };
  const busy = createLiveWorkerRepository(
    { ...base, workers: [busyWorker] },
    'LIVE',
    'AUTHENTICATED',
    'LIVE',
  ).getWorker('supervisor');
  assert.equal(busy.statusLabel, 'READY');
  assert.equal(busy.visualStatus, 'BUSY');
  assert.equal(busy.animationState, 'typing');
  assert.equal(busy.activeTaskCount, 2);

  const unknownWorker = {
    ...base.workers[0],
    process_status: 'FUTURE_STATE' as unknown as WorkforceProcessStatus,
  };
  const unknown = createLiveWorkerRepository(
    { ...base, workers: [unknownWorker] },
    'LIVE',
    'AUTHENTICATED',
    'LIVE',
  ).getWorker('supervisor');
  assert.equal(unknown.statusLabel, 'ERROR');
  assert.equal(unknown.visualStatus, 'ERROR');
  assert.equal(unknown.animationState, 'idle');
});

test('global OFFLINE connection overrides a previously LIVE worker snapshot', () => {
  const repository = createLiveWorkerRepository(
    createSnapshot(7),
    'LIVE',
    'AUTHENTICATED',
    'OFFLINE',
  );
  const worker = repository.getWorker('haiku');
  assert.equal(worker.freshness, 'OFFLINE');
  assert.equal(worker.statusLabel, 'OFFLINE');
  assert.equal(worker.activeTaskCount, null);
  assert.equal(worker.visualStatus, 'ERROR');
});

test('LIVE display reports missing backend records instead of falling back to DEMO', () => {
  const repository = createLiveWorkerRepository(createSnapshot(0), 'LIVE', 'AUTHENTICATED', 'LIVE');
  const worker = repository.getWorker('haiku');
  assert.equal(worker.statusLabel, 'NOT_REPORTED');
  assert.equal(worker.source, null);
  assert.equal(worker.activeTaskCount, null);
});

test('changing display mode does not mutate the deterministic office store', () => {
  const initialMode = useWorkerDisplayModeStore.getState().mode;
  const initialLiveSelection = useWorkerDisplayModeStore.getState().selectedLiveWorkerId;
  const officeSnapshot = useOfficeStore.getState();

  useWorkerDisplayModeStore.getState().setMode('LIVE');
  useWorkerDisplayModeStore.getState().setSelectedLiveWorkerId('haiku');
  assert.equal(useWorkerDisplayModeStore.getState().mode, 'LIVE');
  assert.equal(useWorkerDisplayModeStore.getState().selectedLiveWorkerId, 'haiku');
  assert.equal(useOfficeStore.getState(), officeSnapshot);

  useWorkerDisplayModeStore.getState().setSelectedLiveWorkerId(initialLiveSelection);
  useWorkerDisplayModeStore.getState().setMode('DEMO');
  assert.equal(useOfficeStore.getState(), officeSnapshot);
  useWorkerDisplayModeStore.getState().setMode(initialMode);
});

test('the deterministic simulation clock only runs while DEMO is unpaused', () => {
  assert.equal(shouldRunSimulationClock('DEMO', false), true);
  assert.equal(shouldRunSimulationClock('DEMO', true), false);
  assert.equal(shouldRunSimulationClock('LIVE', false), false);
  assert.equal(shouldRunSimulationClock('LIVE', true), false);
});
