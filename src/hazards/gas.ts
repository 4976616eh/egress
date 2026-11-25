import { isWalkable } from '../sim/grid';
import type { Rng } from '../sim/rng';
import type { Hazard } from './types';
import { exitGoals, randomWalkable, spreadFrontier } from './common';
import { GAS_UP_DELAY } from './vertical';

const SPREAD_INTERVAL = 2; // s
const SPREAD_P = 0.35;
const BUILD_UP = 20; // s to reach full concentration in a cell

export function createGas(speed = 1): Hazard {
  let level = new Float32Array(0); // concentration 0..1
  let aux = new Float32Array(0);
  let gas = new Uint8Array(0);
  let gasStartedAt = new Float32Array(0);
  let gasList: number[] = [];
  let frontier: number[] = [];
  let upwardLinks: { lower: number; upper: number }[] = [];
  let timer = 0;
  let elapsed = 0;
  let origin = 0;
  let rng: Rng = Math.random;
  const spreadInterval = SPREAD_INTERVAL / speed;
  const buildUp = BUILD_UP / speed;
  const gasUpDelay = GAS_UP_DELAY / speed;

  return {
    type: 'gas',
    preDelay: 0,
    get level() { return level; },
    get aux() { return aux; },
    get origin() { return origin; },
    init(g, o, r, portals) {
      const n = g.w * g.h;
      rng = r;
      level = new Float32Array(n);
      aux = new Float32Array(n);
      gas = new Uint8Array(n);
      gasStartedAt = new Float32Array(n).fill(Infinity);
      upwardLinks = [];
      if (portals) for (let i = 0; i < n; i++) if (portals.up[i] >= 0) upwardLinks.push({ lower: i, upper: portals.up[i] });
      origin = o !== null && isWalkable(g.cells[o]) ? o : randomWalkable(g, rng);
      gas[origin] = 1;
      gasStartedAt[origin] = 0;
      level[origin] = 0.01;
      gasList = [origin];
      frontier = [origin];
      timer = 0;
      elapsed = 0;
    },
    step(g, dt, _t, _portals) {
      elapsed += dt;
      for (const i of gasList) level[i] = Math.min(1, level[i] + dt / buildUp);
      timer += dt;
      let changed = false;
      if (timer >= spreadInterval) {
        timer -= spreadInterval;
        const res = spreadFrontier(g, frontier, gas, SPREAD_P, rng);
        frontier = res.frontier;
        for (const i of res.newCells) {
          level[i] = 0.01;
          gasStartedAt[i] = elapsed;
        }
        if (res.newCells.length) {
          gasList.push(...res.newCells);
          changed = true;
        }
      }
      // This simplified model treats the leak as a lighter-than-air gas.
      for (const { lower, upper } of upwardLinks) {
        if (!gas[lower] || gas[upper] || elapsed - gasStartedAt[lower] < gasUpDelay) continue;
        gas[upper] = 1;
        level[upper] = 0.01;
        gasStartedAt[upper] = elapsed;
        gasList.push(upper);
        frontier.push(upper);
        changed = true;
      }
      return changed;
    },
    isBlocked: () => false,
    speedFactor: (i) => (gas[i] ? 0.85 : 1),
    pathCost: (i) => (gas[i] ? 8 : 0),
    isLethal: () => false,
    // Exits inside the gas zone are unsafe: people must reroute.
    goals: (g) => exitGoals(g, (i) => !gas[i]),
  };
}
