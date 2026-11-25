import { Simulation } from '../sim/engine';
import type { Scenario } from '../sim/types';
import { defaultOriginCell, isWalkable } from '../sim/grid';
import { computeResults } from '../results/metrics';
import { useProject } from './useProject';

/** The running simulation lives outside React; views read it every frame. */
export const simRef: { current: Simulation | null } = { current: null };

/** `override` replays an exact run (e.g. the worst case found by the Monte Carlo batch) without touching the saved scenario. */
export function startSimulation(override?: Partial<Scenario>) {
  const s = useProject.getState();
  // Earthquake debris must land somewhere new every run; other disasters keep the saved seed so re-runs are comparable.
  let scenario = override
    ? { ...s.scenario, ...override }
    : s.scenario.type === 'earthquake'
      ? { ...s.scenario, origin: s.scenario.origin ?? defaultOriginCell(s.grid), seed: (Math.random() * 2 ** 31) | 0 }
      : { ...s.scenario, origin: s.scenario.origin ?? defaultOriginCell(s.grid) };
  const origin = scenario.origin;
  if (origin !== null && (origin < 0 || origin >= s.grid.cells.length || !isWalkable(s.grid.cells[origin]))) {
    scenario = { ...scenario, origin: defaultOriginCell(s.grid) };
  }
  if (!override && scenario.origin !== s.scenario.origin) {
    s.set({ scenario: { ...s.scenario, origin: scenario.origin } });
  }
  simRef.current = new Simulation(s.grid, s.rooms, scenario, s.exitNames);
  s.set({ mode: 'run', paused: false, simId: s.simId + 1 });
}

export function finishSimulation() {
  const sim = simRef.current;
  if (!sim) return;
  const s = useProject.getState();
  const results = computeResults(sim, s.targetTime);
  const prevComparable = s.results && s.results.comparisonKey === results.comparisonKey;
  s.set({ mode: 'results', prevResults: prevComparable ? s.results : null, results });
}

export function stopSimulation() {
  simRef.current = null;
  useProject.getState().set({ mode: 'edit' });
}

export function skipToEnd() {
  simRef.current?.runToEnd();
}
