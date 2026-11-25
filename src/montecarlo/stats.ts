import type { Room } from '../sim/types';
import type { RunSummary } from './batch';

export interface RoomRisk {
  roomId: number;
  name: string;
  /** Share of runs in which at least one person from this room did not get out. */
  share: number;
}

export interface McStats {
  runs: number;
  /** Runs in which everyone got out. */
  completeRuns: number;
  /** Runs in which at least one person got out, so a last-exit time exists. */
  timeRuns: number;
  /** Scenario knobs the batch ran with, so "show the worst case" can replay it exactly. */
  config: { origin: number | null; randomOrigin: boolean };
  mean: number;
  median: number;
  p95: number;
  best: number;
  worst: number;
  /** Share of runs where everyone got out within the target. */
  withinTarget: number;
  /** Share of runs where at least one person was left inside. */
  withTrapped: number;
  meanTrapped: number;
  maxTrapped: number;
  worstRun: RunSummary;
  histogram: { from: number; to: number; count: number }[];
  roomRisk: RoomRisk[];
  target: number;
}

const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

export function summarize(runs: RunSummary[], rooms: Room[], target: number, config: McStats['config'], bins = 10): McStats {
  if (!runs.length) throw new Error('No runs to summarize');
  // Even an incomplete run has a useful time-to-last-exit if at least one person escaped.
  const measured = runs.filter((r) => r.evacuated > 0);
  const times = measured.map((r) => r.totalTime).sort((a, b) => a - b);
  const has = times.length > 0;
  const sum = times.reduce((a, b) => a + b, 0);
  const lo = has ? times[0] : NaN;
  const hi = has ? times[times.length - 1] : NaN;
  const width = Math.max(1, (hi - lo) / bins);
  const histogram = has ? Array.from({ length: bins }, (_, i) => ({ from: lo + i * width, to: lo + (i + 1) * width, count: 0 })) : [];
  for (const t of times) histogram[Math.min(bins - 1, Math.floor((t - lo) / width))].count++;

  const risk = new Map<number, number>();
  for (const r of runs) for (const id of Object.keys(r.roomTrapped)) risk.set(+id, (risk.get(+id) ?? 0) + 1);
  const roomRisk = [...risk.entries()]
    .map(([roomId, n]) => ({ roomId, name: rooms.find((x) => x.id === roomId)?.name ?? String(roomId), share: n / runs.length }))
    .sort((a, b) => b.share - a.share);

  // Worst = most people left inside, then slowest.
  const worstRun = [...runs].sort((a, b) => b.trapped - a.trapped || b.totalTime - a.totalTime)[0];
  return {
    runs: runs.length,
    completeRuns: runs.filter((r) => r.complete).length,
    timeRuns: measured.length,
    config,
    mean: has ? sum / times.length : NaN,
    median: has ? quantile(times, 0.5) : NaN,
    p95: has ? quantile(times, 0.95) : NaN,
    best: lo,
    worst: hi,
    withinTarget: runs.filter((r) => r.complete && r.totalTime <= target).length / runs.length,
    withTrapped: runs.filter((r) => r.trapped > 0).length / runs.length,
    meanTrapped: runs.reduce((n, r) => n + r.trapped, 0) / runs.length,
    maxTrapped: Math.max(...runs.map((r) => r.trapped)),
    worstRun,
    histogram,
    roomRisk,
    target,
  };
}
