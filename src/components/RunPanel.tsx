import { useProject } from '../store/useProject';
import { simRef, skipToEnd, stopSimulation } from '../store/simControl';
import { AGENT_STATE as S } from '../sim/types';
import { DISASTERS, fmtSpread, fmtTime } from './labels';
import { Btn, Section } from './ui';

export default function RunPanel() {
  useProject((s) => s.simTick);
  const speed = useProject((s) => s.speed);
  const paused = useProject((s) => s.paused);
  const set = useProject((s) => s.set);
  const sim = simRef.current;
  if (!sim) return null;

  const total = sim.agents.length;
  let out = 0, trapped = 0, moving = 0;
  for (const a of sim.agents) {
    if (a.state === S.EVACUATED) out++;
    else if (a.state === S.TRAPPED) trapped++;
    else if (a.state === S.MOVING) moving++;
  }
  const d = DISASTERS[sim.hazard.type];
  const inPreDelay = sim.t < sim.hazard.preDelay;
  const speedLabel = fmtSpread(sim.scenario.spreadSpeed || 1);

  return (
    <div>
      <Section title={`${d.label}${` · разпространение ${speedLabel}`} - симулация`}>
        <div className="text-sm uppercase tracking-wide text-ink-dim">Изминало време</div>
        <div className="font-display text-5xl font-bold tabular-nums text-ink">{fmtTime(sim.t)}</div>
        {inPreDelay && <div className="mt-1 rounded-md bg-amber-500/10 px-2 py-1 text-[1rem] text-amber-700">Падни, прикрий се, задръж… {Math.ceil(sim.hazard.preDelay - sim.t)} s</div>}
        <div className="mt-4">
          <div className="flex justify-between text-[1rem]">
            <span className="text-ink">Евакуирани</span>
            <span className="font-semibold tabular-nums text-ink">{out} / {total}</span>
          </div>
          <div className="mt-1 h-3 overflow-hidden rounded-full bg-raised">
            <div className="h-full bg-accent transition-all" style={{ width: `${(out / Math.max(1, total)) * 100}%` }} />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[1rem]">
            <div className="rounded-lg bg-raised px-3 py-2"><div className="text-sm text-ink-dim">В движение</div><div className="text-lg font-semibold tabular-nums text-ink">{moving}</div></div>
            <div className="rounded-lg bg-red-500/10 px-3 py-2"><div className="text-sm text-red-600">В опасност</div><div className="text-lg font-semibold tabular-nums text-red-600">{trapped}</div></div>
          </div>
        </div>
      </Section>
      <Section title="Управление">
        <div className="flex gap-1.5">
          {[1, 5, 20].map((v) => (
            <Btn key={v} active={speed === v} onClick={() => set({ speed: v })} className="flex-1">{v}×</Btn>
          ))}
        </div>
        <div className="mt-2 flex gap-1.5">
          <Btn onClick={() => set({ paused: !paused })} className="flex-1">{paused ? 'Продължи' : 'Пауза'}</Btn>
          <Btn onClick={skipToEnd} className="flex-1">До края</Btn>
        </div>
        <Btn variant="danger" onClick={stopSimulation} className="mt-2 w-full">Спри и се върни към плана</Btn>
      </Section>
    </div>
  );
}
