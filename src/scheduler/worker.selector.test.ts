import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorkerDispatchState } from './worker.matching';
import { selectWorker } from './worker.selector';
import {
  COST_PER_1K_TOKENS_SIMULATED,
  INITIAL_WORKER_ORDER,
} from '../workers/worker.registry';
import type { WorkerId } from '../workers/worker.types';

test('1. Lowest load ratio wins regardless of higher simulated cost or later workerOrder', () => {
  const candidates: readonly WorkerDispatchState[] = [
    { workerId: 'haiku', activeCount: 1, maxConcurrency: 2, exclusion: null }, // 1/2 = 0.50, cheaper (0.001), earlier
    { workerId: 'opus', activeCount: 0, maxConcurrency: 1, exclusion: null }, // 0/1 = 0.00, more expensive (0.015), later
  ];

  assert.equal(
    selectWorker(candidates, COST_PER_1K_TOKENS_SIMULATED, INITIAL_WORKER_ORDER),
    'opus',
  );

  const fractionalCandidates: readonly WorkerDispatchState[] = [
    { workerId: 'worker_a', activeCount: 1, maxConcurrency: 2, exclusion: null }, // 1/2 = 0.50
    { workerId: 'worker_b', activeCount: 1, maxConcurrency: 3, exclusion: null }, // 1/3 = 0.333...
  ];
  assert.equal(
    selectWorker(
      fractionalCandidates,
      { worker_a: 0.001, worker_b: 0.05 },
      ['worker_a', 'worker_b'],
    ),
    'worker_b',
  );
});

test('2. Equal load ratio resolves by lower simulated cost rate', () => {
  const candidates: readonly WorkerDispatchState[] = [
    { workerId: 'supervisor', activeCount: 1, maxConcurrency: 2, exclusion: null }, // 1/2, cost 0.003
    { workerId: 'haiku', activeCount: 1, maxConcurrency: 2, exclusion: null }, // 1/2, cost 0.001
  ];

  assert.equal(
    selectWorker(candidates, COST_PER_1K_TOKENS_SIMULATED, INITIAL_WORKER_ORDER),
    'haiku',
  );
});

test('3. Equal load ratio and equal simulated cost resolve by earliest workerOrder', () => {
  const candidates: readonly WorkerDispatchState[] = [
    { workerId: 'sonnet', activeCount: 0, maxConcurrency: 1, exclusion: null }, // cost 0.003, index 2
    { workerId: 'supervisor', activeCount: 0, maxConcurrency: 2, exclusion: null }, // cost 0.003, index 0
  ];

  assert.equal(
    selectWorker(candidates, COST_PER_1K_TOKENS_SIMULATED, INITIAL_WORKER_ORDER),
    'supervisor',
  );

  // Reversing workerOrder flips winner when load and cost are equal
  assert.equal(
    selectWorker(candidates, COST_PER_1K_TOKENS_SIMULATED, [
      ...INITIAL_WORKER_ORDER,
    ].reverse()),
    'sonnet',
  );
});

test('4. Integer cross-multiplication treats 1/2 and 2/4 as exact equal load ratios', () => {
  const halfTwo: WorkerDispatchState = {
    workerId: 'worker_half_2',
    activeCount: 1,
    maxConcurrency: 2,
    exclusion: null,
  };
  const twoFourths: WorkerDispatchState = {
    workerId: 'worker_two_4',
    activeCount: 2,
    maxConcurrency: 4,
    exclusion: null,
  };

  // Equal cost -> tie-broken strictly by workerOrder in both directions, proving 1/2 === 2/4
  const equalCosts = { worker_half_2: 0.005, worker_two_4: 0.005 };
  assert.equal(
    selectWorker([twoFourths, halfTwo], equalCosts, [
      'worker_half_2',
      'worker_two_4',
    ]),
    'worker_half_2',
  );
  assert.equal(
    selectWorker([halfTwo, twoFourths], equalCosts, [
      'worker_two_4',
      'worker_half_2',
    ]),
    'worker_two_4',
  );
});

