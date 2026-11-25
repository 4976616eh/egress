import type { GridData, Room, Scenario } from '../sim/types';
import { FLOOR_GAP, MAX_FLOORS } from '../sim/floors';

const KEY = 'evacsim.project.v1';
const BROKEN_KEY = 'evacsim.project.v1.broken';

export interface ProjectFile {
  version: 1;
  w: number;
  h: number;
  cells: number[];
  roomIds: number[];
  stairDir?: number[];
  rooms: Room[];
  /** Plan image of the first floor (kept so older versions can still read the file). */
  background: string | null;
  /** Plan image per floor. */
  backgrounds?: (string | null)[];
  floors?: number;
  floorH?: number;
  scenario?: Scenario;
  targetTime?: number;
  exitNames?: Record<string, string>;
}

export interface ProjectData {
  grid: GridData;
  rooms: Room[];
  /** One plan image (or null) per floor. */
  backgrounds: (string | null)[];
  scenario?: Scenario;
  targetTime?: number;
  exitNames?: Record<string, string>;
}

export function serialize(p: ProjectData): ProjectFile {
  return {
    version: 1,
    w: p.grid.w,
    h: p.grid.h,
    cells: Array.from(p.grid.cells),
    roomIds: Array.from(p.grid.rooms),
    stairDir: Array.from(p.grid.stairDir),
    rooms: p.rooms,
    background: p.backgrounds[0] ?? null,
    backgrounds: p.backgrounds,
    floors: p.grid.floors ?? 1,
    floorH: p.grid.floorH ?? p.grid.h,
    scenario: p.scenario,
    targetTime: p.targetTime,
    exitNames: p.exitNames,
  };
}

const CELL_MAX = 5; // C.DOOR is the highest cell type
const SCENARIO_TYPES = ['fire', 'earthquake', 'flood', 'gas'];
const MAX_CELLS = 3_000_000;
const FALLBACK_ROOM_COLOR = '#bfdbfe';

const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
const bad = (why: string) => new Error(`Невалиден файл на проект (${why})`);

/** Reads a project file and refuses anything that could break the editor or the simulation later. */
export function deserialize(f: ProjectFile): ProjectData {
  if (!f || typeof f !== 'object' || f.version !== 1) throw bad('версия');
  if (!isInt(f.w, 1, 1000) || !isInt(f.h, 1, 4000) || f.w * f.h > MAX_CELLS) throw bad('размери');
  const n = f.w * f.h;
  if (!Array.isArray(f.cells) || f.cells.length !== n || !Array.isArray(f.roomIds) || f.roomIds.length !== n || !Array.isArray(f.rooms))
    throw bad('липсват данни');
  // Files from before multi-storey support have one floor that fills the whole grid.
  const floors = f.floors ?? 1;
  const floorH = f.floorH ?? f.h;
  if (!Number.isInteger(floors) || floors < 1 || floors > MAX_FLOORS || !Number.isInteger(floorH) || floors * floorH + (floors - 1) * FLOOR_GAP !== f.h)
    throw bad('етажи');

  if (f.rooms.length > 1000) throw bad('твърде много стаи');
  const rooms: Room[] = [];
  const ids = new Set<number>();
  for (const r of f.rooms) {
    if (!r || !isInt(r.id, 0, 32767) || ids.has(r.id)) throw bad('стая');
    if (!isInt(r.adults, 0, 10000) || !isInt(r.children, 0, 10000) || !isInt(r.reducedMobility, 0, 10000)) throw bad('брой хора');
    ids.add(r.id);
    rooms.push({
      id: r.id,
      name: String(r.name ?? '').slice(0, 60),
      adults: r.adults,
      children: r.children,
      reducedMobility: r.reducedMobility,
      color: typeof r.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(r.color) ? r.color : FALLBACK_ROOM_COLOR,
    });
  }

  const cells = new Uint8Array(n);
  const roomIds = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const c = f.cells[i];
    const r = f.roomIds[i];
    if (!isInt(c, 0, CELL_MAX) || !isInt(r, -1, 32767)) throw bad('клетки');
    cells[i] = c;
    roomIds[i] = r >= 0 && !ids.has(r) ? -1 : r; // a cell pointing at a room that does not exist is just not in a room
  }
  let stairDir = new Uint8Array(n);
  if (f.stairDir) {
    if (!Array.isArray(f.stairDir) || f.stairDir.length !== n) throw bad('стълби');
    for (let i = 0; i < n; i++) {
      const d = f.stairDir[i];
      if (!isInt(d, 0, 4)) throw bad('посока на стълби');
      stairDir[i] = d;
    }
  }

  const backgrounds = Array.from({ length: floors }, (_, k) => {
    const v = (f.backgrounds ? f.backgrounds[k] : k === 0 ? f.background : null) ?? null;
    return typeof v === 'string' && v.startsWith('data:image/') ? v : null; // only embedded images, never a link to somewhere else
  });

  let scenario: Scenario | undefined;
  if (f.scenario) {
    const sc = f.scenario;
    if (!SCENARIO_TYPES.includes(sc.type)) throw bad('бедствие');
    scenario = {
      type: sc.type,
      origin: isInt(sc.origin, 0, n - 1) ? sc.origin : null,
      seed: typeof sc.seed === 'number' && Number.isFinite(sc.seed) ? sc.seed : 42,
      spreadSpeed: typeof sc.spreadSpeed === 'number' && Number.isFinite(sc.spreadSpeed) ? Math.min(2, Math.max(0.5, sc.spreadSpeed)) : 1,
    };
  }
  const targetTime = typeof f.targetTime === 'number' && Number.isFinite(f.targetTime) && f.targetTime >= 10 && f.targetTime <= 36000 ? f.targetTime : undefined;
  const exitNames: Record<string, string> = {};
  if (f.exitNames !== undefined) {
    if (!f.exitNames || typeof f.exitNames !== 'object' || Array.isArray(f.exitNames)) throw bad('имена на изходи');
    const entries = Object.entries(f.exitNames);
    if (entries.length > 1000) throw bad('твърде много имена на изходи');
    for (const [key, value] of entries) {
      if (!/^\d+:\d+:\d+$/.test(key) || typeof value !== 'string') throw bad('име на изход');
      exitNames[key] = value.slice(0, 60);
    }
  }

  return { grid: { w: f.w, h: f.h, cells, rooms: roomIds, stairDir, floors, floorH }, rooms, backgrounds, scenario, targetTime, exitNames };
}

