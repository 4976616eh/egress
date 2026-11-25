import { C, type GridData, type Room } from './types';

/**
 * Multi-storey buildings live in ONE grid: floor k is a band of `floorH` rows, and bands are
 * separated by FLOOR_GAP empty rows so nothing on one floor is ever adjacent to another floor.
 * Floors are connected only through stairs that sit exactly above each other ("portals").
 * A grid without `floors` / `floorH` is a single floor.
 */
export const FLOOR_GAP = 2;
export const MAX_FLOORS = 8;

export const floorCount = (g: GridData) => g.floors ?? 1;
export const floorRows = (g: GridData) => g.floorH ?? g.h;
export const floorStride = (g: GridData) => floorRows(g) + FLOOR_GAP;
/** Index of the first cell of floor f in the combined grid. */
export const floorOffset = (g: GridData, f: number) => f * floorStride(g) * g.w;

/** Floor a (possibly fractional) row of the combined grid belongs to. */
export function rowFloor(g: GridData, y: number): number {
  const n = floorCount(g);
  if (n === 1) return 0;
  return Math.max(0, Math.min(n - 1, Math.floor((y + 0.5) / floorStride(g))));
}
export const cellFloor = (g: GridData, i: number) => rowFloor(g, (i / g.w) | 0);

export const floorName = (f: number) => (f === 0 ? 'Партер' : `Етаж ${f}`);

/** One floor as a grid of its own whose arrays share memory with the building - drawing on it edits the building. */
export function floorView(g: GridData, f: number): GridData {
  if (floorCount(g) === 1) return g;
  const rows = floorRows(g);
  const a = floorOffset(g, f);
  const b = a + g.w * rows;
  return { w: g.w, h: rows, floors: 1, floorH: rows, cells: g.cells.subarray(a, b), rooms: g.rooms.subarray(a, b), stairDir: g.stairDir.subarray(a, b) };
}

/** Which floor each room is on (by its first cell). */
export function roomFloors(g: GridData): Map<number, number> {
  const out = new Map<number, number>();
  for (let i = 0; i < g.rooms.length; i++) {
    const r = g.rooms[i];
    if (r >= 0 && !out.has(r)) out.set(r, cellFloor(g, i));
  }
  return out;
}

/** A copied room number keeps its look: 101 on the ground floor becomes 201 one floor up. */
function renameForFloor(name: string, f: number) {
  const baseName = name.replace(/\s+\((?:Партер|Етаж\s+\d+)\)$/i, '').trim();
  return /^\d{3,}$/.test(baseName) ? `${f + 1}${baseName.slice(1)}` : `${baseName} (${floorName(f)})`;
}

/**
 * Adds a floor on top. With `copyFrom`, the new floor starts as a copy of that floor (walls, rooms with their people,
 * stairs - so the stairwell lines up); exits are turned into wall because upper floors only get out through the stairs.
 */
export function appendFloor(g: GridData, rooms: Room[], copyFrom: number | null): { grid: GridData; rooms: Room[] } {
  const floors = floorCount(g);
  const rows = floorRows(g);
  const h = g.h + FLOOR_GAP + rows;
  const n = g.w * h;
  const grid: GridData = { w: g.w, h, cells: new Uint8Array(n), rooms: new Int16Array(n).fill(-1), stairDir: new Uint8Array(n), floors: floors + 1, floorH: rows };
  grid.cells.set(g.cells);
  grid.rooms.set(g.rooms);
  grid.stairDir.set(g.stairDir);
  const added: Room[] = [];
  if (copyFrom !== null) {
    const src = floorOffset(g, copyFrom);
    const dst = floorOffset(grid, floors);
    const ids = new Map<number, number>();
    let next = rooms.reduce((m, r) => Math.max(m, r.id), 0) + 1;
    for (let k = 0; k < g.w * rows; k++) {
      const c = g.cells[src + k];
      grid.cells[dst + k] = c === C.EXIT ? C.WALL : c;
      grid.stairDir[dst + k] = g.stairDir[src + k];
      const r = g.rooms[src + k];
      if (r < 0) continue;
      let id = ids.get(r);
      if (id === undefined) {
        id = next++;
        ids.set(r, id);
        const room = rooms.find((x) => x.id === r);
        if (room) added.push({ ...room, id, name: renameForFloor(room.name, floors) });
      }
      grid.rooms[dst + k] = id;
    }
  }
  return { grid, rooms: added };
}

