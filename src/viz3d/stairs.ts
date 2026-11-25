import { C, type GridData } from '../sim/types';
import { isWalkable } from '../sim/grid';
import { floorCount, floorOffset, floorView } from '../sim/floors';
import { WALL_H } from './coords';

/**
 * Height (m) of every stair cell of ONE floor. A real flight climbs in one direction, with each full-width row a
 * single step - not a pyramid rising equally from every open side. Rise runs along the flight's long axis,
 * from the end open to a corridor up to the end against the wall.
 */
export function stairHeightMap(g: GridData): Map<number, number> {
  const stairs: number[] = [];
  for (let i = 0; i < g.cells.length; i++) if (g.cells[i] === C.STAIRS) stairs.push(i);
  const heights = new Map<number, number>();
  const stairSet = new Set(stairs);
  const neighbors4 = (i: number) => {
    const x = i % g.w, y = (i / g.w) | 0;
    const out: number[] = [];
    if (x > 0) out.push(i - 1);
    if (x < g.w - 1) out.push(i + 1);
    if (y > 0) out.push(i - g.w);
    if (y < g.h - 1) out.push(i + g.w);
    return out;
  };
  const visited = new Set<number>();
  for (const start of stairs) {
    if (visited.has(start)) continue;
    const comp: number[] = [];
    const stack = [start];
    visited.add(start);
    while (stack.length) {
      const c = stack.pop()!;
      comp.push(c);
      for (const n of neighbors4(c)) {
        if (stairSet.has(n) && !visited.has(n)) {
          visited.add(n);
          stack.push(n);
        }
      }
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const c of comp) {
      const x = c % g.w, y = (c / g.w) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    // A flight drawn with the stairs tool carries its own direction (1/2 = ±x, 3/4 = ±y);
    // trust that over any guess. Only freehand-painted stairs fall back to inferring one.
    const drawnDir = comp.reduce((d, c) => d || g.stairDir[c], 0);
    const axisIsX = drawnDir ? drawnDir === 1 || drawnDir === 2 : maxX - minX >= maxY - minY;
    const span = Math.max(1, axisIsX ? maxX - minX : maxY - minY);
    const posOf = (c: number) => (axisIsX ? (c % g.w) - minX : ((c / g.w) | 0) - minY);
    let ascendFromLow: boolean;
    if (drawnDir) {
      ascendFromLow = drawnDir === 1 || drawnDir === 3;
    } else {
      let lowOpen = 0, highOpen = 0;
      for (const c of comp) {
        if (!neighbors4(c).some((n) => !stairSet.has(n) && isWalkable(g.cells[n]))) continue;
        if (posOf(c) <= span * 0.3) lowOpen++;
        if (posOf(c) >= span * 0.7) highOpen++;
      }
      // Flipped from a plain "more open neighbours" read, which was unreliable in practice.
      ascendFromLow = highOpen > lowOpen;
    }
    for (const c of comp) {
      const t = ascendFromLow ? posOf(c) / span : 1 - posOf(c) / span;
      heights.set(c, 0.15 + t * (WALL_H - 0.15));
    }
  }
  return heights;
}

/** Stair height for every cell of the whole building (0 where there are no stairs). */
export function stairHeightField(building: GridData): Float32Array {
  const out = new Float32Array(building.cells.length);
  for (let f = 0; f < floorCount(building); f++) {
    const off = floorOffset(building, f);
    for (const [i, h] of stairHeightMap(floorView(building, f))) out[off + i] = h;
  }
  return out;
}
