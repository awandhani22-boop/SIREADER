import assert from 'node:assert/strict';
import test from 'node:test';
import { createTaskEntity } from '../tasks/task.factory';
import { TASK_PRIORITIES, type TaskPriority } from '../tasks/task.types';
import type { TaskEntity } from '../workers/worker.types';
import {
  compareOrderedQueueItems,
  orderQueue,
  PRIORITY_RANK,
  resolvePriorityRank,
  type OrderedQueueItem,
} from './priority.scheduler';
import type { QueuedTaskEntry } from './scheduler.types';

function makeTask(
  id: string,
  priority: TaskPriority,
  sequenceNumber = 1,
): TaskEntity {
  return createTaskEntity({
    id,
    sequenceNumber,
    seed: 20261106,
    simTimeMs: 1000,
    type: 'DATA_ANALYSIS',
    category: 'REASONING',
    title: `Task ${id}`,
    description: `Deterministic test task ${id}`,
    priority,
    status: 'QUEUED',
  });
}

test('1. Priority rank ordering strictly enforces CRITICAL > HIGH > NORMAL > LOW', () => {
  const tLow = makeTask('tsk_low', 'LOW', 1);
  const tNormal = makeTask('tsk_normal', 'NORMAL', 2);
  const tHigh = makeTask('tsk_high', 'HIGH', 3);
  const tCritical = makeTask('tsk_critical', 'CRITICAL', 4);

  const entries: readonly QueuedTaskEntry[] = [
    { taskId: 'tsk_low', sequence: 1, enqueuedAtSimMs: 100 },
    { taskId: 'tsk_normal', sequence: 2, enqueuedAtSimMs: 200 },
    { taskId: 'tsk_high', sequence: 3, enqueuedAtSimMs: 300 },
    { taskId: 'tsk_critical', sequence: 4, enqueuedAtSimMs: 400 },
  ];

  const tasks: Readonly<Record<string, TaskEntity>> = {
    tsk_low: tLow,
    tsk_normal: tNormal,
    tsk_high: tHigh,
    tsk_critical: tCritical,
  };

  const ordered = orderQueue(entries, tasks);
  assert.deepEqual(
    ordered.map((item) => item.entry.taskId),
    ['tsk_critical', 'tsk_high', 'tsk_normal', 'tsk_low'],
  );
});

test('2. FIFO ordering by ascending sequence within equal priority', () => {
  const t1 = makeTask('tsk_h1', 'HIGH', 1);
  const t2 = makeTask('tsk_h2', 'HIGH', 2);
  const t3 = makeTask('tsk_h3', 'HIGH', 3);

  const entries: readonly QueuedTaskEntry[] = [
    { taskId: 'tsk_h1', sequence: 10, enqueuedAtSimMs: 500 },
    { taskId: 'tsk_h2', sequence: 20, enqueuedAtSimMs: 500 },
    { taskId: 'tsk_h3', sequence: 30, enqueuedAtSimMs: 500 },
  ];

  const tasks: Readonly<Record<string, TaskEntity>> = {
    tsk_h1: t1,
    tsk_h2: t2,
    tsk_h3: t3,
  };

  const ordered = orderQueue(entries, tasks);
  assert.deepEqual(
    ordered.map((item) => item.entry.taskId),
    ['tsk_h1', 'tsk_h2', 'tsk_h3'],
  );
});

test('3. Sequence beats array order when equal-priority entries are provided out of order', () => {
  const tSeq30 = makeTask('tsk_seq30', 'NORMAL', 1);
  const tSeq10 = makeTask('tsk_seq10', 'NORMAL', 2);
  const tSeq20 = makeTask('tsk_seq20', 'NORMAL', 3);

  const entries: readonly QueuedTaskEntry[] = [
    { taskId: 'tsk_seq30', sequence: 30, enqueuedAtSimMs: 100 },
    { taskId: 'tsk_seq10', sequence: 10, enqueuedAtSimMs: 100 },
    { taskId: 'tsk_seq20', sequence: 20, enqueuedAtSimMs: 100 },
  ];

  const tasks: Readonly<Record<string, TaskEntity>> = {
    tsk_seq30: tSeq30,
    tsk_seq10: tSeq10,
    tsk_seq20: tSeq20,
  };

  const ordered = orderQueue(entries, tasks);
  assert.deepEqual(
    ordered.map((item) => item.entry.taskId),
    ['tsk_seq10', 'tsk_seq20', 'tsk_seq30'],
  );
  assert.deepEqual(
    ordered.map((item) => item.originalIndex),
    [1, 2, 0],
  );
});

