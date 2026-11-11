import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialWorkersRegistry } from '../workers/worker.registry';
import type { WorkerRuntimeRecord } from '../workers/worker.live-repository';
import { createLiveWorkerSceneModels } from './liveWorkerSceneModel';

function makeRecord(workerId: string, index: number, department = 'Research Room'): WorkerRuntimeRecord {
  return {
    workerId,
    displayName: `Live Worker ${index}`,
    role: 'Runtime worker',
    department,
    enabled: true,
    acceptingTasks: true,
    processStatus: 'READY',
    statusLabel: 'READY',
    visualStatus: 'IDLE',
    animationState: 'seated',
    modelTier: 'FAST',
    capabilityIds: ['classification'],
    maxConcurrency: 1,
    activeTaskCount: 0,
    inFlightProviderRequests: 0,
    heartbeatAt: '2026-11-10T00:00:00Z',
    observedAt: '2026-11-10T00:00:00Z',
    source: 'LIVE',
    freshness: 'LIVE',
  };
}

function makeRoster(total: number, department = 'Research Room'): WorkerRuntimeRecord[] {
  const initial = createInitialWorkersRegistry();
  const records = Object.values(initial).map((worker, index) =>
    makeRecord(worker.id, index + 1, worker.department),
  );
  for (let index = records.length; index < total; index += 1) {
    records.push(makeRecord(`runtime_${String(index + 1).padStart(3, '0')}`, index + 1, department));
  }
  return records;
}

function coordinateKey(position: readonly number[]): string {
  return position.map((value) => value.toFixed(3)).join(':');
}

test('LIVE 3D scene keeps the seven authored worker positions and backend status', () => {
  const initial = createInitialWorkersRegistry();
  const models = createLiveWorkerSceneModels(makeRoster(7));

  assert.equal(models.length, 7);
  for (const model of models) {
    const worker = initial[model.workerId as keyof typeof initial];
    assert.ok(worker);
    assert.deepEqual(model.position3D, worker.homePosition3D);
    assert.equal(model.statusLabel, 'READY');
    assert.equal(model.visualStatus, 'IDLE');
    assert.equal(model.avatarConfig.modelUrl, worker.avatarConfig.modelUrl);
  }
});

test('LIVE 3D scene lays out 50 workers with unique finite positions and stable IDs', () => {
  const models = createLiveWorkerSceneModels(makeRoster(50));
  const ids = new Set(models.map((model) => model.workerId));
  const positions = new Set(models.map((model) => coordinateKey(model.position3D)));

  assert.equal(models.length, 50);
  assert.equal(ids.size, 50);
  assert.equal(positions.size, 50);
  assert.ok(models.every((model) =>
    model.position3D.every(Number.isFinite) &&
    model.avatarConfig.modelUrl === null &&
    !('metrics' in model),
  ));
});

test('LIVE 3D scene lays out 100 workers deterministically regardless of input order', () => {
  const records = makeRoster(100);
  const first = createLiveWorkerSceneModels(records);
  const reversed = createLiveWorkerSceneModels([...records].reverse());

  assert.equal(first.length, 100);
  assert.deepEqual(
    first.map((model) => [model.workerId, model.position3D]),
    reversed.map((model) => [model.workerId, model.position3D]),
  );
  assert.equal(new Set(first.map((model) => coordinateKey(model.position3D))).size, 100);
});

test('LIVE scene refuses a roster beyond its documented single-floor layout capacity', () => {
  assert.throws(() => createLiveWorkerSceneModels(makeRoster(176)), RangeError);
});

test('LIVE 3D presentation never mutates backend records', () => {
  const records = makeRoster(50);
  const before = records.map((record) => ({ ...record, capabilityIds: [...record.capabilityIds] }));
  createLiveWorkerSceneModels(records);
  assert.deepEqual(records, before);
});
