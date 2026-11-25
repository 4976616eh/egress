import { CELL_SIZE, type GridData } from '../sim/types';
import { floorCount, floorRows, floorStride, rowFloor } from '../sim/floors';

export const CS = CELL_SIZE;
export const WALL_H = 3;
export const LOW_WALL_H = 1;

/** Height of floor `f` above the ground; `explode` adds metres of space between floors. */
export const floorY = (f: number, explode = 0) => f * (WALL_H + explode);

/**
 * How a multi-floor building is arranged in 3D:
 *  - 'spread': every floor lies on the ground, side by side (nothing floats, everything is visible);
 *  - 'stack':  floors are piled on top of each other like in a real building.
 */
export type Layout = 'spread' | 'stack';
/** Free ground between two floors in the spread layout, metres. */
export const SPREAD_GAP = 6;
/** Distance between the centres of two neighbouring floors in the spread layout. */
export const floorPitch = (g: GridData) => g.w * CS + SPREAD_GAP;

/**
 * World offset [x, y] of floor f. `f` may be fractional (someone is on the stairs): stacked floors
 * interpolate the height, side-by-side floors snap to the nearer one.
 */
export function floorShift(g: GridData, f: number, explode: number, layout: Layout): [number, number] {
  const n = floorCount(g);
  if (layout === 'stack' || n === 1) return [0, floorY(f, explode)];
  return [(Math.round(f) - (n - 1) / 2) * floorPitch(g), 0];
}

/** Widest horizontal extent of everything drawn - what the camera and the light have to cover. */
export function viewSpan(g: GridData, layout: Layout): number {
  const n = floorCount(g);
  return layout === 'spread' && n > 1 ? n * floorPitch(g) : Math.max(g.w, floorRows(g)) * CS;
}

/**
 * Cell coordinates (may be fractional) → world X/Z in meters. Every floor is centred on the origin;
 * its height comes from floorY. Works on a whole building and on a single floor alike.
 */
export function toWorld(g: GridData, cx: number, cy: number): [number, number] {
  const ly = cy - rowFloor(g, cy) * floorStride(g);
  return [(cx + 0.5) * CS - (g.w * CS) / 2, (ly + 0.5) * CS - (floorRows(g) * CS) / 2];
}

export function cellWorld(g: GridData, i: number): [number, number] {
  return toWorld(g, i % g.w, (i / g.w) | 0);
}

/** Cell of a single floor (pass a floorView) under a world position, or null outside it. */
export function worldToCell(g: GridData, x: number, z: number): number | null {
  const cx = Math.floor((x + (g.w * CS) / 2) / CS);
  const cy = Math.floor((z + (g.h * CS) / 2) / CS);
  if (cx < 0 || cy < 0 || cx >= g.w || cy >= g.h) return null;
  return cy * g.w + cx;
}
