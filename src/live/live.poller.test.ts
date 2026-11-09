import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LIVE_API_PATHS,
  type ActiveMarketWatchesDto,
  type ActivePipelineDto,
  type AuditDecisionsDto,
  type AuthenticatedSessionDto,
  type LiveApiPath,
  type LiveApiResponseMap,
  type SystemStatusDto,
  type TelemetryUsageDto,
} from './live.contracts';
import { LiveApiError, type LiveApiClient } from './live.api';
import { createLiveController } from './live.controller';
import {
  calculateLiveRetryDelay,
  createLivePoller,
  LIVE_POLL_INTERVALS,
  LIVE_RETRY_MAX_MS,
  LIVE_STALE_INTERVAL_MULTIPLIER,
  type LivePollerClock,
} from './live.poller';
import { useLiveStore } from './live.state';
import { useOfficeStore } from '../workers/worker.state';
import type { LiveEventSourceLike } from './live.events';
import { LIVE_SSE_RECONCILIATION_INTERVAL_MS } from './live.events';

const session: AuthenticatedSessionDto = {
  authenticated: true,
  csrfToken: 'B'.repeat(43),
};

const responses: LiveApiResponseMap = {
  '/api/v1/system/status': {
    api_status: 'HEALTHY',
    database_status: 'CONNECTED',
    server_time_utc: '2026-11-08T10:00:00Z',
    runtime_control: null,
    process_monitoring_note: 'Process heartbeat is not exposed by this API.',
  } satisfies SystemStatusDto,
  '/api/v1/telemetry/usage': {
    period_start: '2026-11-01',
    period_end: '2026-11-08',
    period_days: 7,
    currencies: [],
    models: [],
  } satisfies TelemetryUsageDto,
  '/api/v1/pipeline/active': {
    server_time_utc: '2026-11-08T10:00:00Z',
    total_in_flight: 0,
    total_queued: 0,
    in_flight_tasks: [],
    queued_messages: [],
  } satisfies ActivePipelineDto,
  '/api/v1/market-watches/active': {
    server_time_utc: '2026-11-08T10:00:00Z',
    total_active_watches: 0,
    watches: [],
  } satisfies ActiveMarketWatchesDto,
  '/api/v1/audit/decisions': {
    server_time_utc: '2026-11-08T10:00:00Z',
    total_returned: 0,
    offset: 0,
    decisions: [],
  } satisfies AuditDecisionsDto,
  '/api/v1/workforce/runtime': {
    server_time_utc: '2026-11-09T10:00:00Z',
    runtime: {
      observed_at: '2026-11-09T10:00:00Z', configured_workers: 7,
      ready_workers: 0, stale_workers: 0, offline_workers: 7,
      active_tasks: 0, queued_tasks: 0, waiting_review_tasks: 0,
      dead_lettered_tasks: 0, completed_last_24h: 0,
    },
    workers: [],
  },
  '/api/v1/workforce/tasks': {
    server_time_utc: '2026-11-09T10:00:00Z',
    total_count: 0, limit: 50, offset: 0, tasks: [],
  },
  '/api/v1/workforce/activity': {
    server_time_utc: '2026-11-09T10:00:00Z',
    total_count: 0, limit: 50, offset: 0, events: [],
  },
};

class FakeClock implements LivePollerClock {
  private nextId = 1;
  private tasks = new Map<number, { at: number; callback: () => void }>();
  private currentTime = 0;

  now(): number {
    return this.currentTime;
  }

  setTimeout(callback: () => void, delayMs: number): number {
    const id = this.nextId++;
    this.tasks.set(id, {
      at: this.currentTime + Math.max(0, delayMs),
      callback,
    });
    return id;
  }

  clearTimeout(handle: number): void {
    this.tasks.delete(handle);
  }

  async flushMicrotasks(): Promise<void> {
    for (let index = 0; index < 12; index += 1) await Promise.resolve();
  }

