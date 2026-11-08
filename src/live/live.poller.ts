/**
 * Single coordinated polling lifecycle for authenticated LIVE observability.
 *
 * Each endpoint has an independent cadence, retry timer and stale deadline.
 * Requests never overlap per endpoint. The scheduler is injectable so timing
 * rules can be tested deterministically without real waiting.
 */
import { LiveApiError, type LiveApiErrorCode } from './live.api';
import { LIVE_API_PATHS, type LiveApiPath } from './live.contracts';
import { liveController, type LiveController } from './live.controller';
import { useLiveStore } from './live.state';

export const LIVE_POLL_INTERVALS: Readonly<Record<LiveApiPath, number>> = Object.freeze({
  '/api/v1/system/status': 10_000,
  '/api/v1/pipeline/active': 10_000,
  '/api/v1/market-watches/active': 10_000,
  '/api/v1/telemetry/usage': 30_000,
  '/api/v1/audit/decisions': 30_000,
});

export const LIVE_STALE_INTERVAL_MULTIPLIER = 3;
export const LIVE_OFFLINE_FAILURE_THRESHOLD = 2;
export const LIVE_RETRY_BASE_MS = 1_000;
export const LIVE_RETRY_MAX_MS = 60_000;
export const LIVE_SSE_RECONCILIATION_INTERVAL_MS = 60_000;

export interface LivePollerClock {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(handle: number): void;
}

export interface LivePollerOptions {
  readonly clock?: LivePollerClock;
  readonly random?: () => number;
}

export interface LivePoller {
  start(options?: { skipSessionBootstrap?: boolean }): Promise<boolean>;
  stop(): void;
  refresh(path: LiveApiPath): Promise<void>;
  refreshAll(): Promise<void>;
  setEventConnected(connected: boolean): void;
  isRunning(): boolean;
}

const browserClock: LivePollerClock = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
  clearTimeout: (handle) => window.clearTimeout(handle),
};

function errorCode(error: unknown): LiveApiErrorCode {
  return error instanceof LiveApiError ? error.code : 'UNEXPECTED_RESPONSE';
}

function isTransportFailure(code: LiveApiErrorCode): boolean {
  return code === 'OFFLINE' || code === 'TIMEOUT';
}

export function calculateLiveRetryDelay(
  failureCount: number,
  randomValue = 0.5,
): number {
  const safeFailureCount = Number.isFinite(failureCount)
    ? Math.max(1, Math.floor(failureCount))
    : 1;
  const exponent = Math.min(safeFailureCount - 1, 16);
  const base = Math.min(LIVE_RETRY_MAX_MS, LIVE_RETRY_BASE_MS * (2 ** exponent));
  const sample = Number.isFinite(randomValue)
    ? Math.min(1, Math.max(0, randomValue))
    : 0.5;
  const jittered = Math.round(base * (0.8 + sample * 0.4));
  return Math.max(1, Math.min(LIVE_RETRY_MAX_MS, jittered));
}

