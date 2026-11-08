import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LiveContractError,
  parseLiveStreamEvent,
  type LiveEventResetReason,
} from './live.contracts';
import {
  createLiveEventStream,
  LIVE_EVENT_STREAM_URL,
  type LiveEventSourceFactory,
} from './live.events';
import type { LivePoller } from './live.poller';

const EPOCH = '00000000-0000-4000-8000-000000000001';

class FakeEventSource {
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  closed = false;
  readonly listeners = new Map<string, (event: MessageEvent<string>) => void>();

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void {
    this.listeners.set(type, listener);
  }

  close(): void { this.closed = true; }

  emit(type: string, data: unknown, sequence: number): void {
    const listener = this.listeners.get(type);
    if (!listener) throw new Error('No listener for event type ' + type);
    listener({
      data: JSON.stringify(data),
      lastEventId: EPOCH + ':' + String(sequence),
    } as MessageEvent<string>);
  }
}

function invalidation(resources: string[]) {
  return {
    schema_version: 1,
    occurred_at: '2026-11-09T00:00:00Z',
    resources,
  };
}

function reset(reason: LiveEventResetReason) {
  return {
    schema_version: 1,
    occurred_at: '2026-11-09T00:00:00Z',
    reason,
  };
}

test('LIVE SSE contract rejects unknown resources, invalid ids and extra payload fields', () => {
  const valid = parseLiveStreamEvent(
    'resources.invalidated',
    JSON.stringify(invalidation(['pipeline'])),
    EPOCH + ':1',
  );
  assert.equal(valid.kind, 'resources.invalidated');
  assert.equal(valid.sequence, 1);

  assert.throws(
    () => parseLiveStreamEvent('resources.invalidated', JSON.stringify(invalidation(['orders'])), EPOCH + ':2'),
    LiveContractError,
  );
  assert.throws(
    () => parseLiveStreamEvent('resources.invalidated', JSON.stringify({
      ...invalidation(['pipeline']), internal_row: 'must-not-be-accepted',
    }), EPOCH + ':2'),
    LiveContractError,
  );
  assert.throws(
    () => parseLiveStreamEvent('resources.invalidated', JSON.stringify(invalidation(['pipeline', 'pipeline'])), EPOCH + ':2'),
    LiveContractError,
  );
  assert.throws(
    () => parseLiveStreamEvent('stream.reset', JSON.stringify(reset('unknown' as LiveEventResetReason)), EPOCH + ':2'),
    LiveContractError,
  );
  assert.throws(
    () => parseLiveStreamEvent('resources.invalidated', JSON.stringify(invalidation(['pipeline'])), 'bad-cursor'),
    LiveContractError,
  );
});

test('LIVE SSE client maps invalidations to authoritative snapshot refreshes only', () => {
  const source = new FakeEventSource();
  const statuses: string[] = [];
  const refreshes: string[] = [];
  let refreshAll = 0;
  const connected: boolean[] = [];
  const poller = {
    refresh: async (path: string) => { refreshes.push(path); },
    refreshAll: async () => { refreshAll += 1; },
    setEventConnected: (value: boolean) => { connected.push(value); },
  } as unknown as LivePoller;
  const factory: LiveEventSourceFactory = (url) => {
    assert.equal(url, LIVE_EVENT_STREAM_URL);
    return source;
  };
  const client = createLiveEventStream(poller, {
    createEventSource: factory,
    onStatus: (status) => statuses.push(status),
  });

  client.start();
  assert.equal(client.getStatus(), 'CONNECTING');
  source.onopen?.(new Event('open'));
  assert.equal(client.isConnected(), true);

  source.emit('resources.invalidated', invalidation(['pipeline', 'telemetry']), 1);
  assert.deepEqual(refreshes, [
    '/api/v1/pipeline/active',
    '/api/v1/telemetry/usage',
  ]);

  // Duplicate event IDs are ignored.
  source.emit('resources.invalidated', invalidation(['pipeline']), 1);
  assert.equal(refreshes.length, 2);

  // A sequence gap forces a complete snapshot reconciliation.
  source.emit('resources.invalidated', invalidation(['audit']), 3);
  assert.equal(refreshAll, 1);
  assert.equal(refreshes.length, 2);

  source.emit('stream.reset', reset('cursor_expired'), 4);
  assert.equal(refreshAll, 2);
  assert.equal(client.getStatus(), 'RECONNECTING');

  client.stop();
  assert.equal(client.getStatus(), 'STOPPED');
  assert.equal(source.closed, true);
  assert.equal(connected[0], true);
  assert.equal(connected[connected.length - 1], false);
  assert.ok(statuses.includes('CONNECTED'));
});

test('malformed LIVE SSE event closes the stream and keeps snapshot polling fallback', () => {
  const source = new FakeEventSource();
  let refreshAll = 0;
  let eventConnected = true;
  const poller = {
    refresh: async () => undefined,
    refreshAll: async () => { refreshAll += 1; },
    setEventConnected: (value: boolean) => { eventConnected = value; },
  } as unknown as LivePoller;
  const client = createLiveEventStream(poller, {
    createEventSource: () => source,
  });
  client.start();
  source.onopen?.(new Event('open'));
  source.emit('resources.invalidated', invalidation(['unknown']), 1);
  assert.equal(source.closed, true);
  assert.equal(client.getStatus(), 'DEGRADED');
  assert.equal(refreshAll, 1);
  assert.equal(eventConnected, false);
});
