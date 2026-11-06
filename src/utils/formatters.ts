/**
 * Utility formatters for SIREADER Virtual Office (Phase 1 — Simulated Telemetry)
 */

export function formatTokens(tokens: number): string {
  return Math.round(tokens).toLocaleString('en-US');
}

export function formatSimulatedCost(costUsd: number): string {
  if (costUsd < 0.01 && costUsd > 0) {
    return `$${costUsd.toFixed(4)}`;
  }
  return `$${costUsd.toFixed(3)}`;
}

export function formatSimDuration(simMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(simMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => String(n).padStart(2, '0');
  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

export function formatProgressPercent(progress: number): string {
  return `${Math.min(100, Math.max(0, Math.round(progress)))}%`;
}