/** Removes floor f (and its rooms); floors above move down. `remap` converts a cell index of the old grid to the new one (null if it was on f). */
export function removeFloor(g: GridData, rooms: Room[], f: number): { grid: GridData; rooms: Room[]; remap: (cell: number) => number | null } {
  const floors = floorCount(g);
  const rows = floorRows(g);
  const h = g.h - rows - FLOOR_GAP;
  const n = g.w * h;
  const grid: GridData = { w: g.w, h, cells: new Uint8Array(n), rooms: new Int16Array(n).fill(-1), stairDir: new Uint8Array(n), floors: floors - 1, floorH: rows };
  const gone = new Set<number>();
  const size = g.w * rows;
  let to = 0;
  for (let k = 0; k < floors; k++) {
    const a = floorOffset(g, k);
    if (k === f) {
      for (let i = 0; i < size; i++) if (g.rooms[a + i] >= 0) gone.add(g.rooms[a + i]);
      continue;
    }
    const b = floorOffset(grid, to++);
    grid.cells.set(g.cells.subarray(a, a + size), b);
    grid.rooms.set(g.rooms.subarray(a, a + size), b);
    grid.stairDir.set(g.stairDir.subarray(a, a + size), b);
  }
  const step = floorStride(g) * g.w;
  return {
    grid,
    rooms: rooms.filter((r) => !gone.has(r.id)),
    remap: (cell) => {
      const cf = cellFloor(g, cell);
      return cf === f ? null : cf > f ? cell - step : cell;
    },
  };
}

/** Number of separate stairwells on a floor (connected groups of stair cells). */
export function stairwellCount(g: GridData, f: number): number {
  const v = floorView(g, f);
  const seen = new Uint8Array(v.cells.length);
  let n = 0;
  for (let s = 0; s < v.cells.length; s++) {
    if (v.cells[s] !== C.STAIRS || seen[s]) continue;
    n++;
    const stack = [s];
    seen[s] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % v.w;
      for (const j of [x > 0 ? i - 1 : -1, x < v.w - 1 ? i + 1 : -1, i - v.w, i + v.w]) {
        if (j >= 0 && j < v.cells.length && !seen[j] && v.cells[j] === C.STAIRS) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
  }
  return n;
}

export interface Portals {
  /** Cell on the floor above (stairs exactly over these stairs), or -1. */
  up: Int32Array;
  down: Int32Array;
}

/** Stairs that sit exactly above each other are linked; null for a single floor. */
export function buildPortals(g: GridData): Portals | null {
  const floors = floorCount(g);
  if (floors < 2) return null;
  const up = new Int32Array(g.cells.length).fill(-1);
  const down = new Int32Array(g.cells.length).fill(-1);
  const step = floorStride(g) * g.w;
  const size = g.w * floorRows(g);
  for (let f = 0; f < floors - 1; f++)
    for (let k = 0; k < size; k++) {
      const i = f * step + k;
      if (g.cells[i] === C.STAIRS && g.cells[i + step] === C.STAIRS) {
        up[i] = i + step;
        down[i + step] = i;
      }
    }
  return { up, down };
}

/** Plain-language problems with the way floors are connected, for the editor. `floor` is the upper floor of the broken link. */
export function stairIssues(g: GridData): { floor: number; text: string }[] {
  const floors = floorCount(g);
  const out: { floor: number; text: string }[] = [];
  const step = floorStride(g) * g.w;
  const size = g.w * floorRows(g);
  for (let f = 0; f < floors - 1; f++) {
    let below = 0, above = 0, linked = 0;
    for (let k = 0; k < size; k++) {
      const lo = g.cells[f * step + k] === C.STAIRS;
      const hi = g.cells[(f + 1) * step + k] === C.STAIRS;
      if (lo) below++;
      if (hi) above++;
      if (lo && hi) linked++;
    }
    if (linked > 0 && linked === below && linked === above) continue;
    out.push({
      floor: f + 1,
      text:
        linked
          ? `Само част от стълбищата на ${floorName(f + 1)} съвпадат с тези на ${floorName(f)} (${linked} от ${Math.max(below, above)} клетки). Подравни ги, за да могат хората да преминават по всички стълби.`
          : below || above
            ? `Стълбите на ${floorName(f + 1)} не са точно над тези на ${floorName(f)} - нарисувай ги на едно и също място.`
          : `Няма стълби между ${floorName(f)} и ${floorName(f + 1)} - хората горе няма да могат да слязат.`,
    });
  }
  return out;
}

/** Floors above the ground floor that have EXIT cells. They count as outside emergency stairs: people use them directly. */
export interface FloorShiftBounds {
  minDx: number;
  maxDx: number;
  minDy: number;
  maxDy: number;
}

/** Returns translations that keep every non-empty cell on the selected floor inside the grid. */
export function floorShiftBounds(g: GridData, floor: number): FloorShiftBounds | null {
  if (!Number.isInteger(floor) || floor < 0 || floor >= floorCount(g)) return null;
  const view = floorView(g, floor);
  let minX = view.w;
  let maxX = -1;
  let minY = view.h;
  let maxY = -1;
  for (let i = 0; i < view.cells.length; i++) {
    if (view.cells[i] === C.VOID && view.rooms[i] < 0 && view.stairDir[i] === 0) continue;
    const x = i % view.w;
    const y = (i / view.w) | 0;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  if (maxX < 0) return { minDx: 0, maxDx: 0, minDy: 0, maxDy: 0 };
  return {
    minDx: minX === 0 ? 0 : -minX,
    maxDx: view.w - 1 - maxX,
    minDy: minY === 0 ? 0 : -minY,
    maxDy: view.h - 1 - maxY,
  };
}

/** Shifts the whole selected floor without discarding any cells. */
export function shiftFloor(g: GridData, rooms: Room[], floor: number, dx: number, dy: number): { grid: GridData; rooms: Room[] } {
  if (dx === 0 && dy === 0) return { grid: g, rooms };
  const bounds = floorShiftBounds(g, floor);
  if (
    !bounds ||
    !Number.isInteger(dx) ||
    !Number.isInteger(dy) ||
    dx < bounds.minDx ||
    dx > bounds.maxDx ||
    dy < bounds.minDy ||
    dy > bounds.maxDy
  ) return { grid: g, rooms };
  const rows = floorRows(g);
  const size = g.w * rows;
  const offset = floorOffset(g, floor);
  const next = {
    w: g.w,
    h: g.h,
    cells: g.cells.slice(),
    rooms: g.rooms.slice(),
    stairDir: g.stairDir.slice(),
    floors: g.floors,
    floorH: g.floorH,
  } satisfies GridData;

  for (let i = 0; i < size; i++) {
    next.cells[offset + i] = 0;
    next.rooms[offset + i] = -1;
    next.stairDir[offset + i] = 0;
  }

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < g.w; x++) {
      const src = offset + y * g.w + x;
      const nx = x + dx;
      const ny = y + dy;
      const dst = offset + ny * g.w + nx;
      next.cells[dst] = g.cells[src];
      next.rooms[dst] = g.rooms[src];
      next.stairDir[dst] = g.stairDir[src];
    }
  }

  return { grid: next, rooms: rooms.map((room) => ({ ...room })) };
}

