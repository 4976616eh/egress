import { useEffect } from 'react';
import { useProject } from './store/useProject';
import { finishSimulation, simRef } from './store/simControl';
import { DT } from './sim/engine';
import Header from './components/Header';
import EditPanel from './components/EditPanel';
import ToolPanel from './components/ToolPanel';
import RunPanel from './components/RunPanel';
import ResultsPanel from './results/ResultsPanel';
import ViewToolbar from './components/ViewToolbar';
import PlanCanvas from './editor/PlanCanvas';
import Building3D from './viz3d/Building3D';
import ErrorBoundary, { ViewCrash } from './components/ErrorBoundary';

/** Drives the simulation with a fixed time step while in run mode. */
function useSimLoop() {
  const mode = useProject((s) => s.mode);
  const simId = useProject((s) => s.simId);
  useEffect(() => {
    if (mode !== 'run') return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let lastTick = 0;
    const loop = (now: number) => {
      const sim = simRef.current;
      if (!sim) return;
      const realDt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const { paused, speed } = useProject.getState();
      if (!paused) {
        acc += realDt * speed;
        let n = 0;
        while (acc >= DT && n < 400 && !sim.done) {
          sim.step(DT);
          acc -= DT;
          n++;
        }
      }
      if (now - lastTick > 100) {
        lastTick = now;
        useProject.setState((s) => ({ simTick: s.simTick + 1 }));
      }
      if (sim.done) return finishSimulation();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [mode, simId]);
}

export default function App() {
  const mode = useProject((s) => s.mode);
  const view = useProject((s) => s.view);
  useSimLoop();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && useProject.getState().mode === 'edit') {
        e.preventDefault();
        useProject.getState().undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex h-screen flex-col bg-base text-ink">
      <Header />
      <div className="flex min-h-0 flex-1">
        <aside className={`${mode === 'results' ? 'w-96' : 'w-[22rem]'} shrink-0 overflow-y-auto border-r border-line bg-surface`}>
          {mode === 'edit' ? <EditPanel /> : mode === 'run' ? <RunPanel /> : <ResultsPanel />}
        </aside>
        <main className="relative min-w-0 flex-1 bg-base">
          <ViewToolbar />
          {view === '2d' ? (
            <PlanCanvas />
          ) : (
            <ErrorBoundary resetKey={view} fallback={() => <ViewCrash />}>
              <Building3D />
            </ErrorBoundary>
          )}
        </main>
        {mode === 'edit' && (
          <aside className="w-80 shrink-0 border-l border-line bg-surface">
            <ToolPanel />
          </aside>
        )}
      </div>
    </div>
  );
}
