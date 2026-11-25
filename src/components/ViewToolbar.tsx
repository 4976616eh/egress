import { useProject } from '../store/useProject';
import { AGENT_COLORS, AGENT_LABELS, FOLLOW_COLOR, TRAPPED_COLOR } from './labels';
import type { AgentKind } from '../sim/types';
import { floorCount, floorName } from '../sim/floors';

const seg = (active: boolean, disabled = false) =>
  `px-3 py-1.5 text-sm font-medium transition ${
    disabled ? 'text-ink-dim opacity-40 cursor-not-allowed' : active ? 'bg-accent text-white' : 'text-ink-dim hover:bg-black/5 hover:text-ink'
  }`;

const legendKinds = Object.keys(AGENT_COLORS) as AgentKind[];

export default function ViewToolbar() {
  const view = useProject((s) => s.view);
  const lowWalls = useProject((s) => s.lowWalls);
  const preset = useProject((s) => s.camera.preset);
  const selectedRoom = useProject((s) => s.selectedRoom);
  const mode = useProject((s) => s.mode);
  const floors = useProject((s) => floorCount(s.grid));
  const activeFloor = useProject((s) => s.activeFloor);
  const explode = useProject((s) => s.explode);
  const layout = useProject((s) => s.layout);
  const onlyActive = useProject((s) => s.onlyActiveFloor);
  const set = useProject((s) => s.set);
  const setCamera = useProject((s) => s.setCamera);

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center gap-2">
        <div className="pointer-events-auto flex overflow-hidden rounded-lg bg-surface/95 shadow-lg shadow-black/10 ring-1 ring-line backdrop-blur">
          <button type="button" className={seg(view === '2d')} onClick={() => set({ view: '2d' })}>2D план</button>
          <button type="button" className={seg(view === '3d')} onClick={() => set({ view: '3d' })}>3D сграда</button>
        </div>
        <div className="pointer-events-auto flex overflow-hidden rounded-lg bg-surface/95 shadow-lg shadow-black/10 ring-1 ring-line backdrop-blur">
          <button type="button" className={seg(preset === 'iso', view !== '3d')} disabled={view !== '3d'} onClick={() => setCamera('iso')}>
            Изометрия
          </button>
          <button type="button" className={seg(preset === 'top', view !== '3d')} disabled={view !== '3d'} onClick={() => setCamera('top')}>
            Отгоре
          </button>
          <button
            type="button"
            className={seg(preset === 'follow', view !== '3d' || selectedRoom === null)}
            disabled={view !== '3d' || selectedRoom === null}
            title={view !== '3d' ? 'Само в 3D изглед' : selectedRoom === null ? 'Избери стая първо' : 'Камерата следва стаята, а хората в нея са в бяло'}
            onClick={() => setCamera('follow')}
          >
            Следи стая
          </button>
          <button type="button" className={seg(lowWalls, view !== '3d')} disabled={view !== '3d'} onClick={() => set({ lowWalls: !lowWalls })}>
            Срежи стените
          </button>
        </div>
      </div>
      {floors > 1 && (
        <div className="pointer-events-none absolute inset-x-0 top-16 z-10 flex flex-wrap justify-center gap-2">
          {floors > 1 && <div className="pointer-events-auto flex overflow-hidden rounded-lg bg-surface/95 shadow-lg shadow-black/10 ring-1 ring-line backdrop-blur">
            {Array.from({ length: floors }, (_, f) => (
              <button key={f} type="button" className={seg(f === activeFloor)} onClick={() => set({ activeFloor: f })} title={view === '3d' ? 'Този етаж се редактира и (при „Само този етаж“) се показва сам' : undefined}>
                {floorName(f)}
              </button>
            ))}
          </div>}
          {view === '3d' && (
            <div className="pointer-events-auto flex items-center gap-3 rounded-lg bg-surface/95 px-3 py-1.5 text-sm text-ink-dim shadow-lg shadow-black/10 ring-1 ring-line backdrop-blur">
              {floors > 1 && <>
              <div className="flex overflow-hidden rounded-md ring-1 ring-line">
                <button type="button" className={seg(layout === 'spread')} onClick={() => set({ layout: 'spread', camera: { preset: 'iso', n: useProject.getState().camera.n + 1 } })} title="Всеки етаж лежи на земята, един до друг - нищо не виси във въздуха">
                  Един до друг
                </button>
                <button type="button" className={seg(layout === 'stack')} onClick={() => set({ layout: 'stack', camera: { preset: 'iso', n: useProject.getState().camera.n + 1 } })} title="Етажите са един върху друг като в истинска сграда">
                  Като сграда
                </button>
              </div>
              {layout === 'stack' && (
                <label className="flex items-center gap-2">
                  Раздалечи
                  <input type="range" min={0} max={8} step={0.5} value={explode} onChange={(e) => set({ explode: Number(e.target.value) })} className="w-24 accent-accent" />
                </label>
              )}
              <button type="button" className={`rounded-md px-2 py-0.5 font-medium transition ${onlyActive ? 'bg-accent text-white' : 'hover:bg-black/5 hover:text-ink'}`} onClick={() => set({ onlyActiveFloor: !onlyActive })}>
                Само този етаж
              </button>
              </>}
            </div>
          )}
        </div>
      )}
      <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex flex-wrap gap-3 rounded-lg bg-surface/95 px-3 py-2 text-xs text-ink-dim shadow-lg shadow-black/10 ring-1 ring-line backdrop-blur">
        {legendKinds.map((k) => (
          <span key={k} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: AGENT_COLORS[k] }} />{AGENT_LABELS[k]}</span>
        ))}
        {preset === 'follow' && selectedRoom !== null && (
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full ring-1 ring-ink-dim" style={{ background: FOLLOW_COLOR }} />Следена стая</span>
        )}
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: TRAPPED_COLOR }} />В опасност</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-green-600" />Изход</span>
        {mode === 'results' && (
          <span className="flex items-center gap-1.5">
            Чакане: <span className="h-2.5 w-16 rounded-sm" style={{ background: 'linear-gradient(90deg,#22c55e,#facc15,#dc2626)' }} />
          </span>
        )}
      </div>
    </>
  );
}
