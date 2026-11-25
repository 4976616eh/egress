import { useEffect, useState } from 'react';
import { useProject } from '../store/useProject';
import { startSimulation, stopSimulation } from '../store/simControl';
import type { DisasterType } from '../sim/types';
import { floorCount, floorName } from '../sim/floors';
import { DISASTERS, fmtTime } from '../components/labels';
import { Btn, Section } from '../components/ui';
import { openReport } from './report';

export default function ResultsPanel() {
  const r = useProject((s) => s.results);
  const prev = useProject((s) => s.prevResults);
  const target = useProject((s) => s.targetTime);
  const scenario = useProject((s) => s.scenario);
  const multiFloor = useProject((s) => floorCount(s.grid) > 1);
  const set = useProject((s) => s.set);
  const [applied, setApplied] = useState<Set<number>>(new Set());
  // A new run means new recommendations, so earlier "applied" marks no longer mean anything.
  useEffect(() => setApplied(new Set()), [r]);
  if (!r) return null;

  const ok = r.trapped === 0 && r.totalTime <= target;
  const comparablePrev = !!prev && prev.comparisonKey === r.comparisonKey;
  // Times only compare when plan and all simulation inputs are identical and everyone got out in both runs.
  const delta = prev && comparablePrev && r.trapped === 0 && prev.trapped === 0 ? r.totalTime - prev.totalTime : null;
  const rooms = [...r.rooms].sort((a, b) => (b.time ?? Infinity) - (a.time ?? Infinity));

  const applyFix = (i: number) => {
    const fix = r.recommendations[i].fix;
    if (!fix) return;
    const s = useProject.getState();
    s.pushUndo();
    for (const c of fix.cells) {
      s.grid.cells[c] = fix.type;
      s.grid.rooms[c] = -1;
      s.grid.stairDir[c] = 0;
    }
    s.bumpGrid();
    setApplied((a) => new Set(a).add(i));
  };

  const rerunWith = (type: DisasterType) => {
    set({ scenario: { ...scenario, type } });
    startSimulation();
  };

  return (
    <div>
      <div className="px-4 pt-4">
        <div className={`rounded-xl border p-4 ${ok ? 'border-accent/40 bg-accent/10' : 'border-red-500/30 bg-red-500/10'}`}>
          <div className="text-xs uppercase tracking-wide text-ink-dim">
            {DISASTERS[r.disaster].label} · {r.trapped > 0 ? 'евакуацията не е пълна' : 'общо време за евакуация'}
          </div>
          {(r.trapped === 0 || r.evacuated > 0) && (
            <div className="font-display text-6xl font-bold tabular-nums text-ink">{fmtTime(r.totalTime)}</div>
          )}
          <div className={`text-sm font-medium ${ok ? 'text-accent' : 'text-red-600'}`}>
            Цел {fmtTime(target)} ·{' '}
            {r.trapped > 0
              ? `${r.trapped} души не излязоха${r.evacuated > 0 ? ` (последният излязъл на ${fmtTime(r.totalTime)})` : ''}`
              : ok
                ? 'в рамките на целта'
                : `над целта с ${fmtTime(r.totalTime - target)}`}
          </div>
          {prev && comparablePrev && (
            <div className="mt-2 text-sm text-ink-dim">
              Предишен опит: {prev.trapped > 0 ? '—' : fmtTime(prev.totalTime)}
              {prev.trapped > 0 && ` (${prev.trapped} неизлезли)`}
              {delta !== null && (
                <>
                  {' '}→{' '}
                  <span className={delta <= 0 ? 'font-semibold text-accent' : 'font-semibold text-red-600'}>
                    {delta <= 0 ? '' : '+'}{fmtTime(delta)}
                  </span>
                </>
              )}
            </div>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-raised px-3 py-2">
            <div className="text-xs text-ink-dim">Евакуирани</div>
            <div className="text-2xl font-semibold tabular-nums text-ink">{r.evacuated}<span className="text-[1rem] text-ink-dim">/{r.total}</span></div>
          </div>
          <div className={`rounded-lg px-3 py-2 ${r.trapped ? 'bg-red-500/10' : 'bg-raised'}`}>
            <div className="text-xs text-ink-dim">Неевакуирани</div>
            <div className={`text-2xl font-semibold tabular-nums ${r.trapped ? 'text-red-600' : 'text-ink'}`}>{r.trapped}</div>
          </div>
        </div>
      </div>

      <Section title="Препоръки">
        <ol className="space-y-2">
          {r.recommendations.map((rec, i) => (
            <li key={i} className="flex gap-2 text-sm leading-snug text-ink">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-amber-500/15 text-xs font-bold text-amber-700">{i + 1}</span>
              <span className="min-w-0">
                {rec.text}
                {rec.fix &&
                  (applied.has(i) ? (
                    <span className="mt-1.5 block text-sm font-medium text-accent">Приложено - натисни „Пусни отново“, за да видиш ефекта.</span>
                  ) : (
                    <Btn variant="primary" onClick={() => applyFix(i)} className="mt-1.5 block">{rec.fix.label}</Btn>
                  ))}
              </span>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Натоварване на изходите">
        <div className="space-y-2">
          {r.exits.map((e) => (
            <div key={e.name}>
              <div className="flex justify-between text-sm"><span className="text-ink">{e.name}</span><span className="tabular-nums text-ink-dim">{e.count} души · {Math.round(e.share * 100)}%</span></div>
              <div className="mt-0.5 h-2 overflow-hidden rounded-full bg-raised">
                <div className={`h-full ${e.share > 0.5 ? 'bg-red-500' : 'bg-accent'}`} style={{ width: `${e.share * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-ink-dim">Топлинната карта на плана показва къде хората са чакали най-дълго (зелено → червено).</p>
      </Section>

      <Section title="Стаи">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-dim">
              <th className="pb-1 font-medium">Стая</th>
              <th className="pb-1 text-right font-medium">Хора</th>
              <th className="pb-1 text-right font-medium">Време</th>
              <th className="pb-1 pl-2 font-medium">Изход</th>
            </tr>
          </thead>
          <tbody>
            {rooms.map((x) => (
              <tr key={x.roomId} className="border-t border-line">
                <td className="py-1 font-medium text-ink">
                  {x.name}
                  {multiFloor && <span className="ml-1 text-xs font-normal text-ink-dim">{floorName(x.floor)}</span>}
                </td>
                <td className="py-1 text-right tabular-nums text-ink">{x.evacuated}/{x.people}</td>
                <td className={`py-1 text-right tabular-nums ${x.time === null ? 'font-semibold text-red-600' : 'text-ink'}`}>{x.time === null ? '-' : fmtTime(x.time)}</td>
                <td className="py-1 pl-2 text-ink-dim">{x.exitName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <div className="space-y-2 px-4 py-4">
        <Btn variant="primary" onClick={() => startSimulation()} className="w-full py-2.5">Пусни отново</Btn>
        <Btn onClick={() => openReport(r, target)} className="w-full">Виж отчета</Btn>
        <Btn onClick={stopSimulation} className="w-full">Промени плана и опитай пак</Btn>
        <div className="pt-2 text-xs text-ink-dim">Същата сграда, друго бедствие:</div>
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.keys(DISASTERS) as DisasterType[]).map((d) => (
            <Btn key={d} active={d === r.disaster} onClick={() => rerunWith(d)}>{DISASTERS[d].label}</Btn>
          ))}
        </div>
      </div>
    </div>
  );
}
