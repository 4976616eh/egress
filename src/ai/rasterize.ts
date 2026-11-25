import { C, CELL_SIZE, type GridData, type Room } from '../sim/types';
import { createGrid, forEach4, isWalkable } from '../sim/grid';
import { ROOM_COLORS } from '../components/labels';
import { paintRoomRect } from '../editor/tools';
import { SPEC_SCALE, type Box, type PlanSpec, type StairsClimb } from './planSpec';

export interface GeneratedPlan {
  grid: GridData;
  rooms: Room[];
  warnings: string[];
  stats: { rooms: number; doors: number; exits: number; stairs: number; autoDoors: number };
}

/** Thickest wall (in cells) a door may cut through - absorbs the AI's imprecision about where walls are. */
const MAX_WALL = 3;
const DOOR_WIDTH = 2;
const SNAP_DOOR = 6;
const SNAP_EXIT = 7;
const DIRS4: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const STAIR_DIR: Record<StairsClimb, number> = { right: 1, left: 2, down: 3, up: 4 };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function cellRange(a: number, b: number, n: number): [number, number] {
  const lo = clamp(Math.floor((a / SPEC_SCALE) * n), 0, n - 1);
  const hi = clamp(Math.ceil((b / SPEC_SCALE) * n) - 1, lo, n - 1);
  return [lo, hi];
}

function boxCells(b: Box, w: number, h: number) {
  const [x0, x1] = cellRange(b.x0, b.x1, w);
  const [y0, y1] = cellRange(b.y0, b.y1, h);
  return { x0, y0, x1, y1 };
}

const inGrid = (g: GridData, x: number, y: number) => x >= 0 && y >= 0 && x < g.w && y < g.h;

// ---------------------------------------------------------------- doors

interface Passage {
  /** Wall cells that become door cells. */
  cells: number[];
  /** Walkable cells on either side. */
  a: number;
  b: number;
}

/** A wall cell through which one can walk in a straight line (along `axis`) from one walkable area into a different one. */
function passageAt(g: GridData, x: number, y: number, axis: 'x' | 'y'): Passage | null {
  const i = y * g.w + x;
  if (g.cells[i] !== C.WALL) return null;
  const dx = axis === 'x' ? 1 : 0;
  const dy = axis === 'x' ? 0 : 1;
  const walk = (sx: number, sy: number, first: number[]) => {
    const cells = first;
    let cx = x + sx;
    let cy = y + sy;
    while (cells.length <= MAX_WALL) {
      if (!inGrid(g, cx, cy)) return null;
      const j = cy * g.w + cx;
      if (isWalkable(g.cells[j])) return { cells, end: j };
      if (g.cells[j] !== C.WALL) return null;
      cells.push(j);
      cx += sx;
      cy += sy;
    }
    return null;
  };
  const pos = walk(dx, dy, [i]);
  const neg = walk(-dx, -dy, []);
  if (!pos || !neg || pos.cells.length + neg.cells.length > MAX_WALL) return null;
  if (g.rooms[pos.end] === g.rooms[neg.end]) return null; // same room, or two corridor cells: not a door
  return { cells: [...neg.cells, ...pos.cells], a: neg.end, b: pos.end };
}

function bestPassage(g: GridData, cx: number, cy: number, radius: number, accept: (p: Passage) => boolean = () => true) {
  let best: { x: number; y: number; axis: 'x' | 'y'; p: Passage; score: number } | null = null;
  for (let y = Math.max(0, cy - radius); y <= Math.min(g.h - 1, cy + radius); y++)
    for (let x = Math.max(0, cx - radius); x <= Math.min(g.w - 1, cx + radius); x++) {
      for (const axis of ['x', 'y'] as const) {
        const p = passageAt(g, x, y, axis);
        if (!p || !accept(p)) continue;
        const score = Math.hypot(x - cx, y - cy) + 0.6 * p.cells.length;
        if (!best || score < best.score) best = { x, y, axis, p, score };
      }
    }
  return best;
}

/** Opens the passage and widens it to DOOR_WIDTH cells along the wall. */
function openDoor(g: GridData, spot: { x: number; y: number; axis: 'x' | 'y'; p: Passage }) {
  for (const c of spot.p.cells) g.cells[c] = C.DOOR;
  const [px, py] = spot.axis === 'x' ? [0, 1] : [1, 0];
  let opened = 1;
  for (const s of [1, -1]) {
    if (opened >= DOOR_WIDTH) break;
    const nx = spot.x + s * px;
    const ny = spot.y + s * py;
    if (!inGrid(g, nx, ny)) continue;
    const extra = passageAt(g, nx, ny, spot.axis);
    if (extra) {
      for (const c of extra.cells) g.cells[c] = C.DOOR;
      opened++;
    }
  }
}

// ---------------------------------------------------------------- exits

