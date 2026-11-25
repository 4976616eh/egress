import type { GridData } from '../sim/types';
import { forEach4, isWalkable } from '../sim/grid';
import type { Rng } from '../sim/rng';
import type { Portals } from '../sim/floors';
import type { Hazard } from './types';
import { exitGoals, randomWalkable, spreadFrontier } from './common';
import { FIRE_UP_DELAY } from './vertical';

const SPREAD_INTERVAL = 2.5; // s between spread attempts
const IGNITE_P = 0.5;
const SMOKE_RADIUS = 5; // cells
const BURN_UP_TIME = 4; // s until a cell is fully ablaze (lethal at 50%)

export function createFire(speed = 1): Hazard {
  let level = new Float32Array(0);
  let aux = new Float32Array(0);
  let burning = new Uint8Array(0);
  let burnStartedAt = new Float32Array(0);
  let burningList: number[] = [];
  let frontier: number[] = [];
  let upwardLinks: { lower: number; upper: number }[] = [];
  let timer = 0;
  let elapsed = 0;
  let origin = 0;
  let rng: Rng = Math.random;
  const spreadInterval = SPREAD_INTERVAL / speed;
  const burnUpTime = BURN_UP_TIME / speed;
  const fireUpDelay = FIRE_UP_DELAY / speed;

  function computeSmoke(g: GridData, portals?: Portals | null) {
    aux.fill(0);
    const d = new Int16Array(g.w * g.h).fill(-1);
    const q = burningList.slice();
    for (const i of q) d[i] = 0;
    for (let head = 0; head < q.length; head++) {
      const i = q[head];
      if (d[i] >= SMOKE_RADIUS) continue;
      const visit = (j: number) => {
        if (d[j] >= 0 || !isWalkable(g.cells[j])) return;
        d[j] = d[i] + 1;
        aux[j] = 1 - d[j] / (SMOKE_RADIUS + 1);
        q.push(j);
      };
      forEach4(g, i, visit);
      // Hot smoke can rise through a connected stairwell before flames reach it.
      const up = portals?.up[i] ?? -1;
      if (up >= 0) visit(up);
    }
  }

  return {
    type: 'fire',
    preDelay: 0,
    get level() { return level; },
    get aux() { return aux; },
    get origin() { return origin; },
    init(g, o, r, portals) {
      const n = g.w * g.h;
      rng = r;
      level = new Float32Array(n);
      aux = new Float32Array(n);
      burning = new Uint8Array(n);
      burnStartedAt = new Float32Array(n).fill(Infinity);
      upwardLinks = [];
      if (portals) for (let i = 0; i < n; i++) if (portals.up[i] >= 0) upwardLinks.push({ lower: i, upper: portals.up[i] });
      origin = o !== null && isWalkable(g.cells[o]) ? o : randomWalkable(g, rng);
      burning[origin] = 1;
      burnStartedAt[origin] = 0;
      burningList = [origin];
      frontier = [origin];
      timer = 0;
      elapsed = 0;
      computeSmoke(g, portals);
    },
    step(g, dt, _t, portals) {
      elapsed += dt;
      for (const i of burningList) level[i] = Math.min(1, level[i] + dt / burnUpTime);
      timer += dt;
      let changed = false;
      if (timer >= spreadInterval) {
        timer -= spreadInterval;
        if (frontier.length > 0) {
          const res = spreadFrontier(g, frontier, burning, IGNITE_P, rng);
          frontier = res.frontier;
          for (const i of res.newCells) burnStartedAt[i] = elapsed;
          if (res.newCells.length) {
            burningList.push(...res.newCells);
            changed = true;
          }
        }
      }
      // Flames climb one connected stair link only after the stair cell has burned for a while.
      for (const { lower, upper } of upwardLinks) {
        if (!burning[lower] || burning[upper] || elapsed - burnStartedAt[lower] < fireUpDelay) continue;
        burning[upper] = 1;
        burnStartedAt[upper] = elapsed;
        burningList.push(upper);
        frontier.push(upper);
        changed = true;
      }
      if (changed) computeSmoke(g, portals);
      return changed;
    },
    isBlocked: (i) => burning[i] === 1,
    speedFactor: (i) => (aux[i] > 0 ? 0.5 : 1),
    pathCost: (i) => aux[i] * 6,
    isLethal: (i) => level[i] > 0.5,
    goals: (g) => exitGoals(g, (i) => !burning[i]),
  };
}