  async advanceBy(deltaMs: number): Promise<void> {
    const target = this.currentTime + deltaMs;
    let guard = 0;
    while (true) {
      const next = [...this.tasks.entries()]
        .filter(([, task]) => task.at <= target)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      if (++guard > 10_000) throw new Error('FakeClock exceeded its timer execution guard.');
      const [id, task] = next;
      this.tasks.delete(id);
      this.currentTime = task.at;
      task.callback();
      await this.flushMicrotasks();
    }
    this.currentTime = target;
    await this.flushMicrotasks();
  }

  pendingCount(): number {
    return this.tasks.size;
  }
}

class FakeEventSource implements LiveEventSourceLike {
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  closed = false;
  private handlers = new Map<string, EventListener[]>();

  addEventListener(type: string, listener: EventListener): void {
    const handlers = this.handlers.get(type) ?? [];
    handlers.push(listener);
    this.handlers.set(type, handlers);
  }

  open(): void {
    this.onopen?.(new Event('open'));
  }

  fail(): void {
    this.onerror?.(new Event('error'));
  }

  emit(type: string, data: string, lastEventId = ''): void {
    const event = Object.assign(new Event(type), { data, lastEventId }) as MessageEvent<string>;
    for (const listener of this.handlers.get(type) ?? []) listener(event);
  }

  close(): void {
    this.closed = true;
  }
}

function createApi(
  get: (path: LiveApiPath) => Promise<LiveApiResponseMap[LiveApiPath]>,
): LiveApiClient {
  return {
    getSession: async () => session,
    login: async () => session,
    logout: async () => undefined,
    get: async <K extends LiveApiPath>(path: K) =>
      await get(path) as LiveApiResponseMap[K],
    clearCsrfToken: () => undefined,
  };
}