test('4. enqueuedAtSimMs does not affect ordering (sequence strictly determines FIFO)', () => {
  const tEarlierSeqLaterTime = makeTask('tsk_seq1_late_ms', 'CRITICAL', 1);
  const tLaterSeqEarlierTime = makeTask('tsk_seq2_early_ms', 'CRITICAL', 2);

  const entries: readonly QueuedTaskEntry[] = [
    { taskId: 'tsk_seq2_early_ms', sequence: 2, enqueuedAtSimMs: 50 },
    { taskId: 'tsk_seq1_late_ms', sequence: 1, enqueuedAtSimMs: 999999 },
  ];

  const tasks: Readonly<Record<string, TaskEntity>> = {
    tsk_seq1_late_ms: tEarlierSeqLaterTime,
    tsk_seq2_early_ms: tLaterSeqEarlierTime,
  };

  const ordered = orderQueue(entries, tasks);
  assert.deepEqual(
    ordered.map((item) => item.entry.taskId),
    ['tsk_seq1_late_ms', 'tsk_seq2_early_ms'],
  );
});

test('5. Duplicate sequence numbers use original array index ascending as deterministic tie-breaker', () => {
  const tFirstInArray = makeTask('tsk_dup_first', 'HIGH', 1);
  const tSecondInArray = makeTask('tsk_dup_second', 'HIGH', 2);
  const tThirdInArray = makeTask('tsk_dup_third', 'HIGH', 3);

  const entries: readonly QueuedTaskEntry[] = [
    { taskId: 'tsk_dup_first', sequence: 7, enqueuedAtSimMs: 3000 },
    { taskId: 'tsk_dup_second', sequence: 7, enqueuedAtSimMs: 1000 },
    { taskId: 'tsk_dup_third', sequence: 7, enqueuedAtSimMs: 2000 },
  ];

  const tasks: Readonly<Record<string, TaskEntity>> = {
    tsk_dup_first: tFirstInArray,
    tsk_dup_second: tSecondInArray,
    tsk_dup_third: tThirdInArray,
  };

  const ordered = orderQueue(entries, tasks);
  assert.deepEqual(
    ordered.map((item) => item.entry.taskId),
    ['tsk_dup_first', 'tsk_dup_second', 'tsk_dup_third'],
  );
  assert.deepEqual(
    ordered.map((item) => item.originalIndex),
    [0, 1, 2],
  );
});

test('6. Missing task entities always sort last (after LOW and after invalid runtime priority) and order among themselves by sequence then originalIndex', () => {
  const tLow = makeTask('tsk_low', 'LOW', 1);
  const tInvalidPriority = {
    ...makeTask('tsk_invalid_prio', 'LOW', 2),
    priority: 'UNKNOWN_RUNTIME_PRIORITY' as unknown as TaskPriority,
  };

  const entries: readonly QueuedTaskEntry[] = [
    { taskId: 'tsk_missing_seq5', sequence: 5, enqueuedAtSimMs: 10 },
    { taskId: 'tsk_missing_seq1_b', sequence: 1, enqueuedAtSimMs: 10 },
    { taskId: 'tsk_low', sequence: 99, enqueuedAtSimMs: 5000 },
    { taskId: 'tsk_invalid_prio', sequence: 100, enqueuedAtSimMs: 6000 },
    { taskId: 'tsk_missing_seq1_a', sequence: 1, enqueuedAtSimMs: 10 },
  ];

  const tasks: Readonly<Record<string, TaskEntity>> = {
    tsk_low: tLow,
    tsk_invalid_prio: tInvalidPriority,
  };

  const ordered = orderQueue(entries, tasks);
  assert.deepEqual(
    ordered.map((item) => item.entry.taskId),
    [
      'tsk_low',
      'tsk_invalid_prio',
      'tsk_missing_seq1_b',
      'tsk_missing_seq1_a',
      'tsk_missing_seq5',
    ],
  );
  assert.equal(ordered[2].task, null);
  assert.equal(ordered[3].task, null);
  assert.equal(ordered[4].task, null);
});

