import { C, type GridData } from '../sim/types';
import type { Tool } from '../store/useProject';

export const TOOL_CELL: Record<Exclude<Tool, 'select' | 'room' | 'fill'>, number> = {
  corridor: C.FLOOR,
  wall: C.WALL,
  line: C.WALL,
  door: C.DOOR,
  exit: C.EXIT,
  stairs: C.STAIRS,
  erase: C.VOID,
};

export function paintCell(g: GridData, i: number, tool: Tool, roomId: number | null) {
  if (tool === 'select' || tool === 'fill') return;
  if (tool === 'room') {
    g.cells[i] = C.FLOOR;
    g.rooms[i] = roomId ?? -1;
    g.stairDir[i] = 0;
    return;
  }
  g.cells[i] = TOOL_CELL[tool];
  g.rooms[i] = -1;
  // Freehand stairs carry no drawn direction - the 3D view falls back to guessing one.
  g.stairDir[i] = 0;
}

/** Calls fn for every cell on the line between two cells (Bresenham). */
export function forLine(x0: number, y0: number, x1: number, y1: number, fn: (x: number, y: number) => void) {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    fn(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

export function fillRect(g: GridData, x0: number, y0: number, x1: number, y1: number, tool: Tool, roomId: number | null) {
  const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)];
  const [ay, by] = [Math.min(y0, y1), Math.max(y0, y1)];
  for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) paintCell(g, y * g.w + x, tool, roomId);
}

/** Stairs drawn as a rectangle: the drag direction is the direction of travel, start → wall end. */
export function paintStairsRect(g: GridData, x0: number, y0: number, x1: number, y1: number) {
  const dir = Math.abs(x1 - x0) >= Math.abs(y1 - y0) ? (x1 >= x0 ? 1 : 2) : y1 >= y0 ? 3 : 4;
  const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)];
  const [ay, by] = [Math.min(y0, y1), Math.max(y0, y1)];
  for (let y = ay; y <= by; y++)
    for (let x = ax; x <= bx; x++) {
      const i = y * g.w + x;
      g.cells[i] = C.STAIRS;
      g.rooms[i] = -1;
      g.stairDir[i] = dir;
    }
}

/** A cell the fill tool can claim into a room: empty space, or floor/corridor not yet in a room. */
export function isFillable(g: GridData, i: number): boolean {
  return g.cells[i] === C.VOID || (g.cells[i] === C.FLOOR && g.rooms[i] === -1);
}

/**
 * Finds the fillable region reachable 4-directionally from `start`. Returns null if the region
 * reaches the grid's border, meaning it isn't actually enclosed by walls/doors yet.
 */
export function floodRoomRegion(g: GridData, start: number): number[] | null {
  if (!isFillable(g, start)) return null;
  const stack = [start];
  const seen = new Set<number>([start]);
  const region: number[] = [];
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % g.w;
    const y = (i / g.w) | 0;
    if (x === 0 || x === g.w - 1 || y === 0 || y === g.h - 1) return null;
    region.push(i);
    for (const n of [i - 1, i + 1, i - g.w, i + g.w]) {
      if (seen.has(n) || !isFillable(g, n)) continue;
      seen.add(n);
      stack.push(n);
    }
  }
  return region;
}

/** Room rectangle: border becomes walls (keeping existing doors/exits), interior becomes the room. */
export function paintRoomRect(g: GridData, x0: number, y0: number, x1: number, y1: number, roomId: number) {
  const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)];
  const [ay, by] = [Math.min(y0, y1), Math.max(y0, y1)];
  for (let y = ay; y <= by; y++)
    for (let x = ax; x <= bx; x++) {
      const i = y * g.w + x;
      const border = x === ax || x === bx || y === ay || y === by;
      if (border) {
        if (g.cells[i] !== C.DOOR && g.cells[i] !== C.EXIT) {
          g.cells[i] = C.WALL;
          g.rooms[i] = -1;
          g.stairDir[i] = 0;
        }
      } else {
        g.cells[i] = C.FLOOR;
        g.rooms[i] = roomId;
        g.stairDir[i] = 0;
      }
    }
}
