import { useProject, type Tool } from '../store/useProject';
import { Btn } from './ui';

const TOOLS: { id: Tool; label: string; swatch: string; hint: string }[] = [
  { id: 'select', label: 'Избор', swatch: '#ffffff', hint: 'Кликни стая, за да зададеш хората в нея.' },
  { id: 'room', label: 'Стая', swatch: '#bfdbfe', hint: 'Влачи правоъгълник - създава стая със стени около нея.' },
  { id: 'fill', label: 'Запълни стая', swatch: '#fde68a', hint: 'Кликни вътре в празна площ, затворена от стени - превръща я в стая.' },
  { id: 'corridor', label: 'Коридор', swatch: '#e2e8f0', hint: 'Проходима площ, която не е стая.' },
  { id: 'wall', label: 'Стена', swatch: '#334155', hint: 'Непроходима стена.' },
  { id: 'line', label: 'Линия', swatch: '#64748b', hint: 'Влачи от точка до точка - права стена. Режим „Линия“ работи и с останалите инструменти.' },
  { id: 'door', label: 'Врата', swatch: '#d9aa64', hint: 'Отвор в стена. Рисувай върху стената на стаята.' },
  { id: 'exit', label: 'Изход', swatch: '#16a34a', hint: 'Изход навън. Хората се насочват към най-близкия безопасен.' },
  { id: 'stairs', label: 'Стълби', swatch: '#a78bfa', hint: 'Влачи от коридора към стената - посоката на влаченето определя накъде се качват стълбите в 3D.' },
  { id: 'erase', label: 'Гума', swatch: '#f8fafc', hint: 'Изтрива клетки.' },
];

export default function ToolPanel() {
  const s = useProject();

  const pickTool = (t: Tool) => {
    const brushMode = t === 'room' || t === 'corridor' || t === 'stairs' ? 'rect' : t === 'line' ? 'line' : t === 'select' ? s.brushMode : 'brush';
    s.set({ tool: t, brushMode });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-4 py-4">
        <h2 className="text-[1rem] font-semibold text-ink">Инструменти за рисуване</h2>
        <p className="mt-1 text-sm text-ink-dim">Избери инструмент, после рисувай върху плана.</p>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto px-2.5 py-3">
        {TOOLS.map((t) => {
          const active = s.tool === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => pickTool(t.id)}
              className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition ${
                active ? 'bg-accent text-white' : 'text-ink ring-1 ring-transparent hover:bg-raised hover:ring-line'
              }`}
            >
              <span className="mt-0.5 h-6 w-6 shrink-0 rounded-md ring-1 ring-black/10" style={{ background: t.swatch }} />
              <span className="min-w-0">
                <span className="block text-[1rem] font-semibold leading-tight">{t.label}</span>
                <span className={`mt-0.5 block text-sm leading-snug ${active ? 'text-white/70' : 'text-ink-dim'}`}>{t.hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="border-t border-line px-4 py-3">
        {s.tool !== 'select' && (
          <div className="space-y-1.5">
            <div className="flex gap-1.5">
              <Btn active={s.brushMode === 'brush'} onClick={() => s.set({ brushMode: 'brush' })} className="flex-1 whitespace-nowrap px-2!">Четка</Btn>
              <Btn active={s.brushMode === 'rect'} onClick={() => s.set({ brushMode: 'rect' })} className="flex-1 whitespace-nowrap px-2!">Правоъгълник</Btn>
              <Btn active={s.brushMode === 'line'} onClick={() => s.set({ brushMode: 'line' })} className="flex-1 whitespace-nowrap px-2!">Линия</Btn>
            </div>
          </div>
        )}
        <div className="mt-2">
          <Btn onClick={s.undo} disabled={!s.undoStack.length} title="Отмени (Ctrl+Z)" className="w-full">↶ Отмени</Btn>
        </div>
        {s.view === '3d' && s.tool !== 'select' && <p className="mt-2 text-sm text-amber-600">Рисуването работи в 2D изгледа.</p>}
      </div>
    </div>
  );
}
