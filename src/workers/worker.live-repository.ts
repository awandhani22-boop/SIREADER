/**
 * Phase 4.4 repository boundary for authoritative worker runtime records.
 *
 * This adapter deliberately contains no Three.js, Zustand simulation, avatar,
 * animation, or worker-position logic. The scene may join these records to its
 * existing spatial roster by stable worker ID, but must never write LIVE state
 * into the deterministic simulation store.
 */
import type {
  LiveApiResponseMap,
  WorkforceProcessStatus,
  WorkforceRuntimeResponseDto,
} from '../live/live.contracts';

export type WorkerRuntimeSource = 'LIVE';

export interface WorkerRuntimeRecord {
  readonly workerId: string;
  readonly displayName: string;
  readonly role: string;
  readonly department: string;
  readonly enabled: boolean;
  readonly processStatus: WorkforceProcessStatus;
  readonly modelTier: 'NONE' | 'FAST' | 'REASONING' | 'ESCALATION';
  readonly capabilityIds: readonly string[];
  readonly maxConcurrency: number;
  readonly activeTaskCount: number;
  readonly inFlightProviderRequests: number;
  readonly heartbeatAt: string | null;
  readonly observedAt: string;
  readonly source: WorkerRuntimeSource;
}

export interface WorkerRepository {
  readonly source: WorkerRuntimeSource;
  listWorkers(): Promise<readonly WorkerRuntimeRecord[]>;
}

export type WorkforceRuntimeReader = (
  path: '/api/v1/workforce/runtime',
) => Promise<WorkforceRuntimeResponseDto>;

function toWorkerRuntimeRecord(
  worker: WorkforceRuntimeResponseDto['workers'][number],
  observedAt: string,
): WorkerRuntimeRecord {
  return Object.freeze({
    workerId: worker.worker_id,
    displayName: worker.display_name,
    role: worker.role,
    department: worker.department,
    enabled: worker.enabled,
    processStatus: worker.process_status,
    modelTier: worker.model_tier,
    capabilityIds: Object.freeze([...worker.capability_ids]),
    maxConcurrency: worker.max_concurrency,
    activeTaskCount: worker.active_task_count,
    inFlightProviderRequests: worker.in_flight_provider_requests,
    heartbeatAt: worker.heartbeat_at,
    observedAt,
    source: 'LIVE' as const,
  });
}

export function createLiveWorkerRepository(
  readRuntime: WorkforceRuntimeReader,
): WorkerRepository {
  return Object.freeze({
    source: 'LIVE' as const,
    async listWorkers(): Promise<readonly WorkerRuntimeRecord[]> {
      const snapshot = await readRuntime('/api/v1/workforce/runtime');
      return Object.freeze(
        snapshot.workers.map((worker) => toWorkerRuntimeRecord(worker, snapshot.runtime.observed_at)),
      );
    },
  });
}
