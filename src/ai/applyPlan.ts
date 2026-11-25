import { useProject } from '../store/useProject';
import { cellFloor, floorCount, floorView, roomFloors, stairIssues } from '../sim/floors';
import { analyzePlan } from './analyzePlan';
import { buildGridFromSpec, type GeneratedPlan } from './rasterize';
import { mergeAiRooms } from './roomMatching';

export interface AiPlanResult {
  stats: GeneratedPlan['stats'];
  warnings: string[];
  notes: string;
  /** Floor that was generated. */
  floor: number;
}

/**
 * Reads the plan uploaded for the ACTIVE floor with the AI and writes the result into that floor in place, so 2D and 3D
 * both pick it up and Ctrl+Z restores whatever was drawn before. Other floors are untouched. The user can keep editing.
 */
export async function generateFromPlan(signal?: AbortSignal): Promise<AiPlanResult> {
  const before = useProject.getState();
  const floor = Math.min(before.activeFloor, floorCount(before.grid) - 1);
  const image = before.backgrounds[floor];
  if (!image) throw new Error('Първо качи план за този етаж.');
  const spec = await analyzePlan(image, signal, floor);

  // The user may have changed things while the AI was working - build against the current state.
  const st = useProject.getState();
  if (floor >= floorCount(st.grid)) throw new Error('Етажът е премахнат междувременно.');
  const view = floorView(st.grid, floor);
  // Exits belong to the ground floor; upper floors reach the way out through the stairs.
  const plan = buildGridFromSpec(spec, view.w, view.h, { exits: floor === 0 });

  const onFloor = roomFloors(st.grid);
  const existingFloorRooms = st.rooms.filter((r) => onFloor.get(r.id) === floor);
  const maxRoomId = st.rooms.reduce((max, room) => Math.max(max, room.id), 0);
  const maxGridRoomId = st.grid.rooms.reduce((max, roomId) => Math.max(max, roomId), 0);
  const merged = mergeAiRooms(existingFloorRooms, plan.rooms, view, plan.grid, Math.max(maxRoomId, maxGridRoomId) + 1);
  const rooms = [...st.rooms.filter((r) => onFloor.get(r.id) !== floor), ...merged.rooms];

  st.pushUndo();
  view.cells.set(plan.grid.cells);
  view.stairDir.set(plan.grid.stairDir);
  for (let i = 0; i < view.rooms.length; i++) {
    const r = plan.grid.rooms[i];
    view.rooms[i] = r >= 0 ? (merged.remap.get(r) ?? r) : -1;
  }
  const origin = st.scenario.origin !== null && cellFloor(st.grid, st.scenario.origin) === floor ? null : st.scenario.origin;
  st.set({
    rooms,
    selectedRoom: null,
    results: null,
    prevResults: null,
    scenario: { ...st.scenario, origin },
    gridVersion: st.gridVersion + 1,
  });

  // Stairs that do not line up with the neighbouring floors would leave people stranded.
  const warnings = [...plan.warnings, ...stairIssues(st.grid).filter((i) => i.floor === floor || i.floor === floor + 1).map((i) => i.text)];
  return { stats: plan.stats, warnings, notes: spec.notes, floor };
}
