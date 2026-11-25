import { create } from 'zustand';
import type { GridData, Room, Scenario } from '../sim/types';
import { createGrid } from '../sim/grid';
import { MAX_FLOORS, appendFloor, alignFloorWithBelow, cellFloor, floorAlignmentDelta, floorCount, floorOffset, removeFloor as removeFloorFrom, shiftFloor } from '../sim/floors';
import type { SimResults } from '../results/metrics';
import { buildDemoSchool } from '../demo/demoSchool';
import type { Layout } from '../viz3d/coords';
import { ROOM_COLORS } from '../components/labels';
import { loadLocalResult, saveLocal, type ProjectData } from './persist';

export type Tool = 'select' | 'room' | 'fill' | 'corridor' | 'wall' | 'line' | 'door' | 'exit' | 'stairs' | 'erase';
export type Mode = 'edit' | 'run' | 'results';
export type CameraPreset = 'iso' | 'top' | 'follow';

interface Snapshot {
  cells: Uint8Array;
  roomIds: Int16Array;
  stairDir: Uint8Array;
  rooms: Room[];
  scenario: Scenario;
}

function moveExitNames(names: Record<string, string>, floor: number, dx: number, dy: number) {
  const moved: Record<string, string> = {};
  for (const [key, name] of Object.entries(names)) {
    const match = /^(\d+):(\d+):(\d+)$/.exec(key);
    if (!match) {
      moved[key] = name;
      continue;
    }
    const [f, x, y] = match.slice(1).map(Number);
    moved[f === floor ? `${f}:${x + dx}:${y + dy}` : key] = name;
  }
  return moved;
}

function removeFloorExitNames(names: Record<string, string>, floor: number) {
  const kept: Record<string, string> = {};
  for (const [key, name] of Object.entries(names)) {
    const match = /^(\d+):(\d+):(\d+)$/.exec(key);
    if (!match) {
      kept[key] = name;
      continue;
    }
    const [f, x, y] = match.slice(1).map(Number);
    if (f === floor) continue;
    kept[f > floor ? `${f - 1}:${x}:${y}` : key] = name;
  }
  return kept;
}

export interface ProjectState {
  grid: GridData;
  gridVersion: number;
  rooms: Room[];
  /** User-defined exit labels keyed by floor and the exit's first local cell. */
  exitNames: Record<string, string>;
  /** Plan image per floor. */
  backgrounds: (string | null)[];
  bgOpacity: number;
  /** Floor shown in 2D and edited with the drawing tools. */
  activeFloor: number;
  /** Extra metres between floors in the 3D view (0 = stacked). */
  explode: number;
  /** 3D: floors side by side on the ground ('spread') or stacked like a real building ('stack'). */
  layout: Layout;
  /** 3D: show only the active floor instead of the whole building. */
  onlyActiveFloor: boolean;
  /** 3D: show room names above the building. */
  showRoomNames: boolean;
  /** 3D: show occupancy counts in room labels. */
  showRoomCounts: boolean;

  tool: Tool;
  brushMode: 'brush' | 'rect' | 'line';
  selectedRoom: number | null;

  scenario: Scenario;
  targetTime: number;

  mode: Mode;
  view: '2d' | '3d';
  speed: number;
  paused: boolean;
  simId: number;
  simTick: number;
  results: SimResults | null;
  prevResults: SimResults | null;

  lowWalls: boolean;
  camera: { preset: CameraPreset; n: number };

  undoStack: Snapshot[];
  /** Set when the browser autosave could not keep everything. */
  saveWarning: string | null;
  /** Set when the saved project could not be read and the demo building was shown instead. */
  loadWarning: string | null;

  set: (p: Partial<ProjectState>) => void;
  bumpGrid: () => void;
  pushUndo: () => void;
  undo: () => void;
  addRoom: () => number;
  updateRoom: (id: number, patch: Partial<Room>) => void;
  setExitName: (key: string, name: string) => void;
  deleteRoom: (id: number) => void;
  loadProject: (p: ProjectData) => void;
  newProject: (w: number, h: number, background?: string | null) => void;
  setCamera: (preset: CameraPreset) => void;
  /** Plan image of the active floor. */
  setBackground: (url: string | null) => void;
  /** Adds a floor on top - empty, or a copy of the active floor - and switches to it. */
  addFloor: (copyActive: boolean) => void;
  removeFloor: (floor: number) => void;
  shiftFloor: (floor: number, dx: number, dy: number) => void;
  alignFloor: (floor: number) => void;
}

const loaded = loadLocalResult();
const initial: ProjectData = loaded.data ?? { ...buildDemoSchool(), backgrounds: [null] };

