import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  createWorkforceCommandHandlers,
  validateWorkforceCommandBody,
  type WorkforceCommandPath,
} from './commands.ts';

const TOKEN = 'phase5-command-bff-test-token-0123456789';
const PATH: WorkforceCommandPath = '/api/v1/commands/workers/scheduling';
const validBody = { worker_id: 'haiku', accepting_tasks: false };
const validResult = {
  command_id: 'cmd_12345678',
  actor_id: 'local_operator',
  command_type: 'WORKER_SCHEDULING_SET',
  target_id: 'haiku',
  correlation_id: 'corr_12345678',
  outcome: { accepted: true, worker_id: 'haiku', accepting_tasks: false, schedule_state: 'PAUSED' },
  created_at: '2026-11-09T10:00:00Z',
  replayed: false,
};

async function startProxy(
  options: Parameters<typeof createWorkforceCommandHandlers>[0] = {},
  path: WorkforceCommandPath = PATH,
): Promise<{ server: Server; url: string }> {
  const app = express();
  app.use(express.json({ limit: '20kb' }));
  app.post(path, createWorkforceCommandHandlers(options)[path]);
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${address.port}${path}` };
}
async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test('BFF command validator rejects trading-adjacent workers/capabilities and extra fields', () => {
  assert.equal(validateWorkforceCommandBody(PATH, validBody), true);
  assert.equal(validateWorkforceCommandBody(PATH, { ...validBody, actor_id: 'admin' }), false);
  assert.equal(validateWorkforceCommandBody(PATH, { worker_id: 'decision_engineer', accepting_tasks: false }), false);
  assert.equal(validateWorkforceCommandBody('/api/v1/commands/tasks/enqueue', {
    task_type: 'PLACE_ORDER', title: 'Never allow order tasks',
    required_capability: 'rule_validation', requested_worker_id: 'decision_engineer',
    input_payload: {}, priority: 50, max_attempts: 2, non_trading_acknowledged: true,
  }), false);
  assert.equal(validateWorkforceCommandBody('/api/v1/commands/tasks/enqueue', {
    task_type: 'SUMMARIZATION', title: 'Summarize supplied text',
    required_capability: 'summarization', requested_worker_id: 'haiku',
    input_payload: { text: 'x' }, priority: 50, max_attempts: 2,
    non_trading_acknowledged: true,
  }), true);
});

test('BFF command proxy forwards only fixed upstream request with server token and idempotency key', async () => {
  const received: Array<{ url: string; headers: Headers; body: unknown; redirect?: RequestRedirect }> = [];
  const proxy = await startProxy({
    tokenProvider: () => TOKEN,
    fetchImpl: async (input, init = {}) => {
      received.push({
        url: String(input), headers: new Headers(init.headers),
        body: JSON.parse(String(init.body)), redirect: init.redirect,
      });
      return new Response(JSON.stringify(validResult), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  try {
    const response = await globalThis.fetch(proxy.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json', 'idempotency-key': 'command-proxy-test-0001',
        authorization: 'Bearer browser-must-not-forward', cookie: 'operator-session-cookie',
      },
      body: JSON.stringify(validBody),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), validResult);
    assert.equal(received.length, 1);
    assert.equal(received[0].url, 'http://127.0.0.1:8010/api/v1/commands/workers/scheduling');
    assert.equal(received[0].headers.get('authorization'), 'Bearer ' + TOKEN);
    assert.equal(received[0].headers.get('idempotency-key'), 'command-proxy-test-0001');
    assert.equal(received[0].headers.get('cookie'), null);
    assert.equal(received[0].headers.get('x-csrf-token'), null);
    assert.equal(JSON.stringify(received[0].body), JSON.stringify(validBody));
    assert.equal(received[0].redirect, 'manual');
  } finally { await close(proxy.server); }
});

test('BFF command proxy fails closed when its dedicated command token is absent', async () => {
  let contacted = false;
  const proxy = await startProxy({
    tokenProvider: () => undefined,
    fetchImpl: async () => { contacted = true; return new Response('{}'); },
  });
  try {
    const response = await globalThis.fetch(proxy.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': 'command-proxy-test-0002' },
      body: JSON.stringify(validBody),
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json() as { error: { code: string } }).error.code, 'UPSTREAM_AUTH_FAILED');
    assert.equal(contacted, false);
  } finally { await close(proxy.server); }
});

test('BFF command proxy rejects invalid request before reaching command service', async () => {
  let contacted = false;
  const proxy = await startProxy({
    tokenProvider: () => TOKEN,
    fetchImpl: async () => {
      contacted = true;
      return new Response(JSON.stringify(validResult), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  try {
    const response = await globalThis.fetch(proxy.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': 'command-proxy-test-0003' },
      body: JSON.stringify({ worker_id: 'decision_engineer', accepting_tasks: false }),
    });
    assert.equal(response.status, 400);
    assert.equal(contacted, false);
  } finally { await close(proxy.server); }
});

test('BFF command proxy maps backend conflicts and rejects invalid upstream response schema', async () => {
  const conflict = await startProxy({
    tokenProvider: () => TOKEN, fetchImpl: async () => new Response('{}', { status: 409 }),
  });
  const invalid = await startProxy({
    tokenProvider: () => TOKEN,
    fetchImpl: async () => new Response(JSON.stringify({ command_id: 'short' }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }),
  });
  try {
    const conflictResponse = await globalThis.fetch(conflict.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': 'command-proxy-test-0004' },
      body: JSON.stringify(validBody),
    });
    assert.equal(conflictResponse.status, 409);
    assert.equal((await conflictResponse.json() as { error: { code: string } }).error.code, 'BACKEND_ERROR');
    const invalidResponse = await globalThis.fetch(invalid.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': 'command-proxy-test-0005' },
      body: JSON.stringify(validBody),
    });
    assert.equal(invalidResponse.status, 502);
    assert.equal((await invalidResponse.json() as { error: { code: string } }).error.code, 'SCHEMA_INVALID');
  } finally {
    await close(conflict.server);
    await close(invalid.server);
  }
});


test('review adjudication proxy injects the trusted operator identity and validates the exact command DTO', async () => {
  const reviewPath: WorkforceCommandPath = '/api/v1/commands/reviews/adjudicate';
  const reviewBody = {
    review_id: 'rev_12345678',
    decision: 'APPROVED',
    expected_original_sha256: 'a'.repeat(64),
    adjusted_output: null,
    reason_code: null,
    notes: null,
  };
  const responseBody = {
    command_id: 'cmd_12345678',
    actor_id: 'local_operator',
    command_type: 'REVIEW_ADJUDICATE',
    target_id: 'rev_12345678',
    correlation_id: 'corr_12345678',
    outcome: {
      accepted: true,
      review_id: 'rev_12345678',
      task_id: 'task_12345678',
      decision: 'APPROVED',
      adjudicated_by: 'local_operator',
      adjudicated_at: '2026-11-10T00:00:00Z',
      task_status: 'COMPLETED',
    },
    created_at: '2026-11-10T00:00:00Z',
    replayed: false,
  };
  let receivedHeaders: Headers | null = null;
  const proxy = await startProxy({
    tokenProvider: () => TOKEN,
    fetchImpl: async (_input, init = {}) => {
      receivedHeaders = new Headers(init.headers);
      return new Response(JSON.stringify(responseBody), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    },
  }, reviewPath);
  try {
    const response = await globalThis.fetch(proxy.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'review-adjudicate-test-0001',
        'x-operator-id': 'attacker-controlled',
        authorization: 'Bearer browser-token-must-not-forward',
      },
      body: JSON.stringify(reviewBody),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), responseBody);
    assert.equal(receivedHeaders?.get('x-operator-id'), 'local_operator');
    assert.equal(receivedHeaders?.get('authorization'), 'Bearer ' + TOKEN);
    assert.equal(receivedHeaders?.get('cookie'), null);
  } finally { await close(proxy.server); }
});

test('review adjudication validator rejects missing hash, edit without adjusted output, and non-edit with output', () => {
  const reviewPath: WorkforceCommandPath = '/api/v1/commands/reviews/adjudicate';
  const base = {
    review_id: 'rev_12345678',
    decision: 'APPROVED',
    expected_original_sha256: 'b'.repeat(64),
    adjusted_output: null,
    reason_code: null,
    notes: null,
  };
  assert.equal(validateWorkforceCommandBody(reviewPath, base), true);
  assert.equal(validateWorkforceCommandBody(reviewPath, { ...base, expected_original_sha256: 'bad' }), false);
  assert.equal(validateWorkforceCommandBody(reviewPath, { ...base, decision: 'EDITED' }), false);
  assert.equal(validateWorkforceCommandBody(reviewPath, { ...base, adjusted_output: { corrected: true } }), false);
  assert.equal(validateWorkforceCommandBody(reviewPath, { ...base, decision: 'REJECTED', reason_code: 'QUALITY_REJECTED' }), true);
  assert.equal(validateWorkforceCommandBody(reviewPath, { ...base, extra: true }), false);
});