test('5. Missing or invalid cost rate is treated as positive infinity', () => {
  const missingCostCandidate: WorkerDispatchState = {
    workerId: 'worker_missing_cost',
    activeCount: 0,
    maxConcurrency: 1,
    exclusion: null,
  };
  const expensiveValidCandidate: WorkerDispatchState = {
    workerId: 'worker_expensive',
    activeCount: 0,
    maxConcurrency: 1,
    exclusion: null,
  };

  assert.equal(
    selectWorker(
      [missingCostCandidate, expensiveValidCandidate],
      { worker_expensive: 999.99 },
      ['worker_missing_cost', 'worker_expensive'],
    ),
    'worker_expensive',
  );

  // NaN and negative cost rates are also treated as invalid (+Infinity)
  assert.equal(
    selectWorker(
      [
        { workerId: 'w_nan', activeCount: 0, maxConcurrency: 1, exclusion: null },
        { workerId: 'w_neg', activeCount: 0, maxConcurrency: 1, exclusion: null },
        { workerId: 'w_valid', activeCount: 0, maxConcurrency: 1, exclusion: null },
      ],
      { w_nan: Number.NaN, w_neg: -0.001, w_valid: 50 },
      ['w_nan', 'w_neg', 'w_valid'],
    ),
    'w_valid',
  );
});

test('6. Two missing costs do not produce NaN comparator behavior', () => {
  const candidates: readonly WorkerDispatchState[] = [
    { workerId: 'w_b', activeCount: 0, maxConcurrency: 1, exclusion: null },
    { workerId: 'w_a', activeCount: 0, maxConcurrency: 1, exclusion: null },
  ];

  // Empty cost map -> both costs are +Infinity -> must deterministically proceed to workerOrder
  assert.equal(selectWorker(candidates, {}, ['w_a', 'w_b']), 'w_a');
  assert.equal(selectWorker(candidates, {}, ['w_b', 'w_a']), 'w_b');
});

test('7. When all candidates have infinite or missing costs, tie-break proceeds to workerOrder (using first occurrence)', () => {
  const candidates: readonly WorkerDispatchState[] = [
    { workerId: 'sonnet', activeCount: 0, maxConcurrency: 1, exclusion: null },
    { workerId: 'haiku', activeCount: 0, maxConcurrency: 2, exclusion: null },
    { workerId: 'opus', activeCount: 0, maxConcurrency: 1, exclusion: null },
  ];

  const infiniteCosts: Partial<Record<WorkerId, number>> = {
    sonnet: Number.POSITIVE_INFINITY,
    opus: Number.NaN,
  };

  // Duplicate IDs in workerOrder use first occurrence ('opus' at 0 beats 'haiku' at 1)
  const orderWithDuplicates: readonly WorkerId[] = [
    'opus',
    'haiku',
    'sonnet',
    'opus',
  ];
  assert.equal(
    selectWorker(candidates, infiniteCosts, orderWithDuplicates),
    'opus',
  );
});

test('8. Worker IDs absent from workerOrder sort after listed workers and tie-break via final string comparison', () => {
  const unlistedZ: WorkerDispatchState = {
    workerId: 'unlisted_z',
    activeCount: 0,
    maxConcurrency: 1,
    exclusion: null,
  };
  const unlistedA: WorkerDispatchState = {
    workerId: 'unlisted_a',
    activeCount: 0,
    maxConcurrency: 1,
    exclusion: null,
  };
  const listedLast: WorkerDispatchState = {
    workerId: 'listed_worker',
    activeCount: 0,
    maxConcurrency: 1,
    exclusion: null,
  };

  const equalCosts = {
    unlisted_z: 0.002,
    unlisted_a: 0.002,
    listed_worker: 0.002,
  };

  // Listed worker beats unlisted workers when load and cost are equal
  assert.equal(
    selectWorker([unlistedA, unlistedZ, listedLast], equalCosts, [
      'listed_worker',
    ]),
    'listed_worker',
  );

  // When no candidate is in workerOrder, plain string comparison picks 'unlisted_a'
  assert.equal(
    selectWorker([unlistedZ, unlistedA], equalCosts, ['some_other_worker']),
    'unlisted_a',
  );
});