/** A wall cell with walkable floor behind it and open outside ahead, for direction (dx, dy). */
function isExitWall(g: GridData, x: number, y: number, dx: number, dy: number) {
  if (!inGrid(g, x, y) || g.cells[y * g.w + x] !== C.WALL) return false;
  const bx = x - dx;
  const by = y - dy;
  if (!inGrid(g, bx, by) || !isWalkable(g.cells[by * g.w + bx])) return false;
  const ax = x + dx;
  const ay = y + dy;
  return !inGrid(g, ax, ay) || g.cells[ay * g.w + ax] === C.VOID;
}

function placeExit(g: GridData, cx: number, cy: number, widthCells: number): boolean {
  let best: { x: number; y: number; d: [number, number]; score: number } | null = null;
  for (let y = Math.max(0, cy - SNAP_EXIT); y <= Math.min(g.h - 1, cy + SNAP_EXIT); y++)
    for (let x = Math.max(0, cx - SNAP_EXIT); x <= Math.min(g.w - 1, cx + SNAP_EXIT); x++)
      for (const d of DIRS4) {
        if (!isExitWall(g, x, y, d[0], d[1])) continue;
        const score = Math.hypot(x - cx, y - cy);
        if (!best || score < best.score) best = { x, y, d, score };
      }
  if (!best) return false;
  const [dx, dy] = best.d;
  const [px, py] = [dy, dx]; // perpendicular, sign irrelevant
  // Exactly the requested width (at least one door = 2 cells = 1 m). Never wider than drawn:
  // the exits are the bottleneck, so a wider exit would make every evacuation look faster.
  const n = clamp(Math.round(widthCells), 2, 10);
  const start = -Math.floor((n - 1) / 2);
  for (let t = start; t < start + n; t++) {
    const x = best.x + t * px;
    const y = best.y + t * py;
    if (isExitWall(g, x, y, dx, dy)) g.cells[y * g.w + x] = C.EXIT;
  }
  return true;
}

// ---------------------------------------------------------------- reachability

/** Cells that can walk to a goal cell (exits on the ground floor; on upper floors the stairs down). */
function reachableFrom(g: GridData, goal: number): Uint8Array {
  const seen = new Uint8Array(g.w * g.h);
  const queue: number[] = [];
  for (let i = 0; i < g.cells.length; i++) if (g.cells[i] === goal) { seen[i] = 1; queue.push(i); }
  for (let h = 0; h < queue.length; h++)
    forEach4(g, queue[h], (j) => {
      if (!seen[j] && isWalkable(g.cells[j])) { seen[j] = 1; queue.push(j); }
    });
  return seen;
}

function roomReached(g: GridData, id: number, seen: Uint8Array) {
  for (let i = 0; i < g.rooms.length; i++) if (g.rooms[i] === id && seen[i]) return true;
  return false;
}

