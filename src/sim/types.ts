/** Meters per grid cell. */
export const CELL_SIZE = 0.5;

export const C = {
  VOID: 0,
  FLOOR: 1,
  WALL: 2,
  EXIT: 3,
  STAIRS: 4,
  DOOR: 5,
} as const;
export type CellType = (typeof C)[keyof typeof C];

export interface Room {
  id: number;
  name: string;
  adults: number;
  children: number;
  reducedMobility: number;
  color: string;
}

export interface GridData {
  w: number;
  h: number;
  cells: Uint8Array;
  /** Room id per cell, -1 if the cell is not part of a room. */
  rooms: Int16Array;
  /** Stairs only: which way a hand-drawn flight climbs - 0 unset (infer it), 1 +x, 2 -x, 3 +y, 4 -y. */
  stairDir: Uint8Array;
  /** Floors stacked in this grid (default 1). Floor k is a band of `floorH` rows - see sim/floors.ts. */
  floors?: number;
  /** Rows per floor (default h). */
  floorH?: number;
}

export type DisasterType = 'fire' | 'earthquake' | 'flood' | 'gas';

export interface Scenario {
  type: DisasterType;
  /** Cell index where the hazard starts; null = random. */
  origin: number | null;
  seed: number;
  /** Multiplier on how fast the hazard spreads (0.5 slow, 1 normal, 2 fast). For earthquake it scales the amount of debris and the aftershock rate. */
  spreadSpeed: number;
}

export type AgentKind = 'child' | 'adult' | 'reduced';

export const AGENT_STATE = {
  WAITING: 0,
  MOVING: 1,
  EVACUATED: 2,
  TRAPPED: 3,
} as const;

export interface Agent {
  id: number;
  kind: AgentKind;
  room: number;
  roomIdx: number;
  cell: number;
  next: number;
  progress: number;
  stepLen: number;
  speed: number;
  delay: number;
  state: number;
  exitTime: number;
  /** Index into Simulation.exits, -1 = reached stairs (flood). */
  exitId: number;
  /** Render position in cell units (cell x + fraction + jitter). */
  x: number;
  y: number;
  ox: number;
  oy: number;
  waited: number;
  /** Lowest flow-field distance reached since the last flow recompute; only new records count as progress. */
  bestDist: number;
  /** Floor the agent's cell is on. */
  fl: number;
  /** Floors climbed (+) or descended (-) so far while walking a flight of stairs between floors; 0 otherwise. */
  lift: number;
}
