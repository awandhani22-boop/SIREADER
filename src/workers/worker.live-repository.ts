/**
 * Phase 4.4 source boundary for worker presentation.
 *
 * LIVE records are built only from validated backend snapshots already held by
 * the independent LIVE store. SIMULATED records are built only from the
 * deterministic office store. This module contains no Three.js or network I/O.
 */
import type {
  WorkforceProcessStatus,
  WorkforceRuntimeResponseDto,
} from '../live/live.contracts';
import type { LiveResourceStatus, LiveSessionState } from '../live/live.state';
import type {
  AnimationClipKey,
  WorkerEntity,
  WorkerStatus,
} from './worker.types';

export type WorkerRuntimeSource = 'LIVE' | 'SIMULATED';
export type WorkerRuntimeFreshness =
  | 'LIVE'
  | 'REFRESHING'
  | 'STALE'
  | 'OFFLINE'
  | 'ERROR'
  | 'CONNECTING'
  | 'UNAUTHENTICATED'
  | 'SIMULATED';

export interface WorkerRuntimeRecord {
  readonly workerId: string;
  readonly displayName: string;
  readonly role: string;
  readonly department: string;
  readonly enabled: boolean | null;
  readonly processStatus: WorkforceProcessStatus | 'NOT_REPORTED' | 'CONNECTING' | 'ERROR' | 'UNAUTHENTICATED';
  readonly statusLabel: string;
  readonly visualStatus: WorkerStatus;
  readonly animationState: AnimationClipKey;
  readonly modelTier: 'NONE' | 'FAST' | 'REASONING' | 'ESCALATION' | null;
  readonly capabilityIds: readonly string[];
  readonly maxConcurrency: number | null;
  readonly activeTaskCount: number | null;
  readonly inFlightProviderRequests: number | null;
  readonly heartbeatAt: string | null;
  readonly observedAt: string | null;
  readonly source: WorkerRuntimeSource | null;
  readonly freshness: WorkerRuntimeFreshness;
}

export interface WorkerRepository {
  readonly source: WorkerRuntimeSource;
  listWorkers(): readonly WorkerRuntimeRecord[];
  getWorker(workerId: string): WorkerRuntimeRecord;
}

function emptyLiveRecord(
  workerId: string,
  freshness: WorkerRuntimeFreshness,
): WorkerRuntimeRecord {
  const statusLabel = freshness === 'LIVE' || freshness === 'REFRESHING'
    ? 'NOT_REPORTED'
    : freshness;
  const processStatus =
    statusLabel === 'NOT_REPORTED' || statusLabel === 'CONNECTING'
      || statusLabel === 'ERROR' || statusLabel === 'UNAUTHENTICATED'
      ? statusLabel
      : 'OFFLINE';

  return Object.freeze({
    workerId,
    displayName: workerId,
    role: '',
    department: '',
    enabled: null,
    processStatus,
    statusLabel,
    visualStatus: freshness === 'CONNECTING' ? 'WAITING' : 'ERROR',
    animationState: 'idle',
    modelTier: null,
    capabilityIds: Object.freeze([]),
    maxConcurrency: null,
    activeTaskCount: null,
    inFlightProviderRequests: null,
    heartbeatAt: null,
    observedAt: null,
    source: null,
    freshness,
  });
}

function resourceFreshness(
  status: LiveResourceStatus,
  session: LiveSessionState,
  hasSnapshot: boolean,
): WorkerRuntimeFreshness {
  if (session !== 'AUTHENTICATED') return 'UNAUTHENTICATED';
  if (status === 'ERROR') return 'ERROR';
  if (status === 'STALE') return 'STALE';
  if (status === 'LIVE') return hasSnapshot ? 'LIVE' : 'ERROR';
  if (status === 'LOADING' && hasSnapshot) return 'REFRESHING';
  return 'CONNECTING';
}

