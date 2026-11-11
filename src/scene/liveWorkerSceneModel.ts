import { createInitialWorkersRegistry, ROOM_LIST } from '../workers/worker.registry';
import type { AvatarConfig, WorkerId } from '../workers/worker.types';
import type { WorkerRuntimeRecord } from '../workers/worker.live-repository';

/**
 * The live scene consumes a presentation-only view of a backend worker.
 * SIMULATED metrics and task entities are intentionally excluded.
 */
export type WorkerAvatarModel = Pick<import('../workers/worker.types').WorkerEntity,
  'id' | 'name' | 'position3D' | 'deskRotationY' | 'status' | 'animationState' | 'avatarConfig'
>;

export interface LiveWorkerSceneModel extends WorkerAvatarModel {
  readonly workerId: WorkerId;
  readonly displayName: string;
  readonly department: string;
  readonly statusLabel: string;
  readonly visualStatus: WorkerRuntimeRecord['visualStatus'];
  readonly animationState: WorkerRuntimeRecord['animationState'];
  readonly activeTaskCount: number | null;
  readonly position3D: [number, number, number];
  readonly deskRotationY: number;
  readonly avatarConfig: AvatarConfig;
}

const GRID_COLUMNS = 5;
const GRID_ROWS = 5;
const GRID_X_START = -2.4;
const GRID_Z_START = -2.6;
const GRID_X_STEP = 1.2;
const GRID_Z_STEP = 1.3;
const MAX_DYNAMIC_WORKERS_PER_ROOM = GRID_COLUMNS * GRID_ROWS;

const initialWorkers = createInitialWorkersRegistry();
const initialWorkerIds = new Set(Object.keys(initialWorkers));
const initialWorkersById = initialWorkers as Record<string, (typeof initialWorkers)[keyof typeof initialWorkers]>;

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function preferredRoomIndex(department: string, workerId: string): number {
  const normalizedDepartment = department.trim().toLocaleLowerCase();
  const match = ROOM_LIST.findIndex((room) =>
    room.name.toLocaleLowerCase() === normalizedDepartment ||
    room.departmentCode.toLocaleLowerCase() === normalizedDepartment ||
    room.id.toLocaleLowerCase() === normalizedDepartment,
  );
  return match >= 0 ? match : stableHash(workerId) % ROOM_LIST.length;
}

function dynamicWorkerPosition(roomIndex: number, slot: number): [number, number, number] {
  const room = ROOM_LIST[roomIndex];
  const column = slot % GRID_COLUMNS;
  const row = Math.floor(slot / GRID_COLUMNS);
  return [
    room.center3D[0] + GRID_X_START + column * GRID_X_STEP,
    0,
    room.center3D[2] + GRID_Z_START + row * GRID_Z_STEP,
  ];
}

function isReservedByInitialWorker(roomIndex: number, position: readonly number[]): boolean {
  const roomId = ROOM_LIST[roomIndex].id;
  return Object.values(initialWorkersById).some((worker) =>
    worker.roomId === roomId &&
    Math.hypot(
      worker.homePosition3D[0] - position[0],
      worker.homePosition3D[2] - position[2],
    ) < 0.7,
  );
}

function findFreePlacement(
  preferredRoom: number,
  roomLoads: number[],
): { roomIndex: number; position: [number, number, number] } | null {
  for (let offset = 0; offset < ROOM_LIST.length; offset += 1) {
    const roomIndex = (preferredRoom + offset) % ROOM_LIST.length;
    let slot = roomLoads[roomIndex];
    while (slot < MAX_DYNAMIC_WORKERS_PER_ROOM &&
      isReservedByInitialWorker(roomIndex, dynamicWorkerPosition(roomIndex, slot))) {
      slot += 1;
    }
    if (slot < MAX_DYNAMIC_WORKERS_PER_ROOM) {
      roomLoads[roomIndex] = slot + 1;
      return { roomIndex, position: dynamicWorkerPosition(roomIndex, slot) };
    }
    roomLoads[roomIndex] = MAX_DYNAMIC_WORKERS_PER_ROOM;
  }
  return null;
}

function selectFallbackAvatar(workerId: string): AvatarConfig {
  const fallback = initialWorkers.supervisor.avatarConfig;
  const palette = ROOM_LIST[stableHash(workerId) % ROOM_LIST.length];
  return {
    ...fallback,
    modelUrl: null,
    accentColor: palette.accentColor,
    secondaryColor: palette.accentColor,
    badgeCode: workerId.slice(0, 8).toUpperCase(),
  };
}

/**
 * Creates stable, deterministic avatar positions for a validated LIVE roster.
 * The seven original workers retain their authored positions. Additional
 * workers are assigned to their matching department room, then overflow is
 * distributed across the other rooms. No backend record is written to stores.
 */
export function createLiveWorkerSceneModels(
  records: readonly WorkerRuntimeRecord[],
): readonly LiveWorkerSceneModel[] {
  if (records.length > ROOM_LIST.length * MAX_DYNAMIC_WORKERS_PER_ROOM) {
    throw new RangeError(
      `LIVE scene supports at most ${ROOM_LIST.length * MAX_DYNAMIC_WORKERS_PER_ROOM} workers per layout snapshot`,
    );
  }

  const sortedRecords = [...records].sort((left, right) =>
    left.workerId < right.workerId ? -1 : left.workerId > right.workerId ? 1 : 0,
  );
  const roomLoads = ROOM_LIST.map(() => 0);
  const models: LiveWorkerSceneModel[] = [];

  for (const record of sortedRecords) {
    const knownWorker = initialWorkerIds.has(record.workerId)
      ? initialWorkersById[record.workerId]
      : undefined;

    let position3D: readonly [number, number, number];
    let deskRotationY: number;
    let avatarConfig: AvatarConfig;

    if (knownWorker) {
      position3D = knownWorker.homePosition3D;
      deskRotationY = knownWorker.deskRotationY;
      avatarConfig = knownWorker.avatarConfig;
    } else {
      const placement = findFreePlacement(
        preferredRoomIndex(record.department, record.workerId),
        roomLoads,
      );
      if (!placement) {
        throw new RangeError('LIVE scene has no free worker placement slot');
      }

      position3D = placement.position;
      deskRotationY = 0;
      avatarConfig = selectFallbackAvatar(record.workerId);
    }

    models.push(Object.freeze({
      id: record.workerId as WorkerId,
      workerId: record.workerId as WorkerId,
      name: record.displayName,
      displayName: record.displayName,
      department: record.department,
      statusLabel: record.statusLabel,
      visualStatus: record.visualStatus,
      status: record.visualStatus,
      animationState: record.animationState,
      activeTaskCount: record.activeTaskCount,
      position3D: [...position3D] as [number, number, number],
      deskRotationY,
      avatarConfig,
    }));
  }

  return Object.freeze(models);
}