export function createLivePoller(
  controller: LiveController = liveController,
  options: LivePollerOptions = {},
): LivePoller {
  const clock = options.clock ?? browserClock;
  const random = options.random ?? Math.random;
  const nextTimers = new Map<LiveApiPath, number>();
  const staleTimers = new Map<LiveApiPath, number>();
  const inFlight = new Map<LiveApiPath, number>();
  const retryCounts = new Map<LiveApiPath, number>();
  const dirtyPaths = new Set<LiveApiPath>();

  let running = false;
  let generation = 0;
  let consecutiveTransportFailures = 0;
  let transportOffline = false;
  let eventConnected = false;

  function pollingInterval(path: LiveApiPath): number {
    return eventConnected ? LIVE_SSE_RECONCILIATION_INTERVAL_MS : LIVE_POLL_INTERVALS[path];
  }

  function isCurrent(runGeneration: number): boolean {
    return running && generation === runGeneration;
  }

  function clearTimer(map: Map<LiveApiPath, number>, path: LiveApiPath): void {
    const handle = map.get(path);
    if (handle !== undefined) {
      clock.clearTimeout(handle);
      map.delete(path);
    }
  }

  function clearAllTimers(): void {
    for (const handle of nextTimers.values()) clock.clearTimeout(handle);
    for (const handle of staleTimers.values()) clock.clearTimeout(handle);
    nextTimers.clear();
    staleTimers.clear();
  }

  function recomputeConnection(): void {
    const state = useLiveStore.getState();
    if (state.session === 'UNAUTHENTICATED') {
      state.setConnection('SESSION_REQUIRED');
      return;
    }
    if (transportOffline) {
      state.setConnection('OFFLINE');
      return;
    }

    const statuses = LIVE_API_PATHS.map((path) => state.resources[path].status);
    if (statuses.includes('ERROR')) {
      state.setConnection('ERROR');
    } else if (statuses.includes('STALE')) {
      state.setConnection('STALE');
    } else if (statuses.every((status) => status === 'LIVE')) {
      state.setConnection('LIVE');
    } else {
      state.setConnection('CONNECTING');
    }
  }

  function scheduleNext(path: LiveApiPath, delayMs: number, runGeneration: number): void {
    if (!isCurrent(runGeneration)) return;
    clearTimer(nextTimers, path);
    const handle = clock.setTimeout(() => {
      nextTimers.delete(path);
      void pollPath(path, runGeneration);
    }, delayMs);
    nextTimers.set(path, handle);
  }

  function scheduleStaleDeadline(
    path: LiveApiPath,
    fetchedAt: number,
    runGeneration: number,
  ): void {
    clearTimer(staleTimers, path);
    const staleAt = fetchedAt + pollingInterval(path) * LIVE_STALE_INTERVAL_MULTIPLIER;
    const delay = Math.max(0, staleAt - clock.now());
    const handle = clock.setTimeout(() => {
      staleTimers.delete(path);
      if (!isCurrent(runGeneration)) return;
      useLiveStore.getState().markResourceStale(path, fetchedAt);
      recomputeConnection();
    }, delay);
    staleTimers.set(path, handle);
  }

  async function pollPath(path: LiveApiPath, runGeneration: number): Promise<void> {
    if (!isCurrent(runGeneration)) return;

    // A slow request must never overlap with another request to the same route.
    if (inFlight.has(path)) {
      dirtyPaths.add(path);
      return;
    }

    const previous = useLiveStore.getState().resources[path];
    inFlight.set(path, runGeneration);
    useLiveStore.getState().setResourceLoading(path);

    try {
      const data = await controller.getResource(path);
      if (!isCurrent(runGeneration)) return;

      const fetchedAt = clock.now();
      useLiveStore.getState().setResourceSuccess(path, data, fetchedAt);
      useLiveStore.getState().setSession('AUTHENTICATED');
      retryCounts.set(path, 0);
      consecutiveTransportFailures = 0;
      transportOffline = false;
      recomputeConnection();
      scheduleStaleDeadline(path, fetchedAt, runGeneration);
      scheduleNext(path, pollingInterval(path), runGeneration);
    } catch (error) {
      if (!isCurrent(runGeneration)) return;

      const code = errorCode(error);
      if (code === 'SESSION_REQUIRED') {
        stop();
        useLiveStore.getState().clearPrivateLiveData();
        return;
      }

      const retries = (retryCounts.get(path) ?? 0) + 1;
      retryCounts.set(path, retries);

      if (isTransportFailure(code)) {
        consecutiveTransportFailures += 1;
        useLiveStore.getState().restoreResourceAfterTransportFailure(
          path,
          previous.status,
          code,
        );
        if (previous.fetchedAt !== null) {
          // If a timeout crossed the stale deadline while the request was
          // loading, re-arm the remaining time instead of losing the deadline.
          scheduleStaleDeadline(path, previous.fetchedAt, runGeneration);
        }
        if (consecutiveTransportFailures >= LIVE_OFFLINE_FAILURE_THRESHOLD) {
          transportOffline = true;
        }
      } else {
        consecutiveTransportFailures = 0;
        useLiveStore.getState().setResourceError(path, code);
      }

      recomputeConnection();
      scheduleNext(path, calculateLiveRetryDelay(retries, random()), runGeneration);
    } finally {
      if (inFlight.get(path) === runGeneration) inFlight.delete(path);

      // If a new session/polling generation began while this request was in flight,
      // immediately service the path that the new generation safely skipped.
      if (running && !inFlight.has(path) && !nextTimers.has(path)) {
        if (dirtyPaths.delete(path) || generation !== runGeneration) {
          scheduleNext(path, 0, generation);
        }
      }
    }
  }

  function stop(): void {
    running = false;
    generation += 1;
    clearAllTimers();
    dirtyPaths.clear();
    eventConnected = false;
  }

  return {
    async start(startOptions = {}): Promise<boolean> {
      if (running) return true;
      running = true;
      const runGeneration = ++generation;
      consecutiveTransportFailures = 0;
      transportOffline = false;
      retryCounts.clear();
      useLiveStore.getState().setConnection('CONNECTING');

      try {
        if (startOptions.skipSessionBootstrap) {
          if (useLiveStore.getState().session !== 'AUTHENTICATED') {
            running = false;
            return false;
          }
        } else {
          const authenticated = await controller.bootstrapSession();
          if (!isCurrent(runGeneration)) return false;
          if (!authenticated) {
            running = false;
            return false;
          }
        }
      } catch (error) {
        if (isCurrent(runGeneration)) running = false;
        throw error;
      }

      if (!isCurrent(runGeneration)) return false;
      await Promise.all(LIVE_API_PATHS.map((path) => pollPath(path, runGeneration)));
      return isCurrent(runGeneration);
    },

    stop,

    async refresh(path: LiveApiPath): Promise<void> {
      if (!running) return;
      clearTimer(nextTimers, path);
      await pollPath(path, generation);
    },

    async refreshAll(): Promise<void> {
      if (!running) return;
      for (const path of LIVE_API_PATHS) clearTimer(nextTimers, path);
      await Promise.all(LIVE_API_PATHS.map((path) => pollPath(path, generation)));
    },

    setEventConnected(connected: boolean): void {
      if (eventConnected === connected || !running) return;
      eventConnected = connected;
      for (const path of LIVE_API_PATHS) {
        clearTimer(nextTimers, path);
        if (!inFlight.has(path)) scheduleNext(path, pollingInterval(path), generation);
        const snapshot = useLiveStore.getState().resources[path];
        if (snapshot.fetchedAt !== null) scheduleStaleDeadline(path, snapshot.fetchedAt, generation);
      }
    },

    isRunning(): boolean {
      return running;
    },
  };
}
