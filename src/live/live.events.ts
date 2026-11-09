import type { LiveApiPath } from './live.contracts';

export const LIVE_EVENT_STREAM_URL = '/api/v1/events/stream' as const;
export const LIVE_SSE_RECONCILIATION_INTERVAL_MS = 60_000;

export const LIVE_EVENT_RESOURCE_PATHS = Object.freeze({
  system: ['/api/v1/system/status'],
  telemetry: ['/api/v1/telemetry/usage'],
  pipeline: ['/api/v1/pipeline/active'],
  market_watches: ['/api/v1/market-watches/active'],
  audit: ['/api/v1/audit/decisions'],
  workforce: [
    '/api/v1/workforce/runtime',
    '/api/v1/workforce/tasks',
    '/api/v1/workforce/activity',
  ],
} as const satisfies Readonly<Record<string, readonly LiveApiPath[]>>);

export type LiveEventResource = keyof typeof LIVE_EVENT_RESOURCE_PATHS;
export type LiveEventResetReason =
  | 'cursor_invalid'
  | 'epoch_changed'
  | 'cursor_ahead'
  | 'replay_gap'
  | 'subscriber_overflow'
  | 'listener_disconnected'
  | 'listener_recovered'
  | 'server_shutdown';

export interface LiveEventSourceLike {
  onopen: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  addEventListener(type: string, listener: EventListener): void;
  close(): void;
}

export interface LiveInvalidationEvent {
  readonly epoch: string;
  readonly sequence: number;
  readonly resources: readonly LiveEventResource[];
  readonly paths: readonly LiveApiPath[];
}

export function parseLiveInvalidationEvent(
  data: string,
  lastEventId: string,
): LiveInvalidationEvent | null {
  const match = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([1-9][0-9]{0,18})$/.exec(lastEventId);
  if (!match) return null;
  const sequence = Number(match[2]);
  if (!Number.isSafeInteger(sequence) || sequence < 1) return null;

  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== 3 ||
    !Object.prototype.hasOwnProperty.call(record, 'schema_version') ||
    !Object.prototype.hasOwnProperty.call(record, 'occurred_at') ||
    !Object.prototype.hasOwnProperty.call(record, 'resources') ||
    record.schema_version !== 1 ||
    typeof record.occurred_at !== 'string' ||
    !record.occurred_at.includes('T') ||
    !Number.isFinite(Date.parse(record.occurred_at)) ||
    !Array.isArray(record.resources) ||
    record.resources.length < 1 ||
    record.resources.length > 6
  ) return null;

  const resources: LiveEventResource[] = [];
  for (const item of record.resources) {
    if (
      typeof item !== 'string' ||
      !Object.prototype.hasOwnProperty.call(LIVE_EVENT_RESOURCE_PATHS, item) ||
      resources.includes(item as LiveEventResource)
    ) return null;
    resources.push(item as LiveEventResource);
  }

  return {
    epoch: match[1],
    sequence,
    resources,
    paths: resources.flatMap((resource) => LIVE_EVENT_RESOURCE_PATHS[resource]),
  };
}

export function parseLiveResetEvent(data: string): LiveEventResetReason | null {
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const allowed = [
    'cursor_invalid',
    'epoch_changed',
    'cursor_ahead',
    'replay_gap',
    'subscriber_overflow',
    'listener_disconnected',
    'listener_recovered',
    'server_shutdown',
  ];
  if (
    Object.keys(record).length !== 2 ||
    record.schema_version !== 1 ||
    typeof record.reason !== 'string' ||
    !allowed.includes(record.reason)
  ) return null;
  return record.reason as LiveEventResetReason;
}
