import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LiveContractError,
  LIVE_API_PATHS,
  parseAuthenticatedSession,
  parseLiveApiResponse,
  parseLoggedOut,
  type ActiveMarketWatchesDto,
  type ActivePipelineDto,
  type AuditDecisionsDto,
  type AuthenticatedSessionDto,
  type SystemStatusDto,
  type TelemetryUsageDto,
  type WorkforceTasksResponseDto,
  type WorkforceCommandPath,
  type WorkforceCommandRequest,
  type WorkforceCommandResponseDto,
} from './live.contracts';
import {
  createLiveApiClient,
  LiveApiError,
  type LiveApiClient,
} from './live.api';
import { createLiveController } from './live.controller';
import { useLiveStore } from './live.state';

const systemStatus: SystemStatusDto = {
  api_status: 'HEALTHY',
  database_status: 'CONNECTED',
  server_time_utc: '2026-11-08T10:00:00Z',
  runtime_control: null,
  process_monitoring_note: 'Worker OS liveness is not monitored.',
};

const telemetry: TelemetryUsageDto = {
  period_start: '2026-11-01',
  period_end: '2026-11-08',
  period_days: 7,
  currencies: [{
    currency: 'IDR',
    total_cost: '1000.50',
    total_reserved: 0,
    total_projected: 1250,
    total_requests: 2,
    tokens: {
      input_tokens: 100,
      output_tokens: 50,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      thinking_tokens: 5,
    },
    status_counts: { COMPLETED: 2 },
  }],
  models: [],
};

const pipeline: ActivePipelineDto = {
  server_time_utc: '2026-11-08T10:00:00Z',
  total_in_flight: 1,
  total_queued: 1,
  in_flight_tasks: [{
    task_id: 7,
    status: 'PROCESSING',
    liveness_status: 'IN_FLIGHT_UNCONFIRMED',
    created_at: '2026-11-08T09:59:00Z',
    elapsed_seconds: 60,
  }],
  queued_messages: [{
    queue_item_id: 12,
    status: 'PENDING',
    queue_reason: 'OTHER',
    attempts: 0,
    claimed_at: null,
    created_at: '2026-11-08T09:59:30Z',
    updated_at: '2026-11-08T09:59:30Z',
  }],
};

const marketWatches: ActiveMarketWatchesDto = {
  server_time_utc: '2026-11-08T10:00:00Z',
  total_active_watches: 1,
  watches: [{
    watch_id: 3,
    symbol: 'XAUUSD',
    status: 'WAITING_FOR_SPREAD',
    spread_pips: null,
    maximum_spread_pips: '2.0',
    last_bid: null,
    last_ask: null,
    check_count: 0,
    last_checked_at: null,
    next_check_at: '2026-11-08T10:01:00Z',
    created_at: '2026-11-08T09:58:00Z',
  }],
};

const auditDecisions: AuditDecisionsDto = {
  server_time_utc: '2026-11-08T10:00:00Z',
  total_returned: 1,
  offset: 0,
  decisions: [{
    audit_id: 9,
    decision: 'APPROVED',
    previous_status: 'PENDING_REVIEW',
    new_status: 'APPROVED',
    reviewer_role: 'Authorized Approver',
    decided_at: '2026-11-08T09:50:00Z',
  }],
};

const fixtures = {
  '/api/v1/system/status': systemStatus,
  '/api/v1/telemetry/usage': telemetry,
  '/api/v1/pipeline/active': pipeline,
  '/api/v1/market-watches/active': marketWatches,
  '/api/v1/audit/decisions': auditDecisions,
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
} as const;

const authenticatedSession: AuthenticatedSessionDto = {
  authenticated: true,
  csrfToken: 'A'.repeat(43),
};

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function bffError(code: string): Record<string, unknown> {
  return { error: { code, message: 'safe test message' } };
}

