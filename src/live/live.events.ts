/** Same-origin EventSource client; SSE events only invalidate authoritative snapshots. */
import {
  parseLiveStreamEvent,
  type LiveEventResource,
  type LiveStreamEvent,
  type LiveApiPath,
} from './live.contracts';
import type { LivePoller } from './live.poller';

export type LiveEventStreamStatus =
  | 'STOPPED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'DEGRADED';

interface EventSourceLike {
  onopen: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void;
  close(): void;
}

export type LiveEventSourceFactory = (url: string) => EventSourceLike;

export interface LiveEventStream {
  start(): void;
  stop(): void;
  isConnected(): boolean;
  getStatus(): LiveEventStreamStatus;
}

export interface LiveEventStreamOptions {
  readonly createEventSource?: LiveEventSourceFactory;
  readonly onStatus?: (status: LiveEventStreamStatus) => void;
}

export const LIVE_EVENT_STREAM_URL = '/api/v1/events/stream' as const;

const RESOURCE_PATH: Readonly<Record<LiveEventResource, LiveApiPath>> = Object.freeze({
  system: '/api/v1/system/status',
  telemetry: '/api/v1/telemetry/usage',
  pipeline: '/api/v1/pipeline/active',
  market_watches: '/api/v1/market-watches/active',
  audit: '/api/v1/audit/decisions',
});

function browserEventSource(url: string): EventSourceLike {
  return new EventSource(url, { withCredentials: true });
}

export function createLiveEventStream(
  poller: LivePoller,
  options: LiveEventStreamOptions = {},
): LiveEventStream {
  const factory = options.createEventSource ?? browserEventSource;
  let source: EventSourceLike | null = null;
  let status: LiveEventStreamStatus = 'STOPPED';
  let epoch: string | null = null;
  let sequence = 0;

  function setStatus(next: LiveEventStreamStatus): void {
    if (status === next) return;
    status = next;
    options.onStatus?.(next);
  }

  function reconcileAll(): void {
    void poller.refreshAll();
  }

  function handleEvent(eventName: string, message: MessageEvent<string>): void {
    if (!source) return;
    let event: LiveStreamEvent;
    try {
      event = parseLiveStreamEvent(eventName, message.data, message.lastEventId);
    } catch {
      source.close();
      source = null;
      poller.setEventConnected(false);
      setStatus('DEGRADED');
      reconcileAll();
      return;
    }

    if (event.kind === 'stream.reset') {
      epoch = event.epoch;
      sequence = event.sequence;
      reconcileAll();
      // The API ends the connection after a reset. EventSource reconnects
      // automatically and sends the reset event ID as Last-Event-ID.
      setStatus('RECONNECTING');
      return;
    }

    if (epoch === event.epoch && event.sequence <= sequence) {
      // Duplicate or delayed replay event.
      return;
    }

    if (epoch !== null &&
        (epoch !== event.epoch || event.sequence !== sequence + 1)) {
      epoch = event.epoch;
      sequence = event.sequence;
      reconcileAll();
      return;
    }

    epoch = event.epoch;
    sequence = event.sequence;
    for (const resource of event.resources) {
      // The event is an invalidation hint only. Poller fetches and validates
      // the authoritative snapshot; it never writes event payloads to Zustand.
      void poller.refresh(RESOURCE_PATH[resource]);
    }
  }

  return {
    start(): void {
      if (source) return;
      setStatus('CONNECTING');
      try {
        const current = factory(LIVE_EVENT_STREAM_URL);
        source = current;
        current.onopen = () => {
          if (source !== current) return;
          poller.setEventConnected(true);
          setStatus('CONNECTED');
        };
        current.onerror = () => {
          if (source !== current) return;
          poller.setEventConnected(false);
          setStatus('RECONNECTING');
        };
        current.addEventListener('resources.invalidated', (event) => {
          if (source === current) handleEvent('resources.invalidated', event);
        });
        current.addEventListener('stream.reset', (event) => {
          if (source === current) handleEvent('stream.reset', event);
        });
      } catch {
        poller.setEventConnected(false);
        setStatus('DEGRADED');
        reconcileAll();
      }
    },

    stop(): void {
      const current = source;
      source = null;
      if (current) {
        current.onopen = null;
        current.onerror = null;
        current.close();
      }
      poller.setEventConnected(false);
      setStatus('STOPPED');
      epoch = null;
      sequence = 0;
    },

    isConnected(): boolean {
      return status === 'CONNECTED';
    },

    getStatus(): LiveEventStreamStatus {
      return status;
    },
  };
}
