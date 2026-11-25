/**
 * What the AI returns for an uploaded plan. All coordinates are integers on a 0..1000 scale
 * relative to the image as shown: x 0 = left edge, 1000 = right edge; y 0 = top edge, 1000 = bottom edge.
 */
export type RoomKind = 'classroom' | 'office' | 'service' | 'other';
export type StairsClimb = 'up' | 'down' | 'left' | 'right';

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface PlanSpec {
  rooms: (Box & { name: string; kind: RoomKind })[];
  corridors: Box[];
  stairs: (Box & { climbs: StairsClimb })[];
  doors: { x: number; y: number }[];
  exits: { x: number; y: number; widthM: number }[];
  notes: string;
}

export const SPEC_SCALE = 1000;

const KINDS: RoomKind[] = ['classroom', 'office', 'service', 'other'];
const CLIMBS: StairsClimb[] = ['up', 'down', 'left', 'right'];
const LIMITS = { rooms: 150, corridors: 60, stairs: 20, doors: 300, exits: 30 };

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const coord = (v: unknown): number | null => {
  const n = num(v);
  return n === null ? null : Math.max(0, Math.min(SPEC_SCALE, Math.round(n)));
};
const arr = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : [];

function toBox(o: Record<string, unknown>): Box | null {
  const a = coord(o.x0), b = coord(o.y0), c = coord(o.x1), d = coord(o.y1);
  if (a === null || b === null || c === null || d === null) return null;
  const box = { x0: Math.min(a, c), y0: Math.min(b, d), x1: Math.max(a, c), y1: Math.max(b, d) };
  // Ignore specks - anything under 0.5% of the image on a side is noise.
  return box.x1 - box.x0 < 5 || box.y1 - box.y0 < 5 ? null : box;
}

/** Turns the untrusted tool output into a safe PlanSpec; throws a user-readable error if there is nothing usable. */
export function sanitizeSpec(raw: unknown): PlanSpec {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  const rooms: PlanSpec['rooms'] = [];
  for (const o of arr(r.rooms).slice(0, LIMITS.rooms)) {
    const box = toBox(o);
    if (!box) continue;
    const name = typeof o.name === 'string' ? o.name.trim().slice(0, 40) : '';
    const kind = KINDS.includes(o.kind as RoomKind) ? (o.kind as RoomKind) : 'other';
    rooms.push({ ...box, name, kind });
  }

  const corridors = arr(r.corridors).slice(0, LIMITS.corridors).map(toBox).filter((b): b is Box => !!b);

  const stairs: PlanSpec['stairs'] = [];
  for (const o of arr(r.stairs).slice(0, LIMITS.stairs)) {
    const box = toBox(o);
    if (box) stairs.push({ ...box, climbs: CLIMBS.includes(o.climbs as StairsClimb) ? (o.climbs as StairsClimb) : 'up' });
  }

  const doors: PlanSpec['doors'] = [];
  for (const o of arr(r.doors).slice(0, LIMITS.doors)) {
    const x = coord(o.x), y = coord(o.y);
    if (x !== null && y !== null) doors.push({ x, y });
  }

  const exits: PlanSpec['exits'] = [];
  for (const o of arr(r.exits).slice(0, LIMITS.exits)) {
    const x = coord(o.x), y = coord(o.y);
    if (x === null || y === null) continue;
    const w = num(o.width_m);
    exits.push({ x, y, widthM: w === null ? 2 : Math.max(1, Math.min(8, w)) });
  }

  if (rooms.length + corridors.length === 0) throw new Error('AI не откри стаи или коридори в това изображение. Опитай с по-ясен план или го начертай ръчно.');

  return { rooms, corridors, stairs, doors, exits, notes: typeof r.notes === 'string' ? r.notes.trim().slice(0, 400) : '' };
}
