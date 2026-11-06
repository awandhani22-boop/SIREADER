import { Activity, ChevronDown, ChevronUp, Filter } from 'lucide-react';
import { formatSimDuration } from '../utils/formatters';
import { ROOM_LIST } from '../workers/worker.registry';
import { useOfficeStore } from '../workers/worker.state';

/**
 * ActivityFeed Component
 * Displays a live chronological stream of deterministic SIMULATED task & worker events
 * with department filtering and clickable worker links.
 */

export function ActivityFeed() {
  const events = useOfficeStore((s) => s.events);
  const isActivityFeedOpen = useOfficeStore((s) => s.isActivityFeedOpen);
  const departmentFilter = useOfficeStore((s) => s.departmentFilter);
  const setActivityFeedOpen = useOfficeStore((s) => s.setActivityFeedOpen);
  const setDepartmentFilter = useOfficeStore((s) => s.setDepartmentFilter);
  const selectWorker = useOfficeStore((s) => s.selectWorker);

  const filteredEvents =
    departmentFilter === 'ALL'
      ? events
      : events.filter((evt) => evt.department === departmentFilter);

  return (
    <section
      aria-label="Simulated Office Activity Feed"
      data-testid="activity-feed-panel"
      className="w-full sm:w-[430px] bg-[#0B1220] border border-slate-800/95 rounded-t-lg shadow-2xl text-slate-100 overflow-hidden"
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-2 px-3.5 py-2 bg-[#080E1A] border-b border-slate-800">
        <div className="flex items-center gap-2 min-w-0">
          <Activity className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="text-xs font-semibold text-white truncate">
            Live Simulated Task Feed
          </span>
          <span className="font-mono text-[10px] text-cyan-300">
            SIMULATED ({filteredEvents.length})
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex items-center gap-1">
            <Filter className="w-3 h-3 text-slate-400" />
            <select
              aria-label="Filter Activity Feed by Department"
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] font-medium text-slate-200 focus:outline-none focus:border-cyan-400"
            >
              <option value="ALL">All Departments</option>
              {ROOM_LIST.map((r) => (
                <option key={r.id} value={r.name}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => setActivityFeedOpen(!isActivityFeedOpen)}
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors cursor-pointer"
            aria-label={
              isActivityFeedOpen ? 'Collapse Activity Feed' : 'Expand Activity Feed'
            }
          >
            {isActivityFeedOpen ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Event Stream Body */}
      {isActivityFeedOpen && (
        <div className="max-h-48 overflow-y-auto divide-y divide-slate-800/70">
          {filteredEvents.length === 0 ? (
            <div className="p-3 text-xs text-slate-400 text-center">
              No simulated events recorded for this department filter yet.
            </div>
          ) : (
            filteredEvents.slice(0, 25).map((evt) => (
              <div
                key={evt.id}
                className="flex items-start justify-between gap-2.5 px-3.5 py-2 hover:bg-slate-900/60 transition-colors text-xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: evt.accentColor }}
                    />
                    {evt.workerId ? (
                      <button
                        type="button"
                        onClick={() => selectWorker(evt.workerId)}
                        className="font-semibold text-slate-200 hover:text-cyan-300 transition-colors cursor-pointer truncate"
                      >
                        {evt.workerName}
                      </button>
                    ) : (
                      <span className="font-semibold text-cyan-300">
                        {evt.workerName}
                      </span>
                    )}
                    <span className="text-slate-600" aria-hidden="true">
                      ·
                    </span>
                    <span className="text-[10px] text-slate-400 truncate">
                      {evt.department}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">
                    {evt.message}
                  </p>
                </div>

                <span className="font-mono text-[10px] text-slate-400 shrink-0 pt-0.5">
                  T+{formatSimDuration(evt.simTimestampMs)}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}
