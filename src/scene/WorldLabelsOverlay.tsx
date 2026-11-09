import React from 'react';
import { recordWorkerComponentRender } from '../utils/renderProfiler';
import { ROOM_LIST } from '../workers/worker.registry';
import { useOfficeStore } from '../workers/worker.state';
import { RoomDefinition, RoomId, WorkerId } from '../workers/worker.types';
import { useWorkerDisplayModeStore } from '../workers/worker.display-mode';
import { createDemoWorkerRepository, createLiveWorkerRepository } from '../workers/worker.live-repository';
import { useLiveStore } from '../live/live.state';
import type { WorkforceRuntimeResponseDto } from '../live/live.contracts';

/**
 * WorldLabelsOverlay (Fix C — Granular Per-Worker & Per-Room Subscriptions)
 *
 * Each room badge and worker floating status tag subscribes ONLY to its own
 * slice in `useOfficeStore`, preventing unnecessary re-renders across the overlay
 * when a single worker's state or task changes.
 */

export const roomLabelDomRefs: Partial<Record<RoomId, HTMLDivElement | null>> = {};
export const workerLabelDomRefs: Partial<Record<WorkerId, HTMLDivElement | null>> = {};

const RoomSignageItem = React.memo(function RoomSignageItem({
  room,
}: {
  room: RoomDefinition;
}) {
  const isSelected = useOfficeStore(
    (s) =>
      s.selectedRoomId === room.id || s.selectedWorkerId === room.primaryWorkerId,
  );
  const selectRoom = useOfficeStore((s) => s.selectRoom);

  return (
    <div
      ref={(el) => {
        roomLabelDomRefs[room.id] = el;
      }}
      className="absolute top-0 left-0 will-change-transform pointer-events-auto"
      style={{ transform: 'translate3d(-9999px, -9999px, 0)' }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          selectRoom(room.id, room.primaryWorkerId);
        }}
        className={`-translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5 px-2 py-0.5 rounded border text-left transition-colors cursor-pointer whitespace-nowrap select-none ${
          isSelected
            ? 'bg-slate-900/95 border-cyan-400 text-white shadow-[0_0_12px_rgba(6,182,212,0.35)]'
            : 'bg-slate-950/85 border-slate-700/80 text-slate-300 hover:border-slate-500 hover:text-white'
        }`}
        aria-label={`Select room ${room.name}`}
      >
        <span
          className="font-mono text-[9px] font-bold tracking-wider px-1 py-0.2 rounded bg-slate-900"
          style={{ color: room.accentColor }}
        >
          {room.departmentCode}
        </span>
        <span className="text-[10px] font-semibold tracking-tight">
          {room.name}
        </span>
      </button>
    </div>
  );
});

export const WorldWorkerBadgeItem = React.memo(function WorldWorkerBadgeItem({
  workerId,
}: {
  workerId: WorkerId;
}) {
  recordWorkerComponentRender(workerId, 'badge');

  const worker = useOfficeStore((state) => state.workers[workerId]);
  const activeTask = useOfficeStore((state) => {
    const taskId = state.workers[workerId]?.currentTaskId;
    return taskId ? state.tasks[taskId] ?? null : null;
  });
  const isSelected = useOfficeStore((state) => state.selectedWorkerId === workerId);
  const selectWorker = useOfficeStore((state) => state.selectWorker);
  const displayMode = useWorkerDisplayModeStore((state) => state.mode);
  const liveResource = useLiveStore((state) => state.resources['/api/v1/workforce/runtime']);
  const liveSession = useLiveStore((state) => state.session);
  const liveSnapshot = liveResource.data as WorkforceRuntimeResponseDto | null;

  if (!worker) return null;

  const liveRepository = createLiveWorkerRepository(liveSnapshot, liveResource.status, liveSession);
  const demoRepository = createDemoWorkerRepository([worker]);
  const view = displayMode === 'LIVE'
    ? liveRepository.getWorker(workerId)
    : demoRepository.getWorker(workerId);
  const displayName = displayMode === 'LIVE'
    ? (view.source === 'LIVE' ? view.displayName : workerId)
    : worker.shortName;
  const statusLabel = view.statusLabel;
  const statusBadgeColor =
    statusLabel === 'READY' || statusLabel === 'IDLE'
      ? 'text-emerald-300 border-emerald-500/40 bg-emerald-950/90'
      : statusLabel === 'BUSY' || statusLabel === 'RUNNING'
        ? 'text-cyan-300 border-cyan-500/40 bg-cyan-950/90'
        : statusLabel === 'STALE' || statusLabel === 'CONNECTING' || statusLabel === 'REFRESHING'
          ? 'text-amber-300 border-amber-500/40 bg-amber-950/90'
          : 'text-rose-300 border-rose-500/40 bg-rose-950/90';

  return (
    <div
      ref={(element) => {
        workerLabelDomRefs[worker.id] = element;
      }}
      className="absolute top-0 left-0 will-change-transform pointer-events-auto"
      style={{ transform: 'translate3d(-9999px, -9999px, 0)' }}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          selectWorker(worker.id);
        }}
        className={`-translate-x-1/2 -translate-y-full flex flex-col items-center gap-0.5 px-2 py-1 rounded-md border transition-colors cursor-pointer select-none whitespace-nowrap ${
          isSelected
            ? 'bg-slate-900/95 border-cyan-400 shadow-[0_0_14px_rgba(6,182,212,0.45)]'
            : 'bg-slate-950/90 border-slate-700/80 hover:border-slate-500'
        }`}
        aria-label={`Select 3D worker ${displayName}, status ${statusLabel}, source ${displayMode}`}
        data-testid={`scene-worker-status-${workerId}`}
      >
        <div className="flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: worker.avatarConfig.accentColor }}
          />
          <span className="text-[11px] font-semibold text-slate-100">
            {displayName}
          </span>
          <span className={`font-mono text-[9px] font-medium px-1 py-0.2 rounded border ${statusBadgeColor}`}>
            {statusLabel}
          </span>
        </div>

        {displayMode === 'DEMO' && activeTask && (
          <div className="w-full flex items-center gap-1.5 pt-0.5">
            <span className="font-mono text-[9px] text-slate-400">
              {activeTask.status}
            </span>
            <div className="w-11 h-1 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full transition-all duration-300"
                style={{
                  width: `${Math.min(100, Math.max(0, activeTask.progress))}%`,
                  backgroundColor:
                    worker.status === 'PAUSED'
                      ? '#F59E0B'
                      : worker.avatarConfig.accentColor,
                }}
              />
            </div>
            <span className="font-mono text-[9px] text-slate-300">
              {Math.round(activeTask.progress)}%
            </span>
          </div>
        )}

        {displayMode === 'LIVE' && view.activeTaskCount !== null && (
          <span className="font-mono text-[9px] text-slate-300">
            Backend active tasks: {view.activeTaskCount}
          </span>
        )}
        {displayMode === 'LIVE' && view.freshness === 'UNAUTHENTICATED' && (
          <span className="font-mono text-[9px] text-amber-300">Operator login required</span>
        )}
      </button>
    </div>
  );
});

export function WorldLabelsOverlay() {
  const workerOrder = useOfficeStore((s) => s.workerOrder);

  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden z-10"
      aria-label="3D Office Spatial Labels"
    >
      {ROOM_LIST.map((room) => (
        <RoomSignageItem key={room.id} room={room} />
      ))}
      {workerOrder.map((workerId) => (
        <WorldWorkerBadgeItem key={workerId} workerId={workerId} />
      ))}
    </div>
  );
}