test('SIREADER Batch 4 — LIVE contracts, API client, session and isolated state', async (t) => {
  await t.test('strict DTO contracts accept all eight backend response fixtures', () => {
    for (const path of LIVE_API_PATHS) {
      assert.deepEqual(parseLiveApiResponse(path, fixtures[path]), fixtures[path]);
    }
  });

  await t.test('strict DTO contracts reject missing fields, unknown fields and invalid values', () => {
    assert.throws(
      () => parseLiveApiResponse('/api/v1/system/status', { ...systemStatus, injected: 'no' }),
      LiveContractError,
    );
    assert.throws(
      () => parseLiveApiResponse('/api/v1/system/status', { ...systemStatus, database_status: 'ONLINE' }),
      LiveContractError,
    );
    assert.throws(
      () => parseLiveApiResponse('/api/v1/telemetry/usage', {
        ...telemetry,
        currencies: [{ ...telemetry.currencies[0], tokens: { ...telemetry.currencies[0].tokens, input_tokens: -1 } }],
      }),
      LiveContractError,
    );
    assert.throws(
      () => parseLiveApiResponse('/api/v1/pipeline/active', {
        ...pipeline,
        in_flight_tasks: [{ ...pipeline.in_flight_tasks[0], liveness_status: 'BUSY' }],
      }),
      LiveContractError,
    );
    assert.throws(
      () => parseLiveApiResponse('/api/v1/market-watches/active', {
        ...marketWatches,
        watches: [{ ...marketWatches.watches[0], unexpected: true }],
      }),
      LiveContractError,
    );
    assert.throws(
      () => parseLiveApiResponse('/api/v1/audit/decisions', {
        ...auditDecisions,
        decisions: [{ ...auditDecisions.decisions[0], reviewer_role: 'Unknown' }],
      }),
      LiveContractError,
    );
  });

  await t.test('auth DTOs are strict and reject malformed CSRF material or extra keys', () => {
    assert.deepEqual(parseAuthenticatedSession(authenticatedSession), authenticatedSession);
    assert.deepEqual(parseLoggedOut({ authenticated: false }), { authenticated: false });
    assert.throws(() => parseAuthenticatedSession({ authenticated: true, csrfToken: 'short' }), LiveContractError);
    assert.throws(() => parseAuthenticatedSession({ ...authenticatedSession, extra: true }), LiveContractError);
    assert.throws(() => parseLoggedOut({ authenticated: false, csrfToken: 'leak' }), LiveContractError);
  });

  await t.test('LIVE API client calls every fixed same-origin route without forwarding credentials', async () => {
    const calls: Array<{ input: RequestInfo | URL; init: RequestInit }> = [];
    const api = createLiveApiClient({
      fetchImpl: async (input, init = {}) => {
        calls.push({ input, init });
        const path = String(input);
        return jsonResponse(fixtures[path as keyof typeof fixtures]);
      },
    });

    for (const path of LIVE_API_PATHS) {
      await api.get(path);
    }

    assert.deepEqual(calls.map((call) => String(call.input)), [...LIVE_API_PATHS]);
    for (const call of calls) {
      assert.equal(call.init.method, 'GET');
      assert.equal(call.init.credentials, 'same-origin');
      assert.equal(call.init.cache, 'no-store');
      assert.equal(call.init.redirect, 'error');
      const headers = new Headers(call.init.headers);
      assert.equal(headers.get('accept'), 'application/json');
      assert.equal(headers.get('authorization'), null);
      assert.equal(headers.get('cookie'), null);
      assert.equal(headers.get('x-forwarded-for'), null);
    }
  });

  await t.test('workforce task pagination uses bounded integers and the same-origin BFF route', async () => {
    const calls: Array<{ input: RequestInfo | URL; init: RequestInit }> = [];
    const api = createLiveApiClient({
      fetchImpl: async (input, init = {}) => {
        calls.push({ input, init });
        return jsonResponse({
          server_time_utc: '2026-11-09T10:00:00Z',
          total_count: 125,
          limit: 25,
          offset: 50,
          tasks: [],
        });
      },
    });

    await assert.rejects(api.getWorkforceTasks(0, 0), (error: unknown) =>
      error instanceof LiveApiError && error.code === 'BAD_REQUEST');
    await assert.rejects(api.getWorkforceTasks(101, 0), (error: unknown) =>
      error instanceof LiveApiError && error.code === 'BAD_REQUEST');
    await assert.rejects(api.getWorkforceTasks(50, 100_001), (error: unknown) =>
      error instanceof LiveApiError && error.code === 'BAD_REQUEST');
    assert.equal(calls.length, 0);

    const result = await api.getWorkforceTasks(25, 50);
    assert.equal(result.total_count, 125);
    assert.equal(result.limit, 25);
    assert.equal(result.offset, 50);
    assert.equal(String(calls[0].input), '/api/v1/workforce/tasks?limit=25&offset=50');
    assert.equal(calls[0].init.credentials, 'same-origin');
    assert.equal(calls[0].init.cache, 'no-store');
    assert.equal(new Headers(calls[0].init.headers).get('authorization'), null);
  });

  await t.test('workforce attempts require a bounded task ID and use the authenticated fixed BFF route', async () => {
    const calls: Array<{ input: RequestInfo | URL; init: RequestInit }> = [];
    const api = createLiveApiClient({
      fetchImpl: async (input, init = {}) => {
        calls.push({ input, init });
        return jsonResponse({
          server_time_utc: '2026-11-09T10:00:00Z',
          task_id: 'task_12345678',
          attempts: [],
        });
      },
    });
    await assert.rejects(api.getWorkforceAttempts('bad'), (error: unknown) =>
      error instanceof LiveApiError && error.code === 'BAD_REQUEST');
    const result = await api.getWorkforceAttempts('task_12345678');
    assert.equal(result.task_id, 'task_12345678');
    assert.equal(String(calls[0].input), '/api/v1/workforce/attempts?task_id=task_12345678');
    assert.equal(calls[0].init.method, 'GET');
    assert.equal(calls[0].init.credentials, 'same-origin');
    assert.equal(new Headers(calls[0].init.headers).get('authorization'), null);
  });

  await t.test('session bootstrap and login keep CSRF in client memory and use it only for logout', async () => {
    const calls: Array<{ input: RequestInfo | URL; init: RequestInit }> = [];
    const api = createLiveApiClient({
      fetchImpl: async (input, init = {}) => {
        calls.push({ input, init });
        const path = String(input);
        if (path === '/api/auth/session') return jsonResponse(authenticatedSession);
        if (path === '/api/auth/login') return jsonResponse(authenticatedSession);
        if (path === '/api/auth/logout') return jsonResponse({ authenticated: false });
        return jsonResponse(systemStatus);
      },
    });

    await api.getSession();
    await api.get('/api/v1/system/status');
    await api.login('transient-test-password');
    await api.logout();

    const sessionHeaders = new Headers(calls[0].init.headers);
    const resourceHeaders = new Headers(calls[1].init.headers);
    const loginHeaders = new Headers(calls[2].init.headers);
    const logoutHeaders = new Headers(calls[3].init.headers);
    assert.equal(sessionHeaders.get('x-csrf-token'), null);
    assert.equal(resourceHeaders.get('x-csrf-token'), null);
    assert.equal(loginHeaders.get('x-csrf-token'), null);
    assert.equal(loginHeaders.get('content-type'), 'application/json');
    assert.equal(logoutHeaders.get('x-csrf-token'), authenticatedSession.csrfToken);
    assert.equal(calls[2].init.body, JSON.stringify({ password: 'transient-test-password' }));
    assert.equal(calls[3].init.body, '{}');
    assert.equal(calls.every((call) => !new Headers(call.init.headers).has('authorization')), true);
    assert.equal(Object.keys(api).sort().join(','), 'clearCsrfToken,get,getSession,getWorkforceAttempts,getWorkforceTasks,login,logout,sendWorkforceCommand');
  });


  await t.test('workforce command requires authenticated session CSRF and uses same-origin POST', async () => {
    const calls: Array<{ input: RequestInfo | URL; init: RequestInit }> = [];
    const responseBody = {
      command_id: 'cmd_12345678',
      actor_id: 'local_operator',
      command_type: 'WORKER_SCHEDULING_SET',
      target_id: 'haiku',
      correlation_id: 'corr_12345678',
      outcome: {
        accepted: true, worker_id: 'haiku',
        accepting_tasks: false, schedule_state: 'PAUSED',
      },
      created_at: '2026-11-09T10:00:00Z',
      replayed: false,
    };
    const api = createLiveApiClient({
      idempotencyKeyFactory: () => 'idempotency-test-0001',
      fetchImpl: async (input, init = {}) => {
        calls.push({ input, init });
        if (String(input) === '/api/auth/session') return jsonResponse(authenticatedSession);
        return jsonResponse(responseBody);
      },
    });
    await api.getSession();
    const result = await api.sendWorkforceCommand(
      '/api/v1/commands/workers/scheduling',
      { worker_id: 'haiku', accepting_tasks: false },
    );
    assert.equal(result.command_type, 'WORKER_SCHEDULING_SET');
    assert.equal(String(calls[1].input), '/api/v1/commands/workers/scheduling');
    assert.equal(calls[1].init.method, 'POST');
    assert.equal(calls[1].init.credentials, 'same-origin');
    const headers = new Headers(calls[1].init.headers);
    assert.equal(headers.get('x-csrf-token'), authenticatedSession.csrfToken);
    assert.equal(headers.get('idempotency-key'), 'idempotency-test-0001');
    assert.equal(headers.get('authorization'), null);
    assert.equal(calls[1].init.body, JSON.stringify({ worker_id: 'haiku', accepting_tasks: false }));
  });


  await t.test('workforce command reuses the same idempotency key after an ambiguous timeout', async () => {
    const calls: Array<{ headers: Headers; body: string }> = [];
    let keySequence = 0;
    let attempts = 0;
    const responseBody = {
      command_id: 'cmd_timeout1234',
      actor_id: 'local_operator',
      command_type: 'TASK_ENQUEUE',
      target_id: 'task_timeout1234',
      correlation_id: 'corr_timeout1234',
      outcome: { accepted: true, created: true, status: 'QUEUED', task_id: 'task_timeout1234' },
      created_at: '2026-11-09T10:00:00Z',
      replayed: true,
    };
    const api = createLiveApiClient({
      idempotencyKeyFactory: () => 'timeout-retry-key-' + (++keySequence),
      fetchImpl: async (input, init = {}) => {
        if (String(input) === '/api/auth/session') return jsonResponse(authenticatedSession);
        attempts += 1;
        calls.push({ headers: new Headers(init.headers), body: String(init.body) });
        if (attempts === 1) return jsonResponse(bffError('TIMEOUT'), 504);
        return jsonResponse(responseBody);
      },
    });
    await api.getSession();
    const request = {
      task_type: 'SUMMARIZATION',
      title: 'Retry after ambiguous timeout',
      required_capability: 'summarization',
      requested_worker_id: 'haiku',
      input_payload: { text: 'safe content' },
      priority: 50,
      max_attempts: 2,
      non_trading_acknowledged: true as const,
    };
    await assert.rejects(
      api.sendWorkforceCommand('/api/v1/commands/tasks/enqueue', request),
      (error: unknown) => error instanceof LiveApiError && error.code === 'TIMEOUT',
    );
    const result = await api.sendWorkforceCommand('/api/v1/commands/tasks/enqueue', request);
    assert.equal(result.replayed, true);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].headers.get('idempotency-key'), calls[1].headers.get('idempotency-key'));
    assert.equal(calls[0].body, calls[1].body);
    assert.equal(keySequence, 1);
  });

  await t.test('workforce command fails closed without a CSRF token and validates response schema', async () => {
    const noSession = createLiveApiClient({ fetchImpl: async () => jsonResponse({}) });
    await assert.rejects(
      noSession.sendWorkforceCommand('/api/v1/commands/workers/scheduling', { worker_id: 'haiku', accepting_tasks: false }),
      (error: unknown) => error instanceof LiveApiError && error.code === 'CSRF_MISSING',
    );
    const invalid = createLiveApiClient({
      fetchImpl: async (input) => String(input) === '/api/auth/session'
        ? jsonResponse(authenticatedSession)
        : jsonResponse({ command_id: 'short' }),
    });
    await invalid.getSession();
    await assert.rejects(
      invalid.sendWorkforceCommand('/api/v1/commands/workers/scheduling', { worker_id: 'haiku', accepting_tasks: false }),
      (error: unknown) => error instanceof LiveApiError && error.code === 'SCHEMA_INVALID',
    );
  });

  await t.test('missing operator session maps to SESSION_REQUIRED', async () => {
    const api = createLiveApiClient({
      fetchImpl: async () => jsonResponse(bffError('SESSION_REQUIRED'), 401),
    });
    await assert.rejects(api.getSession(), (error: unknown) =>
      error instanceof LiveApiError && error.code === 'SESSION_REQUIRED');
  });

  await t.test('transport and timeout errors have explicit non-LIVE classifications', async () => {
    const offline = createLiveApiClient({
      fetchImpl: async () => { throw new TypeError('network unavailable'); },
    });
    await assert.rejects(offline.get('/api/v1/system/status'), (error: unknown) =>
      error instanceof LiveApiError && error.code === 'OFFLINE');

    const timeout = createLiveApiClient({
      timeoutMs: 10,
      fetchImpl: async (_input, init = {}) => new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
      }),
    });
    await assert.rejects(timeout.get('/api/v1/system/status'), (error: unknown) =>
      error instanceof LiveApiError && error.code === 'TIMEOUT');
  });

  await t.test('LIVE store records explicit provenance and clears private data', () => {
    useLiveStore.getState().reset();
    useLiveStore.getState().setResourceSuccess('/api/v1/system/status', systemStatus, 1234);
    const state = useLiveStore.getState();
    const live = state.resources['/api/v1/system/status'];
    assert.equal(live.status, 'LIVE');
    assert.equal(live.source, 'LIVE');
    assert.equal(live.fetchedAt, 1234);
    assert.deepEqual(live.data, systemStatus);
    assert.equal(state.resources['/api/v1/telemetry/usage'].data, null);
    assert.equal(state.session, 'UNKNOWN');
    state.clearPrivateLiveData();
    assert.equal(useLiveStore.getState().resources['/api/v1/system/status'].data, null);
    assert.equal(useLiveStore.getState().connection, 'SESSION_REQUIRED');
    assert.equal(useLiveStore.getState().session, 'UNAUTHENTICATED');
  });

  await t.test('controller bootstraps auth, loads validated LIVE data and clears private data on 401', async () => {
    useLiveStore.getState().reset();
    let sessionRequired = false;
    const api: LiveApiClient = {
      getSession: async () => {
        if (sessionRequired) throw new LiveApiError('SESSION_REQUIRED');
        return authenticatedSession;
      },
      login: async () => authenticatedSession,
      logout: async () => undefined,
      get: async (path) => fixtures[path],
      getWorkforceAttempts: async (taskId) => ({ server_time_utc: '2026-11-09T10:00:00Z', task_id: taskId, attempts: [] }),
      getWorkforceTasks: async (limit = 50, offset = 0) => ({
        ...(fixtures['/api/v1/workforce/tasks'] as WorkforceTasksResponseDto),
        limit,
        offset,
      }),
      sendWorkforceCommand: async (_path: WorkforceCommandPath, _request: WorkforceCommandRequest): Promise<WorkforceCommandResponseDto> => ({
        command_id: 'cmd_12345678', actor_id: 'local_operator', command_type: 'WORKER_SCHEDULING_SET',
        target_id: 'haiku', correlation_id: 'corr_12345678',
        outcome: { accepted: true, worker_id: 'haiku', accepting_tasks: false, schedule_state: 'PAUSED' },
        created_at: '2026-11-09T10:00:00Z', replayed: false,
      }),
      clearCsrfToken: () => undefined,
    };
    const controller = createLiveController(api);
    assert.equal(await controller.bootstrapSession(), true);
    assert.equal(useLiveStore.getState().session, 'AUTHENTICATED');
    assert.equal(useLiveStore.getState().connection, 'CONNECTING');

    await controller.loadResource('/api/v1/pipeline/active');
    assert.equal(useLiveStore.getState().connection, 'LIVE');
    assert.equal(useLiveStore.getState().resources['/api/v1/pipeline/active'].source, 'LIVE');

    sessionRequired = true;
    assert.equal(await controller.bootstrapSession(), false);
    assert.equal(useLiveStore.getState().session, 'UNAUTHENTICATED');
    assert.equal(useLiveStore.getState().connection, 'SESSION_REQUIRED');
    assert.equal(useLiveStore.getState().resources['/api/v1/pipeline/active'].data, null);
  });

  await t.test('logout clears private data and CSRF state', async () => {
    useLiveStore.getState().reset();
    useLiveStore.getState().setResourceSuccess('/api/v1/system/status', systemStatus, 1234);
    let csrfCleared = false;
    const api: LiveApiClient = {
      getSession: async () => authenticatedSession,
      login: async () => authenticatedSession,
      logout: async () => undefined,
      get: async (path) => fixtures[path],
      getWorkforceAttempts: async (taskId) => ({ server_time_utc: '2026-11-09T10:00:00Z', task_id: taskId, attempts: [] }),
      getWorkforceTasks: async (limit = 50, offset = 0) => ({
        ...(fixtures['/api/v1/workforce/tasks'] as WorkforceTasksResponseDto),
        limit,
        offset,
      }),
      sendWorkforceCommand: async (_path: WorkforceCommandPath, _request: WorkforceCommandRequest): Promise<WorkforceCommandResponseDto> => ({
        command_id: 'cmd_12345678', actor_id: 'local_operator', command_type: 'WORKER_SCHEDULING_SET',
        target_id: 'haiku', correlation_id: 'corr_12345678',
        outcome: { accepted: true, worker_id: 'haiku', accepting_tasks: false, schedule_state: 'PAUSED' },
        created_at: '2026-11-09T10:00:00Z', replayed: false,
      }),
      clearCsrfToken: () => { csrfCleared = true; },
    };
    const controller = createLiveController(api);
    await controller.logout();
    assert.equal(csrfCleared, true);
    assert.equal(useLiveStore.getState().resources['/api/v1/system/status'].data, null);
    assert.equal(useLiveStore.getState().session, 'UNAUTHENTICATED');
    assert.equal(useLiveStore.getState().connection, 'SESSION_REQUIRED');
  });

  await t.test('controller does not mark API data LIVE when schema validation fails', async () => {
    useLiveStore.getState().reset();
    const api: LiveApiClient = {
      getSession: async () => authenticatedSession,
      login: async () => authenticatedSession,
      logout: async () => undefined,
      get: async () => { throw new LiveApiError('SCHEMA_INVALID'); },
      getWorkforceAttempts: async (taskId) => ({ server_time_utc: '2026-11-09T10:00:00Z', task_id: taskId, attempts: [] }),
      getWorkforceTasks: async (limit = 50, offset = 0) => ({
        ...(fixtures['/api/v1/workforce/tasks'] as WorkforceTasksResponseDto),
        limit,
        offset,
      }),
      sendWorkforceCommand: async (_path: WorkforceCommandPath, _request: WorkforceCommandRequest): Promise<WorkforceCommandResponseDto> => ({
        command_id: 'cmd_12345678', actor_id: 'local_operator', command_type: 'WORKER_SCHEDULING_SET',
        target_id: 'haiku', correlation_id: 'corr_12345678',
        outcome: { accepted: true, worker_id: 'haiku', accepting_tasks: false, schedule_state: 'PAUSED' },
        created_at: '2026-11-09T10:00:00Z', replayed: false,
      }),
      clearCsrfToken: () => undefined,
    };
    const controller = createLiveController(api);
    await assert.rejects(controller.loadResource('/api/v1/system/status'));
    const snapshot = useLiveStore.getState().resources['/api/v1/system/status'];
    assert.equal(snapshot.status, 'ERROR');
    assert.equal(snapshot.source, null);
    assert.equal(snapshot.data, null);
    assert.equal(useLiveStore.getState().connection, 'ERROR');
  });
});
