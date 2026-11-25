import type { DisasterType } from '../sim/types';

/** Base delays at 1x speed, measured after the hazard reaches a linked stair cell. */
export const FIRE_UP_DELAY = 10;
export const GAS_UP_DELAY = 3;
export const FLOOD_STAIR_OVERTOP_DEPTH = 0.7;

function seconds(value: number) {
  return new Intl.NumberFormat('bg-BG', { maximumFractionDigits: 1 }).format(value);
}

/** User-facing summary of the simplified vertical-spread rule used by the simulation engine. */
export function verticalSpreadDescription(type: DisasterType, speed: number, floors: number) {
  if (floors <= 1) return 'Сградата е едноетажна; вертикално разпространение няма.';
  const safeSpeed = Math.max(0.01, speed);
  switch (type) {
    case 'fire':
      return `Димът се качва по свързаните стълби; огънят преминава нагоре след ${seconds(FIRE_UP_DELAY / safeSpeed)} s от запалването на стълбищната клетка.`;
    case 'gas':
      return `Опростеният модел приема лек газ; той се качва по свързаните стълби след ${seconds(GAS_UP_DELAY / safeSpeed)} s.`;
    case 'flood':
      return `Водата прелива към горния етаж през свързано стълбище при ${seconds(FLOOD_STAIR_OVERTOP_DEPTH)} m дълбочина.`;
    case 'earthquake':
      return 'Земетресението въздейства на етажите едновременно, а не се разпространява нагоре като фронт.';
  }
}
