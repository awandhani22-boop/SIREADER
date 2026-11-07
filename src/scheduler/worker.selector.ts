import type { WorkerId } from '../workers/worker.types';
import type { WorkerDispatchState } from './worker.matching';

/**
 * Deterministic Worker Selector (Phase 2.2 — Local Deterministic Simulation)
 *
 * Pure, side-effect-free candidate selection using strict tie-break hierarchy:
 * 1. Lowest load ratio (`activeCount / maxConcurrency`) via integer cross-multiplication.
 * 2. Lowest simulated cost rate (missing or invalid cost rates treated as +Infinity).
 * 3. Earliest first-occurrence index in `workerOrder` (absent IDs sort after listed IDs).
 * 4. Plain code-unit string comparison (`<` / `>`) on `workerId` (locale-independent).
 */

function resolvePositiveDenominator(maxConcurrency: number): number {
  if (
    typeof maxConcurrency === 'number' &&
    Number.isFinite(maxConcurrency) &&
    maxConcurrency > 0
  ) {
    return maxConcurrency;
  }
  return 1;
}

function resolveSimulatedCostRate(
  costRates: Readonly<Partial<Record<WorkerId, number>>>,
  workerId: WorkerId,
): number {
  if (
    !costRates ||
    typeof costRates !== 'object' ||
    !Object.prototype.hasOwnProperty.call(costRates, workerId)
  ) {
    return Number.POSITIVE_INFINITY;
  }

  const rawRate = costRates[workerId];
  if (
    typeof rawRate === 'number' &&
    Number.isFinite(rawRate) &&
    rawRate >= 0
  ) {
    return rawRate;
  }

  return Number.POSITIVE_INFINITY;
}

function buildFirstOccurrenceOrderMap(
  workerOrder: readonly WorkerId[],
): Map<WorkerId, number> {
  const indexMap = new Map<WorkerId, number>();
  if (!Array.isArray(workerOrder)) {
    return indexMap;
  }

  for (let i = 0; i < workerOrder.length; i++) {
    const workerId = workerOrder[i];
    if (typeof workerId === 'string' && !indexMap.has(workerId)) {
      indexMap.set(workerId, i);
    }
  }

  return indexMap;
}

/**
 * Selects the optimal eligible worker from `candidates` without mutating any inputs.
 * Ignores any candidate with `exclusion !== null`. Returns `null` when no eligible candidate exists.
 */
export function selectWorker(
  candidates: readonly WorkerDispatchState[],
  costRates: Readonly<Partial<Record<WorkerId, number>>>,
  workerOrder: readonly WorkerId[],
): WorkerId | null {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }

  const eligibleCandidates: WorkerDispatchState[] = [];
  for (const candidate of candidates) {
    if (candidate && candidate.exclusion === null) {
      eligibleCandidates.push(candidate);
    }
  }

  if (eligibleCandidates.length === 0) {
    return null;
  }

  const orderIndexMap = buildFirstOccurrenceOrderMap(workerOrder);

  eligibleCandidates.sort((a, b) => {
    // 1. Lowest load ratio via integer cross-multiplication
    const aMax = resolvePositiveDenominator(a.maxConcurrency);
    const bMax = resolvePositiveDenominator(b.maxConcurrency);
    const aCross = a.activeCount * bMax;
    const bCross = b.activeCount * aMax;
    if (aCross < bCross) return -1;
    if (aCross > bCross) return 1;

    // 2. Lowest simulated cost rate (explicit < / > so +Infinity === +Infinity never yields NaN)
    const aCost = resolveSimulatedCostRate(costRates, a.workerId);
    const bCost = resolveSimulatedCostRate(costRates, b.workerId);
    if (aCost < bCost) return -1;
    if (aCost > bCost) return 1;

    // 3. Earliest position in workerOrder (absent IDs sort after all listed IDs)
    const aOrderIdx = orderIndexMap.get(a.workerId) ?? Number.POSITIVE_INFINITY;
    const bOrderIdx = orderIndexMap.get(b.workerId) ?? Number.POSITIVE_INFINITY;
    if (aOrderIdx < bOrderIdx) return -1;
    if (aOrderIdx > bOrderIdx) return 1;

    // 4. Plain code-unit worker ID comparison (never localeCompare)
    if (a.workerId < b.workerId) return -1;
    if (a.workerId > b.workerId) return 1;
    return 0;
  });

  return eligibleCandidates[0].workerId;
}
