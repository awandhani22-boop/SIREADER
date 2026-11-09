import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  WorkforceProcessStatus,
  WorkforceRuntimeResponseDto,
  WorkforceWorkerDto,
} from '../live/live.contracts';
import { useOfficeStore } from './worker.state';
import { useWorkerDisplayModeStore, shouldRunSimulationClock } from './worker.display-mode';
import { createDemoWorkerRepository, createLiveWorkerRepository } from './worker.live-repository';
import type { WorkerEntity } from './worker.types';

const timestamp = '2026-11-09T08:00:00Z';

function makeWorker(
  index = 1,
  overrides: Partial<WorkforceWorkerDto> = {},
): WorkforceWorkerDto {
  const workerId = 'worker_' + index.toString().padStart(3, '0');
  return {
    worker_id: workerId,
    display_name: 'Worker ' + index,
    role: 'Runtime worker',
    department: 'AI Runtime',
    enabled: true,
    max_concurrency: 2,
    model_tier: 'FAST',
    capability_ids: ['classification', 'summarization'],
    process_status: 'READY',
    heartbeat_at: timestamp,
    active_task_count: 0,
    in_flight_provider_requests: 0,
    schema_version: 1,
    created_at: timestamp,
    updated_at: timestamp,
    ...overrides,
  };
}

function makeSnapshot(
  workers: readonly WorkforceWorkerDto[] = [makeWorker()],
): WorkforceRuntimeResponseDto {
  return {
    server_time_utc: timestamp,
    runtime: {
      observed_at: timestamp,
      configured_workers: workers.length,
      ready_workers: workers.filter((worker) => worker.process_status === 'READY').length,
      stale_workers: workers.filter((worker) => worker.process_status === 'STALE').length,
      offline_workers: workers.filter((worker) => worker.process_status === 'OFFLINE').length,
      active_tasks: workers.reduce((sum, worker) => sum + worker.active_task_count, 0),
      queued_tasks: 0,
      waiting_review_tasks: 0,
      dead_lettered_tasks: 0,
      completed_last_24h: 0,
    },
    workers,
  };
}

test('LIVE repository maps backend READY workload without inventing process state', () => {
  const snapshot = makeSnapshot([makeWorker(1, { active_task_count: 2, in_flight_provider_requests: 1 })]);
  const repository = createLiveWorkerRepository(snapshot, 'LIVE', 'AUTHENTICATED', 'LIVE');
  const worker = repository.getWorker('worker_001');

  assert.equal(repository.source, 'LIVE');
  assert.equal(worker.source, 'LIVE');
  assert.equal(worker.freshness, 'LIVE');
  assert.equal(worker.processStatus, 'READY');
  assert.equal(worker.statusLabel, 'READY');
  assert.equal(worker.visualStatus, 'BUSY');
  assert.equal(worker.animationState, 'typing');
  assert.equal(worker.activeTaskCount, 2);
  assert.equal(worker.inFlightProviderRequests, 1);
});

test('LIVE repository marks stale and error snapshots as non-current and suppresses live counters', () => {
  const snapshot = makeSnapshot([makeWorker(1, { active_task_count: 3, in_flight_provider_requests: 2 })]);
  for (const status of ['STALE', 'ERROR'] as const) {
    const worker = createLiveWorkerRepository(snapshot, status, 'AUTHENTICATED', status).getWorker('worker_001');
    assert.equal(worker.statusLabel, status);
    assert.equal(worker.visualStatus, 'ERROR');
    assert.equal(worker.activeTaskCount, null);
    assert.equal(worker.inFlightProviderRequests, null);
    assert.equal(worker.freshness, status);
  }
});

test('LIVE repository does not display cached process status while a snapshot is connecting', () => {
  const repository = createLiveWorkerRepository(makeSnapshot(), 'IDLE', 'AUTHENTICATED', 'CONNECTING');
  const worker = repository.getWorker('worker_001');
  assert.equal(worker.statusLabel, 'CONNECTING');
  assert.equal(worker.visualStatus, 'WAITING');
  assert.equal(worker.activeTaskCount, null);
});

test('global OFFLINE connection suppresses last-known worker counters and process state', () => {
  const repository = createLiveWorkerRepository(makeSnapshot(), 'LIVE', 'AUTHENTICATED', 'OFFLINE');
  const worker = repository.getWorker('worker_001');
  assert.equal(worker.freshness, 'OFFLINE');
  assert.equal(worker.statusLabel, 'OFFLINE');
  assert.equal(worker.activeTaskCount, null);
  assert.equal(worker.visualStatus, 'ERROR');
});

