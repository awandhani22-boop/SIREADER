import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorkforceRuntimeResponseDto } from '../live/live.contracts';
import { createDemoWorkerDisplayRepository, createLiveWorkerDisplayRepository } from './worker.live-repository';
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
  const repository = createLiveWorkerDisplayRepository(snapshot, 'LIVE', 'AUTHENTICATED');
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

test('LIVE display repository supports a 100-worker fixture without worker-specific branching', () => {
  const repository = createLiveWorkerDisplayRepository(createSnapshot(100), 'LIVE', 'AUTHENTICATED');
  const workers = repository.listWorkers();

  assert.equal(workers.length, 100);
  assert.equal(workers[99].workerId, 'worker_100');
  assert.equal(workers.every((worker) => worker.source === 'LIVE'), true);
});

test('LIVE stale, error and unauthenticated states never borrow demo worker values', () => {
  const snapshot = createSnapshot(7);
  const stale = createLiveWorkerDisplayRepository(snapshot, 'STALE', 'AUTHENTICATED');
  assert.equal(stale.getWorker('haiku').freshness, 'STALE');
  assert.equal(stale.getWorker('haiku').activeTaskCount, null);
  assert.equal(stale.getWorker('haiku').visualStatus, 'ERROR');

  const error = createLiveWorkerDisplayRepository(null, 'ERROR', 'AUTHENTICATED');
  assert.equal(error.getWorker('haiku').freshness, 'ERROR');
  assert.equal(error.getWorker('haiku').source, null);

  const unauthenticated = createLiveWorkerDisplayRepository(snapshot, 'LIVE', 'UNKNOWN');
  assert.equal(unauthenticated.listWorkers().length, 0);
  assert.equal(unauthenticated.getWorker('haiku').freshness, 'UNAUTHENTICATED');
});

test('DEMO display repository reads only deterministic simulation workers and labels SIMULATED', () => {
  const snapshot = SimulationEngine.createInitialSnapshot(DEFAULT_SIMULATION_SEED);
  const demo = createDemoWorkerDisplayRepository(snapshot.workerOrder.map((id) => snapshot.workers[id]));
  assert.equal(demo.source, 'SIMULATED');
  assert.equal(demo.listWorkers().length, 7);
  assert.ok(demo.listWorkers().every((worker) => worker.source === 'SIMULATED'));
  assert.ok(demo.listWorkers().every((worker) => worker.freshness === 'SIMULATED'));
});
