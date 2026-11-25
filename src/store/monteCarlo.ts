import { create } from 'zustand';
import { useProject } from './useProject';
import { defaultOriginCell, isWalkable } from '../sim/grid';
import { batchSeeds, type RunSummary } from '../montecarlo/batch';
import { summarize, type McStats } from '../montecarlo/stats';
import type { McJob, McMessage } from '../montecarlo/mc.worker';

interface McState {
  status: 'idle' | 'running' | 'done';
  done: number;
  total: number;
  stats: McStats | null;
  /** Stats from before the plan last changed, for a before/after comparison. */
  prevStats: McStats | null;
  error: string | null;
}

export const useMonteCarlo = create<McState>()(() => ({ status: 'idle', done: 0, total: 0, stats: null, prevStats: null, error: null }));

let workers: Worker[] = [];
const stop = () => {
  workers.forEach((w) => w.terminate());
  workers = [];
};

export function cancelMonteCarlo() {
  stop();
  useMonteCarlo.setState({ status: 'idle', done: 0, total: 0 });
}

export function startMonteCarlo(n: number, randomOrigin: boolean) {
  stop();
  const p = useProject.getState();
  const savedOrigin = p.scenario.origin;
  const originIsValid = savedOrigin !== null && savedOrigin >= 0 && savedOrigin < p.grid.cells.length && isWalkable(p.grid.cells[savedOrigin]);
  const scenario = {
    ...p.scenario,
    origin: randomOrigin ? null : originIsValid ? savedOrigin : defaultOriginCell(p.grid),
  };
  const seeds = batchSeeds(n);
  const count = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1, n));
  const runs: RunSummary[] = [];
  let finished = 0;
  useMonteCarlo.setState({ status: 'running', done: 0, total: n, error: null });

  for (let k = 0; k < count; k++) {
    const w = new Worker(new URL('../montecarlo/mc.worker.ts', import.meta.url), { type: 'module' });
    workers.push(w);
    w.onmessage = (e: MessageEvent<McMessage>) => {
      if (e.data.type === 'run') {
        runs.push(e.data.run);
        useMonteCarlo.setState({ done: runs.length });
        return;
      }
      if (++finished < count) return;
      stop();
      const stats = summarize(runs, p.rooms, p.targetTime, { origin: scenario.origin, randomOrigin });
      useMonteCarlo.setState({ status: 'done', done: n, stats });
    };
    w.onerror = () => {
      stop();
      useMonteCarlo.setState({ status: 'idle', done: 0, total: 0, error: 'Симулацията на заден план не успя. Опитайте отново.' });
    };
    const job: McJob = { grid: p.grid, rooms: p.rooms, scenario, seeds: seeds.filter((_, i) => i % count === k) };
    w.postMessage(job);
  }
}

// Results describe one specific plan and scenario: drop them as soon as either changes (the seed alone does not matter).
useProject.subscribe((s, prev) => {
  const a = s.scenario;
  const b = prev.scenario;
  const changed =
    s.gridVersion !== prev.gridVersion ||
    s.rooms !== prev.rooms ||
    s.targetTime !== prev.targetTime ||
    a.type !== b.type ||
    a.origin !== b.origin ||
    a.spreadSpeed !== b.spreadSpeed;
  if (!changed) return;
  const cur = useMonteCarlo.getState();
  if (cur.status === 'idle' && !cur.stats) return;
  stop();
  useMonteCarlo.setState({ status: 'idle', done: 0, total: 0, stats: null, prevStats: cur.stats ?? cur.prevStats });
});
