import { AGENT_STATE as S, C, CELL_SIZE, type Agent, type AgentKind, type GridData, type Room, type Scenario } from './types';
import { cloneGrid, isWalkable, labelExits, type ExitInfo } from './grid';
import { computeFlowField } from './flowField';
import { buildPortals, floorCount, floorStride, type Portals } from './floors';
import { mulberry32, shuffle, type Rng } from './rng';
import { createHazard } from '../hazards';
import type { Hazard } from '../hazards/types';

/** Fixed simulation time step (s). */
export const DT = 0.1;
/** Max agents per 0.5 m cell. An agent reserves its next cell while moving, so 1 already gives door flows of ~1.5 people/m/s. */
const MAX_PER_CELL = 1;
const MAX_TIME = 900;
const STUCK_TIMEOUT = 45;
/** Adults leave once the children in their room have left, or after this many seconds. */
const ADULT_MAX_WAIT = 60;
/** Chance a child ignores the optimal direction and wanders to any open neighbour instead. */
const CHILD_CHAOS_P = 0.15;

const DIRS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

/** Length (in cells) of the walk between two floors; with the slower speed on stairs this is a few seconds per floor. */
const PORTAL_LEN = 10;

const BASE_SPEED = {
  adult: 1.3,
  reduced: 0.5,
  child: 0.7,
};

const terrainSpeed = (c: number) => (c === C.DOOR || c === C.EXIT || c === C.STAIRS ? 0.5 : 1);
const terrainCost = (c: number) => (c === C.DOOR ? 0.5 : c === C.STAIRS ? 1 : 0);

export class Simulation {
  readonly g: GridData;
  readonly rooms: Room[];
  readonly scenario: Scenario;
  readonly hazard: Hazard;
  readonly exits: ExitInfo[];
  readonly exitNames: Readonly<Record<string, string>>;
  readonly exitIds: Int16Array;
  readonly agents: Agent[] = [];
  readonly occ: Uint8Array;
  /** Seconds agents spent waiting in each cell (congestion heatmap). */
  readonly heat: Float32Array;
  readonly goalMask: Uint8Array;
  /** Floor of every cell. */
  readonly floorOf: Uint8Array;
  /** Links between stairs that sit exactly above each other; null in a one-floor building. */
  readonly portals: Portals | null;
  dist: Float64Array;
  t = 0;
  done = false;
  private rng: Rng;
  private flowDirty = true;
  private lastProgress = 0;
  private remaining: Int32Array;

  constructor(grid: GridData, rooms: Room[], scenario: Scenario, exitNames: Readonly<Record<string, string>> = {}) {
    this.g = cloneGrid(grid);
    this.rooms = rooms.map((r) => ({ ...r }));
    this.scenario = { ...scenario };
    this.exitNames = { ...exitNames };
    this.rng = mulberry32(scenario.seed);
    const n = this.g.w * this.g.h;
    this.occ = new Uint8Array(n);
    this.heat = new Float32Array(n);
    this.goalMask = new Uint8Array(n);
    this.dist = new Float64Array(n);
    this.floorOf = new Uint8Array(n);
    const nf = floorCount(this.g);
    if (nf > 1) {
      const step = floorStride(this.g) * this.g.w;
      for (let f = 1; f < nf; f++) this.floorOf.fill(f, f * step);
    }
    this.portals = buildPortals(this.g);
    this.hazard = createHazard(scenario.type, scenario.spreadSpeed || 1);
    this.hazard.init(this.g, scenario.origin, this.rng, this.portals);
    const lab = labelExits(this.g);
    this.exits = lab.exits;
    this.exitIds = lab.ids;
    this.remaining = new Int32Array(this.rooms.length);
    this.spawn();
    this.recomputeFlow();
    this.lastProgress = this.agents.reduce((m, a) => Math.max(m, a.delay), 0);
  }

  private passable = (i: number) => isWalkable(this.g.cells[i]) && !this.hazard.isBlocked(i);