test('LIVE repository clears private worker records before authentication', () => {
  const repository = createLiveWorkerRepository(makeSnapshot(), 'LIVE', 'UNKNOWN', 'SESSION_REQUIRED');
  assert.deepEqual(repository.listWorkers(), []);
  const worker = repository.getWorker('worker_001');
  assert.equal(worker.statusLabel, 'UNAUTHENTICATED');
  assert.equal(worker.source, null);
  assert.equal(worker.activeTaskCount, null);
});

test('LIVE repository reports absent and unknown workers explicitly', () => {
  const missing = createLiveWorkerRepository(makeSnapshot([]), 'LIVE', 'AUTHENTICATED', 'LIVE')
    .getWorker('worker_missing');
  assert.equal(missing.statusLabel, 'NOT_REPORTED');
  assert.equal(missing.source, null);
  assert.equal(missing.activeTaskCount, null);

  const unknownState = makeWorker(1, {
    process_status: 'FUTURE_STATE' as unknown as WorkforceProcessStatus,
  });
  const unknown = createLiveWorkerRepository(
    makeSnapshot([unknownState]),
    'LIVE',
    'AUTHENTICATED',
  ).getWorker('worker_001');
  assert.equal(unknown.statusLabel, 'ERROR');
  assert.equal(unknown.visualStatus, 'ERROR');
  assert.equal(unknown.animationState, 'idle');
});

test('LIVE repository returns complete 50-worker and 100-worker rosters without fixed-roster truncation', () => {
  for (const count of [50, 100]) {
    const snapshot = makeSnapshot(Array.from({ length: count }, (_, index) => makeWorker(index + 1)));
    const repository = createLiveWorkerRepository(snapshot, 'LIVE', 'AUTHENTICATED', 'LIVE');
    const workers = repository.listWorkers();

    assert.equal(workers.length, count);
    assert.equal(workers[0].workerId, 'worker_001');
    assert.equal(workers[count - 1].workerId, 'worker_' + count.toString().padStart(3, '0'));
    assert.equal(workers.every((worker) => worker.source === 'LIVE'), true);
  }
});

test('DEMO repository derives worker display data only from deterministic worker entities', () => {
  const demoWorker = {
    id: 'haiku',
    name: 'Haiku Worker',
    role: 'Fast worker',
    department: 'AI Runtime',
    status: 'BUSY',
    animationState: 'typing',
    activeTaskIds: ['task-a', 'task-b'],
  } as unknown as WorkerEntity;
  const repository = createDemoWorkerRepository([demoWorker]);
  const worker = repository.getWorker('haiku');

  assert.equal(repository.source, 'SIMULATED');
  assert.equal(worker.source, 'SIMULATED');
  assert.equal(worker.freshness, 'SIMULATED');
  assert.equal(worker.statusLabel, 'BUSY');
  assert.equal(worker.activeTaskCount, 2);
  assert.equal(repository.getWorker('missing').source, 'SIMULATED');
});

test('changing LIVE mode and selection does not mutate the deterministic office store', () => {
  const initialMode = useWorkerDisplayModeStore.getState().mode;
  const initialLiveSelection = useWorkerDisplayModeStore.getState().selectedLiveWorkerId;
  const officeState = useOfficeStore.getState();

  useWorkerDisplayModeStore.getState().setMode('LIVE');
  useWorkerDisplayModeStore.getState().setSelectedLiveWorkerId('worker_050');
  assert.equal(useWorkerDisplayModeStore.getState().mode, 'LIVE');
  assert.equal(useWorkerDisplayModeStore.getState().selectedLiveWorkerId, 'worker_050');
  assert.equal(useOfficeStore.getState(), officeState);

  useWorkerDisplayModeStore.getState().setSelectedLiveWorkerId(initialLiveSelection);
  useWorkerDisplayModeStore.getState().setMode(initialMode);
  assert.equal(useOfficeStore.getState(), officeState);
});

test('the simulation clock advances only in unpaused DEMO mode', () => {
  assert.equal(shouldRunSimulationClock('DEMO', false), true);
  assert.equal(shouldRunSimulationClock('DEMO', true), false);
  assert.equal(shouldRunSimulationClock('LIVE', false), false);
  assert.equal(shouldRunSimulationClock('LIVE', true), false);
});