export interface FloorAlignment {
  dx: number;
  dy: number;
  overlap: number;
  currentStairs: number;
  belowStairs: number;
}

/** Finds the whole-floor translation that maximizes the number of exactly aligned stair cells. */
export function floorAlignment(g: GridData, floor: number): FloorAlignment | null {
  if (floor <= 0 || floor >= floorCount(g)) return null;
  const below = floorView(g, floor - 1);
  const current = floorView(g, floor);

  const collect = (view: GridData) => {
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i < view.cells.length; i++) {
      if (view.cells[i] === C.STAIRS) points.push({ x: i % view.w, y: (i / view.w) | 0 });
    }
    return points;
  };

  const belowStairs = collect(below);
  const currentStairs = collect(current);
  const bounds = floorShiftBounds(g, floor);
  if (!belowStairs.length || !currentStairs.length || !bounds) return null;
  const belowSet = new Set(belowStairs.map(({ x, y }) => y * below.w + x));
  const candidates = new Set<string>();
  for (const lower of belowStairs) {
    for (const upper of currentStairs) {
      const dx = lower.x - upper.x;
      const dy = lower.y - upper.y;
      if (dx >= bounds.minDx && dx <= bounds.maxDx && dy >= bounds.minDy && dy <= bounds.maxDy) {
        candidates.add(`${dx},${dy}`);
      }
    }
  }

  let best: { dx: number; dy: number; overlap: number; distance: number } | null = null;
  for (const candidate of candidates) {
    const [dx, dy] = candidate.split(',').map(Number);
    const overlap = currentStairs.reduce(
      (count, p) => count + (belowSet.has((p.y + dy) * below.w + p.x + dx) ? 1 : 0),
      0,
    );
    const distance = Math.abs(dx) + Math.abs(dy);
    if (
      !best ||
      overlap > best.overlap ||
      (overlap === best.overlap && distance < best.distance) ||
      (overlap === best.overlap && distance === best.distance && (dy < best.dy || (dy === best.dy && dx < best.dx)))
    ) best = { dx, dy, overlap, distance };
  }
  if (!best || best.overlap === 0) return null;
  return {
    dx: best.dx,
    dy: best.dy,
    overlap: best.overlap,
    currentStairs: currentStairs.length,
    belowStairs: belowStairs.length,
  };
}

export function floorAlignmentDelta(g: GridData, floor: number): { dx: number; dy: number } | null {
  const alignment = floorAlignment(g, floor);
  return alignment ? { dx: alignment.dx, dy: alignment.dy } : null;
}

/** Aligns the selected floor to the lower floor while preserving every cell on both floors. */
export function alignFloorWithBelow(
  g: GridData,
  floor: number,
  rooms: Room[] = [],
): { grid: GridData; rooms: Room[]; dx: number; dy: number } | null {
  const delta = floorAlignmentDelta(g, floor);
  if (!delta) return null;
  const moved = shiftFloor(g, rooms, floor, delta.dx, delta.dy);
  if (moved.grid === g) return null;
  const { dx, dy } = delta;
  return { ...moved, dx, dy };
}

export function upperExitFloors(g: GridData): number[] {
  const out: number[] = [];
  for (let f = 1; f < floorCount(g); f++) if (floorView(g, f).cells.includes(C.EXIT)) out.push(f);
  return out;
}
