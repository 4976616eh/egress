import { AGENT_STATE as S, type DisasterType } from '../sim/types';
import type { Simulation } from '../sim/engine';
import { cellFloor, floorCount, floorName, roomFloors } from '../sim/floors';
import { exitKey, exitLabel } from '../sim/grid';
import { buildRecommendations, type Recommendation } from './recommendations';
import { comparisonKey as makeComparisonKey } from './comparison';

export interface RoomResult {
  roomId: number;
  name: string;
  /** Floor the room is on (0 = ground floor). */
  floor: number;
  people: number;
  evacuated: number;
  /** Time until the last person of the room got out (null if someone did not). */
  time: number | null;
  exitName: string;
}

export interface ExitUsage {
  name: string;
  count: number;
  share: number;
}

/** What the run was made with, so a report can be read (and repeated) without the project open. */
export interface ResultsMeta {
  seed: number;
  spreadSpeed: number;
  /** Where the hazard started, in words. */
  origin: string;
  floors: number;
  children: number;
  adults: number;
  reduced: number;
}

export interface SimResults {
  disaster: DisasterType;
  /** Exact signature of the building and room layout that was simulated. */
  planHash: string;
  /** Exact plan and scenario signature; only identical runs can be compared. */
  comparisonKey: string;
  /** Time of the LAST person who got out. Only a real evacuation time when `trapped` is 0. */
  totalTime: number;
  total: number;
  evacuated: number;
  trapped: number;
  rooms: RoomResult[];
  exits: ExitUsage[];
  heat: Float32Array;
  heatMax: number;
  hotspot: { cell: number; wait: number } | null;
  recommendations: Recommendation[];
  meta: ResultsMeta;
}

export const STAIRS_EXIT_NAME = 'Стълби (нагоре)';

export function exitName(sim: Simulation, exitId: number) {
  if (exitId < 0) return STAIRS_EXIT_NAME;
  const exit = sim.exits[exitId];
  if (!exit) return 'Изход ?';
  return exitLabel(exit, sim.exitNames[exitKey(sim.g, exit)]?.trim() || `Изход ${exit.name}`);
}

export function computeResults(sim: Simulation, targetTime: number): SimResults {
  const { agents } = sim;
  const evac = agents.filter((a) => a.state === S.EVACUATED);
  const totalTime = evac.reduce((m, a) => Math.max(m, a.exitTime), 0);

  const exitCounts = new Map<number, number>();
  for (const a of evac) exitCounts.set(a.exitId, (exitCounts.get(a.exitId) ?? 0) + 1);
  const exits: ExitUsage[] = sim.exits.map((e) => ({
    name: exitName(sim, e.id),
    count: exitCounts.get(e.id) ?? 0,
    share: evac.length ? (exitCounts.get(e.id) ?? 0) / evac.length : 0,
  }));
  if (exitCounts.has(-1)) exits.push({ name: STAIRS_EXIT_NAME, count: exitCounts.get(-1)!, share: exitCounts.get(-1)! / evac.length });

  const roomOnFloor = roomFloors(sim.g);
  const rooms: RoomResult[] = sim.rooms
    .map((room) => {
      const ra = agents.filter((a) => a.room === room.id);
      const re = ra.filter((a) => a.state === S.EVACUATED);
      const usage = new Map<number, number>();
      for (const a of re) usage.set(a.exitId, (usage.get(a.exitId) ?? 0) + 1);
      const main = [...usage.entries()].sort((a, b) => b[1] - a[1])[0];
      return {
        roomId: room.id,
        name: room.name,
        floor: roomOnFloor.get(room.id) ?? 0,
        people: ra.length,
        evacuated: re.length,
        time: ra.length && re.length === ra.length ? Math.max(...re.map((a) => a.exitTime)) : null,
        exitName: main ? exitName(sim, main[0]) : '-',
      };
    })
    .filter((r) => r.people > 0);

  let heatMax = 0;
  let hot = -1;
  for (let i = 0; i < sim.heat.length; i++)
    if (sim.heat[i] > heatMax) {
      heatMax = sim.heat[i];
      hot = i;
    }

  const o = sim.hazard.origin;
  let origin = 'не е определена';
  if (o >= 0 && o < sim.g.cells.length) {
    const rid = sim.g.rooms[o];
    const rname = rid >= 0 ? sim.rooms.find((x) => x.id === rid)?.name : undefined;
    const where = rname ? `стая ${rname}` : 'коридор или общо пространство';
    origin = floorCount(sim.g) > 1 ? `${floorName(cellFloor(sim.g, o))}, ${where}` : where;
  }
  const meta: ResultsMeta = {
    seed: sim.scenario.seed,
    spreadSpeed: sim.scenario.spreadSpeed,
    origin,
    floors: floorCount(sim.g),
    children: agents.filter((a) => a.kind === 'child').length,
    adults: agents.filter((a) => a.kind === 'adult').length,
    reduced: agents.filter((a) => a.kind === 'reduced').length,
  };

  const planHash = `${sim.g.w}x${sim.g.h}:${sim.g.floors ?? 1}:${sim.g.floorH ?? sim.g.h}:${Array.from(sim.g.cells).join(',')}:${Array.from(sim.g.rooms).join(',')}:${Array.from(sim.g.stairDir).join(',')}:${sim.rooms
    .slice()
    .sort((a, b) => a.id - b.id)
    .map((r) => `${r.id}:${r.name}:${r.children}:${r.adults}:${r.reducedMobility}`)
    .join('|')}`;
  const comparisonKey = makeComparisonKey(planHash, sim.scenario);
  const res: SimResults = {
    disaster: sim.scenario.type,
    planHash,
    comparisonKey,
    totalTime,
    total: agents.length,
    evacuated: evac.length,
    trapped: agents.length - evac.length,
    rooms,
    exits,
    heat: sim.heat.slice(),
    heatMax,
    hotspot: hot >= 0 ? { cell: hot, wait: heatMax } : null,
    recommendations: [],
    meta,
  };
  res.recommendations = buildRecommendations(sim, res, targetTime);
  return res;
}