test('7. Invalid runtime priority receives fallback rank 4, never produces NaN, and sorts after LOW but before missing-task entries', () => {
  const rankUnknownStr = resolvePriorityRank('URGENT_CUSTOM');
  const rankEmptyStr = resolvePriorityRank('');
  const rankProtoKey = resolvePriorityRank('toString');
  const rankNull = resolvePriorityRank(null);
  const rankUndefined = resolvePriorityRank(undefined);

  for (const r of [rankUnknownStr, rankEmptyStr, rankProtoKey, rankNull, rankUndefined]) {
    assert.equal(Number.isNaN(r), false);
    assert.equal(r, 4);
  }

  const tCritical = makeTask('tsk_crit', 'CRITICAL', 1);
  const tLow = makeTask('tsk_low', 'LOW', 2);
  const tCorrupted = {
    ...makeTask('tsk_corrupted', 'NORMAL', 3),
    priority: 'CORRUPTED_PRIORITY' as unknown as TaskPriority,
  };

  const entries: readonly QueuedTaskEntry[] = [
    { taskId: 'tsk_missing', sequence: 1, enqueuedAtSimMs: 100 },
    { taskId: 'tsk_corrupted', sequence: 2, enqueuedAtSimMs: 100 },
    { taskId: 'tsk_low', sequence: 3, enqueuedAtSimMs: 100 },
    { taskId: 'tsk_crit', sequence: 4, enqueuedAtSimMs: 100 },
  ];

  const tasks: Readonly<Record<string, TaskEntity>> = {
    tsk_crit: tCritical,
    tsk_low: tLow,
    tsk_corrupted: tCorrupted,
  };

  const ordered = orderQueue(entries, tasks);
  assert.deepEqual(
    ordered.map((item) => item.entry.taskId),
    ['tsk_crit', 'tsk_low', 'tsk_corrupted', 'tsk_missing'],
  );
});

test('8. Input entries array and entry objects remain completely unchanged (non-mutation)', () => {
  const t1 = makeTask('tsk_1', 'LOW', 1);
  const t2 = makeTask('tsk_2', 'CRITICAL', 2);

  const e1: QueuedTaskEntry = Object.freeze({
    taskId: 'tsk_1',
    sequence: 2,
    enqueuedAtSimMs: 200,
  });
  const e2: QueuedTaskEntry = Object.freeze({
    taskId: 'tsk_2',
    sequence: 1,
    enqueuedAtSimMs: 100,
  });
  const entries: readonly QueuedTaskEntry[] = Object.freeze([e1, e2]);
  const snapshotBefore = [...entries];

  const ordered = orderQueue(entries, { tsk_1: t1, tsk_2: t2 });
  assert.deepEqual(entries, snapshotBefore);
  assert.strictEqual(entries[0], e1);
  assert.strictEqual(entries[1], e2);
  assert.equal(ordered.length, 2);
});

test('9. Input task map and task objects remain completely unchanged (non-mutation)', () => {
  const t1 = Object.freeze(makeTask('tsk_1', 'NORMAL', 1));
  const t2 = Object.freeze(makeTask('tsk_2', 'HIGH', 2));
  const tasks: Readonly<Record<string, TaskEntity>> = Object.freeze({
    tsk_1: t1,
    tsk_2: t2,
  });
  const keysBefore = Object.keys(tasks);

  const entries: readonly QueuedTaskEntry[] = [
    { taskId: 'tsk_1', sequence: 1, enqueuedAtSimMs: 100 },
    { taskId: 'tsk_2', sequence: 2, enqueuedAtSimMs: 200 },
  ];

  orderQueue(entries, tasks);
  assert.deepEqual(Object.keys(tasks), keysBefore);
  assert.strictEqual(tasks.tsk_1, t1);
  assert.strictEqual(tasks.tsk_2, t2);
});

