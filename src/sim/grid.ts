import { C, type GridData } from './types';
import { FLOOR_GAP, cellFloor, floorCount, floorName, floorOffset, floorView } from './floors';

/** An empty building of `floors` floors, each `floorH` rows tall. */
export function createGrid(w: number, floorH: number, floors = 1): GridData {
  const h = floors * floorH + (floors - 1) * FLOOR_GAP;
  return { w, h, cells: new Uint8Array(w * h), rooms: new Int16Array(w * h).fill(-1), stairDir: new Uint8Array(w * h), floors, floorH };
}

export function cloneGrid(g: GridData): GridData {
  return { w: g.w, h: g.h, cells: g.cells.slice(), rooms: g.rooms.slice(), stairDir: g.stairDir.slice(), floors: g.floors, floorH: g.floorH };
}

export const isWalkable = (c: number) =>
  c === C.FLOOR || c === C.EXIT || c === C.STAIRS || c === C.DOOR;

/** Nearest walkable cell to (cx, cy) in cell units, searching outward ring by ring. */
export function nearestWalkable(g: GridData, cx: number, cy: number): number {
  const cxi = Math.round(cx);
  const cyi = Math.round(cy);
  const maxR = Math.max(g.w, g.h);
  for (let r = 0; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cxi + dx;
        const y = cyi + dy;
        if (x < 0 || y < 0 || x >= g.w || y >= g.h) continue;
        const i = y * g.w + x;
        if (isWalkable(g.cells[i])) return i;
      }
    }
  }
  return Math.max(0, Math.min(g.w * g.h - 1, cyi * g.w + cxi));
}

/** Default hazard-origin cell: centre of all rooms (or grid centre), snapped to the nearest walkable cell. */
export function defaultOriginCell(building: GridData): number {
  // Multi-storey: start on the ground floor (it begins at index 0, so a floor-local index is also a building index).
  const g = floorCount(building) > 1 ? floorView(building, 0) : building;
  const centroids = roomCentroids(g);
  let x = g.w / 2;
  let y = g.h / 2;
  if (centroids.size) {
    x = 0;
    y = 0;
    for (const c of centroids.values()) { x += c.x; y += c.y; }
    x /= centroids.size;
    y /= centroids.size;
  }
  return nearestWalkable(g, x, y);
}

export function forEach4(g: GridData, i: number, fn: (j: number) => void) {
  const x = i % g.w;
  const y = (i / g.w) | 0;
  if (x > 0) fn(i - 1);
  if (x < g.w - 1) fn(i + 1);
  if (y > 0) fn(i - g.w);
  if (y < g.h - 1) fn(i + g.w);
}

/** Centroid (in cell units) and cell count of every room. */
export function roomCentroids(g: GridData) {
  const acc = new Map<number, { x: number; y: number; n: number }>();
  for (let i = 0; i < g.rooms.length; i++) {
    const r = g.rooms[i];
    if (r < 0) continue;
    let a = acc.get(r);
    if (!a) acc.set(r, (a = { x: 0, y: 0, n: 0 }));
    a.x += i % g.w;
    a.y += (i / g.w) | 0;
    a.n++;
  }
  for (const a of acc.values()) {
    a.x /= a.n;
    a.y /= a.n;
  }
  return acc;
}

export interface ExitInfo {
  id: number;
  name: string;
  /** Floor the exit is on. Above the ground floor it stands for an outside emergency stair. */
  floor: number;
  cells: number[];
  cx: number;
  cy: number;
}

/** Groups adjacent exit cells into exits ordered left to right. */
export function labelExits(g: GridData): { ids: Int16Array; exits: ExitInfo[] } {
  const n = g.w * g.h;
  const seen = new Uint8Array(n);
  const comps: number[][] = [];
  for (let i = 0; i < n; i++) {
    if (g.cells[i] !== C.EXIT || seen[i]) continue;
    const comp: number[] = [];
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const k = stack.pop()!;
      comp.push(k);
      const x = k % g.w;
      const y = (k / g.w) | 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue;
          const j = ny * g.w + nx;
          if (!seen[j] && g.cells[j] === C.EXIT) {
            seen[j] = 1;
            stack.push(j);
          }
        }
    }
    comps.push(comp);
  }
  const exits = comps
    .map((cells) => ({
      cells,
      cx: cells.reduce((s, c) => s + (c % g.w), 0) / cells.length,
      cy: cells.reduce((s, c) => s + ((c / g.w) | 0), 0) / cells.length,
    }))
    .sort((a, b) => a.cx - b.cx || a.cy - b.cy)
    .map((e, k) => ({ ...e, id: k, name: String.fromCharCode(65 + (k % 26)), floor: cellFloor(g, e.cells[0]) }));
  const ids = new Int16Array(n).fill(-1);
  for (const e of exits) for (const c of e.cells) ids[c] = e.id;
  return { ids, exits };
}

/** Stable for an unchanged exit, regardless of component ordering on other floors. */
export function exitKey(g: GridData, e: ExitInfo): string {
  const first = e.cells.reduce((min, cell) => Math.min(min, cell), Infinity);
  const offset = floorOffset(g, e.floor);
  return `${e.floor}:${first % g.w}:${Math.floor((first - offset) / g.w)}`;
}

/** Custom names replace the generated letter; upper-floor exits keep their emergency-stair note. */
export function exitLabel(e: ExitInfo, name = `Изход ${e.name}`): string {
  return e.floor > 0 ? `${name} (аварийна, ${floorName(e.floor)})` : name;
}
