import type { AgentKind, DisasterType } from '../sim/types';

export const DISASTERS: Record<DisasterType, { label: string; desc: string; color: string }> = {
  fire: { label: 'Пожар', desc: 'Огънят се разпространява по етажа; димът се качва по свързаните стълби, а огънят преминава нагоре след 10 s при 1× (времето се променя със скоростта).', color: '#ea580c' },
  earthquake: { label: 'Земетресение', desc: '10 s „Падни, прикрий се, задръж“, после евакуация. Отломки падат на случайни места и следват вторични трусове.', color: '#92400e' },
  flood: { label: 'Наводнение', desc: 'Водата се разпространява по етажа; при дълбочина 0,7 m на свързано стълбище прелива към етажа отгоре.', color: '#2563eb' },
  gas: { label: 'Изтичане на газ', desc: 'Опростен модел на лек газ: изкачва се по свързаните стълби след 3 s при 1× (времето се променя със скоростта).', color: '#16a34a' },
};

/** Disaster spread speed range (multiplier on each hazard's own rate constants). */
export const SPREAD_MIN = 0.5;
export const SPREAD_MAX = 2;
export const SPREAD_STEP = 0.1;
export const fmtSpread = (v: number) => `${v.toFixed(1)}×`;

export const AGENT_COLORS: Record<AgentKind, string> = {
  adult: '#2563eb',
  child: '#f59e0b',
  reduced: '#a21caf',
};
export const TRAPPED_COLOR = '#dc2626';
export const FOLLOW_COLOR = '#ffffff';

export const AGENT_LABELS: Record<AgentKind, string> = {
  adult: 'Възрастни',
  child: 'Деца',
  reduced: 'С намалена подвижност',
};

export const ROOM_COLORS = [
  '#bfdbfe', '#bbf7d0', '#fde68a', '#fbcfe8', '#ddd6fe', '#fed7aa',
  '#a5f3fc', '#d9f99d', '#fecaca', '#c7d2fe', '#99f6e4', '#f5d0fe',
];

export function fmtTime(s: number): string {
  if (!Number.isFinite(s)) return '—';
  const sign = s < 0 ? '−' : '';
  s = Math.abs(Math.round(s));
  return `${sign}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
