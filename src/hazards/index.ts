import type { DisasterType } from '../sim/types';
import type { Hazard } from './types';
import { createFire } from './fire';
import { createEarthquake } from './earthquake';
import { createFlood } from './flood';
import { createGas } from './gas';

export function createHazard(type: DisasterType, speed = 1): Hazard {
  switch (type) {
    case 'fire': return createFire(speed);
    case 'earthquake': return createEarthquake(speed);
    case 'flood': return createFlood(speed);
    case 'gas': return createGas(speed);
  }
}