test('SIREADER Batch 5 — LIVE polling cadence, freshness, retry and recovery', async (t) => {
  await t.test('fixed endpoint cadence is 10s and 30s without changing simulation time', async () => {
    useLiveStore.getState().reset();
    const clock = new FakeClock();
    const counts = new Map<LiveApiPath, number>();
    const api = createApi(async (path) => {
      counts.set(path, (counts.get(path) ?? 0) + 1);
      return responses[path];
    });
    const poller = createLivePoller(createLiveController(api), {
      clock,
      random: () => 0.5,
    });

    assert.equal(await poller.start(), true);
    assert.deepEqual([...counts.entries()].sort(), LIVE_API_PATHS.map((path) => [path, 1]).sort());
    assert.equal(useLiveStore.getState().resources['/api/v1/system/status'].status, 'LIVE');

    await clock.advanceBy(9_999);
    assert.equal(counts.get('/api/v1/system/status'), 1);
    await clock.advanceBy(1);
    assert.equal(counts.get('/api/v1/system/status'), 2);
    assert.equal(counts.get('/api/v1/pipeline/active'), 2);
    assert.equal(counts.get('/api/v1/market-watches/active'), 2);
    assert.equal(counts.get('/api/v1/telemetry/usage'), 1);
    assert.equal(counts.get('/api/v1/audit/decisions'), 1);

    await clock.advanceBy(20_000);
    assert.equal(counts.get('/api/v1/system/status'), 4);
    assert.equal(counts.get('/api/v1/pipeline/active'), 4);
    assert.equal(counts.get('/api/v1/market-watches/active'), 4);
    assert.equal(counts.get('/api/v1/telemetry/usage'), 2);
    assert.equal(counts.get('/api/v1/audit/decisions'), 2);

    assert.equal(LIVE_POLL_INTERVALS['/api/v1/system/status'], 10_000);
    assert.equal(LIVE_POLL_INTERVALS['/api/v1/telemetry/usage'], 30_000);
    assert.equal(useLiveStore.getState().resources['/api/v1/system/status'].source, 'LIVE');
    poller.stop();
  });

  await t.test('global connection is LIVE only after all eight endpoint snapshots are validated', async () => {
    useLiveStore.getState().reset();
    const clock = new FakeClock();
    let resolveSystem: ((value: SystemStatusDto) => void) | undefined;
    const api = createApi(async (path) => {
      if (path === '/api/v1/system/status') {
        return new Promise<SystemStatusDto>((resolve) => { resolveSystem = resolve; });
      }
      return responses[path];
    });
    const poller = createLivePoller(createLiveController(api), { clock });
    const starting = poller.start();
    await clock.flushMicrotasks();

    assert.equal(useLiveStore.getState().resources['/api/v1/pipeline/active'].status, 'LIVE');
    assert.equal(useLiveStore.getState().resources['/api/v1/system/status'].status, 'LOADING');
    assert.equal(useLiveStore.getState().connection, 'CONNECTING');

    resolveSystem?.(responses['/api/v1/system/status']);
    assert.equal(await starting, true);
    assert.equal(useLiveStore.getState().connection, 'LIVE');
    poller.stop();
  });

  await t.test('a slow endpoint is never requested twice concurrently', async () => {
    useLiveStore.getState().reset();
    const clock = new FakeClock();
    let systemCalls = 0;
    let resolveSystem: ((value: SystemStatusDto) => void) | undefined;
    const api = createApi(async (path) => {
      if (path === '/api/v1/system/status') {
        systemCalls += 1;
        return new Promise<SystemStatusDto>((resolve) => { resolveSystem = resolve; });
      }
      return responses[path];
    });
    const poller = createLivePoller(createLiveController(api), { clock });
    const starting = poller.start();
    await clock.flushMicrotasks();

    assert.equal(systemCalls, 1);
    await poller.refresh('/api/v1/system/status');
    assert.equal(systemCalls, 1);

    resolveSystem?.(responses['/api/v1/system/status']);
    assert.equal(await starting, true);
    assert.equal(systemCalls, 1);
    poller.stop();
  });

  await t.test('retry delay uses bounded jitter and never exceeds 60 seconds', () => {
    assert.equal(calculateLiveRetryDelay(1, 0), 800);
    assert.equal(calculateLiveRetryDelay(1, 1), 1_200);
    assert.equal(calculateLiveRetryDelay(2, 0.5), 2_000);
    assert.equal(calculateLiveRetryDelay(99, 1), LIVE_RETRY_MAX_MS);
    assert.ok(calculateLiveRetryDelay(99, 0) <= LIVE_RETRY_MAX_MS);
    assert.ok(calculateLiveRetryDelay(99, 0) > 0);
  });

  await t.test('two consecutive transport failures mark connection OFFLINE and a success recovers to LIVE', async () => {
    useLiveStore.getState().reset();
    const clock = new FakeClock();
    let fail = false;
    const api = createApi(async (path) => {
      if (fail) throw new LiveApiError('OFFLINE');
      return responses[path];
    });
    const poller = createLivePoller(createLiveController(api), {
      clock,
      random: () => 0.5,
    });

    assert.equal(await poller.start(), true);
    fail = true;
    await clock.advanceBy(10_000);
    assert.equal(useLiveStore.getState().connection, 'OFFLINE');

    fail = false;
    await poller.refresh('/api/v1/system/status');
    assert.equal(useLiveStore.getState().connection, 'LIVE');
    assert.equal(useLiveStore.getState().resources['/api/v1/system/status'].status, 'LIVE');
    poller.stop();
  });

  await t.test('last-known validated values become STALE after three intervals and remain available', async () => {
    useLiveStore.getState().reset();
    const clock = new FakeClock();
    let fail = false;
    const api = createApi(async (path) => {
      if (fail) throw new LiveApiError('OFFLINE');
      return responses[path];
    });
    const poller = createLivePoller(createLiveController(api), {
      clock,
      random: () => 0.5,
    });

    await poller.start();
    const original = useLiveStore.getState().resources['/api/v1/system/status'];
    assert.ok(original.data);
    fail = true;
    await clock.advanceBy(10_000);
    assert.equal(useLiveStore.getState().resources['/api/v1/system/status'].data, original.data);

    await clock.advanceBy(20_000);
    const stale = useLiveStore.getState().resources['/api/v1/system/status'];
    assert.equal(stale.status, 'STALE');
    assert.deepEqual(stale.data, original.data);
    assert.equal(stale.fetchedAt, original.fetchedAt);
    assert.equal(stale.source, 'LIVE');
    assert.equal(LIVE_STALE_INTERVAL_MULTIPLIER, 3);
    poller.stop();
  });

  await t.test('schema errors remain ERROR and are never reclassified as SIMULATED or STALE', async () => {
    useLiveStore.getState().reset();
    const clock = new FakeClock();
    const api = createApi(async (path) => {
      if (path === '/api/v1/system/status') throw new LiveApiError('SCHEMA_INVALID');
      return responses[path];
    });
    const poller = createLivePoller(createLiveController(api), {
      clock,
      random: () => 0.5,
    });

    await poller.start();
    const resource = useLiveStore.getState().resources['/api/v1/system/status'];
    assert.equal(resource.status, 'ERROR');
    assert.equal(resource.source, null);
    await clock.advanceBy(30_000);
    assert.equal(useLiveStore.getState().resources['/api/v1/system/status'].status, 'ERROR');
    poller.stop();
  });

  await t.test('SESSION_REQUIRED stops every polling timer and clears all private LIVE data', async () => {
    useLiveStore.getState().reset();
    const clock = new FakeClock();
    const api = createApi(async () => {
      throw new LiveApiError('SESSION_REQUIRED');
    });
    const poller = createLivePoller(createLiveController(api), { clock });

    assert.equal(await poller.start(), false);
    assert.equal(poller.isRunning(), false);
    assert.equal(useLiveStore.getState().connection, 'SESSION_REQUIRED');
    assert.equal(useLiveStore.getState().session, 'UNAUTHENTICATED');
    assert.equal(useLiveStore.getState().resources['/api/v1/system/status'].data, null);
    assert.equal(clock.pendingCount(), 0);
  });

  await t.test('SESSION_REQUIRED after SSE opens closes EventSource and clears private LIVE data', async () => {
    useLiveStore.getState().reset();
    const clock = new FakeClock();
    let sessionExpired = false;
    const sources: FakeEventSource[] = [];
    const api = createApi(async (path) => {
      if (sessionExpired) throw new LiveApiError('SESSION_REQUIRED');
      return responses[path];
    });
    const poller = createLivePoller(createLiveController(api), {
      clock,
      eventSourceFactory: () => {
        const source = new FakeEventSource();
        sources.push(source);
        return source;
      },
    });

    assert.equal(await poller.start(), true);
    assert.equal(sources.length, 1);
    sources[0].open();
    await clock.flushMicrotasks();
    assert.equal(useLiveStore.getState().session, 'AUTHENTICATED');
    assert.ok(useLiveStore.getState().resources['/api/v1/system/status'].data);

    sessionExpired = true;
    // Healthy SSE moves snapshot reconciliation to 60 seconds.
    await clock.advanceBy(LIVE_SSE_RECONCILIATION_INTERVAL_MS);

    assert.equal(poller.isRunning(), false);
    assert.equal(sources[0].closed, true);
    assert.equal(useLiveStore.getState().session, 'UNAUTHENTICATED');
    assert.equal(useLiveStore.getState().connection, 'SESSION_REQUIRED');
    assert.equal(useLiveStore.getState().resources['/api/v1/system/status'].data, null);
    assert.equal(clock.pendingCount(), 0);
  });

  await t.test('operator can re-authenticate and restore LIVE SSE after BFF session loss', async () => {
    useLiveStore.getState().reset();
    let sessionValid = true;
    const sources: FakeEventSource[] = [];
    const api: LiveApiClient = {
      getSession: async () => {
        if (!sessionValid) throw new LiveApiError('SESSION_REQUIRED');
        return session;
      },
      login: async () => {
        sessionValid = true;
        return session;
      },
      logout: async () => {
        sessionValid = false;
      },
      get: async <K extends LiveApiPath>(path: K) => {
        if (!sessionValid) throw new LiveApiError('SESSION_REQUIRED');
        return responses[path] as LiveApiResponseMap[K];
      },
      clearCsrfToken: () => undefined,
    };
    const controller = createLiveController(api);
    const poller = createLivePoller(controller, {
      clock: new FakeClock(),
      eventSourceFactory: () => {
        const source = new FakeEventSource();
        sources.push(source);
        return source;
      },
    });

    assert.equal(await poller.start(), true);
    assert.equal(sources.length, 1);
    sources[0].open();

    // A BFF process restart loses its in-memory session map.
    sessionValid = false;
    await poller.refresh('/api/v1/system/status');
    assert.equal(poller.isRunning(), false);
    assert.equal(sources[0].closed, true);
    assert.equal(useLiveStore.getState().session, 'UNAUTHENTICATED');
    assert.equal(useLiveStore.getState().resources['/api/v1/system/status'].data, null);

    await controller.login('test-only-password');
    assert.equal(useLiveStore.getState().session, 'AUTHENTICATED');
    assert.equal(await poller.start({ skipSessionBootstrap: true }), true);
    assert.equal(sources.length, 2);
    sources[1].open();
    assert.equal(useLiveStore.getState().resources['/api/v1/system/status'].status, 'LIVE');

    poller.stop();
  });

  await t.test('stopping during an in-flight request prevents late data from repopulating the store', async () => {
    useLiveStore.getState().reset();
    const clock = new FakeClock();
    let resolveSystem: ((value: SystemStatusDto) => void) | undefined;
    const api = createApi(async (path) => {
      if (path === '/api/v1/system/status') {
        return new Promise<SystemStatusDto>((resolve) => { resolveSystem = resolve; });
      }
      return responses[path];
    });
    const poller = createLivePoller(createLiveController(api), { clock });
    const starting = poller.start();
    await clock.flushMicrotasks();
    poller.stop();
    useLiveStore.getState().clearPrivateLiveData();
    resolveSystem?.(responses['/api/v1/system/status']);
    await starting;
    await clock.flushMicrotasks();

    assert.equal(useLiveStore.getState().resources['/api/v1/system/status'].data, null);
    assert.equal(useLiveStore.getState().session, 'UNAUTHENTICATED');
  });
  await t.test('SSE invalidation refreshes only its resource and changes reconciliation to 60 seconds', async () => {
    useLiveStore.getState().reset();
    const clock = new FakeClock();
    const counts = new Map<LiveApiPath, number>();
    const sources: FakeEventSource[] = [];
    const api = createApi(async (path) => {
      counts.set(path, (counts.get(path) ?? 0) + 1);
      return responses[path];
    });
    const poller = createLivePoller(createLiveController(api), {
      clock,
      random: () => 0.5,
      eventSourceFactory: (url) => {
        assert.equal(url, '/api/v1/events/stream');
        const source = new FakeEventSource();
        sources.push(source);
        return source;
      },
    });

    assert.equal(await poller.start(), true);
    assert.equal(sources.length, 1);
    sources[0].open();
    await clock.flushMicrotasks();
    assert.equal(LIVE_SSE_RECONCILIATION_INTERVAL_MS, 60_000);

    sources[0].emit(
      'resources.invalidated',
      JSON.stringify({
        schema_version: 1,
        occurred_at: '2026-11-08T10:00:00Z',
        resources: ['pipeline'],
      }),
      '123e4567-e89b-12d3-a456-426614174000:1',
    );
    await clock.flushMicrotasks();

    assert.equal(counts.get('/api/v1/pipeline/active'), 2);
    assert.equal(counts.get('/api/v1/system/status'), 1);
    assert.equal(counts.get('/api/v1/telemetry/usage'), 1);

    await clock.advanceBy(60_000);
    assert.equal(counts.get('/api/v1/system/status'), 2);
    assert.equal(counts.get('/api/v1/pipeline/active'), 3);
    assert.equal(counts.get('/api/v1/telemetry/usage'), 2);
    assert.equal(counts.get('/api/v1/audit/decisions'), 2);

    poller.stop();
    assert.equal(sources[0].closed, true);
  });

  await t.test('SSE failure restores normal polling as a safe fallback', async () => {
    useLiveStore.getState().reset();
    const clock = new FakeClock();
    const counts = new Map<LiveApiPath, number>();
    const sources: FakeEventSource[] = [];
    const api = createApi(async (path) => {
      counts.set(path, (counts.get(path) ?? 0) + 1);
      return responses[path];
    });
    const poller = createLivePoller(createLiveController(api), {
      clock,
      random: () => 0.5,
      eventSourceFactory: () => {
        const source = new FakeEventSource();
        sources.push(source);
        return source;
      },
    });

    assert.equal(await poller.start(), true);
    sources[0].open();
    await clock.flushMicrotasks();
    sources[0].fail();
    await clock.flushMicrotasks();

    assert.equal(counts.get('/api/v1/system/status'), 2);
    assert.equal(counts.get('/api/v1/pipeline/active'), 2);
    await clock.advanceBy(10_000);
    assert.equal(counts.get('/api/v1/system/status'), 3);
    assert.equal(counts.get('/api/v1/pipeline/active'), 3);
    assert.equal(counts.get('/api/v1/telemetry/usage'), 2);

    poller.stop();
    assert.equal(sources[0].closed, true);
  });

  await t.test('SSE stream reset performs full snapshot reconciliation and reconnects', async () => {
    useLiveStore.getState().reset();
    const clock = new FakeClock();
    const counts = new Map<LiveApiPath, number>();
    const sources: FakeEventSource[] = [];
    const api = createApi(async (path) => {
      counts.set(path, (counts.get(path) ?? 0) + 1);
      return responses[path];
    });
    const poller = createLivePoller(createLiveController(api), {
      clock,
      random: () => 0.5,
      eventSourceFactory: () => {
        const source = new FakeEventSource();
        sources.push(source);
        return source;
      },
    });

    assert.equal(await poller.start(), true);
    sources[0].open();
    sources[0].emit(
      'stream.reset',
      JSON.stringify({ schema_version: 1, reason: 'replay_gap' }),
    );
    await clock.flushMicrotasks();

    assert.equal(sources[0].closed, true);
    assert.equal(counts.get('/api/v1/system/status'), 2);
    assert.equal(counts.get('/api/v1/pipeline/active'), 2);
    await clock.advanceBy(2_000);
    assert.equal(sources.length, 2);

    poller.stop();
  });

  await t.test('SSE LIVE invalidations and SIMULATED controls remain isolated in both directions', async () => {
    useLiveStore.getState().reset();
    useOfficeStore.getState().resetSimulationWithSeed(20_261_109);
    useOfficeStore.getState().setGlobalPaused(true);

    const clock = new FakeClock();
    const sources: FakeEventSource[] = [];
    const api = createApi(async (path) => responses[path]);
    const poller = createLivePoller(createLiveController(api), {
      clock,
      random: () => 0.5,
      eventSourceFactory: () => {
        const source = new FakeEventSource();
        sources.push(source);
        return source;
      },
    });

    assert.equal(await poller.start(), true);
    assert.equal(sources.length, 1);
    sources[0].open();

    const simulatedBeforeEvent = useOfficeStore.getState();
    const liveBeforeEvent = useLiveStore.getState();
    sources[0].emit(
      'resources.invalidated',
      JSON.stringify({
        schema_version: 1,
        occurred_at: '2026-11-09T00:00:00Z',
        resources: ['pipeline'],
      }),
      '123e4567-e89b-12d3-a456-426614174000:1',
    );
    await clock.flushMicrotasks();

    const simulatedAfterEvent = useOfficeStore.getState();
    assert.equal(simulatedAfterEvent.simTimeMs, simulatedBeforeEvent.simTimeMs);
    assert.equal(simulatedAfterEvent.tickCount, simulatedBeforeEvent.tickCount);
    assert.strictEqual(simulatedAfterEvent.workers, simulatedBeforeEvent.workers);
    assert.strictEqual(simulatedAfterEvent.tasks, simulatedBeforeEvent.tasks);
    assert.strictEqual(simulatedAfterEvent.events, simulatedBeforeEvent.events);

    const liveAfterEvent = useLiveStore.getState();
    assert.notStrictEqual(liveAfterEvent.resources, liveBeforeEvent.resources);
    assert.equal(
      liveAfterEvent.resources['/api/v1/pipeline/active'].status,
      'LIVE',
    );
    const liveResourcesBeforeSimulation = liveAfterEvent.resources;

    useOfficeStore.getState().tickSimulation(500);

    const simulatedAfterControl = useOfficeStore.getState();
    assert.equal(simulatedAfterControl.simTimeMs, simulatedBeforeEvent.simTimeMs + 500);
    assert.equal(simulatedAfterControl.tickCount, simulatedBeforeEvent.tickCount + 1);
    assert.strictEqual(
      useLiveStore.getState().resources,
      liveResourcesBeforeSimulation,
      'SIMULATED clock advancement must not mutate LIVE API snapshots',
    );

    poller.stop();
    useOfficeStore.getState().resetSimulationWithSeed();
    useLiveStore.getState().reset();
  });

  await t.test('network interruption falls back to polling and resumes SSE reconciliation after reconnect', async () => {
    useLiveStore.getState().reset();
    const clock = new FakeClock();
    const counts = new Map<LiveApiPath, number>();
    const sources: FakeEventSource[] = [];
    let networkOffline = false;
    const api = createApi(async (path) => {
      counts.set(path, (counts.get(path) ?? 0) + 1);
      if (networkOffline) throw new LiveApiError('OFFLINE');
      return responses[path];
    });
    const poller = createLivePoller(createLiveController(api), {
      clock,
      random: () => 0.5,
      eventSourceFactory: () => {
        const source = new FakeEventSource();
        sources.push(source);
        return source;
      },
    });

    assert.equal(await poller.start(), true);
    assert.equal(sources.length, 1);
    sources[0].open();
    await clock.flushMicrotasks();

    networkOffline = true;
    sources[0].fail();
    await clock.flushMicrotasks();
    assert.equal(useLiveStore.getState().connection, 'OFFLINE');
    assert.equal(sources[0].closed, false, 'one network error leaves native EventSource reconnect enabled');

    await clock.advanceBy(10_000);
    const systemCallsDuringOutage = counts.get('/api/v1/system/status') ?? 0;
    const telemetryCallsDuringOutage = counts.get('/api/v1/telemetry/usage') ?? 0;
    assert.ok(systemCallsDuringOutage >= 4, 'normal 10-second system polling/retries must continue during outage');
    assert.ok(telemetryCallsDuringOutage >= 4, 'telemetry retries must continue while the network is unavailable');
    assert.equal(useLiveStore.getState().connection, 'OFFLINE');

    networkOffline = false;
    sources[0].open();
    await clock.flushMicrotasks();
    assert.equal(sources.length, 1, 'native EventSource reconnect reuses the same source');
    assert.ok(
      (counts.get('/api/v1/system/status') ?? 0) > systemCallsDuringOutage,
      'SSE reconnect must immediately refresh the system snapshot',
    );
    assert.ok(
      (counts.get('/api/v1/telemetry/usage') ?? 0) > telemetryCallsDuringOutage,
      'SSE reconnect must immediately refresh the telemetry snapshot',
    );
    assert.equal(useLiveStore.getState().connection, 'LIVE', 'LIVE returns after all eight refreshed snapshots validate');

    const recoveredSystemCalls = counts.get('/api/v1/system/status') ?? 0;
    const recoveredTelemetryCalls = counts.get('/api/v1/telemetry/usage') ?? 0;
    await clock.advanceBy(59_999);
    assert.equal(counts.get('/api/v1/system/status'), recoveredSystemCalls);
    await clock.advanceBy(1);

    assert.equal(
      counts.get('/api/v1/system/status'),
      recoveredSystemCalls + 1,
      'healthy SSE then uses the 60-second reconciliation interval',
    );
    assert.equal(
      counts.get('/api/v1/telemetry/usage'),
      recoveredTelemetryCalls + 1,
    );

    poller.stop();
    assert.equal(sources[0].closed, true);
  });

});
