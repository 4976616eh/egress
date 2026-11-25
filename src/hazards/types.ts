import type { DisasterType, GridData } from '../sim/types';
import type { Rng } from '../sim/rng';
import type { Goal } from '../sim/flowField';
import type { Portals } from '../sim/floors';

export interface Hazard {
  readonly type: DisasterType;
  /** Seconds everyone stays in place before evacuating (earthquake: drop, cover, hold). */
  readonly preDelay: number;
  /** Main field per cell, read by the visualization: fire level 0..1, debris, water depth (m), gas 0..1. */
  readonly level: Float32Array;
  /** Secondary field (smoke around fire, rubble around debris). */
  readonly aux: Float32Array;
  readonly origin: number;
  init(grid: GridData, origin: number | null, rng: Rng, portals?: Portals | null): void;
  /** Advance the hazard. Returns true when the flow field must be recomputed. */
  step(grid: GridData, dt: number, t: number, portals?: Portals | null): boolean;
  isBlocked(cell: number): boolean;
  speedFactor(cell: number): number;
  /** Extra path cost so agents route around the hazard when possible. */
  pathCost(cell: number): number;
  /** An agent standing here is lost. */
  isLethal(cell: number): boolean;
  /** Where agents try to go. */
  goals(grid: GridData): Goal[];
}
