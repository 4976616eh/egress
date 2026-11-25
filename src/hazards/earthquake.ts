import { C } from '../sim/types';
import { forEach4, isWalkable } from '../sim/grid';
import type { Hazard } from './types';
import type { Rng } from '../sim/rng';
import { exitGoals } from './common';

const DROP_COVER_HOLD = 10; // s
const AFTERSHOCK_INTERVAL = 12; // s between aftershocks at 1x
const MAX_AFTERSHOCKS = 12;

export function createEarthquake(speed = 1): Hazard {
  let level = new Float32Array(0); // debris = 1
  let aux = new Float32Array(0); // rubble around debris = 1
  let origin = 0;
  let rng: Rng = Math.random;
  let spots: number[] = [];
  let timer = 0;
  let aftershocks = 0;
  let drop: (c: number, size: number) => void = () => {};
  let mark: () => void = () => {};
  const interval = AFTERSHOCK_INTERVAL / speed;

  return {
    type: 'earthquake',
    preDelay: DROP_COVER_HOLD,
    get level() { return level; },
    get aux() { return aux; },
    get origin() { return origin; },
    init(g, o, r) {
      rng = r;
      timer = 0;
      aftershocks = 0;
      const n = g.w * g.h;
      level = new Float32Array(n);
      aux = new Float32Array(n);
      // Debris falls anywhere inside the building (rooms, corridors, doorways), so it can seal rooms and cut off exits.
      const open = (i: number) => g.cells[i] === C.FLOOR || g.cells[i] === C.DOOR;
      spots = [];
      for (let i = 0; i < n; i++) if (open(i)) spots.push(i);
      if (!spots.length) return;
      origin = o ?? spots[Math.floor(rng() * spots.length)];
      // Faster quakes drop more debris at once and keep shaking more often (see step).
      const clumps = Math.max(4, Math.round((spots.length / 250) * speed));
      drop = (c: number, size: number) => {
        let cells = [c];
        level[c] = 1;
        for (let s = 0; s < size; s++) {
          const next: number[] = [];
          for (const k of cells)
            forEach4(g, k, (j) => {
              if (open(j) && rng() < 0.45 && !level[j]) {
                level[j] = 1;
                next.push(j);
              }
            });
          cells = next;
        }
      };
      if (o !== null && isWalkable(g.cells[o])) drop(o, 3);
      for (let k = 0; k < clumps; k++) drop(spots[Math.floor(rng() * spots.length)], 1 + Math.floor(rng() * 2));
      mark = () => { for (let i = 0; i < n; i++) if (level[i]) forEach4(g, i, (j) => { if (!level[j]) aux[j] = 1; }); };
      mark();
    },
    step(_g, dt, t) {
      // Aftershocks: after the drop-cover-hold phase, new debris keeps falling at random places.
      if (!spots.length || t < DROP_COVER_HOLD || aftershocks >= MAX_AFTERSHOCKS) return false;
      timer += dt;
      if (timer < interval) return false;
      timer = 0;
      aftershocks++;
      drop(spots[Math.floor(rng() * spots.length)], Math.floor(rng() * 2));
      mark();
      return true;
    },
    isBlocked: (i) => level[i] > 0,
    speedFactor: (i) => (aux[i] > 0 ? 0.7 : 1),
    pathCost: (i) => aux[i],
    // Debris landing on someone leaves them trapped under it.
    isLethal: (i) => level[i] > 0,
    goals: (g) => exitGoals(g, (i) => !level[i]),
  };
}
