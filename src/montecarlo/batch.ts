import { Simulation } from '../sim/engine';
import { AGENT_STATE, type GridData, type Room, type Scenario } from '../sim/types';

/** Outcome of one headless run. Plain data, so it can cross the worker boundary. */
export interface RunSummary {
  seed: number;
  /** Time of the last evacuation (s); people left inside are counted separately. */
  totalTime: number;
  evacuated: number;
  trapped: number;
  total: number;
  /** Everyone got out. Only then is `totalTime` a real evacuation time. */
  complete: boolean;
  /** Room id → people from that room who did not get out. */
  roomTrapped: Record<number, number>;
}

export function runOnce(grid: GridData, rooms: Room[], scenario: Scenario, seed: number): RunSummary {
  const sim = new Simulation(grid, rooms, { ...scenario, seed });
  sim.runToEnd();
  const roomTrapped: Record<number, number> = {};
  let totalTime = 0;
  for (const a of sim.agents) {
    if (a.state === AGENT_STATE.EVACUATED) totalTime = Math.max(totalTime, a.exitTime);
    else roomTrapped[a.room] = (roomTrapped[a.room] ?? 0) + 1;
  }
  return { seed, totalTime, evacuated: sim.evacuated, trapped: sim.trapped, total: sim.agents.length, complete: sim.trapped === 0, roomTrapped };
}

/** Same seeds every time, so re-running after a plan change compares like with like. */
export const batchSeeds = (n: number) => Array.from({ length: n }, (_, i) => 1000 + i);
