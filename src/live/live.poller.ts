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
import {
  LIVE_EVENT_STREAM_URL,
  LIVE_SSE_RECONCILIATION_INTERVAL_MS,
  parseLiveInvalidationEvent,
  parseLiveResetEvent,
  type LiveEventSourceLike,
} from './live.events';

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
export const LIVE_SSE_FAILURE_THRESHOLD = 3;

export interface LivePollerClock {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(handle: number): void;
}

export interface LivePollerOptions {
  readonly clock?: LivePollerClock;
  readonly random?: () => number;
  readonly eventSourceFactory?: (url: string) => LiveEventSourceLike;
}

export interface LivePoller {
  start(options?: { skipSessionBootstrap?: boolean }): Promise<boolean>;
  stop(): void;
  refresh(path: LiveApiPath): Promise<void>;
  refreshAll(): Promise<void>;
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

  let eventSource: LiveEventSourceLike | null = null;
  let eventSourceRetryTimer: number | null = null;
  let eventStreamHealthy = false;
  let eventStreamFailures = 0;
  let eventEpoch: string | null = null;
  let lastEventSequence: number | null = null;

  const eventSourceFactory = options.eventSourceFactory ?? (
    typeof EventSource === 'undefined'
      ? undefined
      : (url: string) => new EventSource(url)
  );

  let running = false;
  let generation = 0;
  let consecutiveTransportFailures = 0;
  let transportOffline = false;

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

