import { useEffect, useRef, useState } from 'react';
import { DT, Simulation } from '../sim/engine';
import { C } from '../sim/types';
import { roomCentroids } from '../sim/grid';
import { buildDemoSchool } from '../demo/demoSchool';
import { drawPlan } from '../editor/render2d';
import { fmtTime } from '../components/labels';

const CS = 8;
/** Simulated seconds per real second. */
const SPEED = 7;
const HOLD_AFTER_DONE = 2.5; // s

function createSim(seed: number) {
  const d = buildDemoSchool();
  // The hero should look hopeful: give the right wing its own exit so most people get out.
  for (let y = 20; y <= 23; y++) d.grid.cells[y * d.grid.w + d.grid.w - 1] = C.EXIT;
  return {
    d,
    sim: new Simulation(d.grid, d.rooms, { ...d.scenario, seed, spreadSpeed: 0.7 }),
    centroids: roomCentroids(d.grid),
  };
}

/** The real simulation engine and 2D renderer, running live as the page's centrepiece. */
export default function HeroSim() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [stats, setStats] = useState({ t: 0, out: 0, total: 0 });

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let world = createSim(1);
    let seed = 1;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = world.d.grid.w * CS * dpr;
    canvas.height = world.d.grid.h * CS * dpr;

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawPlan(ctx, {
        g: world.sim.g,
        rooms: world.sim.rooms,
        cs: CS,
        bg: null,
        bgOpacity: 0,
        sim: world.sim,
        hazardOverlay: true,
        heat: null,
        heatMax: 0,
        origin: world.d.scenario.origin,
        originColor: '#ea580c',
        preview: null,
        hover: null,
        editing: false,
        selectedRoom: null,
        showRoomNames: true,
        showRoomCounts: true,
        centroids: world.centroids,
      });
    };

    if (reduce) {
      // No motion: show a single frame partway through the evacuation.
      for (let i = 0; i < 500; i++) world.sim.step(DT);
      draw();
      setStats({ t: world.sim.t, out: world.sim.evacuated, total: world.sim.agents.length });
      return;
    }

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let hold = 0;
    let visible = true;
    let lastStats = 0;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { threshold: 0.05 });
    io.observe(canvas);

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!visible) return;
      if (world.sim.done) {
        hold += dt;
        if (hold > HOLD_AFTER_DONE) {
          hold = 0;
          world = createSim(++seed);
        }
      } else {
        acc += dt * SPEED;
        let n = 0;
        while (acc >= DT && n < 40 && !world.sim.done) {
          world.sim.step(DT);
          acc -= DT;
          n++;
        }
      }
      draw();
      if (now - lastStats > 200) {
        lastStats = now;
        setStats({ t: world.sim.t, out: world.sim.evacuated, total: world.sim.agents.length });
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, []);

  const pct = stats.total ? (stats.out / stats.total) * 100 : 0;

  return (
    <div className="relative">
      <div className="overflow-hidden rounded-2xl bg-white shadow-2xl shadow-accent/20 ring-1 ring-black/10">
        <div className="flex items-center gap-2 border-b border-line bg-raised px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <span className="ml-3 flex items-center gap-1.5 text-xs font-medium text-ink-dim">
            <span className="lp-blink h-2 w-2 rounded-full bg-red-500" />
            Пожар · симулация на живо
          </span>
          <span className="ml-auto font-display text-sm font-bold tabular-nums text-ink">{fmtTime(stats.t)}</span>
        </div>
        <canvas ref={ref} className="block h-auto w-full bg-white" aria-label="Симулация на евакуация на живо" />
        <div className="flex items-center gap-3 border-t border-line bg-surface px-4 py-2.5">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-raised">
            <div className="h-full rounded-full bg-gradient-to-r from-accent to-accent-bright transition-[width] duration-200" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-sm font-semibold tabular-nums text-ink">
            {stats.out}<span className="text-ink-dim">/{stats.total} навън</span>
          </span>
        </div>
      </div>

      <div className="lp-float absolute -left-3 top-16 hidden rounded-xl bg-white px-3 py-2 shadow-lg ring-1 ring-black/5 sm:block" style={{ ['--r' as string]: '-3deg' }}>
        <div className="text-[11px] font-medium uppercase tracking-wide text-ink-dim">Задръстване</div>
        <div className="text-sm font-semibold text-red-600">пред изхода</div>
      </div>
      <div className="lp-float absolute -right-3 bottom-20 hidden rounded-xl bg-white px-3 py-2 shadow-lg ring-1 ring-black/5 sm:block" style={{ ['--r' as string]: '3deg', ['--d' as string]: '1.2s' }}>
        <div className="text-[11px] font-medium uppercase tracking-wide text-ink-dim">Препоръка</div>
        <div className="text-sm font-semibold text-accent">Добави изход →</div>
      </div>
    </div>
  );
}
