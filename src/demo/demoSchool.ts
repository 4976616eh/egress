import { C, type GridData, type Room, type Scenario } from '../sim/types';
import { createGrid } from '../sim/grid';
import { ROOM_COLORS } from '../components/labels';

/**
 * Demo school, 50 × 22 m: a long corridor with 12 classrooms (320 children),
 * main staircase at the top centre, main entrance at the bottom centre and one
 * side exit on the left. The right wing has no exit of its own - that is the
 * weakness the simulation should reveal.
 */
export function buildDemoSchool(): { grid: GridData; rooms: Room[]; scenario: Scenario } {
  const W = 100;
  const H = 44;
  const g = createGrid(W, H);
  const set = (x: number, y: number, c: number, r = -1) => {
    const i = y * W + x;
    g.cells[i] = c;
    g.rooms[i] = r;
  };
  const fill = (x0: number, y0: number, x1: number, y1: number, c: number, r = -1) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c, r);
  };

  fill(0, 0, W - 1, H - 1, C.FLOOR);
  for (let x = 0; x < W; x++) {
    set(x, 0, C.WALL);
    set(x, H - 1, C.WALL);
    set(x, 18, C.WALL);
    set(x, 25, C.WALL);
  }
  for (let y = 0; y < H; y++) {
    set(0, y, C.WALL);
    set(W - 1, y, C.WALL);
  }
  for (const wx of [14, 28, 42, 57, 71, 85]) {
    for (let y = 1; y <= 17; y++) set(wx, y, C.WALL);
    for (let y = 26; y <= 42; y++) set(wx, y, C.WALL);
  }

  const cols: [number, number][] = [[1, 13], [15, 27], [29, 41], [58, 70], [72, 84], [86, 98]];
  const rooms: Room[] = [];
  let id = 1;
  const addRoom = (x0: number, x1: number, y0: number, y1: number, doorY: number, doorX: number, k: number) => {
    rooms.push({
      id,
      name: String(100 + id),
      children: k % 3 === 0 ? 26 : 27,
      adults: 1,
      reducedMobility: id === 2 || id === 11 ? 1 : 0,
      color: ROOM_COLORS[(id - 1) % ROOM_COLORS.length],
    });
    fill(x0, y0, x1, y1, C.FLOOR, id);
    set(doorX, doorY, C.DOOR);
    set(doorX + 1, doorY, C.DOOR);
    id++;
  };
  // Bottom row 101–106, top row 107–112.
  cols.forEach(([x0, x1], k) => addRoom(x0, x1, 26, 42, 25, x0 + 2, k));
  cols.forEach(([x0, x1], k) => addRoom(x0, x1, 1, 17, 18, x1 - 3, k + 1));

  // Top centre: main staircase, open to the corridor.
  for (let x = 45; x <= 54; x++) set(x, 18, C.FLOOR);
  fill(46, 3, 53, 13, C.STAIRS);
  // Bottom centre: entrance hall with the main exit.
  for (let x = 44; x <= 55; x++) set(x, 25, C.FLOOR);
  for (let x = 47; x <= 52; x++) set(x, H - 1, C.EXIT);
  // Side exit at the left end of the corridor.
  for (let y = 20; y <= 23; y++) set(0, y, C.EXIT);

  return { grid: g, rooms, scenario: { type: 'fire', origin: 16 * W + 50, seed: 42, spreadSpeed: 1 } };
}