const MAX_SAVED_CHARS = 1_800_000;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Изображението не може да бъде оптимизирано за запазване.'));
    image.src = src;
  });
}

function renderCompressedImage(image: HTMLImageElement, maxSide: number, quality: number) {
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Не може да се създаде изображение за автоматично запазване.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { dataUrl: canvas.toDataURL('image/jpeg', quality), width: canvas.width, height: canvas.height };
}

const compressImage = (image: HTMLImageElement, maxSide: number, quality: number) =>
  renderCompressedImage(image, maxSide, quality).dataUrl;

/** Makes uploaded plans small enough for autosave while keeping enough detail to trace. */
export async function preparePlanImage(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    return renderCompressedImage(image, 2048, 0.84);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Returns how autosave went. Oversized backgrounds are compressed, never silently dropped. */
export async function saveLocal(
  p: ProjectData,
  isCurrent: () => boolean = () => true,
): Promise<'ok' | 'optimized' | 'failed' | 'superseded'> {
  const save = (project: ProjectData) => {
    const json = JSON.stringify(serialize(project));
    if (json.length > MAX_SAVED_CHARS) return false;
    localStorage.setItem(KEY, json);
    return true;
  };
  const revision = ++localSaveRevision;
  try {
    if (save(p)) return 'ok';
  } catch {
    // Browser storage quota can vary, so retry below with progressively smaller plan images.
  }
  if (!p.backgrounds.some(Boolean)) return 'failed';

  try {
    const images = await Promise.all(p.backgrounds.map((src) => src ? loadImage(src) : Promise.resolve(null)));
    for (const [maxSide, quality] of [
      [2048, 0.82],
      [1600, 0.76],
      [1280, 0.7],
      [1024, 0.64],
      [800, 0.58],
      [640, 0.5],
      [480, 0.42],
    ]) {
      if (revision !== localSaveRevision || !isCurrent()) return 'superseded';
      const backgrounds = images.map((image) => image ? compressImage(image, maxSide, quality) : null);
      try {
        if (save({ ...p, backgrounds })) return 'optimized';
      } catch {
        // Continue reducing the images until the project fits the available browser storage.
      }
    }
  } catch {
    return revision === localSaveRevision && isCurrent() ? 'failed' : 'superseded';
  }
  return revision === localSaveRevision && isCurrent() ? 'failed' : 'superseded';
}

let localSaveRevision = 0;

/** The saved project, or - when it cannot be read - why. A copy of unreadable data is kept so nothing is lost. */
export function loadLocalResult(): { data: ProjectData | null; problem: string | null } {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
    if (!raw) return { data: null, problem: null };
    return { data: deserialize(JSON.parse(raw)), problem: null };
  } catch (e) {
    if (!raw) return { data: null, problem: null }; // storage itself is unavailable: nothing was lost
    let kept = false;
    try {
      localStorage.setItem(BROKEN_KEY, raw);
      kept = true;
    } catch {
      /* over quota */
    }
    const why = e instanceof Error ? e.message : 'неизвестна грешка';
    return {
      data: null,
      problem: `Запазеният проект не можа да се зареди (${why}), затова е показана демо сградата. ${kept ? 'Копие на запазените данни е пазено и можеш да го свалиш.' : 'Копие не можа да се запази - няма място в браузъра.'}`,
    };
  }
}

export function loadLocal(): ProjectData | null {
  return loadLocalResult().data;
}

/** Saves the stored project (or the kept copy of an unreadable one) as a file. */
export function downloadLocalCopy(which: 'current' | 'broken'): boolean {
  try {
    const raw = localStorage.getItem(which === 'broken' ? BROKEN_KEY : KEY);
    if (!raw) return false;
    const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = which === 'broken' ? 'egress-nevaliden-zapis.json' : 'egress-zapis.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return true;
  } catch {
    return false;
  }
}

/** Forgets the stored project. */
export function clearLocal() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