export const useProject = create<ProjectState>()((set, get) => ({
  grid: initial.grid,
  gridVersion: 0,
  rooms: initial.rooms,
  exitNames: initial.exitNames ?? {},
  backgrounds: initial.backgrounds,
  bgOpacity: 0.6,
  activeFloor: 0,
  explode: 0,
  layout: 'spread',
  onlyActiveFloor: false,
  showRoomNames: true,
  showRoomCounts: true,

  tool: 'select',
  brushMode: 'rect',
  selectedRoom: null,

  scenario: initial.scenario ?? { type: 'fire', origin: null, seed: 42, spreadSpeed: 1 },
  targetTime: initial.targetTime ?? 180,

  mode: 'edit',
  view: '3d',
  speed: 5,
  paused: false,
  simId: 0,
  simTick: 0,
  results: null,
  prevResults: null,

  lowWalls: false,
  camera: { preset: 'iso', n: 0 },

  undoStack: [],
  saveWarning: null,
  loadWarning: loaded.problem,

  set: (p) => set(p),
  bumpGrid: () => set((s) => ({ gridVersion: s.gridVersion + 1 })),
  pushUndo: () => {
    const { grid, rooms, undoStack } = get();
    set({
      undoStack: [
        ...undoStack.slice(-30),
        {
          cells: grid.cells.slice(),
          roomIds: grid.rooms.slice(),
          stairDir: grid.stairDir.slice(),
          rooms: rooms.map((r) => ({ ...r })),
          scenario: { ...get().scenario },
        },
      ],
    });
  },
  undo: () => {
    const { undoStack, grid } = get();
    const snap = undoStack[undoStack.length - 1];
    if (!snap) return;
    grid.cells.set(snap.cells);
    grid.rooms.set(snap.roomIds);
    grid.stairDir.set(snap.stairDir);
    set((s) => ({
      rooms: snap.rooms,
      scenario: snap.scenario,
      undoStack: undoStack.slice(0, -1),
      gridVersion: s.gridVersion + 1,
      results: null,
      prevResults: null,
    }));
  },
  addRoom: () => {
    const { rooms } = get();
    const id = rooms.reduce((m, r) => Math.max(m, r.id), 0) + 1;
    const room: Room = {
      id,
      name: `Стая ${rooms.length + 1}`,
      children: 0,
      adults: 0,
      reducedMobility: 0,
      color: ROOM_COLORS[(id - 1) % ROOM_COLORS.length],
    };
    set({ rooms: [...rooms, room], selectedRoom: id });
    return id;
  },
  updateRoom: (id, patch) => set((s) => ({ rooms: s.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
  setExitName: (key, name) =>
    set((s) => {
      const value = name.slice(0, 60);
      if (s.exitNames[key] === value) return {};
      return { exitNames: { ...s.exitNames, [key]: value }, results: null, prevResults: null };
    }),
  deleteRoom: (id) => {
    const { grid } = get();
    get().pushUndo();
    for (let i = 0; i < grid.rooms.length; i++) if (grid.rooms[i] === id) grid.rooms[i] = -1;
    set((s) => ({ rooms: s.rooms.filter((r) => r.id !== id), selectedRoom: null, gridVersion: s.gridVersion + 1 }));
  },
  loadProject: (p) =>
    set((s) => ({
      grid: p.grid,
      rooms: p.rooms,
      exitNames: p.exitNames ?? {},
      backgrounds: p.backgrounds,
      activeFloor: 0,
      scenario: p.scenario ?? s.scenario,
      targetTime: p.targetTime ?? s.targetTime,
      gridVersion: s.gridVersion + 1,
      selectedRoom: null,
      results: null,
      prevResults: null,
      undoStack: [],
      mode: 'edit',
    })),
  newProject: (w, h, background = null) =>
    set((s) => ({
      grid: createGrid(w, h),
      rooms: [],
      exitNames: {},
      backgrounds: [background],
      activeFloor: 0,
      scenario: { ...s.scenario, origin: null },
      gridVersion: s.gridVersion + 1,
      selectedRoom: null,
      results: null,
      prevResults: null,
      undoStack: [],
      mode: 'edit',
      view: '2d',
      tool: 'room',
      brushMode: 'rect',
    })),
  setCamera: (preset) => set((s) => ({ camera: { preset, n: s.camera.n + 1 } })),
  setBackground: (url) =>
    set((s) => {
      const backgrounds = s.backgrounds.slice();
      backgrounds[s.activeFloor] = url;
      return { backgrounds };
    }),
  addFloor: (copyActive) =>
    set((s) => {
      if (floorCount(s.grid) >= MAX_FLOORS) return {};
      const { grid, rooms } = appendFloor(s.grid, s.rooms, copyActive ? s.activeFloor : null);
      // Floors are appended, so every existing cell index (including the hazard origin) stays valid.
      return {
        grid,
        rooms: [...s.rooms, ...rooms],
        backgrounds: [...s.backgrounds, null],
        activeFloor: floorCount(grid) - 1,
        gridVersion: s.gridVersion + 1,
        selectedRoom: null,
        results: null,
        prevResults: null,
        undoStack: [],
      };
    }),
  removeFloor: (floor) =>
    set((s) => {
      const n = floorCount(s.grid);
      if (n < 2 || floor < 0 || floor >= n) return {};
      const r = removeFloorFrom(s.grid, s.rooms, floor);
      const origin = s.scenario.origin === null ? null : r.remap(s.scenario.origin);
      let active = s.activeFloor > floor ? s.activeFloor - 1 : s.activeFloor;
      active = Math.min(active, n - 2);
      return {
        grid: r.grid,
        rooms: r.rooms,
        exitNames: removeFloorExitNames(s.exitNames, floor),
        backgrounds: s.backgrounds.filter((_, k) => k !== floor),
        activeFloor: active,
        scenario: { ...s.scenario, origin },
        gridVersion: s.gridVersion + 1,
        selectedRoom: null,
        results: null,
        prevResults: null,
        undoStack: [],
      };
    }),
  shiftFloor: (floor, dx, dy) => {
    const s = get();
    if (!Number.isInteger(dx) || !Number.isInteger(dy)) return;
    const next = shiftFloor(s.grid, s.rooms, floor, dx, dy);
    if (next.grid === s.grid) return;
    let origin = s.scenario.origin;
    if (origin !== null && cellFloor(s.grid, origin) === floor) {
      const local = origin - floorOffset(s.grid, floor);
      origin = floorOffset(next.grid, floor) + local + dy * s.grid.w + dx;
    }
    get().pushUndo();
    set({
      grid: next.grid,
      rooms: next.rooms,
      exitNames: moveExitNames(s.exitNames, floor, dx, dy),
      scenario: { ...s.scenario, origin },
      gridVersion: s.gridVersion + 1,
      results: null,
      prevResults: null,
    });
  },
  alignFloor: (floor) => {
    const s = get();
    if (!Number.isInteger(floor) || floor <= 0 || floor >= floorCount(s.grid)) return;
    const delta = floorAlignmentDelta(s.grid, floor);
    if (!delta || (delta.dx === 0 && delta.dy === 0)) return;
    const aligned = alignFloorWithBelow(s.grid, floor, s.rooms);
    if (!aligned) return;
    let origin = s.scenario.origin;
    if (origin !== null && cellFloor(s.grid, origin) === floor) {
      const local = origin - floorOffset(s.grid, floor);
      origin = floorOffset(aligned.grid, floor) + local + aligned.dy * s.grid.w + aligned.dx;
    }
    get().pushUndo();
    set({
      grid: aligned.grid,
      rooms: aligned.rooms,
      exitNames: moveExitNames(s.exitNames, floor, aligned.dx, aligned.dy),
      scenario: { ...s.scenario, origin },
      gridVersion: s.gridVersion + 1,
      results: null,
      prevResults: null,
    });
  },
}));

// Autosave to localStorage.
let saveTimer: ReturnType<typeof setTimeout> | undefined;
useProject.subscribe((s, prev) => {
  if (
    s.gridVersion !== prev.gridVersion ||
    s.rooms !== prev.rooms ||
    s.exitNames !== prev.exitNames ||
    s.backgrounds !== prev.backgrounds ||
    s.scenario !== prev.scenario ||
    s.targetTime !== prev.targetTime
  ) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const st = useProject.getState();
      const project = { grid: st.grid, rooms: st.rooms, backgrounds: st.backgrounds, scenario: st.scenario, targetTime: st.targetTime, exitNames: st.exitNames };
      const isCurrent = () => {
        const current = useProject.getState();
        return current.gridVersion === st.gridVersion &&
          current.rooms === st.rooms &&
          current.backgrounds === st.backgrounds &&
          current.scenario === st.scenario &&
          current.targetTime === st.targetTime &&
          current.exitNames === st.exitNames;
      };
      void saveLocal(project, isCurrent).then((res) => {
        if (res === 'superseded') return;
        const current = useProject.getState();
        const saveWarning =
          res === 'optimized'
            ? 'Планът беше автоматично намален, за да се запази в браузъра.'
            : res === 'failed'
              ? 'Автоматичното запазване не успя. Експортирайте проекта, за да не го загубите.'
              : null;
        if (saveWarning !== current.saveWarning) useProject.setState({ saveWarning });
      });
    }, 500);
  }
});
