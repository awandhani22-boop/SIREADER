import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertWorkerConcurrencyInvariant,
  getActiveTaskIds,
  withTaskActivated,
  withTaskDeactivated,
} from './worker.concurrency';
import { createInitialWorkersRegistry } from './worker.registry';
import type { WorkerEntity } from './worker.types';

test('1. Activation maintains primary task semantics (currentTaskId === activeTaskIds[0] ?? null)', () => {
  const initialHaiku = createInitialWorkersRegistry().haiku;
  assert.deepEqual(initialHaiku.activeTaskIds, []);
  assert.equal(initialHaiku.currentTaskId, null);

  // First activated task becomes both activeTaskIds[0] and currentTaskId
  const afterFirst = withTaskActivated(initialHaiku, 'tsk_haiku_101_0');
  assert.deepEqual(afterFirst.activeTaskIds, ['tsk_haiku_101_0']);
  assert.equal(afterFirst.currentTaskId, 'tsk_haiku_101_0');

  // Second concurrent activated task appends to activeTaskIds while preserving currentTaskId === activeTaskIds[0]
  const afterSecond = withTaskActivated(afterFirst, 'tsk_haiku_102_0');
  assert.deepEqual(afterSecond.activeTaskIds, [
    'tsk_haiku_101_0',
    'tsk_haiku_102_0',
  ]);
  assert.equal(afterSecond.currentTaskId, 'tsk_haiku_101_0');
  assert.deepEqual(getActiveTaskIds(afterSecond), [
    'tsk_haiku_101_0',
    'tsk_haiku_102_0',
  ]);
});

test('2. Deactivation maintains primary task semantics and promotes next active task when primary completes', () => {
  const initialHaiku = createInitialWorkersRegistry().haiku;
  const withTwoActive = withTaskActivated(
    withTaskActivated(initialHaiku, 'tsk_haiku_101_0'),
    'tsk_haiku_102_0',
  );

  // Deactivating the primary task ('tsk_haiku_101_0') promotes 'tsk_haiku_102_0' to currentTaskId
  const afterPrimaryDeactivated = withTaskDeactivated(
    withTwoActive,
    'tsk_haiku_101_0',
  );
  assert.deepEqual(afterPrimaryDeactivated.activeTaskIds, ['tsk_haiku_102_0']);
  assert.equal(afterPrimaryDeactivated.currentTaskId, 'tsk_haiku_102_0');

  // Deactivating the remaining task clears both activeTaskIds and currentTaskId
  const afterAllDeactivated = withTaskDeactivated(
    afterPrimaryDeactivated,
    'tsk_haiku_102_0',
  );
  assert.deepEqual(afterAllDeactivated.activeTaskIds, []);
  assert.equal(afterAllDeactivated.currentTaskId, null);

  // Deactivating a non-existent task ID on an already valid worker preserves reference identity
  const unchangedRef = withTaskDeactivated(
    afterAllDeactivated,
    'tsk_non_existent',
  );
  assert.strictEqual(unchangedRef, afterAllDeactivated);
});

test('3. Duplicate active task ID protection prevents duplicate entries and preserves worker reference', () => {
  const initialSonnet = createInitialWorkersRegistry().sonnet;
  const activatedOnce = withTaskActivated(initialSonnet, 'tsk_sonnet_101_0');
  const activatedTwice = withTaskActivated(activatedOnce, 'tsk_sonnet_101_0');

  assert.deepEqual(activatedTwice.activeTaskIds, ['tsk_sonnet_101_0']);
  assert.equal(activatedTwice.currentTaskId, 'tsk_sonnet_101_0');
  assert.strictEqual(
    activatedTwice,
    activatedOnce,
    'Re-activating an already active taskId must return the exact same WorkerEntity reference',
  );

  assert.throws(
    () => withTaskActivated(initialSonnet, '   '),
    /Cannot activate an empty taskId/,
  );
});

test('4. Concurrency invariant validation passes for valid workers and throws on capacity, duplicate, or primary mismatch violations', () => {
  const initialHaiku = createInitialWorkersRegistry().haiku;
  assertWorkerConcurrencyInvariant(initialHaiku, 2);

  const validTwoTasks = withTaskActivated(
    withTaskActivated(initialHaiku, 'tsk_haiku_101_0'),
    'tsk_haiku_102_0',
  );
  assertWorkerConcurrencyInvariant(validTwoTasks, 2);

  // Exceeding maxConcurrency throws
  assert.throws(
    () => assertWorkerConcurrencyInvariant(validTwoTasks, 1),
    /exceeds maxConcurrency/,
  );

  // Duplicate active task IDs throw
  const duplicateWorker: WorkerEntity = {
    ...initialHaiku,
    activeTaskIds: ['tsk_haiku_101_0', 'tsk_haiku_101_0'],
    currentTaskId: 'tsk_haiku_101_0',
  };
  assert.throws(
    () => assertWorkerConcurrencyInvariant(duplicateWorker, 2),
    /duplicate active taskId/,
  );

  // Mismatch between currentTaskId and activeTaskIds[0] throws
  const mismatchWorker: WorkerEntity = {
    ...initialHaiku,
    activeTaskIds: ['tsk_haiku_101_0', 'tsk_haiku_102_0'],
    currentTaskId: 'tsk_haiku_102_0',
  };
  assert.throws(
    () => assertWorkerConcurrencyInvariant(mismatchWorker, 2),
    /does not match activeTaskIds\[0\]/,
  );

  // Invalid maxConcurrency throws
  assert.throws(
    () => assertWorkerConcurrencyInvariant(initialHaiku, 0),
    /Invalid maxConcurrency/,
  );
});

test('5. Legacy worker fallback in getActiveTaskIds derives from currentTaskId only when activeTaskIds property is absent', () => {
  const baseOpus = createInitialWorkersRegistry().opus;
  const legacyOpusWithoutActiveIds = {
    ...baseOpus,
    currentTaskId: 'tsk_opus_legacy_1',
  } as Partial<WorkerEntity>;
  delete legacyOpusWithoutActiveIds.activeTaskIds;

  assert.deepEqual(
    getActiveTaskIds(legacyOpusWithoutActiveIds as WorkerEntity),
    ['tsk_opus_legacy_1'],
  );

  // When activeTaskIds is explicitly present (even if empty), it is authoritative
  const explicitEmptyOpus: WorkerEntity = {
    ...baseOpus,
    activeTaskIds: [],
    currentTaskId: 'tsk_opus_stale_mismatch',
  };
  assert.deepEqual(getActiveTaskIds(explicitEmptyOpus), []);
});
