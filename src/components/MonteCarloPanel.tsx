import { useState } from 'react';
import { useProject } from '../store/useProject';
import { startSimulation } from '../store/simControl';
import { cancelMonteCarlo, startMonteCarlo, useMonteCarlo } from '../store/monteCarlo';
import { C } from '../sim/types';
import { floorCount, roomFloors, stairIssues } from '../sim/floors';
import { verticalSpreadDescription } from '../hazards/vertical';
import { fmtTime } from './labels';
import { Btn, Section } from './ui';

const COUNTS = [20, 50, 100];
const pct = (x: number) => `${Math.round(x * 100)}%`;

export default function MonteCarloPanel() {
  const mc = useMonteCarlo();
  const rooms = useProject((s) => s.rooms);
  const grid = useProject((s) => s.grid);
  const scenario = useProject((s) => s.scenario);
  const [count, setCount] = useState(50);
  const [randomOrigin, setRandomOrigin] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    const people = rooms.reduce((n, r) => n + r.children + r.adults + r.reducedMobility, 0);
    if (!grid.cells.some((c) => c === C.EXIT)) return setError('Добавете поне един изход.');
    if (people === 0) return setError('Добавете поне една стая с хора.');
    const floors = floorCount(grid);
    const roomFloor = roomFloors(grid);
    const peoplePerFloor = Array<number>(floors).fill(0);
    for (const room of rooms) peoplePerFloor[roomFloor.get(room.id) ?? 0] += room.children + room.adults + room.reducedMobility;
    const stranded = stairIssues(grid).find((issue) => peoplePerFloor.slice(issue.floor).some((n) => n > 0));
    if (stranded) return setError(stranded.text);
    setError(null);
    startMonteCarlo(count, randomOrigin);
  };

  const st = mc.stats;
  const prev = mc.prevStats;
  const maxBin = st ? Math.max(1, ...st.histogram.map((h) => h.count)) : 1;

  return (
    <Section title="Методът „Монте Карло“ — много учения наведнъж">
      {mc.status !== 'done' && (
        <p className="mb-3 text-sm text-ink-dim">
          Пуска симулацията много пъти със случайни реакции и показва средното и най-лошото време, а не само един опит.
        </p>
      )}
      {floorCount(grid) > 1 && (
        <p className="mb-3 text-sm text-ink-dim">
          {verticalSpreadDescription(scenario.type, scenario.spreadSpeed, floorCount(grid))} Резултатите включват това правило във всяко пускане.
        </p>
      )}

      {mc.status === 'running' ? (
        <div>
          <div className="mb-1 flex justify-between text-sm text-ink">
            <span>Изпълнение…</span>
            <span className="tabular-nums">{mc.done}/{mc.total}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-raised">
            <div className="h-full bg-accent transition-all" style={{ width: `${(mc.done / Math.max(1, mc.total)) * 100}%` }} />
          </div>
          <Btn onClick={cancelMonteCarlo} className="mt-3 w-full">Откажи</Btn>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-[1rem]">
            <span className="text-ink-dim">Брой пускания</span>
            <div className="flex gap-1">
              {COUNTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCount(n)}
                  className={`rounded-md px-2.5 py-1 text-sm ring-1 transition ${count === n ? 'bg-accent text-white ring-accent' : 'bg-raised text-ink ring-line hover:bg-line'}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={randomOrigin} onChange={(e) => setRandomOrigin(e.target.checked)} className="accent-accent" />
            Случайна начална точка на бедствието
          </label>
          {(error ?? mc.error) && <p className="mt-2 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600">{error ?? mc.error}</p>}
          <Btn onClick={run} className="mt-3 w-full py-2">{st ? 'Пусни отново' : `Пусни ${count} пъти`}</Btn>
        </>
      )}

      {st && mc.status === 'done' && (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Stat
              label="Средно време"
              value={fmtTime(st.mean)}
              sub={
                st.timeRuns === 0
                  ? `никой не е излязъл в ${st.runs} пускания`
                  : st.completeRuns < st.runs
                    ? `до последното излизане в ${st.timeRuns} пускания; пълни ${st.completeRuns}/${st.runs}`
                  : prev && Number.isFinite(prev.mean)
                    ? delta(st.mean - prev.mean, 's')
                    : undefined
              }
            />
            <Stat label="Най-лошо време" value={fmtTime(st.worst)} />
            <Stat label="В рамките на целта" value={pct(st.withinTarget)} sub={prev ? delta((st.withinTarget - prev.withinTarget) * 100, 'пп', true) : undefined} good={st.withinTarget >= 0.9} />
            <Stat label="Остават хора вътре" value={pct(st.withTrapped)} sub={st.maxTrapped ? `до ${st.maxTrapped} души` : undefined} bad={st.withTrapped > 0} />
          </div>
          <div className="text-sm text-ink-dim">
            Медиана {fmtTime(st.median)} · 95% от пусканията до {fmtTime(st.p95)} · най-добро {fmtTime(st.best)} · цел {fmtTime(st.target)}
          </div>

          <div>
            <div className="mb-1 text-sm font-medium text-ink">Разпределение на времето до последното излизане ({st.timeRuns} от {st.runs} пускания)</div>
            {st.timeRuns === 0 && <p className="mb-2 text-sm text-ink-dim">Никой не е напуснал сградата в тези пускания, затова няма времена за диаграмата. Провери рисковите стаи и връзката между етажите.</p>}
            <div className="flex h-32 items-end gap-1">
              {st.histogram.map((h, i) => (
                <div
                  key={i}
                  title={`${fmtTime(h.from)}–${fmtTime(h.to)}: ${h.count}`}
                  className={`flex-1 rounded-t ${h.to > st.target ? 'bg-red-400' : 'bg-accent'}`}
                  style={{ height: `${Math.max(h.count ? 6 : 0, (h.count / maxBin) * 100)}%` }}
                />
              ))}
            </div>
            <div className="mt-0.5 flex justify-between text-xs tabular-nums text-ink-dim">
              <span>{fmtTime(st.best)}</span>
              <span>{fmtTime(st.worst)}</span>
            </div>
            <p className="mt-2 text-xs text-ink-dim">
              Диаграмата показва колко симулации са приключили във всеки времеви интервал според времето, за което последният евакуиран човек е излязъл.
            </p>
          </div>

          {st.roomRisk.length > 0 && (
            <div>
              <div className="mb-1 text-sm font-medium text-ink">Най-рискови стаи</div>
              <div className="space-y-1.5">
                {st.roomRisk.slice(0, 4).map((r) => (
                  <div key={r.roomId}>
                    <div className="flex justify-between text-sm">
                      <span className="text-ink">Стая {r.name}</span>
                      <span className="tabular-nums text-ink-dim">{pct(r.share)} от пусканията</span>
                    </div>
                    <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-raised">
                      <div className="h-full bg-red-500" style={{ width: pct(r.share) }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Btn variant="primary" className="w-full py-2" onClick={() => startSimulation({ seed: st.worstRun.seed, origin: st.config.origin })}>
            Покажи най-лошия случай ({st.worstRun.trapped ? `${st.worstRun.trapped} вътре` : fmtTime(st.worstRun.totalTime)})
          </Btn>
        </div>
      )}
    </Section>
  );
}

/** Change against the previous batch, worded as better/worse rather than just up/down. */
function delta(v: number, unit: string, higherIsBetter = false) {
  const r = Math.round(v);
  if (!r) return 'без промяна спрямо предишния';
  const better = higherIsBetter ? r > 0 : r < 0;
  return `${r > 0 ? '+' : ''}${r} ${unit} - ${better ? 'по-добре' : 'по-зле'} от предишния`;
}

function Stat({ label, value, sub, bad, good }: { label: string; value: string; sub?: string; bad?: boolean; good?: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-2 ${bad ? 'bg-red-500/10' : good ? 'bg-accent/10' : 'bg-raised'}`}>
      <div className="text-xs text-ink-dim">{label}</div>
      <div className={`font-display text-2xl font-bold tabular-nums ${bad ? 'text-red-600' : 'text-ink'}`}>{value}</div>
      {sub && <div className="text-xs text-ink-dim">{sub}</div>}
    </div>
  );
}