test('9. Candidate input array order does not affect selection result across all permutations', () => {
  const c1: WorkerDispatchState = {
    workerId: 'opus',
    activeCount: 0,
    maxConcurrency: 1,
    exclusion: null,
  };
  const c2: WorkerDispatchState = {
    workerId: 'decision_engineer',
    activeCount: 0,
    maxConcurrency: 1,
    exclusion: null,
  };
  const c3: WorkerDispatchState = {
    workerId: 'haiku',
    activeCount: 1,
    maxConcurrency: 2,
    exclusion: null,
  };

  const permutations: Array<readonly WorkerDispatchState[]> = [
    [c1, c2, c3],
    [c1, c3, c2],
    [c2, c1, c3],
    [c2, c3, c1],
    [c3, c1, c2],
    [c3, c2, c1],
  ];

  for (const perm of permutations) {
    assert.equal(
      selectWorker(perm, COST_PER_1K_TOKENS_SIMULATED, INITIAL_WORKER_ORDER),
      'decision_engineer',
    );
  }
});

test('10. Repeated selection calls return identical deterministic results', () => {
  const candidates: readonly WorkerDispatchState[] = [
    { workerId: 'opus', activeCount: 0, maxConcurrency: 1, exclusion: null },
    {
      workerId: 'decision_engineer',
      activeCount: 0,
      maxConcurrency: 1,
      exclusion: null,
    },
    {
      workerId: 'market_monitor',
      activeCount: 0,
      maxConcurrency: 1,
      exclusion: null,
    },
  ];

  for (let i = 0; i < 25; i++) {
    assert.equal(
      selectWorker(
        candidates,
        COST_PER_1K_TOKENS_SIMULATED,
        INITIAL_WORKER_ORDER,
      ),
      'decision_engineer',
    );
  }
});

test('11. Blocked candidates (BLOCKED_STATE) are never selected', () => {
  const candidates: readonly WorkerDispatchState[] = [
    {
      workerId: 'haiku',
      activeCount: 0,
      maxConcurrency: 2,
      exclusion: 'BLOCKED_STATE',
    },
    { workerId: 'opus', activeCount: 0, maxConcurrency: 1, exclusion: null },
  ];

  assert.equal(
    selectWorker(candidates, COST_PER_1K_TOKENS_SIMULATED, INITIAL_WORKER_ORDER),
    'opus',
  );
});

test('12. Reserved candidates (LEGACY_QUEUE_RESERVED) are never selected', () => {
  const candidates: readonly WorkerDispatchState[] = [
    {
      workerId: 'haiku',
      activeCount: 0,
      maxConcurrency: 2,
      exclusion: 'LEGACY_QUEUE_RESERVED',
    },
    { workerId: 'sonnet', activeCount: 0, maxConcurrency: 1, exclusion: null },
  ];

  assert.equal(
    selectWorker(candidates, COST_PER_1K_TOKENS_SIMULATED, INITIAL_WORKER_ORDER),
    'sonnet',
  );
});

test('13. At-capacity candidates (AT_CAPACITY) are never selected', () => {
  const candidates: readonly WorkerDispatchState[] = [
    {
      workerId: 'haiku',
      activeCount: 2,
      maxConcurrency: 2,
      exclusion: 'AT_CAPACITY',
    },
    {
      workerId: 'supervisor',
      activeCount: 1,
      maxConcurrency: 2,
      exclusion: null,
    },
  ];

  assert.equal(
    selectWorker(candidates, COST_PER_1K_TOKENS_SIMULATED, INITIAL_WORKER_ORDER),
    'supervisor',
  );
});

test('14. Returns null when candidate list is empty or no eligible candidate remains', () => {
  assert.equal(
    selectWorker([], COST_PER_1K_TOKENS_SIMULATED, INITIAL_WORKER_ORDER),
    null,
  );

  const allExcluded: readonly WorkerDispatchState[] = [
    {
      workerId: 'supervisor',
      activeCount: 0,
      maxConcurrency: 2,
      exclusion: 'BLOCKED_STATE',
    },
    {
      workerId: 'haiku',
      activeCount: 0,
      maxConcurrency: 2,
      exclusion: 'LEGACY_QUEUE_RESERVED',
    },
    {
      workerId: 'sonnet',
      activeCount: 1,
      maxConcurrency: 1,
      exclusion: 'AT_CAPACITY',
    },
  ];

  assert.equal(
    selectWorker(
      allExcluded,
      COST_PER_1K_TOKENS_SIMULATED,
      INITIAL_WORKER_ORDER,
    ),
    null,
  );
});