  function currentPollInterval(path: LiveApiPath): number {
    return eventStreamHealthy
      ? LIVE_SSE_RECONCILIATION_INTERVAL_MS
      : LIVE_POLL_INTERVALS[path];
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
    const staleAt = fetchedAt + currentPollInterval(path) * LIVE_STALE_INTERVAL_MULTIPLIER;
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
    // Preserve an invalidation received during an in-flight snapshot fetch.
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
      scheduleNext(path, currentPollInterval(path), runGeneration);
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

      if (dirtyPaths.delete(path) && isCurrent(runGeneration)) {
        scheduleNext(path, 0, runGeneration);
      }

      // If a new session/polling generation began while this request was in flight,
      // immediately service the path that the new generation safely skipped.
      if (
        running &&
        generation !== runGeneration &&
        !inFlight.has(path) &&
        !nextTimers.has(path)
      ) {
        scheduleNext(path, 0, generation);
      }
    }
  }

  function refreshPaths(paths: readonly LiveApiPath[], runGeneration: number): Promise<void> {
    if (!isCurrent(runGeneration)) return Promise.resolve();
    for (const path of paths) clearTimer(nextTimers, path);
    return Promise.all(paths.map((path) => pollPath(path, runGeneration))).then(() => undefined);
  }

  function setEventStreamHealth(healthy: boolean, runGeneration: number): void {
    if (!isCurrent(runGeneration) || eventStreamHealthy === healthy) return;
    eventStreamHealthy = healthy;
    for (const path of LIVE_API_PATHS) {
      clearTimer(nextTimers, path);
      scheduleNext(path, currentPollInterval(path), runGeneration);
      const fetchedAt = useLiveStore.getState().resources[path].fetchedAt;
      if (fetchedAt !== null) scheduleStaleDeadline(path, fetchedAt, runGeneration);
    }
  }

  function clearEventStreamRetry(): void {
    if (eventSourceRetryTimer !== null) {
      clock.clearTimeout(eventSourceRetryTimer);
      eventSourceRetryTimer = null;
    }
  }

  function closeEventSource(): void {
    clearEventStreamRetry();
    if (eventSource !== null) {
      eventSource.onopen = null;
      eventSource.onerror = null;
      eventSource.close();
      eventSource = null;
    }
    eventStreamHealthy = false;
    eventEpoch = null;
    lastEventSequence = null;
  }

  function scheduleEventStreamRetry(runGeneration: number): void {
    if (!eventSourceFactory || !isCurrent(runGeneration) || eventSourceRetryTimer !== null) return;
    const delay = calculateLiveRetryDelay(Math.max(1, eventStreamFailures), random());
    eventSourceRetryTimer = clock.setTimeout(() => {
      eventSourceRetryTimer = null;
      connectEventStream(runGeneration);
    }, delay);
  }

  function resetEventStream(runGeneration: number): void {
    if (!isCurrent(runGeneration)) return;
    closeEventSource();
    void refreshPaths(LIVE_API_PATHS, runGeneration);
    scheduleEventStreamRetry(runGeneration);
  }

  function onInvalidationEvent(event: Event, runGeneration: number): void {
    if (!isCurrent(runGeneration)) return;
    const message = event as MessageEvent<string>;
    const parsed = parseLiveInvalidationEvent(message.data, message.lastEventId);
    if (!parsed) {
      eventStreamFailures += 1;
      resetEventStream(runGeneration);
      return;
    }

    if (eventEpoch === null) {
      eventEpoch = parsed.epoch;
      lastEventSequence = parsed.sequence;
      void refreshPaths(parsed.paths, runGeneration);
      return;
    }
    if (eventEpoch !== parsed.epoch) {
      eventEpoch = parsed.epoch;
      lastEventSequence = parsed.sequence;
      void refreshPaths(LIVE_API_PATHS, runGeneration);
      return;
    }
    if (lastEventSequence !== null && parsed.sequence <= lastEventSequence) return;
    const sequenceGap = lastEventSequence !== null && parsed.sequence > lastEventSequence + 1;
    lastEventSequence = parsed.sequence;
    void refreshPaths(sequenceGap ? LIVE_API_PATHS : parsed.paths, runGeneration);
  }

  function connectEventStream(runGeneration: number): void {
    if (!eventSourceFactory || !isCurrent(runGeneration)) return;
    closeEventSource();

    let source: LiveEventSourceLike;
    try {
      source = eventSourceFactory(LIVE_EVENT_STREAM_URL);
    } catch {
      eventStreamFailures += 1;
      setEventStreamHealth(false, runGeneration);
      scheduleEventStreamRetry(runGeneration);
      return;
    }
    eventSource = source;

    source.onopen = () => {
      if (!isCurrent(runGeneration) || eventSource !== source) return;
      eventStreamFailures = 0;
      setEventStreamHealth(true, runGeneration);
    };

    source.onerror = () => {
      if (!isCurrent(runGeneration) || eventSource !== source) return;
      eventStreamFailures += 1;
      const wasHealthy = eventStreamHealthy;
      setEventStreamHealth(false, runGeneration);
      if (wasHealthy) void refreshPaths(LIVE_API_PATHS, runGeneration);

      // Let EventSource perform a small number of native reconnect attempts.
      // Then close it and use bounded application-level backoff while snapshots
      // continue on the regular 10s/30s cadence.
      if (eventStreamFailures >= LIVE_SSE_FAILURE_THRESHOLD) {
        source.close();
        if (eventSource === source) eventSource = null;
        scheduleEventStreamRetry(runGeneration);
      }
    };

    source.addEventListener('resources.invalidated', (event) => {
      if (eventSource === source) onInvalidationEvent(event, runGeneration);
    });
    source.addEventListener('stream.reset', (event) => {
      if (!isCurrent(runGeneration) || eventSource !== source) return;
      const message = event as MessageEvent<string>;
      const reason = parseLiveResetEvent(message.data);
      if (reason === null) eventStreamFailures += 1;
      else eventStreamFailures = Math.max(1, eventStreamFailures);
      resetEventStream(runGeneration);
    });
  }

  function stop(): void {
    running = false;
    generation += 1;
    clearAllTimers();
    closeEventSource();
    dirtyPaths.clear();
  }

  return {
    async start(startOptions = {}): Promise<boolean> {
      if (running) return true;
      running = true;
      const runGeneration = ++generation;
      consecutiveTransportFailures = 0;
      transportOffline = false;
      retryCounts.clear();
      dirtyPaths.clear();
      eventStreamFailures = 0;
      eventStreamHealthy = false;
      eventEpoch = null;
      lastEventSequence = null;
      clearEventStreamRetry();
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
      if (isCurrent(runGeneration)) connectEventStream(runGeneration);
      return isCurrent(runGeneration);
    },

    stop,

    async refresh(path: LiveApiPath): Promise<void> {
      if (!running) return;
      await refreshPaths([path], generation);
    },

    async refreshAll(): Promise<void> {
      if (!running) return;
      await refreshPaths(LIVE_API_PATHS, generation);
    },

    isRunning(): boolean {
      return running;
    },
  };
}
