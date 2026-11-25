import { useMemo, useRef, useState } from 'react';
import { useProject } from '../store/useProject';
import { startSimulation } from '../store/simControl';
import { C, CELL_SIZE, type DisasterType } from '../sim/types';
import { defaultOriginCell, isWalkable } from '../sim/grid';
import { exitKey, labelExits } from '../sim/grid';
import { MAX_FLOORS, cellFloor, floorAlignment, floorAlignmentDelta, floorCount, floorName, floorOffset, floorShiftBounds, floorView, roomFloors, stairIssues, upperExitFloors } from '../sim/floors';
import { DISASTERS, SPREAD_MAX, SPREAD_MIN, SPREAD_STEP, fmtSpread, fmtTime } from './labels';
import { Btn, NumberField, Section } from './ui';
import MonteCarloPanel from './MonteCarloPanel';
import { generateFromPlan, type AiPlanResult } from '../ai/applyPlan';
import { downloadLocalCopy, preparePlanImage } from '../store/persist';

export default function EditPanel() {
  const s = useProject();
  const [widthM, setWidthM] = useState(40);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [ai, setAi] = useState<{ status: 'idle' | 'loading' | 'done' | 'error'; error?: string; result?: AiPlanResult }>({ status: 'idle' });
  const aiAbort = useRef<AbortController | null>(null);
  const floors = floorCount(s.grid);
  const floor = Math.min(s.activeFloor, floors - 1);
  const originLocal = defaultOriginCell(floorView(s.grid, floor));
  const originCellOnFloor = floorOffset(s.grid, floor) + originLocal;
  const canPlaceOriginOnFloor = isWalkable(s.grid.cells[originCellOnFloor]);
  const originAlreadyOnFloor = s.scenario.origin !== null && s.scenario.origin >= 0 && s.scenario.origin < s.grid.cells.length && isWalkable(s.grid.cells[s.scenario.origin]) && cellFloor(s.grid, s.scenario.origin) === floor;
  const shiftBounds = floorShiftBounds(s.grid, floor);
  const alignmentDelta = floorAlignmentDelta(s.grid, floor);
  const background = s.backgrounds[floor] ?? null;
  /** Nothing drawn yet on the floor being edited. */
  const gridEmpty = useMemo(() => floorView(s.grid, floor).cells.every((c) => c === C.VOID), [s.grid, s.gridVersion, floor]);
  const room = s.rooms.find((r) => r.id === s.selectedRoom) ?? null;
  const people = (r: { children: number; adults: number; reducedMobility: number }) => r.children + r.adults + r.reducedMobility;
  const totalPeople = s.rooms.reduce((n, r) => n + people(r), 0);
  const roomOnFloor = useMemo(() => roomFloors(s.grid), [s.grid, s.gridVersion]);
  const peoplePerFloor = useMemo(() => {
    const out = Array<number>(floors).fill(0);
    for (const r of s.rooms) out[roomOnFloor.get(r.id) ?? 0] += people(r);
    return out;
  }, [s.rooms, roomOnFloor, floors]);
  const issues = useMemo(() => stairIssues(s.grid), [s.grid, s.gridVersion]);
  const exits = useMemo(() => labelExits(s.grid).exits, [s.grid, s.gridVersion]);

  const onFile = async (f: File) => {
    setUploadError(null);
    try {
      const image = await preparePlanImage(f);
      const st = useProject.getState();
      // With several floors every floor shares the grid made for the first plan: the image just goes under this floor.
      if (floorCount(st.grid) > 1) return st.setBackground(image.dataUrl);
      const empty = st.grid.cells.every((c) => c === C.VOID);
      if (empty || confirm('Да създам нова решетка по размерите на плана? Текущата рисунка ще бъде изтрита.')) {
        const w = Math.round(widthM / CELL_SIZE);
        const h = Math.max(10, Math.round((w * image.height) / image.width));
        st.newProject(w, h, image.dataUrl);
      } else {
        st.setBackground(image.dataUrl);
      }
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Планът не можа да бъде обработен.');
    }
  };

  const runAi = async () => {
    if (!gridEmpty && !confirm(`AI ще замени текущата рисунка на ${floorName(floor)} със собствено разчитане на плана. Ctrl+Z я връща. Продължавам ли?`)) return;
    const ctl = new AbortController();
    aiAbort.current = ctl;
    setAi({ status: 'loading' });
    try {
      const result = await generateFromPlan(ctl.signal);
      s.set({ view: '2d', bgOpacity: Math.min(useProject.getState().bgOpacity, 0.5), tool: 'select' });
      setAi({ status: 'done', result });
    } catch (e) {
      setAi((e as Error).name === 'AbortError' ? { status: 'idle' } : { status: 'error', error: (e as Error).message });
    } finally {
      aiAbort.current = null;
    }
  };

  const drawMyself = () => {
    setAi({ status: 'idle' });
    s.set({ view: '2d', tool: 'room', brushMode: 'rect' });
  };

  const start = () => {
    const hasExit = s.grid.cells.some((c) => c === C.EXIT);
    const placed = s.rooms.filter((r) => s.grid.rooms.includes(r.id));
    if (!hasExit) return setError('Добавете поне един изход (на партера).');
    if (!placed.length || totalPeople === 0) return setError('Добавете поне една стая с хора.');
    // People on a floor whose stairs do not connect down to the ground could never get out.
    const stranded = issues.find((i) => peoplePerFloor.slice(i.floor).some((n) => n > 0));
    if (stranded) return setError(stranded.text);
    setError(null);
    startSimulation();
  };

  return (
    <div>
      <Section step={1} title={floors > 1 ? `План на сградата · ${floorName(floor)}` : 'План на сградата'}>
        <label className="block cursor-pointer rounded-lg border-2 border-dashed border-line px-3 py-3 text-center text-[1rem] text-ink-dim hover:border-accent hover:text-ink">
          {background ? 'Смени плана (PNG/JPG)' : floors > 1 ? `Качи план за ${floorName(floor)} (PNG/JPG)` : 'Качи евакуационен план (PNG/JPG)'}
          <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
        {uploadError && <p className="mt-2 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600">{uploadError}</p>}
        {background && (
          <div className="mt-3 rounded-lg bg-raised p-3">
            <p className="mb-2 text-[1rem] font-semibold text-ink">
              {gridEmpty ? 'Как да изградим сградата?' : 'Разчитане с AI'}
            </p>
            {ai.status === 'loading' ? (
              <div>
                <p className="flex items-center gap-2 text-[1rem] text-ink">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                  AI разчита плана... (до около минута)
                </p>
                <Btn variant="ghost" onClick={() => aiAbort.current?.abort()} className="mt-2">Откажи</Btn>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Btn variant="primary" onClick={runAi} className="w-full">
                  {gridEmpty ? 'Създай 2D и 3D с AI' : 'Разчети отново с AI'}
                </Btn>
                {gridEmpty && <Btn onClick={drawMyself} className="w-full">Ще го начертая сам</Btn>}
                <p className="text-sm text-ink-dim">
                  {gridEmpty
                    ? 'AI очертава стени, стаи, врати, изходи и стълби по снимката - 3D изгледът се прави от същата решетка. После всичко се поправя с инструментите за рисуване.'
                    : 'Рисуването с инструментите вдясно остава винаги достъпно, а Ctrl+Z връща предишната версия.'}
                </p>
              </div>
            )}
            {ai.status === 'error' && <p className="mt-2 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600">{ai.error}</p>}
            {ai.status === 'done' && ai.result && (
              <div className="mt-2 space-y-2">
                <p className="rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-700">
                  Готово: {ai.result.stats.rooms} стаи, {ai.result.stats.doors} врати, {ai.result.stats.exits} изхода
                  {ai.result.stats.stairs ? `, ${ai.result.stats.stairs} стълби` : ''}. Сравни с плана в 2D и поправи каквото трябва. Броят хора по стаи е по подразбиране - провери го.
                </p>
                {ai.result.notes && <p className="text-sm text-ink-dim">AI: {ai.result.notes}</p>}
                {ai.result.warnings.map((w) => (
                  <p key={w} className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700">{w}</p>
                ))}
                <div className="flex gap-1.5">
                  <Btn onClick={() => s.set({ view: '3d' })} className="flex-1">Виж 3D</Btn>
                  <Btn onClick={() => s.set({ view: '2d', tool: 'select' })} className="flex-1">Поправи в 2D</Btn>
                </div>
              </div>
            )}
          </div>
        )}
        <div className="mt-2 flex items-center justify-between text-[1rem]">
          <span className="text-ink-dim">Ширина на сградата</span>
          <span>
            <input type="number" min={5} max={200} value={widthM} onChange={(e) => setWidthM(Number(e.target.value) || 40)} className="w-16 rounded-md border border-line bg-raised px-2 py-1 text-right text-ink" /> m
          </span>
        </div>
        {background && (
          <div className="mt-2 flex items-center gap-2 text-[1rem]">
            <span className="text-ink-dim">Прозрачност</span>
            <input type="range" min={0} max={1} step={0.05} value={s.bgOpacity} onChange={(e) => s.set({ bgOpacity: Number(e.target.value) })} className="flex-1 accent-accent" />
            <Btn variant="ghost" onClick={() => s.setBackground(null)}>✕</Btn>
          </div>
        )}
        {s.saveWarning && <p className="mt-2 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700">{s.saveWarning}</p>}
        {s.loadWarning && (
          <div className="mt-2 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-700">
            <p>{s.loadWarning}</p>
            <div className="mt-2 flex gap-2">
              <Btn variant="ghost" onClick={() => downloadLocalCopy('broken')}>Свали копието</Btn>
              <Btn variant="ghost" onClick={() => s.set({ loadWarning: null })}>Разбрах</Btn>
            </div>
          </div>
        )}
        <p className="mt-2 text-sm text-ink-dim">
          Решетка {s.grid.w}×{s.grid.floorH ?? s.grid.h} клетки · {s.grid.w * CELL_SIZE}×{(s.grid.floorH ?? s.grid.h) * CELL_SIZE} m на етаж (1 клетка = {CELL_SIZE} m)
        </p>
      </Section>

      <Section step={2} title={`Етажи · ${floors}`}>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: floors }, (_, f) => (
            <button
              key={f}
              type="button"
              onClick={() => s.set({ activeFloor: f })}
              className={`rounded-lg px-2.5 py-1.5 text-[1rem] ring-1 transition ${f === floor ? 'bg-accent text-white ring-accent' : 'bg-raised text-ink ring-line hover:bg-line'}`}
            >
              {floorName(f)}
              {floors > 1 && <span className="ml-1.5 text-sm opacity-70 tabular-nums">{peoplePerFloor[f]}</span>}
            </button>
          ))}
        </div>
        <div className="mt-3 space-y-1.5">
          <Btn onClick={() => s.addFloor(false)} disabled={floors >= MAX_FLOORS} className="w-full">+ Добави празен етаж</Btn>
          <Btn onClick={() => s.addFloor(true)} disabled={floors >= MAX_FLOORS} className="w-full" title="Стените, стаите и стълбите се копират - стълбището остава точно над предишното">
            + Нов етаж като копие на {floorName(floor)}
          </Btn>
          {floors > 1 && (
            <>
              <div className="grid grid-cols-3 gap-1.5">
                <Btn onClick={() => s.shiftFloor(floor, -1, 0)} disabled={!shiftBounds || shiftBounds.minDx >= 0} className="w-full">←</Btn>
                <Btn onClick={() => s.shiftFloor(floor, 0, -1)} disabled={!shiftBounds || shiftBounds.minDy >= 0} className="w-full">↑</Btn>
                <Btn onClick={() => s.shiftFloor(floor, 1, 0)} disabled={!shiftBounds || shiftBounds.maxDx <= 0} className="w-full">→</Btn>
                <div />
                <Btn onClick={() => s.shiftFloor(floor, 0, 1)} disabled={!shiftBounds || shiftBounds.maxDy <= 0} className="w-full">↓</Btn>
                <div />
              </div>
              <Btn onClick={() => s.alignFloor(floor)} className="w-full" disabled={floor === 0 || !alignmentDelta || (alignmentDelta.dx === 0 && alignmentDelta.dy === 0)} title="Подравнява максимален брой стълбищни клетки, без да изрязва съдържание">
                Подравни стълбите с {floorName(Math.max(0, floor - 1))}
              </Btn>
              <Btn
                variant="danger"
                className="w-full"
                onClick={() => confirm(`Да премахна ${floorName(floor)} заедно със стаите му? Това не може да се върне.`) && s.removeFloor(floor)}
              >
                Премахни {floorName(floor)}
              </Btn>
            </>
          )}
        </div>
        {issues.map((i) => {
          const alignment = floorAlignment(s.grid, i.floor);
          const canAlign = alignment && (alignment.dx !== 0 || alignment.dy !== 0);
          const hasStairsOnBothFloors = floorView(s.grid, i.floor - 1).cells.includes(C.STAIRS)
            && floorView(s.grid, i.floor).cells.includes(C.STAIRS);
          return (
            <div key={i.text} className="mt-2 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
              <p>{i.text}</p>
              {canAlign ? (
                <Btn variant="primary" className="mt-2 w-full" onClick={() => s.alignFloor(i.floor)}>
                  Подравни автоматично · {alignment.overlap}/{Math.max(alignment.currentStairs, alignment.belowStairs)} клетки · {alignment.dx > 0 ? '+' : ''}{alignment.dx} хор. / {alignment.dy > 0 ? '+' : ''}{alignment.dy} верт.
                </Btn>
              ) : (
                <div className="mt-1 text-xs text-amber-800">
                  <p>
                    {!hasStairsOnBothFloors
                      ? 'Добави стълби и на двата етажа, за да могат да се свържат.'
                      : alignment
                        ? 'Етажът вече е на най-добрата цялостна позиция. За да съвпаднат още клетки, коригирай самите стълби.'
                        : 'Няма безопасно цялостно преместване без изрязване на плана. Коригирай самите стълби.'}
                  </p>
                  {hasStairsOnBothFloors && (
                    <Btn
                      variant="primary"
                      className="mt-2 w-full"
                      onClick={() => s.set({ activeFloor: i.floor, view: '2d', tool: 'select' })}
                    >
                      Отвори {floorName(i.floor)} в 2D за корекция
                    </Btn>
                  )}
                  {hasStairsOnBothFloors && (
                    <p className="mt-1">
                      Синият пунктиран контур показва стълбите отдолу. Ползвай „Стълби“ за липсващи клетки и „Гума“ за излишни клетки, докато съвпаднат.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <p className="mt-2 text-sm text-ink-dim">
          {floors > 1
            ? 'Чертаеш етажа, избран горе (или от лентата над плана). Хората слизат по стълбите, които са точно едно над друго; изходите се рисуват на партера.'
            : 'Сградата е на един етаж. Добави етаж, за да чертаеш или качваш план за всеки етаж отделно.'}
        </p>
        {upperExitFloors(s.grid).length > 0 && (
          <p className="mt-2 rounded-md bg-sky-500/10 px-3 py-2 text-sm text-sky-700">
            Има изход на {upperExitFloors(s.grid).map((f) => floorName(f)).join(', ')}. Той се счита за външна аварийна стълба: хората го ползват директно и излизат веднага. Остави го само ако такава наистина има.
          </p>
        )}
        <details className="mt-3 rounded-lg bg-raised px-3 py-2 text-sm text-ink-dim">
          <summary className="cursor-pointer select-none text-[1rem] font-semibold text-ink">Как се работи с повече от един етаж</summary>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5">
            <li>Избери етажа от бутоните по-горе (или от лентата над плана). Всичко, което чертаеш, качваш като план или добавяш като стая, отива на <b>избрания</b> етаж.</li>
            <li>Ако етажите си приличат, ползвай „Нов етаж като копие“ - стените, стаите и стълбите се копират, а стълбището остава точно над предишното. После само поправяш разликите.</li>
            <li>Стълбите трябва да са на <b>едно и също място</b> на всеки етаж. Ако етажът може да се премести, предупреждението предлага автоматично подравняване. Ако вече е на най-добрата позиция, бутонът отваря проблемния етаж в 2D; синият пунктиран контур показва къде трябва да съвпаднат стълбите. Добави липсващи клетки със „Стълби“ и изтрий излишните с „Гума“.</li>
            <li>Изходите обикновено са на партера, а горните етажи излизат през стълбите, затова всеки етаж с хора трябва да има стълби надолу. Изход, начертан на горен етаж, се счита за външна аварийна стълба: хората го ползват директно. Асансьори не се моделират, така че етаж само с асансьор няма път.</li>
            <li>Стаите и хората се задават за всеки етаж отделно. Числото до името на етажа показва колко души са на него.</li>
            <li>Бедствието започва на етажа на цветния конус (мести се с влачене, след като избереш етажа) и <b>не преминава на друг етаж</b>.</li>
            <li>В 3D етажите лежат на земята един до друг. Кликни заглавието на етаж, за да го избереш. „Като сграда“ ги наслагва, а „Само този етаж“ показва само избрания.</li>
            <li>Преди старт ще те предупредим, ако стълбите на някой етаж не се свързват с долния.</li>
          </ol>
        </details>
      </Section>

      <Section title="Имена на изходите">
        {exits.length === 0 ? (
          <p className="text-sm text-ink-dim">Начертай изход с инструмента „Изход“, за да зададеш име.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-ink-dim">По подразбиране изходите са подредени отляво надясно. Въведи разпознаваеми имена; те ще се използват и в резултатите и отчета.</p>
            {exits.map((exit) => {
              const key = exitKey(s.grid, exit);
              const defaultName = `Изход ${exit.name}`;
              return (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 text-ink">
                    {defaultName}
                      <span className="ml-1 text-ink-dim">· {floorName(exit.floor)}, клетка {Math.round(exit.cx) + 1},{Math.round(exit.cy) + 1}</span>
                  </span>
                  <input
                    value={s.exitNames[key] ?? ''}
                    placeholder={defaultName}
                    maxLength={60}
                    onChange={(e) => s.setExitName(key, e.target.value)}
                    aria-label={`Име за ${defaultName}${floors > 1 ? `, ${floorName(exit.floor)}` : ''}`}
                    className="w-36 rounded-md border border-line bg-raised px-2 py-1 text-ink"
                  />
                </label>
              );
            })}
          </div>
        )}
      </Section>

      <Section step={3} title={`Стаи и хора · ${totalPeople} души`}>
        <div className="mb-3 grid grid-cols-2 gap-2 rounded-lg bg-raised p-2 text-sm">
          <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-ink">
            <input type="checkbox" checked={s.showRoomNames} onChange={(e) => s.set({ showRoomNames: e.target.checked })} className="accent-accent" />
            Имена на стаите
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-ink">
            <input type="checkbox" checked={s.showRoomCounts} onChange={(e) => s.set({ showRoomCounts: e.target.checked })} className="accent-accent" />
            Брой хора
          </label>
        </div>
        {s.rooms.length > 12 && <p className="mb-2 px-2 text-xs text-ink-dim">Когато се виждат над 12 стаи, в 3D се надписва само избраната, за да не се застъпват етикетите. Имената и броят на всички стаи остават в този списък.</p>}
        <div className="max-h-44 space-y-1 overflow-y-auto">
          {s.rooms.length === 0 && <p className="text-sm text-ink-dim">Още няма стаи. Използвай инструмента „Стая“.</p>}
          {s.rooms.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => s.set({ selectedRoom: r.id, activeFloor: roomOnFloor.get(r.id) ?? floor })}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[1rem] ${r.id === s.selectedRoom ? 'bg-raised ring-1 ring-accent/50' : 'hover:bg-raised'}`}
            >
              <span className="h-3 w-3 rounded-sm" style={{ background: r.color }} />
              <span className="flex-1 font-medium text-ink">{r.name}</span>
              {floors > 1 && <span className="text-sm text-ink-dim">{floorName(roomOnFloor.get(r.id) ?? 0)}</span>}
              <span className="text-sm tabular-nums text-ink-dim">{people(r)}</span>
            </button>
          ))}
        </div>
        {room && (
          <div className="mt-3 space-y-2 rounded-lg bg-raised p-3">
            <input value={room.name} onChange={(e) => s.updateRoom(room.id, { name: e.target.value })} className="w-full rounded-md border border-line bg-surface px-2 py-1 text-[1rem] font-semibold text-ink" />
            <NumberField label="Възрастни" value={room.adults} onChange={(v) => s.updateRoom(room.id, { adults: v })} max={Number.MAX_SAFE_INTEGER} />
            <NumberField label="Деца" value={room.children} onChange={(v) => s.updateRoom(room.id, { children: v })} />
            <NumberField label="С намалена подвижност" value={room.reducedMobility} onChange={(v) => s.updateRoom(room.id, { reducedMobility: v })} max={Number.MAX_SAFE_INTEGER} />
            <div className="flex justify-between pt-1">
              <Btn variant="ghost" onClick={() => s.set({ tool: 'room', brushMode: 'brush' })}>Дорисувай</Btn>
              <Btn variant="danger" onClick={() => s.deleteRoom(room.id)}>Изтрий</Btn>
            </div>
          </div>
        )}
      </Section>

      <Section step={4} title="Бедствие">
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.keys(DISASTERS) as DisasterType[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => s.set({ scenario: { ...s.scenario, type: d } })}
              className={`rounded-lg px-2 py-2 text-[1rem] ring-1 transition ${s.scenario.type === d ? 'bg-accent text-white ring-accent' : 'bg-raised text-ink ring-line hover:bg-line'}`}
            >
              {DISASTERS[d].label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-sm text-ink-dim">{DISASTERS[s.scenario.type].desc}</p>
        <p className="mt-2 text-sm text-ink-dim">
          Влачи цветната точка на плана, за да зададеш откъде започва.
          {floors > 1 && ' Бедствието засяга етажа, на който започва (точката се влачи по избрания етаж).'}
        </p>
        {floors > 1 && (
          <div className="mt-3">
            <Btn variant="ghost" className="w-full" disabled={!canPlaceOriginOnFloor || originAlreadyOnFloor} onClick={() => s.set({ scenario: { ...s.scenario, origin: originCellOnFloor } })}>
              {originAlreadyOnFloor ? `Началната точка е на ${floorName(floor)}` : `Премести точката на ${floorName(floor)}`}
            </Btn>
            <p className="mt-1 text-sm text-ink-dim">След това можеш да я плъзнеш върху желаната проходима клетка.</p>
          </div>
        )}
        <label className="mt-3 block text-[1rem]">
          <span className="flex items-center justify-between">
            <span className="text-ink-dim">Скорост на разпространение</span>
            <span className="font-semibold tabular-nums text-ink">{fmtSpread(s.scenario.spreadSpeed || 1)}</span>
          </span>
          <input
            type="range"
            min={SPREAD_MIN}
            max={SPREAD_MAX}
            step={SPREAD_STEP}
            value={s.scenario.spreadSpeed || 1}
            onChange={(e) => s.set({ scenario: { ...s.scenario, spreadSpeed: Number(e.target.value) } })}
            className="mt-1 w-full accent-accent"
          />
          <span className="flex justify-between text-sm text-ink-dim">
            <span>Бавно</span>
            <span>Бързо</span>
          </span>
        </label>
        <label className="mt-3 flex items-center justify-between text-[1rem]">
          <span className="text-ink-dim">Целево време</span>
          <span>
            <input type="number" min={30} max={1200} step={10} value={s.targetTime} onChange={(e) => s.set({ targetTime: Number(e.target.value) || 180 })} className="w-20 rounded-md border border-line bg-raised px-2 py-1 text-right text-ink tabular-nums" /> s
            <span className="ml-1 text-sm text-ink-dim">({fmtTime(s.targetTime)})</span>
          </span>
        </label>
      </Section>

      <div className="px-4 py-4">
        {error && <p className="mb-2 rounded-md bg-red-500/10 px-3 py-2 text-[1rem] text-red-600">{error}</p>}
        <Btn variant="primary" onClick={start} className="w-full py-3 text-[1rem] font-display">Старт на симулацията</Btn>
      </div>

      <MonteCarloPanel />
    </div>
  );
}