  private spawn() {
    const { g, rng, hazard } = this;
    const cellsByRoom = new Map<number, number[]>();
    for (let i = 0; i < g.cells.length; i++) {
      const r = g.rooms[i];
      if (r < 0 || !this.passable(i)) continue;
      let arr = cellsByRoom.get(r);
      if (!arr) cellsByRoom.set(r, (arr = []));
      arr.push(i);
    }
    this.rooms.forEach((room, ri) => {
      const cells = cellsByRoom.get(room.id);
      if (!cells?.length) return;
      shuffle(cells, rng);
      let k = 0;
      const add = (kind: AgentKind, delay: number) => {
        const cell = cells[k++ % cells.length];
        const base = BASE_SPEED[kind];
        const ox = (rng() - 0.5) * 0.5;
        const oy = (rng() - 0.5) * 0.5;
        this.agents.push({
          id: this.agents.length, kind, room: room.id, roomIdx: ri, cell, next: -1, progress: 0, stepLen: 1,
          speed: base * (0.9 + rng() * 0.2), delay, state: S.WAITING, exitTime: -1, exitId: -1,
          x: (cell % g.w) + ox, y: ((cell / g.w) | 0) + oy, ox, oy, waited: 0, bestDist: Infinity,
          fl: this.floorOf[cell], lift: 0,
        });
        this.occ[cell]++;
      };
      const pre = hazard.preDelay;
      // Children take longer to react and line up than adults.
      for (let c = 0; c < room.children; c++) add('child', pre + 4 + rng() * 6);
      for (let c = 0; c < room.reducedMobility; c++) add('reduced', pre + 4 + rng() * 6);
      for (let c = 0; c < room.adults; c++) add('adult', pre + 3);
    });
  }

  recomputeFlow() {
    const { g, hazard } = this;
    const goals = hazard.goals(g);
    this.goalMask.fill(0);
    for (const goal of goals) this.goalMask[goal.cell] = 1;
    this.dist = computeFlowField(g, goals, this.passable, (i) => hazard.pathCost(i) + terrainCost(g.cells[i]), this.portals);
    for (const a of this.agents) a.bestDist = Infinity;
    this.flowDirty = false;
  }

