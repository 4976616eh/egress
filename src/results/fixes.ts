import { C, type GridData } from '../sim/types';
import { isWalkable, nearestWalkable, roomCentroids } from '../sim/grid';

/** A concrete plan edit a recommendation can apply: set these cells to this type. */
export interface Fix {
  label: string;
  cells: number[];
  type: number;
}

const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** New exits keep at least this many cells away from existing ones, otherwise they would just widen an exit that is already busy. */
const MIN_EXIT_GAP = 6;
const NEW_EXIT_WIDTH = 4;

const inside = (g: GridData, x: number, y: number) => x >= 0 && y >= 0 && x < g.w && y < g.h;
/** Outside the grid or unpainted - somewhere a person would end up after leaving the building. */
const isOutside = (g: GridData, x: number, y: number) => !inside(g, x, y) || g.cells[y * g.w + x] === C.VOID;

/** Walkable cell closest to the middle of a room, or -1 if the room has no cells. */
export function roomAnchor(g: GridData, roomId: number): number {
  const c = roomCentroids(g).get(roomId);
  return c ? nearestWalkable(g, c.x, c.y) : -1;
}

/** Marks every cell within `margin` cells of a marked cell, so exits are not planned next to where the hazard was. */
export function dangerMask(g: GridData, seeds: Iterable<number>, margin: number): Uint8Array {
  const mask = new Uint8Array(g.w * g.h);
  for (const i of seeds) {
    const sx = i % g.w;
    const sy = (i / g.w) | 0;
    for (let y = Math.max(0, sy - margin); y <= Math.min(g.h - 1, sy + margin); y++)
      for (let x = Math.max(0, sx - margin); x <= Math.min(g.w - 1, sx + margin); x++) mask[y * g.w + x] = 1;
  }
  return mask;
}

/** Plans a new exit in the outer wall, as close (by walking distance) to `from` as possible, avoiding `avoid` cells. */
export function planNewExit(g: GridData, from: number, label: string, avoid?: Uint8Array): Fix | null {
  if (from < 0) return null;
  const { w, h, cells } = g;

  const nearExit = new Uint8Array(w * h);
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] !== C.EXIT) continue;
    const ex = i % w;
    const ey = (i / w) | 0;
    for (let y = Math.max(0, ey - MIN_EXIT_GAP); y <= Math.min(h - 1, ey + MIN_EXIT_GAP); y++)
      for (let x = Math.max(0, ex - MIN_EXIT_GAP); x <= Math.min(w - 1, ex + MIN_EXIT_GAP); x++) nearExit[y * w + x] = 1;
  }

  // Walking distance from the room, so the new exit is reachable and genuinely close.
  const dist = new Int32Array(w * h).fill(-1);
  const queue = [from];
  dist[from] = 0;
  let best: { wall: number; dx: number; dy: number; d: number } | null = null;
  for (let qi = 0; qi < queue.length; qi++) {
    const c = queue[qi];
    const x = c % w;
    const y = (c / w) | 0;
    for (const [dx, dy] of DIRS4) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inside(g, nx, ny)) continue;
      const n = ny * w + nx;
      if (cells[n] === C.WALL && isOutside(g, nx + dx, ny + dy) && !nearExit[n] && !avoid?.[n] && (!best || dist[c] + 1 < best.d)) {
        best = { wall: n, dx, dy, d: dist[c] + 1 };
      } else if (dist[n] < 0 && isWalkable(cells[n])) {
        dist[n] = dist[c] + 1;
        queue.push(n);
      }
    }
  }
  if (!best) return null;

  // Grow the exit along the wall, only through straight wall with open floor behind it.
  const px = best.dy !== 0 ? 1 : 0;
  const py = best.dx !== 0 ? 1 : 0;
  const okAt = (x: number, y: number) =>
    inside(g, x, y) &&
    cells[y * w + x] === C.WALL &&
    isOutside(g, x + best!.dx, y + best!.dy) &&
    inside(g, x - best!.dx, y - best!.dy) &&
    isWalkable(cells[(y - best!.dy) * w + (x - best!.dx)]) &&
    !nearExit[y * w + x] &&
    !avoid?.[y * w + x];
  const bx = best.wall % w;
  const by = (best.wall / w) | 0;
  const out = [best.wall];
  let up = true;
  let down = true;
  for (let k = 1; out.length < NEW_EXIT_WIDTH && (up || down); k++) {
    if (up && okAt(bx + px * k, by + py * k)) out.push((by + py * k) * w + bx + px * k);
    else up = false;
    if (out.length < NEW_EXIT_WIDTH && down && okAt(bx - px * k, by - py * k)) out.push((by - py * k) * w + bx - px * k);
    else down = false;
  }
  return out.length >= 2 ? { label, cells: out, type: C.EXIT } : null;
}

/** Plans a wider opening at the door or exit closest to a congestion hotspot. */
export function planWiden(g: GridData, hotspot: number, label: string, avoid?: Uint8Array, radius = 8): Fix | null {
  const { w, cells } = g;
  const hx = hotspot % w;
  const hy = (hotspot / w) | 0;
  let door = -1;
  let bestD = radius + 1;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] !== C.DOOR && cells[i] !== C.EXIT) continue;
    const d = Math.hypot((i % w) - hx, ((i / w) | 0) - hy);
    if (d < bestD) {
      bestD = d;
      door = i;
    }
  }
  if (door < 0) return null;
  const type = cells[door];
  const x = door % w;
  const y = (door / w) | 0;
  const open = (cx: number, cy: number) => inside(g, cx, cy) && isWalkable(cells[cy * w + cx]);
  // The opening sits in a straight wall: its neighbours along the wall are wall or more of the same opening.
  const inWall = (cx: number, cy: number) => inside(g, cx, cy) && (cells[cy * w + cx] === C.WALL || cells[cy * w + cx] === type);
  const [ax, ay] = inWall(x - 1, y) && inWall(x + 1, y) ? [1, 0] : inWall(x, y - 1) && inWall(x, y + 1) ? [0, 1] : [0, 0];
  if (!ax && !ay) return null;
  const sides = ax ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]];
  const out: number[] = [];
  for (const sign of [1, -1]) {
    // Walk to the end of the existing opening, then take up to two wall cells beyond it.
    let cx = x;
    let cy = y;
    while (inside(g, cx + ax * sign, cy + ay * sign) && cells[(cy + ay * sign) * w + cx + ax * sign] === type) {
      cx += ax * sign;
      cy += ay * sign;
    }
    for (let k = 1; k <= 2; k++) {
      const nx = cx + ax * sign * k;
      const ny = cy + ay * sign * k;
      if (!inside(g, nx, ny) || cells[ny * w + nx] !== C.WALL || avoid?.[ny * w + nx]) break;
      const open1 = open(nx + sides[0][0], ny + sides[0][1]);
      const open2 = open(nx + sides[1][0], ny + sides[1][1]);
      // Doors need floor on both sides; an outer exit needs it on at least one.
      if (type === C.EXIT ? !(open1 || open2) : !(open1 && open2)) break;
      out.push(ny * w + nx);
    }
  }
  return out.length ? { label, cells: out, type } : null;
}
