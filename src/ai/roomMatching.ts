import type { Room } from '../sim/types';

function normalizeRoomName(name: string) {
  return name.replace(/\s*\(\d+\)$/, '').trim().toLowerCase();
}

function roomBounds(g: { rooms: Int16Array; w: number; h: number }, roomId: number) {
  let x0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < g.rooms.length; i++) {
    if (g.rooms[i] !== roomId) continue;
    const x = i % g.w;
    const y = (i / g.w) | 0;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  if (x0 === Number.POSITIVE_INFINITY) return null;
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function geometryScore(
  existing: Room,
  generated: Room,
  currentFloorGrid: { rooms: Int16Array; w: number; h: number },
  nextFloorGrid: { rooms: Int16Array; w: number; h: number },
) {
  const prev = roomBounds(currentFloorGrid, existing.id);
  const next = roomBounds(nextFloorGrid, generated.id);
  if (!prev || !next) return null;
  const dx = Math.abs(prev.cx - next.cx);
  const dy = Math.abs(prev.cy - next.cy);
  const dw = Math.abs(prev.w - next.w);
  const dh = Math.abs(prev.h - next.h);
  if (dx > 2 || dy > 2 || dw > 3 || dh > 3) return null;
  return dx + dy + dw + dh;
}

function uniqueBestMatch(
  candidates: Room[],
  generated: Room,
  currentFloorGrid: { rooms: Int16Array; w: number; h: number },
  nextFloorGrid: { rooms: Int16Array; w: number; h: number },
) {
  const scored = candidates
    .map((room) => ({
      room,
      score: geometryScore(room, generated, currentFloorGrid, nextFloorGrid),
    }))
    .filter((entry): entry is { room: Room; score: number } => entry.score !== null)
    .sort((a, b) => a.score - b.score);
  if (!scored.length || (scored.length > 1 && scored[0].score === scored[1].score)) return undefined;
  return scored[0].room;
}

/** Reuse existing room settings only when each generated room has one unambiguous prior match. */
export function mergeAiRooms(
  existingOnFloor: Room[],
  generated: Room[],
  currentFloorGrid: { rooms: Int16Array; w: number; h: number },
  nextFloorGrid: { rooms: Int16Array; w: number; h: number },
  firstNewId = existingOnFloor.reduce((max, room) => Math.max(max, room.id), 0) + 1,
) {
  const existingByName = new Map<string, Room[]>();
  const generatedNameCounts = new Map<string, number>();
  for (const room of existingOnFloor) {
    const name = normalizeRoomName(room.name);
    existingByName.set(name, [...(existingByName.get(name) ?? []), room]);
  }
  for (const room of generated) {
    const name = normalizeRoomName(room.name);
    generatedNameCounts.set(name, (generatedNameCounts.get(name) ?? 0) + 1);
  }
  const next: Room[] = [];
  const remap = new Map<number, number>();
  let nextId = Math.max(firstNewId, existingOnFloor.reduce((max, room) => Math.max(max, room.id), 0) + 1);
  const usedIds = new Set<number>();

  for (const room of generated) {
    const normalizedName = normalizeRoomName(room.name);
    const available = existingOnFloor.filter((existing) => !usedIds.has(existing.id));
    const sameName = (existingByName.get(normalizedName) ?? []).filter((existing) => !usedIds.has(existing.id));
    const match =
      sameName.length === 1 && generatedNameCounts.get(normalizedName) === 1
        ? sameName[0]
        : uniqueBestMatch(sameName.length ? sameName : available, room, currentFloorGrid, nextFloorGrid);

    if (!match && nextId > 32767) throw new Error('Няма свободни идентификатори за нови стаи.');
    const finalRoom = match
      ? {
          ...room,
          id: match.id,
          name: match.name,
          color: match.color,
          children: match.children,
          adults: match.adults,
          reducedMobility: match.reducedMobility,
        }
      : { ...room, id: nextId++ };

    if (match) usedIds.add(match.id);
    next.push(finalRoom);
    remap.set(room.id, finalRoom.id);
  }

  return { rooms: next, remap };
}
