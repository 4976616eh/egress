import type { GridData } from './types';
import type { Portals } from './floors';

/** Walking-equivalent cost (in cells) of one flight of stairs between floors. */
export const PORTAL_COST = 10;

export interface Goal {
  cell: number;
  cost: number;
}

class MinHeap {
  private items: number[] = [];
  private pri: number[] = [];
  get size() {
    return this.items.length;
  }
  push(item: number, p: number) {
    const { items, pri } = this;
    let i = items.length;
    items.push(item);
    pri.push(p);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (pri[parent] <= p) break;
      items[i] = items[parent];
      pri[i] = pri[parent];
      i = parent;
    }
    items[i] = item;
    pri[i] = p;
  }
  /** Returns [item, priority]. */
  pop(): [number, number] {
    const { items, pri } = this;
    const top: [number, number] = [items[0], pri[0]];
    const lastI = items.pop()!;
    const lastP = pri.pop()!;
    const n = items.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        let mp = lastP;
        if (l < n && pri[l] < mp) {
          m = l;
          mp = pri[l];
        }
        if (r < n && pri[r] < mp) {
          m = r;
          mp = pri[r];
        }
        if (m === i) break;
        items[i] = items[m];
        pri[i] = pri[m];
        i = m;
      }
      items[i] = lastI;
      pri[i] = lastP;
    }
    return top;
  }
}

const DIRS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

/**
 * Dijkstra from all goals outward. Result: distance (in cells + extra cost) from each
 * cell to its nearest goal. Agents walk downhill on this field.
 */
export function computeFlowField(
  g: GridData,
  goals: Goal[],
  passable: (i: number) => boolean,
  extraCost: (i: number) => number,
  portals: Portals | null = null,
): Float64Array {
  const { w, h } = g;
  const dist = new Float64Array(w * h).fill(Infinity);
  const heap = new MinHeap();
  for (const { cell, cost } of goals) {
    if (passable(cell) && cost < dist[cell]) {
      dist[cell] = cost;
      heap.push(cell, cost);
    }
  }
  while (heap.size) {
    const [i, d] = heap.pop();
    if (d > dist[i]) continue;
    const x = i % w;
    const y = (i / w) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (!passable(j)) continue;
      const diag = dx !== 0 && dy !== 0;
      // No corner cutting through walls.
      if (diag && (!passable(y * w + nx) || !passable(ny * w + x))) continue;
      const nd = d + (diag ? Math.SQRT2 : 1) + extraCost(j);
      if (nd < dist[j]) {
        dist[j] = nd;
        heap.push(j, nd);
      }
    }
    if (portals) {
      const u = portals.up[i];
      const dn = portals.down[i];
      if (u >= 0 && passable(u) && d + PORTAL_COST + extraCost(u) < dist[u]) {
        dist[u] = d + PORTAL_COST + extraCost(u);
        heap.push(u, dist[u]);
      }
      if (dn >= 0 && passable(dn) && d + PORTAL_COST + extraCost(dn) < dist[dn]) {
        dist[dn] = d + PORTAL_COST + extraCost(dn);
        heap.push(dn, dist[dn]);
      }
    }
  }
  return dist;
}