test('15. Input candidates, costRates, and workerOrder remain completely unmutated', () => {
  const c1: WorkerDispatchState = Object.freeze({
    workerId: 'opus',
    activeCount: 0,
    maxConcurrency: 1,
    exclusion: null,
  });
  const c2: WorkerDispatchState = Object.freeze({
    workerId: 'haiku',
    activeCount: 0,
    maxConcurrency: 2,
    exclusion: null,
  });
  const frozenCandidates: readonly WorkerDispatchState[] = Object.freeze([
    c1,
    c2,
  ]);
  const frozenCosts = Object.freeze({ ...COST_PER_1K_TOKENS_SIMULATED });
  const frozenOrder: readonly WorkerId[] = Object.freeze([
    ...INITIAL_WORKER_ORDER,
  ]);

  const winner = selectWorker(frozenCandidates, frozenCosts, frozenOrder);
  assert.equal(winner, 'haiku');
  assert.strictEqual(frozenCandidates[0], c1);
  assert.strictEqual(frozenCandidates[1], c2);
  assert.deepEqual(frozenOrder, INITIAL_WORKER_ORDER);
});

test('16. Real canonical cost example: for equal-load DECISION_EVALUATION, decision_engineer (0.002) beats opus (0.015) despite opus appearing earlier in INITIAL_WORKER_ORDER', () => {
  const candidates: readonly WorkerDispatchState[] = [
    { workerId: 'opus', activeCount: 0, maxConcurrency: 1, exclusion: null },
    {
      workerId: 'decision_engineer',
      activeCount: 0,
      maxConcurrency: 1,
      exclusion: null,
    },
  ];

  // Verify opus precedes decision_engineer in INITIAL_WORKER_ORDER, so decision_engineer wins strictly by lower cost (0.002 < 0.015)
  assert.ok(
    INITIAL_WORKER_ORDER.indexOf('opus') <
      INITIAL_WORKER_ORDER.indexOf('decision_engineer'),
  );
  assert.equal(
    selectWorker(candidates, COST_PER_1K_TOKENS_SIMULATED, INITIAL_WORKER_ORDER),
    'decision_engineer',
  );
});

test('17. Synthetic and canonical equal-cost candidates resolve deterministically through workerOrder', () => {
  // Canonical equal-cost pair: decision_engineer (0.002) vs market_monitor (0.002)
  const canonicalPair: readonly WorkerDispatchState[] = [
    {
      workerId: 'market_monitor',
      activeCount: 0,
      maxConcurrency: 1,
      exclusion: null,
    },
    {
      workerId: 'decision_engineer',
      activeCount: 0,
      maxConcurrency: 1,
      exclusion: null,
    },
  ];
  assert.equal(
    selectWorker(
      canonicalPair,
      COST_PER_1K_TOKENS_SIMULATED,
      INITIAL_WORKER_ORDER,
    ),
    'decision_engineer',
  );

  // Synthetic equal-cost candidates
  const syntheticCandidates: readonly WorkerDispatchState[] = [
    { workerId: 'syn_gamma', activeCount: 1, maxConcurrency: 3, exclusion: null },
    { workerId: 'syn_alpha', activeCount: 1, maxConcurrency: 3, exclusion: null },
    { workerId: 'syn_beta', activeCount: 1, maxConcurrency: 3, exclusion: null },
  ];
  const syntheticCosts = {
    syn_alpha: 0.004,
    syn_beta: 0.004,
    syn_gamma: 0.004,
  };
  assert.equal(
    selectWorker(syntheticCandidates, syntheticCosts, [
      'syn_beta',
      'syn_gamma',
      'syn_alpha',
    ]),
    'syn_beta',
  );
});

test('18. Final string tie-break uses code-unit (< / >) comparison and is strictly locale-independent', () => {
  // In UTF-16 code units, 'W' (0x57 = 87) < 'w' (0x77 = 119), so 'Worker_B' < 'worker_a'.
  // In contrast, English localeCompare places 'worker_a' before 'Worker_B'.
  const candidates: readonly WorkerDispatchState[] = [
    { workerId: 'worker_a', activeCount: 0, maxConcurrency: 1, exclusion: null },
    { workerId: 'Worker_B', activeCount: 0, maxConcurrency: 1, exclusion: null },
  ];

  const equalCosts = {
    worker_a: 0.002,
    Worker_B: 0.002,
  };

  // Empty workerOrder forces final string tie-breaker
  assert.equal(selectWorker(candidates, equalCosts, []), 'Worker_B');
});
