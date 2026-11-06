import { Pause, Play, PlusCircle, Sparkles } from 'lucide-react';
import React, { useState } from 'react';
import { WORKER_TASK_TEMPLATES } from '../workers/worker.registry';
import { useOfficeStore } from '../workers/worker.state';
import { TaskPriority, WorkerEntity } from '../workers/worker.types';

/**
 * WorkerControls Component
 * Provides interactive controls for the selected worker:
 * - Pause / Resume specific worker (preserving exact task progress without resetting)
 * - Quick-assign deterministic department task templates
 * - Custom Mock Task assignment form with validation and priority selection
 */

interface WorkerControlsProps {
  worker: WorkerEntity;
}

export function WorkerControls({ worker }: WorkerControlsProps) {
  const [customTitle, setCustomTitle] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('NORMAL');
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const assignMockTask = useOfficeStore((s) => s.assignMockTask);
  const toggleWorkerPause = useOfficeStore((s) => s.toggleWorkerPause);

  const templates = WORKER_TASK_TEMPLATES[worker.id] ?? WORKER_TASK_TEMPLATES.supervisor;
  const isPaused = worker.status === 'PAUSED';

  const showTransientFeedback = (msg: string) => {
    setFeedbackMsg(msg);
    window.setTimeout(() => {
      setFeedbackMsg((prev) => (prev === msg ? null : prev));
    }, 2600);
  };

  const handleAssignPreset = (templateIdx: number) => {
    const template = templates[templateIdx];
    assignMockTask({ workerId: worker.id }, templateIdx);
    showTransientFeedback(
      worker.status === 'IDLE' && !worker.currentTaskId
        ? `Started "${template.title}"`
        : `Added "${template.title}" to queue`,
    );
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customTitle.trim();
    if (!trimmed) {
      showTransientFeedback('Please enter a simulated task title first.');
      return;
    }

    assignMockTask({
      workerId: worker.id,
      title: trimmed,
      description: `Custom simulated dispatch assigned by operator (${priority} priority).`,
      priority,
    });
    setCustomTitle('');
    showTransientFeedback(
      worker.status === 'IDLE' && !worker.currentTaskId
        ? `Dispatched "${trimmed}" to ${worker.shortName}`
        : `Queued "${trimmed}" for ${worker.shortName}`,
    );
  };

  return (
    <div className="space-y-4 pt-3 border-t border-slate-800/90">
      {/* 1. Per-Worker Pause / Resume Control */}
      <div className="flex items-center justify-between gap-3 bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-200">
            Worker Execution Control
          </div>
          <div className="text-[11px] text-slate-400">
            {isPaused
              ? 'Paused: task progress frozen. Other workers continue.'
              : 'Active: worker processes tasks & queue deterministically.'}
          </div>
        </div>
        <button
          type="button"
          onClick={() => toggleWorkerPause(worker.id)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
            isPaused
              ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
              : 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
          }`}
          aria-label={isPaused ? `Resume ${worker.name}` : `Pause ${worker.name}`}
        >
          {isPaused ? (
            <>
              <Play className="w-3.5 h-3.5" />
              <span>Resume Worker</span>
            </>
          ) : (
            <>
              <Pause className="w-3.5 h-3.5" />
              <span>Pause Worker</span>
            </>
          )}
        </button>
      </div>

      {/* 2. Quick Mock Task Templates */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-200">
            Assign Preset Task (SIMULATED)
          </span>
          <span className="font-mono text-[10px] text-slate-400">
            {templates.length} presets
          </span>
        </div>
        <div className="grid grid-cols-1 gap-1.5">
          {templates.map((tpl, idx) => (
            <button
              key={tpl.title}
              type="button"
              onClick={() => handleAssignPreset(idx)}
              className="group flex items-center justify-between gap-2 px-2.5 py-2 rounded-md bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800 hover:border-cyan-500/40 text-left transition-all cursor-pointer"
            >
              <div className="min-w-0">
                <div className="text-xs font-medium text-slate-200 group-hover:text-cyan-200 truncate">
                  {tpl.title}
                </div>
                <div className="font-mono text-[10px] text-slate-400">
                  {tpl.category} · {tpl.priority} · ~{tpl.targetTokens} sim tokens
                </div>
              </div>
              <span className="text-[11px] font-semibold text-cyan-400 group-hover:translate-x-0.5 transition-transform shrink-0">
                + Assign
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 3. Custom Simulated Task Dispatch Form */}
      <form onSubmit={handleCustomSubmit} className="space-y-2.5">
        <label
          htmlFor="custom-task-input"
          className="block text-xs font-semibold text-slate-200"
        >
          Dispatch Custom Simulated Task
        </label>
        <div className="flex gap-2">
          <input
            id="custom-task-input"
            type="text"
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
            placeholder={`New task for ${worker.shortName}...`}
            className="flex-1 min-w-0 px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-md text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
          />
          <select
            aria-label="Simulated task priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
            className="px-2 py-1.5 text-xs font-mono bg-slate-950 border border-slate-800 rounded-md text-slate-200 focus:outline-none focus:border-cyan-400"
          >
            <option value="LOW">LOW</option>
            <option value="NORMAL">NORMAL</option>
            <option value="HIGH">HIGH</option>
            <option value="CRITICAL">CRITICAL</option>
          </select>
        </div>
        <button
          type="submit"
          className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs transition-colors cursor-pointer whitespace-nowrap"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <span>Assign Mock Task</span>
        </button>
      </form>

      {feedbackMsg && (
        <div
          role="status"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-cyan-950/90 border border-cyan-500/40 text-cyan-200 text-xs"
        >
          <Sparkles className="w-3.5 h-3.5 shrink-0 text-cyan-400" />
          <span className="truncate">{feedbackMsg}</span>
        </div>
      )}
    </div>
  );
}
