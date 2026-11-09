import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorkforceRuntimeResponseDto } from '../live/live.contracts';
import { createLiveWorkerRepository } from './worker.live-repository';

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
