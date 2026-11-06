import { WorkerId } from '../workers/worker.types';

/**
 * Lightweight Render Profiler for Worker Component Render Isolation Verification
 * Tracks per-worker component render counts so automated tests can verify that
 * updating a single worker in Zustand does not cause unnecessary re-renders of
 * the other 6 worker components.
 */

const workerRenderCounts: Record<string, number> = {};

export function recordWorkerComponentRender(workerId: WorkerId, scope: 'avatar' | 'roster' | 'badge' = 'avatar'): void {
  const key = `${scope}:${workerId}`;
  workerRenderCounts[key] = (workerRenderCounts[key] ?? 0) + 1;
}

export function getWorkerComponentRenderCount(workerId: WorkerId, scope: 'avatar' | 'roster' | 'badge' = 'avatar'): number {
  return workerRenderCounts[`${scope}:${workerId}`] ?? 0;
}

export function resetWorkerRenderCounts(): void {
  for (const key of Object.keys(workerRenderCounts)) {
    delete workerRenderCounts[key];
  }
}
