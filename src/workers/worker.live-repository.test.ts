import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorkforceRuntimeResponseDto } from '../live/live.contracts';
import { createDemoWorkerDisplayRepository, createLiveWorkerDisplayRepository, createLiveWorkerRepository } from './worker.live-repository';
import { useWorkerDisplayModeStore, shouldRunSimulationClock } from './worker.display-mode';
import { useOfficeStore } from './worker.state';
import type { WorkerEntity } from './worker.types';

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

test('LIVE worker repository preserves backend process truth and explicit provenance', async () => {
  const snapshot = createSnapshot(7);
  const repository = createLiveWorkerRepository(async (path) => {
    assert.equal(path, '/api/v1/workforce/runtime');
    return snapshot;
  });

  const workers = await repository.listWorkers();
  assert.equal(repository.source, 'LIVE');
  assert.equal(workers.length, 7);
  assert.equal(workers[0].workerId, 'supervisor');
  assert.equal(workers[0].processStatus, 'READY');
  assert.equal(workers[0].source, 'LIVE');
  assert.equal(workers[0].observedAt, snapshot.runtime.observed_at);
  assert.equal(Object.isFrozen(workers), true);
  assert.equal(Object.isFrozen(workers[0]), true);
  assert.equal(Object.isFrozen(workers[0].capabilityIds), true);
});

test('LIVE worker repository supports a 100-worker fixture without worker-specific branching', async () => {
  const snapshot = createSnapshot(100);
  const repository = createLiveWorkerRepository(async () => snapshot);
  const workers = await repository.listWorkers();

  assert.equal(workers.length, 100);
  assert.equal(workers[99].workerId, 'worker_100');
  assert.equal(workers.every((worker) => worker.source === 'LIVE'), true);
});

test('LIVE worker repository propagates read failures and never substitutes demo workers', async () => {
  const repository = createLiveWorkerRepository(async () => {
    throw new Error('OFFLINE');
  });
  await assert.rejects(repository.listWorkers(), /OFFLINE/);
});


test('LIVE display adapter maps authoritative worker states and activity to visual state', () => {
  const snapshot = createSnapshot(1);
  const activeWorker = {
    ...snapshot.workers[0],
    active_task_count: 2,
  };
  const repository = createLiveWorkerDisplayRepository(
    { ...snapshot, workers: [activeWorker] },
    'LIVE',
    'AUTHENTICATED',
  );
  const worker = repository.getWorker(activeWorker.worker_id);

  assert.equal(worker.source, 'LIVE');
  assert.equal(worker.freshness, 'LIVE');
  assert.equal(worker.statusLabel, 'READY');
  assert.equal(worker.visualStatus, 'BUSY');
  assert.equal(worker.animationState, 'typing');
  assert.equal(worker.activeTaskCount, 2);
});

test('LIVE display adapter fails closed for stale, missing, unknown and unauthenticated data', () => {
  const snapshot = createSnapshot(1);
  const staleRepository = createLiveWorkerDisplayRepository(snapshot, 'STALE', 'AUTHENTICATED');
  assert.equal(staleRepository.getWorker(snapshot.workers[0].worker_id).statusLabel, 'STALE');
  assert.equal(staleRepository.getWorker(snapshot.workers[0].worker_id).activeTaskCount, null);

  const missingRepository = createLiveWorkerDisplayRepository(createSnapshot(0), 'LIVE', 'AUTHENTICATED');
  assert.equal(missingRepository.getWorker('not-registered').statusLabel, 'NOT_REPORTED');
  assert.equal(missingRepository.getWorker('not-registered').visualStatus, 'ERROR');

  const unknownSnapshot = createSnapshot(1);
  const unknownWorker = {
    ...unknownSnapshot.workers[0],
    process_status: 'FUTURE_STATE' as unknown as WorkforceProcessStatus,
  };
  const unknownRepository = createLiveWorkerDisplayRepository(
    { ...unknownSnapshot, workers: [unknownWorker] },
    'LIVE',
    'AUTHENTICATED',
  );
  assert.equal(unknownRepository.getWorker(unknownWorker.worker_id).statusLabel, 'ERROR');

  const loggedOut = createLiveWorkerDisplayRepository(snapshot, 'LIVE', 'UNAUTHENTICATED');
  assert.equal(loggedOut.listWorkers().length, 0);
  assert.equal(loggedOut.getWorker(snapshot.workers[0].worker_id).statusLabel, 'UNAUTHENTICATED');
  assert.equal(loggedOut.getWorker(snapshot.workers[0].worker_id).source, null);
});

test('LIVE display adapter retains 50 and 100 worker fixtures without fixed-roster truncation', () => {
  for (const count of [50, 100]) {
    const snapshot = createSnapshot(count);
    const repository = createLiveWorkerDisplayRepository(snapshot, 'LIVE', 'AUTHENTICATED');
    assert.equal(repository.listWorkers().length, count);
    assert.equal(repository.getWorker(snapshot.workers[count - 1].worker_id).source, 'LIVE');
  }
});

test('DEMO display adapter preserves simulated provenance and does not claim LIVE data', () => {
  const demoWorker = {
    id: 'haiku',
    name: 'Haiku Worker',
    role: 'Fast worker',
    department: 'AI Runtime',
    status: 'BUSY',
    animationState: 'typing',
    activeTaskIds: ['task-a', 'task-b'],
  } as unknown as WorkerEntity;
  const repository = createDemoWorkerDisplayRepository([demoWorker]);
  const worker = repository.getWorker('haiku');

  assert.equal(repository.source, 'SIMULATED');
  assert.equal(worker.source, 'SIMULATED');
  assert.equal(worker.freshness, 'SIMULATED');
  assert.equal(worker.statusLabel, 'BUSY');
  assert.equal(worker.activeTaskCount, 2);
  assert.equal(repository.getWorker('missing').source, 'SIMULATED');
});

test('display mode selection cannot mutate the deterministic simulation store', () => {
  const previousMode = useWorkerDisplayModeStore.getState().mode;
  const simulationBefore = useOfficeStore.getState();

  useWorkerDisplayModeStore.getState().setMode('LIVE');
  assert.equal(useWorkerDisplayModeStore.getState().mode, 'LIVE');
  assert.equal(useOfficeStore.getState(), simulationBefore);

  useWorkerDisplayModeStore.getState().setMode('DEMO');
  assert.equal(useOfficeStore.getState(), simulationBefore);
  useWorkerDisplayModeStore.getState().setMode(previousMode);
});

test('only unpaused DEMO mode advances the simulation clock', () => {
  assert.equal(shouldRunSimulationClock('DEMO', false), true);
  assert.equal(shouldRunSimulationClock('DEMO', true), false);
  assert.equal(shouldRunSimulationClock('LIVE', false), false);
  assert.equal(shouldRunSimulationClock('LIVE', true), false);
});
