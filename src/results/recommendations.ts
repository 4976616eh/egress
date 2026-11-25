import { roomCentroids } from '../sim/grid';
import { C } from '../sim/types';
import { cellFloor, floorCount, floorName, stairwellCount } from '../sim/floors';
import type { Simulation } from '../sim/engine';
import { fmtTime } from '../components/labels';
import type { SimResults } from './metrics';
import { dangerMask, planNewExit, planWiden, roomAnchor, type Fix } from './fixes';

/** How far from the hazard's start and from every cell it reached a new exit must be. */
const DANGER_MARGIN = 6;

export interface Recommendation {
  text: string;
  /** A plan edit that puts the advice into practice, when one can be worked out automatically. */
  fix?: Fix;
}

const list = (names: string[]) => names.join(', ');
const listLimited = (names: string[], limit: number) =>
  names.length > limit ? `${list(names.slice(0, limit))} и още ${names.length - limit}` : list(names);

/** Rule-based, plain-language recommendations (Bulgarian UI text). */
export function buildRecommendations(sim: Simulation, r: SimResults, targetTime: number): Recommendation[] {
  const out: Recommendation[] = [];
  const used = new Set<string>();
  /** Offers each distinct edit only once, so two recommendations never show the same button. */
  const unique = (fix: Fix | null): Fix | undefined => {
    if (!fix) return undefined;
    const key = `${fix.type}:${fix.cells.join(',')}`;
    if (used.has(key)) return undefined;
    used.add(key);
    return fix;
  };
  // A new exit beside the fire (or flood, gas, debris) would be useless, so keep clear of everywhere the hazard reached.
  const reached: number[] = [sim.hazard.origin];
  for (let i = 0; i < sim.hazard.level.length; i++) if (sim.hazard.level[i] > 0) reached.push(i);
  const danger = dangerMask(sim.g, reached, DANGER_MARGIN);
  // A new exit only makes sense on the ground floor; upstairs the way out is a second stairwell, which cannot be planned automatically.
  const exitNear = (roomId: number, roomName: string) => {
    const anchor = roomAnchor(sim.g, roomId);
    return anchor >= 0 && cellFloor(sim.g, anchor) > 0 ? undefined : unique(planNewExit(sim.g, anchor, `Добави изход край стая ${roomName}`, danger));
  };
  const realExits = r.exits.filter((e) => e.name.startsWith('Изход'));

  // 1. People who did not get out.
  if (r.trapped > 0) {
    const badRooms = r.rooms.filter((x) => x.evacuated < x.people);
    const bad = badRooms.map((x) => x.name);
    const worst = [...badRooms].sort((a, b) => b.people - b.evacuated - (a.people - a.evacuated))[0];
    const who = r.trapped === 1 ? '1 човек не успя да се евакуира' : `${r.trapped} души не успяха да се евакуират`;
    out.push({
      fix: worst && exitNear(worst.roomId, worst.name),
      text:
      sim.hazard.type === 'earthquake'
        ? // Debris lands in different places every run, so the advice must not blame one specific route.
          `${who} (стаи ${listLimited(bad, 5)}). Отломките падат на различни места при всяко земетресение, затова не може да се предвиди кой път ще се затвори - ` +
            `осигурете поне два независими изхода във всяко крило и повторете симулацията няколко пъти, за да видите колко често стаите остават отрязани.`
        : `${who} (стаи ${listLimited(bad, 5)}). ` +
            `Тези стаи разчитат на един маршрут, който бедствието може да блокира - осигурете втори път за изход.`,
    });
  }

  // 2. Overloaded exit.
  const sorted = [...realExits].sort((a, b) => b.count - a.count);
  if (sorted.length >= 2 && sorted[0].share > 0.5) {
    const top = sorted[0];
    const least = sorted[sorted.length - 1];
    const slowest = r.rooms
      .filter((x) => x.exitName === top.name && x.time !== null)
      .sort((a, b) => (b.time ?? 0) - (a.time ?? 0))
      .slice(0, 3);
    const slowRooms = slowest.map((x) => x.name);
    out.push({
      text: `${top.name} поема ${Math.round(top.share * 100)}% от хората - пренасочете стаи ${list(slowRooms)} към ${least.name}.`,
      fix: slowest[0] && exitNear(slowest[0].roomId, slowest[0].name),
    });
  } else if (realExits.length === 1) {
    const worst = [...r.rooms].filter((x) => x.time !== null).sort((a, b) => (b.time ?? 0) - (a.time ?? 0))[0];
    out.push({
      text: `Цялата сграда разчита на един изход (${realExits[0].name}). Обмислете отваряне на авариен изход.`,
      fix: worst && exitNear(worst.roomId, worst.name),
    });
  }

  // 3. Slowest rooms → add an exit in their wing.
  const slow = r.rooms.filter((x) => x.time !== null).sort((a, b) => (b.time ?? 0) - (a.time ?? 0)).slice(0, 3);
  if (slow.length && r.totalTime > 0) {
    out.push({
      text:
        `Най-бавно се евакуират стаи ${list(slow.map((x) => x.name))} (до ${fmtTime(slow[0].time!)}). ` +
        `Авариен изход в тяхното крило или по-ранно тръгване би съкратил общото време.`,
      fix: exitNear(slow[0].roomId, slow[0].name),
    });
  }

  // 3b. A whole upper floor funnelling through one stairwell.
  if (floorCount(sim.g) > 1 && stairwellCount(sim.g, 0) === 1) {
    const upstairs = r.rooms.filter((x) => x.floor > 0 && x.time !== null).sort((a, b) => (b.time ?? 0) - (a.time ?? 0)).slice(0, 3);
    const slowest = [...r.rooms].filter((x) => x.time !== null).sort((a, b) => (b.time ?? 0) - (a.time ?? 0)).slice(0, 3);
    if (upstairs.length && upstairs.some((x) => slowest.some((y) => y.roomId === x.roomId))) {
      out.push({ text: `Горните етажи слизат по едно-единствено стълбище - второ стълбище в другото крило би разделило потока и би съкратило опашките (най-бавни: ${list(upstairs.map((x) => `${x.name}, ${floorName(x.floor)}`))}).` });
    }
  }

  // 4. Congestion hotspot.
  if (r.hotspot && r.hotspot.wait > 10) {
    out.push({
      text: `Най-голямо задръстване ${describeCell(sim, r.hotspot.cell)} - хората са чакали там общо ${Math.round(r.hotspot.wait)} s. Разширете прохода или разпределете потока между изходите.`,
      fix: unique(planWiden(sim.g, r.hotspot.cell, 'Разшири прохода', danger)),
    });
  }

  // 5. Target.
  if (r.totalTime > targetTime && r.trapped === 0) {
    out.push({ text: `Целта е ${fmtTime(targetTime)} - нужно е съкращение с ${fmtTime(r.totalTime - targetTime)}.` });
  } else if (r.trapped === 0 && out.length < 3) {
    out.push({ text: `Евакуацията е в рамките на целта (${fmtTime(targetTime)}). Повторете с друго бедствие, за да проверите устойчивостта на плана.` });
  }

  return out.slice(0, 4);
}

function describeCell(sim: Simulation, cell: number): string {
  const { g } = sim;
  const x = cell % g.w;
  const y = (cell / g.w) | 0;
  if (g.cells[cell] === C.STAIRS) return floorCount(g) > 1 ? `на стълбището (${floorName(cellFloor(g, cell))})` : 'на стълбището';
  // Nearest exit within 6 cells?
  let bestExit: { name: string; d: number } | null = null;
  for (const e of sim.exits) {
    const d = Math.hypot(e.cx - x, e.cy - y);
    if (d < 6 && (!bestExit || d < bestExit.d)) bestExit = { name: e.name, d };
  }
  if (bestExit) return `пред Изход ${bestExit.name}`;
  // Otherwise the nearest room.
  let bestRoom: { id: number; d: number } | null = null;
  for (const [id, c] of roomCentroids(g)) {
    const d = Math.hypot(c.x - x, c.y - y);
    if (!bestRoom || d < bestRoom.d) bestRoom = { id, d };
  }
  const room = bestRoom && sim.rooms.find((r) => r.id === bestRoom!.id);
  return room ? `в коридора до стая ${room.name}` : 'в коридора';
}