  private pickNext(a: Agent): number {
    const { g, dist, occ } = this;
    const x = a.cell % g.w;
    const y = (a.cell / g.w) | 0;
    // Kids don't always walk straight to the exit - sometimes they wander to any open cell nearby.
    if (a.kind === 'child' && this.rng() < CHILD_CHAOS_P) {
      const options: number[] = [];
      for (const [dx, dy] of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue;
        const j = ny * g.w + nx;
        if (occ[j] >= MAX_PER_CELL || !this.passable(j)) continue;
        if (dx && dy && (!this.passable(y * g.w + nx) || !this.passable(ny * g.w + x))) continue;
        options.push(j);
      }
      if (options.length) return options[Math.floor(this.rng() * options.length)];
    }
    const d0 = dist[a.cell];
    if (!isFinite(d0)) return -1;
    let best = -1;
    let bestD = d0 - 1e-6; // only strictly downhill moves
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue;
      const j = ny * g.w + nx;
      if (occ[j] >= MAX_PER_CELL || !this.passable(j)) continue;
      if (dx && dy && (!this.passable(y * g.w + nx) || !this.passable(ny * g.w + x))) continue;
      const dj = dist[j];
      if (dj < bestD - 1e-6 || (best >= 0 && Math.abs(dj - bestD) <= 1e-6 && this.rng() < 0.5)) {
        best = j;
        bestD = dj;
      }
    }
    // A flight of stairs to the floor above/below is one more way to go.
    const p = this.portals;
    if (p) {
      for (const j of [p.up[a.cell], p.down[a.cell]]) {
        if (j < 0 || occ[j] >= MAX_PER_CELL || !this.passable(j)) continue;
        if (dist[j] < bestD - 1e-6) {
          best = j;
          bestD = dist[j];
        }
      }
    }
    return best;
  }

  private updatePos(a: Agent) {
    const w = this.g.w;
    let x = a.cell % w;
    let y = (a.cell / w) | 0;
    a.lift = 0;
    if (a.next >= 0) {
      if (this.floorOf[a.next] !== a.fl) {
        // Between floors the agent stays in the stairwell; only its height changes.
        a.lift = (this.floorOf[a.next] - a.fl) * a.progress;
      } else {
        x += ((a.next % w) - x) * a.progress;
        y += (((a.next / w) | 0) - y) * a.progress;
      }
    }
    a.x = x + a.ox;
    a.y = y + a.oy;
  }

  step(dt = DT) {
    if (this.done) return;
    const { g, hazard, agents, occ } = this;
    this.t += dt;
    const t = this.t;
    if (hazard.step(g, dt, t, this.portals)) this.flowDirty = true;
    if (this.flowDirty) this.recomputeFlow();

    this.remaining.fill(0);
    for (const a of agents)
      if (a.kind !== 'adult' && a.state < S.EVACUATED && g.rooms[a.cell] === a.room) this.remaining[a.roomIdx]++;

    const n = agents.length;
    const start = Math.floor(this.rng() * n);
    let active = 0;
    for (let k = 0; k < n; k++) {
      const a = agents[(start + k) % n];
      if (a.state >= S.EVACUATED) continue;
      active++;
      if (hazard.isLethal(a.cell)) {
        a.state = S.TRAPPED;
        occ[a.cell]--;
        if (a.next >= 0) occ[a.next]--;
        a.next = -1;
        continue;
      }
      if (t < a.delay) continue;
      if (a.kind === 'adult' && this.remaining[a.roomIdx] > 0 && t < a.delay + ADULT_MAX_WAIT) continue;
      a.state = S.MOVING;

      if (a.next >= 0 && hazard.isBlocked(a.next)) {
        occ[a.next]--;
        a.next = -1;
        a.progress = 0;
      }
      if (a.next < 0) {
        if (this.goalMask[a.cell]) {
          occ[a.cell]--;
          a.state = S.EVACUATED;
          a.exitTime = t;
          a.exitId = this.exitIds[a.cell];
          this.lastProgress = t;
          continue;
        }
        const nx = this.pickNext(a);
        if (nx < 0) {
          a.waited += dt;
          this.heat[a.cell] += dt;
          this.updatePos(a);
          continue;
        }
        a.next = nx;
        occ[nx]++;
        a.progress = 0;
        a.stepLen =
          this.floorOf[nx] !== a.fl
            ? PORTAL_LEN
            : nx % g.w !== a.cell % g.w && ((nx / g.w) | 0) !== ((a.cell / g.w) | 0)
              ? Math.SQRT2
              : 1;
      }
      const sf = hazard.speedFactor(a.cell) * terrainSpeed(g.cells[a.next]);
      a.progress += (a.speed * sf * dt) / (CELL_SIZE * a.stepLen);
      if (a.progress >= 1) {
        occ[a.cell]--;
        a.cell = a.next;
        a.fl = this.floorOf[a.cell];
        a.next = -1;
        a.progress = 0;
        // Random wandering must not reset the stuck timer, so only a new closest-to-exit record counts.
        if (this.dist[a.cell] < a.bestDist - 1e-6) {
          a.bestDist = this.dist[a.cell];
          this.lastProgress = t;
        }
      }
      this.updatePos(a);
    }

    const stuck = t - this.lastProgress > STUCK_TIMEOUT;
    if (active === 0 || stuck || t >= MAX_TIME) {
      for (const a of agents) if (a.state < S.EVACUATED) a.state = S.TRAPPED;
      this.done = true;
    }
  }

  /** Runs to completion without rendering (used for "skip to end" and headless runs). */
  runToEnd(maxSteps = 20000) {
    for (let i = 0; i < maxSteps && !this.done; i++) this.step(DT);
  }

  get evacuated() {
    return this.agents.reduce((s, a) => s + (a.state === S.EVACUATED ? 1 : 0), 0);
  }
  get trapped() {
    return this.agents.reduce((s, a) => s + (a.state === S.TRAPPED ? 1 : 0), 0);
  }
}
