import { C } from '../sim/types';
import { isWalkable } from '../sim/grid';
import { cellFloor, floorCount } from '../sim/floors';
import type { Portals } from '../sim/floors';
import type { Rng } from '../sim/rng';
import type { Goal } from '../sim/flowField';
import type { Hazard } from './types';
import { randomWalkable, spreadFrontier } from './common';
import { FLOOD_STAIR_OVERTOP_DEPTH } from './vertical';

const SPREAD_INTERVAL = 2; // s
const SPREAD_P = 0.6;
const RISE_RATE = 0.012; // m/s per wet cell
const MAX_DEPTH = 1.2;
const IMPASSABLE_DEPTH = 0.7;
/** Exits get this extra cost so agents prefer going upstairs. */
const EXIT_PENALTY = 30;

export function createFlood(speed = 1): Hazard {
  let level = new Float32Array(0); // water depth in meters
  let aux = new Float32Array(0);
  let wet = new Uint8Array(0);
  let wetList: number[] = [];
  let frontier: number[] = [];
  let upwardLinks: { lower: number; upper: number }[] = [];
  let timer = 0;
  let origin = 0;
  let rng: Rng = Math.random;
  const spreadInterval = SPREAD_INTERVAL / speed;
  const riseRate = RISE_RATE * speed;

  return {
    type: 'flood',
    preDelay: 0,
    get level() { return level; },
    get aux() { return aux; },
    get origin() { return origin; },
    init(g, o, r, portals) {
      const n = g.w * g.h;
      rng = r;
      level = new Float32Array(n);
      aux = new Float32Array(n);
      wet = new Uint8Array(n);
      upwardLinks = [];
      if (portals) for (let i = 0; i < n; i++) if (portals.up[i] >= 0) upwardLinks.push({ lower: i, upper: portals.up[i] });
      // Default source: water enters through an exit.
      origin = o !== null && isWalkable(g.cells[o]) ? o : randomWalkable(g, rng, (i) => g.cells[i] === C.EXIT);
      wet[origin] = 1;
      wetList = [origin];
      frontier = [origin];
      timer = 0;
    },
    step(g, dt, _t, _portals) {
      for (const i of wetList) level[i] = Math.min(MAX_DEPTH, level[i] + riseRate * dt);
      timer += dt;
      let changed = false;
      if (timer >= spreadInterval) {
        timer -= spreadInterval;
        const res = spreadFrontier(g, frontier, wet, SPREAD_P, rng);
        frontier = res.frontier;
        wetList.push(...res.newCells);
        // Depth changes path costs continuously; refresh the field every spread tick.
        changed = true;
      }
      // Water spills upward only after it reaches the overtopping depth at a linked stair.
      for (const { lower, upper } of upwardLinks) {
        if (!wet[lower] || wet[upper] || level[lower] < FLOOD_STAIR_OVERTOP_DEPTH) continue;
        wet[upper] = 1;
        level[upper] = 0.01;
        wetList.push(upper);
        frontier.push(upper);
        changed = true;
      }
      return changed;
    },
    isBlocked: (i) => level[i] > IMPASSABLE_DEPTH,
    speedFactor: (i) => (level[i] > 0 ? Math.max(0.25, 1 - level[i] * 1.2) : 1),
    pathCost: (i) => level[i] * 10,
    isLethal: () => false,
    goals(g) {
      const goals: Goal[] = [];
      // In a multi-storey building "up" means a higher floor than the one that floods.
      const floodFloor = cellFloor(g, origin);
      const needUpper = floorCount(g) > 1 && floodFloor < floorCount(g) - 1;
      const safeStairs = (i: number) => g.cells[i] === C.STAIRS && level[i] <= IMPASSABLE_DEPTH && (!needUpper || cellFloor(g, i) > floodFloor);
      let hasStairs = false;
      for (let i = 0; i < g.cells.length && !hasStairs; i++) if (safeStairs(i)) hasStairs = true;
      for (let i = 0; i < g.cells.length; i++) {
        if (level[i] > IMPASSABLE_DEPTH) continue;
        if (safeStairs(i)) goals.push({ cell: i, cost: 0 });
        else if (g.cells[i] === C.EXIT && !wet[i]) goals.push({ cell: i, cost: hasStairs ? EXIT_PENALTY : 0 });
      }
      return goals;
    },
  };
}