test('10. Returned items preserve exact entry and task object references', () => {
  const t1 = makeTask('tsk_1', 'LOW', 1);
  const t2 = makeTask('tsk_2', 'CRITICAL', 2);

  const e1: QueuedTaskEntry = { taskId: 'tsk_1', sequence: 1, enqueuedAtSimMs: 100 };
  const e2: QueuedTaskEntry = { taskId: 'tsk_2', sequence: 2, enqueuedAtSimMs: 200 };
  const eMissing: QueuedTaskEntry = {
    taskId: 'tsk_missing',
    sequence: 3,
    enqueuedAtSimMs: 300,
  };

  const ordered = orderQueue([e1, e2, eMissing], { tsk_1: t1, tsk_2: t2 });

  assert.strictEqual(ordered[0].entry, e2);
  assert.strictEqual(ordered[0].task, t2);
  assert.equal(ordered[0].originalIndex, 1);

  assert.strictEqual(ordered[1].entry, e1);
  assert.strictEqual(ordered[1].task, t1);
  assert.equal(ordered[1].originalIndex, 0);

  assert.strictEqual(ordered[2].entry, eMissing);
  assert.strictEqual(ordered[2].task, null);
  assert.equal(ordered[2].originalIndex, 2);
});

test('11. Returned array is a separate array instance even when empty or already sorted', () => {
  const emptyInput: readonly QueuedTaskEntry[] = [];
  const emptyOutput = orderQueue(emptyInput, {});
  assert.notStrictEqual(emptyOutput, emptyInput);
  assert.equal(emptyOutput.length, 0);

  const t1 = makeTask('tsk_1', 'CRITICAL', 1);
  const singleInput: readonly QueuedTaskEntry[] = [
    { taskId: 'tsk_1', sequence: 1, enqueuedAtSimMs: 100 },
  ];
  const singleOutput = orderQueue(singleInput, { tsk_1: t1 });
  assert.notStrictEqual(singleOutput, singleInput);
});

test('12. Comparator and orderQueue behavior are strictly deterministic across repeated calls', () => {
  const tasks: Record<string, TaskEntity> = {
    tsk_a: makeTask('tsk_a', 'NORMAL', 1),
    tsk_b: makeTask('tsk_b', 'CRITICAL', 2),
    tsk_c: makeTask('tsk_c', 'HIGH', 3),
    tsk_d: makeTask('tsk_d', 'LOW', 4),
    tsk_e: makeTask('tsk_e', 'HIGH', 5),
  };

  const entries: readonly QueuedTaskEntry[] = [
    { taskId: 'tsk_a', sequence: 4, enqueuedAtSimMs: 500 },
    { taskId: 'tsk_missing', sequence: 1, enqueuedAtSimMs: 100 },
    { taskId: 'tsk_b', sequence: 5, enqueuedAtSimMs: 600 },
    { taskId: 'tsk_c', sequence: 3, enqueuedAtSimMs: 300 },
    { taskId: 'tsk_d', sequence: 2, enqueuedAtSimMs: 200 },
    { taskId: 'tsk_e', sequence: 3, enqueuedAtSimMs: 900 },
  ];

  const baseline = orderQueue(entries, tasks);
  for (let i = 0; i < 20; i++) {
    const run = orderQueue(entries, tasks);
    assert.deepEqual(
      run.map((item) => ({
        taskId: item.entry.taskId,
        originalIndex: item.originalIndex,
      })),
      baseline.map((item) => ({
        taskId: item.entry.taskId,
        originalIndex: item.originalIndex,
      })),
    );
  }
});

