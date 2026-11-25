import { C, type GridData } from '../sim/types';
import { isWalkable } from '../sim/grid';
import type { Rng } from '../sim/rng';
import type { Goal } from '../sim/flowField';

export function randomWalkable(g: GridData, rng: Rng, pred: (i: number) => boolean = () => true): number {
  const cands: number[] = [];
  for (let i = 0; i < g.cells.length; i++) if (isWalkable(g.cells[i]) && pred(i)) cands.push(i);
  return cands.length ? cands[Math.floor(rng() * cands.length)] : 0;
}

export function exitGoals(g: GridData, ok: (i: number) => boolean): Goal[] {
  const goals: Goal[] = [];
  for (let i = 0; i < g.cells.length; i++) if (g.cells[i] === C.EXIT && ok(i)) goals.push({ cell: i, cost: 0 });
  return goals;
}

/** Spreads a "wet/burning/gassed" mask one step to 4-neighbours with probability p. Returns newly affected cells. */
export function spreadFrontier(
  g: GridData,
  frontier: number[],
  affected: Uint8Array,
  p: number,
  rng: Rng,
): { newCells: number[]; frontier: number[] } {
  const newCells: number[] = [];
  const next: number[] = [];
  for (const i of frontier) {
    let pending = false;
    const x = i % g.w;
    const y = (i / g.w) | 0;
    const nbrs = [x > 0 ? i - 1 : -1, x < g.w - 1 ? i + 1 : -1, y > 0 ? i - g.w : -1, y < g.h - 1 ? i + g.w : -1];
    for (const j of nbrs) {
      if (j < 0 || affected[j] || !isWalkable(g.cells[j])) continue;
      if (rng() < p) {
        affected[j] = 1;
        newCells.push(j);
        next.push(j);
      } else pending = true;
    }
    if (pending) next.push(i);
  }
  return { newCells, frontier: next };
}
