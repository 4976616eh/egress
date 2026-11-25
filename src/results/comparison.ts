import type { Scenario } from '../sim/types';

/** Identifies runs with identical plans and simulation inputs. */
export function comparisonKey(planHash: string, scenario: Scenario): string {
  return JSON.stringify([
    planHash,
    scenario.type,
    scenario.origin,
    scenario.seed,
    scenario.spreadSpeed,
  ]);
}