function mapBackendStatus(
  status: WorkforceProcessStatus,
  activeTaskCount: number,
): Pick<WorkerRuntimeRecord, 'statusLabel' | 'visualStatus' | 'animationState'> {
  switch (status as string) {
    case 'READY':
      return {
        statusLabel: 'READY',
        visualStatus: activeTaskCount > 0 ? 'BUSY' : 'IDLE',
        animationState: activeTaskCount > 0 ? 'typing' : 'seated',
      };
    case 'STARTING':
      return { statusLabel: 'STARTING', visualStatus: 'WAITING', animationState: 'talking' };
    case 'DRAINING':
      return { statusLabel: 'DRAINING', visualStatus: 'WAITING', animationState: 'talking' };
    case 'STOPPED':
      return { statusLabel: 'STOPPED', visualStatus: 'ERROR', animationState: 'idle' };
    case 'FAILED':
      return { statusLabel: 'FAILED', visualStatus: 'ERROR', animationState: 'idle' };
    case 'STALE':
      return { statusLabel: 'STALE', visualStatus: 'ERROR', animationState: 'idle' };
    case 'OFFLINE':
      return { statusLabel: 'OFFLINE', visualStatus: 'ERROR', animationState: 'idle' };
    case 'DISABLED':
      return { statusLabel: 'DISABLED', visualStatus: 'ERROR', animationState: 'idle' };
    default:
      // Unknown backend states are never guessed into IDLE or BUSY.
      return { statusLabel: 'ERROR', visualStatus: 'ERROR', animationState: 'idle' };
  }
}

function fromBackendWorker(
  worker: WorkforceRuntimeResponseDto['workers'][number],
  observedAt: string,
  freshness: WorkerRuntimeFreshness,
): WorkerRuntimeRecord {
  if (freshness === 'STALE' || freshness === 'ERROR') {
    return Object.freeze({
      workerId: worker.worker_id,
      displayName: worker.display_name,
      role: worker.role,
      department: worker.department,
      enabled: worker.enabled,
      processStatus: freshness,
      statusLabel: freshness,
      visualStatus: 'ERROR',
      animationState: 'idle',
      modelTier: worker.model_tier,
      capabilityIds: Object.freeze([...worker.capability_ids]),
      maxConcurrency: worker.max_concurrency,
      activeTaskCount: null,
      inFlightProviderRequests: null,
      heartbeatAt: worker.heartbeat_at,
      observedAt,
      source: 'LIVE',
      freshness,
    });
  }

  const mapped = mapBackendStatus(worker.process_status, worker.active_task_count);
  return Object.freeze({
    workerId: worker.worker_id,
    displayName: worker.display_name,
    role: worker.role,
    department: worker.department,
    enabled: worker.enabled,
    processStatus: mapped.statusLabel as WorkforceProcessStatus | 'ERROR',
    ...mapped,
    modelTier: worker.model_tier,
    capabilityIds: Object.freeze([...worker.capability_ids]),
    maxConcurrency: worker.max_concurrency,
    activeTaskCount: worker.active_task_count,
    inFlightProviderRequests: worker.in_flight_provider_requests,
    heartbeatAt: worker.heartbeat_at,
    observedAt,
    source: 'LIVE',
    freshness,
  });
}

export function createLiveWorkerRepository(
  snapshot: WorkforceRuntimeResponseDto | null,
  resourceStatus: LiveResourceStatus,
  session: LiveSessionState,
): WorkerRepository {
  const freshness = resourceFreshness(resourceStatus, session, snapshot !== null);
  const records = session === 'AUTHENTICATED' && snapshot
    ? Object.freeze(snapshot.workers.map((worker) =>
        fromBackendWorker(worker, snapshot.runtime.observed_at, freshness),
      ))
    : Object.freeze([] as WorkerRuntimeRecord[]);
  const byId = new Map(records.map((record) => [record.workerId, record]));

  return Object.freeze({
    source: 'LIVE' as const,
    listWorkers: () => records,
    getWorker: (workerId: string) => byId.get(workerId) ?? emptyLiveRecord(workerId, freshness),
  });
}

export function createDemoWorkerRepository(
  workers: readonly WorkerEntity[],
): WorkerRepository {
  const records = Object.freeze(workers.map((worker): WorkerRuntimeRecord => Object.freeze({
    workerId: worker.id,
    displayName: worker.name,
    role: worker.role,
    department: worker.department,
    enabled: true,
    processStatus: 'NOT_REPORTED',
    statusLabel: worker.status,
    visualStatus: worker.status,
    animationState: worker.animationState,
    modelTier: null,
    capabilityIds: Object.freeze([]),
    maxConcurrency: null,
    activeTaskCount: worker.activeTaskIds.length,
    inFlightProviderRequests: null,
    heartbeatAt: null,
    observedAt: null,
    source: 'SIMULATED',
    freshness: 'SIMULATED',
  })));
  const byId = new Map(records.map((record) => [record.workerId, record]));

  return Object.freeze({
    source: 'SIMULATED' as const,
    listWorkers: () => records,
    getWorker: (workerId: string) => byId.get(workerId) ?? emptyLiveRecord(workerId, 'CONNECTING'),
  });
}