test('13. Comparator satisfies total-order properties (irreflexivity, antisymmetry, transitivity) across a representative deterministic set', () => {
  const priorities: Array<TaskPriority | 'INVALID_PRIO' | null> = [
    'CRITICAL',
    'HIGH',
    'NORMAL',
    'LOW',
    'INVALID_PRIO',
    null, // missing task entity
  ];
  const sequences = [1, 2, 5];
  const originalIndices = [0, 1, 2, 3, 4, 5, 6, 7];

  const representativeItems: OrderedQueueItem[] = [];
  let idxCounter = 0;

  for (const prio of priorities) {
    for (const seq of sequences) {
      const origIdx = originalIndices[idxCounter % originalIndices.length] + idxCounter;
      idxCounter += 1;
      const id = `tsk_${String(prio)}_${seq}_${origIdx}`;
      const task: TaskEntity | null =
        prio === null
          ? null
          : {
              ...makeTask(id, 'NORMAL', idxCounter),
              priority: prio as TaskPriority,
            };
      representativeItems.push({
        entry: {
          taskId: id,
          sequence: seq,
          enqueuedAtSimMs: (idxCounter * 137) % 1000,
        },
        task,
        originalIndex: origIdx,
      });
    }
  }

  // Verify irreflexivity and antisymmetry for all pairs
  for (let i = 0; i < representativeItems.length; i++) {
    const a = representativeItems[i];
    assert.equal(compareOrderedQueueItems(a, a), 0, 'Irreflexivity: compare(a, a) === 0');

    for (let j = 0; j < representativeItems.length; j++) {
      const b = representativeItems[j];
      const ab = Math.sign(compareOrderedQueueItems(a, b)) || 0;
      const negBa = -Math.sign(compareOrderedQueueItems(b, a)) || 0;
      assert.equal(ab, negBa, 'Antisymmetry: sign(compare(a, b)) === -sign(compare(b, a))');
      if (i !== j) {
        assert.notEqual(
          ab,
          0,
          'Strict total order on distinct originalIndex items: compare(a, b) !== 0 when i !== j',
        );
      }
    }
  }

  // Verify transitivity for all triples: if a < b and b < c, then a < c
  for (let i = 0; i < representativeItems.length; i++) {
    for (let j = 0; j < representativeItems.length; j++) {
      if (compareOrderedQueueItems(representativeItems[i], representativeItems[j]) >= 0) {
        continue;
      }
      for (let k = 0; k < representativeItems.length; k++) {
        if (compareOrderedQueueItems(representativeItems[j], representativeItems[k]) >= 0) {
          continue;
        }
        assert.ok(
          compareOrderedQueueItems(representativeItems[i], representativeItems[k]) < 0,
          `Transitivity violated for indices (${i}, ${j}, ${k})`,
        );
      }
    }
  }
});

test('14. Literal PRIORITY_RANK map contains all and only the keys in TASK_PRIORITIES with exact ranks 0..3', () => {
  const rankKeys = Object.keys(PRIORITY_RANK).sort();
  const canonicalKeys = [...TASK_PRIORITIES].sort();

  assert.deepEqual(rankKeys, canonicalKeys);
  assert.equal(PRIORITY_RANK.CRITICAL, 0);
  assert.equal(PRIORITY_RANK.HIGH, 1);
  assert.equal(PRIORITY_RANK.NORMAL, 2);
  assert.equal(PRIORITY_RANK.LOW, 3);
  assert.equal(Object.isFrozen(PRIORITY_RANK), true);
});

test('15. Compile-time completeness check: adding a new priority to a TaskPriority union without a rank entry fails TypeScript compilation', () => {
  type HypotheticalExtendedPriority = TaskPriority | 'EMERGENCY';

  const verifyCompleteMap = <T extends Record<HypotheticalExtendedPriority, number>>(
    map: T,
  ): T => map;

  // @ts-expect-error -- Adding 'EMERGENCY' to the priority union without adding it to PRIORITY_RANK must fail compile-time completeness check
  const incompleteRankMap = verifyCompleteMap(PRIORITY_RANK);

  assert.ok(incompleteRankMap);
});
