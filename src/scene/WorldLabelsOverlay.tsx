import { ROOM_LIST } from '../workers/worker.registry';
import { useOfficeStore } from '../workers/worker.state';
import { RoomId, WorkerId } from '../workers/worker.types';

/**
 * WorldLabelsOverlay (Single React Root 3D-to-2D Projected Signage Layer)
 *
 * Replaces multiple @react-three/drei <Html> sub-roots with a single standard
 * React DOM layer whose element positions are updated directly via DOM `ref`
 * transforms inside the R3F `useFrame` camera projection pass.
 * - Eliminates React 19 synchronous root unmount console errors completely.
 * - Prevents 60Hz React re-renders while keeping room & worker labels locked to 3D space.
 */

export const roomLabelDomRefs: Partial<Record<RoomId, HTMLDivElement | null>> = {};
export const workerLabelDomRefs: Partial<Record<WorkerId, HTMLDivElement | null>> = {};

export function WorldLabelsOverlay() {
  const workers = useOfficeStore((s) => s.workers);
  const workerOrder = useOfficeStore((s) => s.workerOrder);
  const tasks = useOfficeStore((s) => s.tasks);
  const selectedWorkerId = useOfficeStore((s) => s.selectedWorkerId);
  const selectedRoomId = useOfficeStore((s) => s.selectedRoomId);
  const selectWorker = useOfficeStore((s) => s.selectWorker);
  const selectRoom = useOfficeStore((s) => s.selectRoom);

  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden z-10"
      aria-label="3D Office Spatial Labels"
    >
      {/* 1. Seven Department Room Signage Headers */}
      {ROOM_LIST.map((room) => {
        const isSelected =
          selectedRoomId === room.id || selectedWorkerId === room.primaryWorkerId;
        return (
          <div
            key={room.id}
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
      })}

      {/* 2. Seven Worker Floating Status & Progress Badges */}
      {workerOrder.map((workerId) => {
        const worker = workers[workerId];
        if (!worker) return null;
        const activeTask = worker.currentTaskId
          ? tasks[worker.currentTaskId] ?? null
          : null;
        const isSelected = selectedWorkerId === worker.id;

        const statusBadgeColor =
          worker.status === 'PAUSED'
            ? 'text-amber-300 border-amber-500/40 bg-amber-950/90'
            : worker.status === 'BUSY' ||
                worker.status === 'WALKING' ||
                worker.status === 'TASK_RECEIVED'
              ? 'text-cyan-300 border-cyan-500/40 bg-cyan-950/90'
              : 'text-slate-300 border-slate-600/50 bg-slate-900/90';

        return (
          <div
            key={worker.id}
            ref={(el) => {
              workerLabelDomRefs[worker.id] = el;
            }}
            className="absolute top-0 left-0 will-change-transform pointer-events-auto"
            style={{ transform: 'translate3d(-9999px, -9999px, 0)' }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                selectWorker(worker.id);
              }}
              className={`-translate-x-1/2 -translate-y-full flex flex-col items-center gap-0.5 px-2 py-1 rounded-md border transition-colors cursor-pointer select-none whitespace-nowrap ${
                isSelected
                  ? 'bg-slate-900/95 border-cyan-400 shadow-[0_0_14px_rgba(6,182,212,0.45)]'
                  : 'bg-slate-950/90 border-slate-700/80 hover:border-slate-500'
              }`}
              aria-label={`Select 3D worker ${worker.name}, status ${worker.status}`}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: worker.avatarConfig.accentColor }}
                />
                <span className="text-[11px] font-semibold text-slate-100">
                  {worker.shortName}
                </span>
                <span
                  className={`font-mono text-[9px] font-medium px-1 py-0.2 rounded border ${statusBadgeColor}`}
                >
                  {worker.status}
                </span>
              </div>

              {activeTask && (
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
            </button>
          </div>
        );
      })}
    </div>
  );
}
