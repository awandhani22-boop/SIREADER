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

export interface SimDurationFormatOptions {
  showFractionalSeconds?: boolean;
}

export function formatSimDuration(
  simMs: number,
  options?: SimDurationFormatOptions,
): string {
  if (!options?.showFractionalSeconds && simMs < 0) {
    return '00:00';
  }

  const isNegative = simMs < 0;
  const nonNegativeMs = Math.max(0, Math.abs(simMs));
  const totalSeconds = Math.floor(nonNegativeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => String(n).padStart(2, '0');
  let timeStr = hours > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;

  if (options?.showFractionalSeconds) {
    const tenths = Math.floor((nonNegativeMs % 1000) / 100);
    timeStr += `.${tenths}`;
  }

  return isNegative ? `-${timeStr}` : timeStr;
}

export function formatProgressPercent(progress: number): string {
  return `${Math.min(100, Math.max(0, Math.round(progress)))}%`;
}
