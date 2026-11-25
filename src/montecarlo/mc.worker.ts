import type { GridData, Room, Scenario } from '../sim/types';
import { runOnce, type RunSummary } from './batch';

export interface McJob {
  grid: GridData;
  rooms: Room[];
  scenario: Scenario;
  seeds: number[];
}
export type McMessage = { type: 'run'; run: RunSummary } | { type: 'done' };

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<McJob>) => void) | null;
  postMessage: (m: McMessage) => void;
};

ctx.onmessage = (e) => {
  const { grid, rooms, scenario, seeds } = e.data;
  for (const seed of seeds) ctx.postMessage({ type: 'run', run: runOnce(grid, rooms, scenario, seed) });
  ctx.postMessage({ type: 'done' });
};
