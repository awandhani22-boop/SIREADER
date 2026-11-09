import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createReviewReadHandlers } from './reviews.ts';

const TOKEN = 'review-read-proxy-test-token-0123456789';
const pendingResponse = {
  server_time_utc: '2026-11-10T00:00:00Z',
  total_count: 1,
  limit: 25,
  offset: 0,
  reviews: [{
    review_id: 'rev_12345678',
    task_id: 'task_12345678',
    attempt_id: 'attempt_12345678',
    status: 'PENDING',
    original_output_sha256: 'a'.repeat(64),
    adjusted_output_sha256: null,
    adjudicated_by: null,
    adjudicated_at: null,
    reason_code: null,
    notes: null,
    review_expires_at: '2026-11-11T00:00:00Z',
    created_at: '2026-11-10T00:00:00Z',
    updated_at: '2026-11-10T00:00:00Z',
    payload_purged_at: null,
  }],
};
const detailResponse = {
  ...pendingResponse.reviews[0],
  original_output: { answer: 'quarantined' },
  adjusted_output: null,
};

async function withServer(
  path: string,
  handler: express.RequestHandler,
  callback: (url: string) => Promise<void>,
): Promise<void> {
  const app = express();
  app.get(path, handler);
  const server: Server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  try { await callback('http://127.0.0.1:' + address.port); }
  finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
}

test('pending review BFF uses a fixed loopback origin, server token, bounded query and no browser headers', async () => {
  let requestedUrl = '';
  let receivedHeaders: Headers | null = null;
  const handlers = createReviewReadHandlers({
    tokenProvider: () => TOKEN,
    fetchImpl: async (input, init = {}) => {
      requestedUrl = String(input);
      receivedHeaders = new Headers(init.headers);
      return new Response(JSON.stringify(pendingResponse), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    },
  });
  await withServer('/api/v1/workforce/reviews/pending', handlers.workforcePending, async (base) => {
    const response = await fetch(base + '/api/v1/workforce/reviews/pending?limit=25&offset=0', {
      headers: { authorization: 'Bearer browser-token', cookie: 'sid=private' },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), pendingResponse);
  });
  assert.equal(requestedUrl, 'http://127.0.0.1:8000/api/v1/workforce/reviews/pending?limit=25&offset=0');
  assert.equal(receivedHeaders?.get('authorization'), 'Bearer ' + TOKEN);
  assert.equal(receivedHeaders?.get('cookie'), null);
});

test('review BFF rejects unbounded query strings and invalid review identifiers before upstream access', async () => {
  let contacted = false;
  const handlers = createReviewReadHandlers({
    tokenProvider: () => TOKEN,
    fetchImpl: async () => { contacted = true; return new Response('{}'); },
  });
  await withServer('/api/v1/workforce/reviews/pending', handlers.workforcePending, async (base) => {
    const response = await fetch(base + '/api/v1/workforce/reviews/pending?limit=1000&unexpected=true');
    assert.equal(response.status, 400);
  });
  await withServer('/api/v1/workforce/reviews/:reviewId', handlers.workforceDetail, async (base) => {
    const response = await fetch(base + '/api/v1/workforce/reviews/not-a-review-id');
    assert.equal(response.status, 400);
  });
  assert.equal(contacted, false);
});

test('review BFF rejects malformed upstream DTO and missing backend token', async () => {
  const invalid = createReviewReadHandlers({
    tokenProvider: () => TOKEN,
    fetchImpl: async () => new Response(JSON.stringify({ ...pendingResponse, unexpected: true }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }),
  });
  await withServer('/api/v1/workforce/reviews/pending', invalid.workforcePending, async (base) => {
    const response = await fetch(base + '/api/v1/workforce/reviews/pending');
    assert.equal(response.status, 502);
  });
  let contacted = false;
  const noToken = createReviewReadHandlers({
    tokenProvider: () => undefined,
    fetchImpl: async () => { contacted = true; return new Response('{}'); },
  });
  await withServer('/api/v1/workforce/reviews/pending', noToken.workforcePending, async (base) => {
    const response = await fetch(base + '/api/v1/workforce/reviews/pending');
    assert.equal(response.status, 503);
  });
  assert.equal(contacted, false);
});

test('review detail BFF validates detail payload and preserves no-store response headers', async () => {
  const handlers = createReviewReadHandlers({
    tokenProvider: () => TOKEN,
    fetchImpl: async () => new Response(JSON.stringify(detailResponse), {
      status: 200, headers: { 'content-type': 'application/json' },
    }),
  });
  await withServer('/api/v1/workforce/reviews/:reviewId', handlers.workforceDetail, async (base) => {
    const response = await fetch(base + '/api/v1/workforce/reviews/rev_12345678');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const payload = await response.json() as typeof detailResponse;
    assert.deepEqual(payload.original_output, { answer: 'quarantined' });
  });
});