/** Last resort for a room the AI left without a usable door: cut one through the wall nearest its centre toward the reachable part. */
function connectRoom(g: GridData, id: number, seen: Uint8Array): boolean {
  let sx = 0, sy = 0, n = 0;
  let x0 = g.w, y0 = g.h, x1 = 0, y1 = 0;
  for (let i = 0; i < g.rooms.length; i++) {
    if (g.rooms[i] !== id) continue;
    const x = i % g.w, y = (i / g.w) | 0;
    sx += x; sy += y; n++;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  if (!n) return false;
  const mx = Math.round(sx / n), my = Math.round(sy / n);
  const radius = Math.max(x1 - x0, y1 - y0) / 2 + MAX_WALL + 1;
  const spot = bestPassage(g, mx, my, Math.ceil(radius), (p) =>
    (g.rooms[p.a] === id && !!seen[p.b] && g.rooms[p.b] === -1) || (g.rooms[p.b] === id && !!seen[p.a] && g.rooms[p.a] === -1));
  if (!spot) return false;
  openDoor(g, spot);
  return true;
}

// ---------------------------------------------------------------- main

export interface BuildOptions {
  /** Place the exits the AI found. False for upper floors: people there get out through the stairs, not through the outer wall. */
  exits?: boolean;
}

/** Rasterises the AI's description onto a grid of w × h cells (one floor of the editor grid, so the plan image still lines up). */
export function buildGridFromSpec(spec: PlanSpec, w: number, h: number, opts: BuildOptions = {}): GeneratedPlan {
  const withExits = opts.exits ?? true;
  const g = createGrid(w, h);
  const warnings: string[] = [];

  // 1. Corridors, lobbies and halls: plain walkable floor.
  for (const c of spec.corridors) {
    const b = boxCells(c, w, h);
    for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) { g.cells[y * w + x] = C.FLOOR; g.rooms[y * w + x] = -1; }
  }

  // 2. Rooms: wall border, room interior.
  const rooms: Room[] = [];
  const names = new Set<string>();
  let tooSmall = 0;
  for (const r of spec.rooms) {
    const b = boxCells(r, w, h);
    if (b.x1 - b.x0 < 2 || b.y1 - b.y0 < 2) { tooSmall++; continue; }
    const id = rooms.length + 1;
    let name = r.name || `Стая ${id}`;
    for (let k = 2; names.has(name); k++) name = `${r.name || `Стая ${id}`} (${k})`;
    names.add(name);
    // Plan recognition identifies geometry, not current occupancy. The user sets the counts afterward.
    rooms.push({ id, name, color: ROOM_COLORS[(id - 1) % ROOM_COLORS.length], children: 0, adults: 0, reducedMobility: 0 });
    paintRoomRect(g, b.x0, b.y0, b.x1, b.y1, id);
  }
  if (tooSmall) warnings.push(`Пропуснах ${tooSmall} твърде малки помещения.`);

  // 3. Stairs, with the climbing direction the plan shows.
  for (const s of spec.stairs) {
    const b = boxCells(s, w, h);
    for (let y = b.y0; y <= b.y1; y++)
      for (let x = b.x0; x <= b.x1; x++) {
        const i = y * w + x;
        g.cells[i] = C.STAIRS;
        g.rooms[i] = -1;
        g.stairDir[i] = STAIR_DIR[s.climbs];
      }
  }

  // 4. Outer walls: every empty cell touching walkable space becomes a wall (8-neighbourhood, so nothing leaks diagonally).
  const toWall: number[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (g.cells[y * w + x] !== C.VOID) continue;
      let touches = false;
      for (let dy = -1; dy <= 1 && !touches; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (inGrid(g, x + dx, y + dy) && isWalkable(g.cells[(y + dy) * w + x + dx])) { touches = true; break; }
        }
      if (touches) toWall.push(y * w + x);
    }
  for (const i of toWall) g.cells[i] = C.WALL;

  // 5. Doors, snapped to the nearest wall that really separates two areas.
  let doors = 0;
  let lostDoors = 0;
  for (const d of spec.doors) {
    const cx = clamp(Math.floor((d.x / SPEC_SCALE) * w), 0, w - 1);
    const cy = clamp(Math.floor((d.y / SPEC_SCALE) * h), 0, h - 1);
    const spot = bestPassage(g, cx, cy, SNAP_DOOR);
    if (spot) { openDoor(g, spot); doors++; } else lostDoors++;
  }
  if (lostDoors) warnings.push(`${lostDoors} врати не успях да поставя на стена - провери ги в 2D.`);

  // 6. Exits on the outer wall (ground floor only).
  let exits = 0;
  let lostExits = 0;
  for (const e of withExits ? spec.exits : []) {
    const cx = clamp(Math.floor((e.x / SPEC_SCALE) * w), 0, w - 1);
    const cy = clamp(Math.floor((e.y / SPEC_SCALE) * h), 0, h - 1);
    if (placeExit(g, cx, cy, e.widthM / CELL_SIZE)) exits++; else lostExits++;
  }
  if (lostExits) warnings.push(`${lostExits} изхода не успях да поставя на външна стена - добави ги с инструмента „Изход“.`);
  if (withExits && exits === 0) warnings.push('Не разпознах нито един изход - добави поне един с инструмента „Изход“.');

  // 7. Every room must be able to reach the way out (an exit, or on upper floors the stairs); if the AI missed a door, add one and say so.
  const goal = withExits ? C.EXIT : C.STAIRS;
  let autoDoors = 0;
  if (!withExits && !g.cells.includes(C.STAIRS)) warnings.push('Не разпознах стълби на този етаж - хората няма да могат да слязат. Нарисувай ги точно над стълбите на етажа под.');
  if (g.cells.includes(goal)) {
    for (let pass = 0; pass < 4; pass++) {
      const seen = reachableFrom(g, goal);
      const stuck = rooms.filter((r) => !roomReached(g, r.id, seen));
      if (!stuck.length) break;
      let progress = false;
      for (const r of stuck) if (connectRoom(g, r.id, seen)) { autoDoors++; progress = true; }
      if (!progress) break;
    }
    const seen = reachableFrom(g, goal);
    const stuck = rooms.filter((r) => !roomReached(g, r.id, seen));
    if (autoDoors) warnings.push(`Добавих врата сама на ${autoDoors} стаи, в които не бяха разпознати - провери ги.`);
    if (stuck.length) warnings.push(`Без път до ${withExits ? 'изход' : 'стълбите'} остават: ${stuck.map((r) => r.name).join(', ')}. Дорисувай врата или коридор.`);
  }

  return { grid: g, rooms, warnings, stats: { rooms: rooms.length, doors: doors + autoDoors, exits, stairs: spec.stairs.length, autoDoors } };
}
