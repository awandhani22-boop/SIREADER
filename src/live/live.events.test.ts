import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LIVE_EVENT_STREAM_URL,
  LIVE_SSE_RECONCILIATION_INTERVAL_MS,
  parseLiveInvalidationEvent,
  parseLiveResetEvent,
} from './live.events';

const ID = '123e4567-e89b-12d3-a456-426614174000:9';

test('LIVE SSE event contract accepts only a bounded allowlisted invalidation envelope', () => {
  const event = parseLiveInvalidationEvent(
    JSON.stringify({
      schema_version: 1,
      occurred_at: '2026-11-08T10:00:00Z',
      resources: ['system', 'pipeline'],
    }),
    ID,
  );
  assert.deepEqual(event, {
    epoch: '123e4567-e89b-12d3-a456-426614174000',
    sequence: 9,
    resources: ['system', 'pipeline'],
    paths: ['/api/v1/system/status', '/api/v1/pipeline/active'],
  });
  assert.equal(LIVE_EVENT_STREAM_URL, '/api/v1/events/stream');
  assert.equal(LIVE_SSE_RECONCILIATION_INTERVAL_MS, 60_000);
});

test('LIVE SSE parser rejects invalid IDs, unknown resource keys, duplicate keys and extra fields', () => {
  const valid = JSON.stringify({
    schema_version: 1,
    occurred_at: '2026-11-08T10:00:00Z',
    resources: ['system'],
  });
  assert.equal(parseLiveInvalidationEvent(valid, 'bad-id'), null);
  assert.equal(parseLiveInvalidationEvent(valid, ID + ':extra'), null);
  assert.equal(parseLiveInvalidationEvent(JSON.stringify({
    schema_version: 1, occurred_at: '2026-11-08T10:00:00Z', resources: ['telegram_messages'],
  }), ID), null);
  assert.equal(parseLiveInvalidationEvent(JSON.stringify({
    schema_version: 1, occurred_at: '2026-11-08T10:00:00Z', resources: ['system', 'system'],
  }), ID), null);
  assert.equal(parseLiveInvalidationEvent(JSON.stringify({
    schema_version: 1, occurred_at: '2026-11-08T10:00:00Z', resources: ['system'], extra: true,
  }), ID), null);
  assert.equal(parseLiveInvalidationEvent('not-json', ID), null);
});

test('LIVE SSE reset parser accepts only known reset reasons', () => {
  assert.equal(parseLiveResetEvent(JSON.stringify({ schema_version: 1, reason: 'replay_gap' })), 'replay_gap');
  assert.equal(parseLiveResetEvent(JSON.stringify({ schema_version: 1, reason: 'internal_error' })), null);
  assert.equal(parseLiveResetEvent(JSON.stringify({ schema_version: 1, reason: 'server_shutdown', extra: true })), null);
});
