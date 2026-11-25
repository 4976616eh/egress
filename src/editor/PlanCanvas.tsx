import { useEffect, useMemo, useRef, useState } from 'react';
import { useProject } from '../store/useProject';
import { simRef } from '../store/simControl';
import { defaultOriginCell, isWalkable, roomCentroids } from '../sim/grid';
import { floorCount, floorOffset, floorView } from '../sim/floors';
import { C } from '../sim/types';
import { DISASTERS } from '../components/labels';
import { drawPlan, type Rect } from './render2d';
import { fillRect, floodRoomRegion, forLine, isFillable, paintCell, paintRoomRect, paintStairsRect } from './tools';

function useImage(url: string | null) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!url) {
      setImg(null);
      return;
    }
    // A slow earlier image must not replace a newer one that already loaded.
    let cancelled = false;
    const i = new Image();
    i.onload = () => {
      if (!cancelled) setImg(i);
    };
    i.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);
  return img;
}

export default function PlanCanvas() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const building = useProject((s) => s.grid);
  const gridVersion = useProject((s) => s.gridVersion);
  const activeFloor = useProject((s) => Math.min(s.activeFloor, floorCount(s.grid) - 1));
  const background = useProject((s) => s.backgrounds[Math.min(s.activeFloor, floorCount(s.grid) - 1)] ?? null);
  const bg = useImage(background);
  // The floor being drawn: a live view into the building, so painting on it edits the building.
  const grid = useMemo(() => floorView(building, activeFloor), [building, activeFloor]);
  const stairOverlay = useMemo(
    () => activeFloor > 0 ? floorView(building, activeFloor - 1) : null,
    [building, activeFloor],
  );
  /** Index of this floor's first cell in the building (hazard origin and sim state use building indices). */
  const offset = floorOffset(building, activeFloor);

  const drag = useRef<{ start: number; last: number; mode: 'brush' | 'rect' | 'line' } | null>(null);
  const preview = useRef<Rect | null>(null);
  const hover = useRef<number | null>(null);
  const draggingOrigin = useRef(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panDrag = useRef<{ startX: number; startY: number; panX: number; panY: number; moved: boolean } | null>(null);

  useEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Non-passive listener so we can preventDefault and turn wheel-scroll into zoom.
  useEffect(() => {
    const el = wrapRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => Math.min(4, Math.max(0.5, z * (e.deltaY < 0 ? 1.12 : 1 / 1.12))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const cs = Math.max(2, Math.floor(Math.min((size.w - 32) / grid.w, (size.h - 32) / grid.h)));
  const centroids = useMemo(() => roomCentroids(grid), [grid, gridVersion]);
  const defaultOrigin = useMemo(() => defaultOriginCell(building), [building, gridVersion]);
  /** Hazard start as a cell of the drawn floor, or null when it is on another floor. */
  const localOrigin = (origin: number | null) => {
    const fallback = defaultOrigin - offset;
    const validLocal = (k: number) => k >= 0 && k < grid.w * grid.h && isWalkable(grid.cells[k]);
    if (origin === null || origin < 0 || origin >= building.cells.length || !isWalkable(building.cells[origin])) {
      return validLocal(fallback) ? fallback : null;
    }
    const k = origin - offset;
    return validLocal(k) ? k : null;
  };

  // Redraw every frame: cheap (one image blit + agents) and keeps the live sim smooth.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = grid.w * cs * dpr;
    canvas.height = grid.h * cs * dpr;
    canvas.style.width = `${grid.w * cs}px`;
    canvas.style.height = `${grid.h * cs}px`;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    const loop = () => {
      const s = useProject.getState();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawPlan(ctx, {
        g: grid,
        rooms: s.rooms,
        cs,
        bg,
        bgOpacity: s.bgOpacity,
        sim: s.mode !== 'edit' ? simRef.current : null,
        hazardOverlay: s.mode === 'run',
        heat: s.mode === 'results' && s.results ? s.results.heat : null,
        heatMax: s.results?.heatMax ?? 0,
        cellOffset: offset,
        origin: localOrigin(s.scenario.origin),
        originColor: DISASTERS[s.scenario.type].color,
        preview: preview.current,
        hover: hover.current,
        editing: s.mode === 'edit',
        stairOverlay: s.mode === 'edit' ? stairOverlay : null,
        selectedRoom: s.selectedRoom,
        showRoomNames: s.showRoomNames,
        showRoomCounts: s.showRoomCounts,
        centroids,
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [grid, cs, bg, centroids, defaultOrigin, offset, stairOverlay]);

  // Cell size in on-screen px, derived from the rendered (zoomed) rect - stays correct at any zoom level.
  const toCell = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    const cellPx = r.width / grid.w;
    const x = Math.floor((e.clientX - r.left) / cellPx);
    const y = Math.floor((e.clientY - r.top) / cellPx);
    if (x < 0 || y < 0 || x >= grid.w || y >= grid.h) return null;
    return y * grid.w + x;
  };

  /** Distance in px from the pointer to the hazard-origin marker's center, for drag hit-testing. */
  const originDist = (e: { clientX: number; clientY: number }) => {
    const s = useProject.getState();
    const origin = localOrigin(s.scenario.origin);
    if (origin === null) return Infinity;
    const r = canvasRef.current!.getBoundingClientRect();
    const cellPx = r.width / grid.w;
    const ox = ((origin % grid.w) + 0.5) * cellPx;
    const oy = (((origin / grid.w) | 0) + 0.5) * cellPx;
    return Math.hypot(e.clientX - r.left - ox, e.clientY - r.top - oy);
  };
  const ORIGIN_HIT_R = (c: number) => Math.max(6, c * 0.9) + 4;

  const onDown = (e: React.PointerEvent) => {
    const s = useProject.getState();
    const originHit = s.mode === 'edit' && originDist(e) <= ORIGIN_HIT_R(cs * zoom);
    if (originHit) {
      const cell = toCell(e);
      if (cell === null) return;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      draggingOrigin.current = true;
      canvasRef.current!.style.cursor = 'grabbing';
      s.set({ scenario: { ...s.scenario, origin: cell + offset } });
      return;
    }
    // Middle-click always pans; the select tool pans on drag and selects on a plain click (see onUp).
    if (e.button === 1 || s.mode !== 'edit' || s.tool === 'select') {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      panDrag.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y, moved: false };
      canvasRef.current!.style.cursor = 'grabbing';
      return;
    }
    const cell = toCell(e);
    if (cell === null) return;
    if (s.tool === 'fill') {
      if (!isFillable(grid, cell)) return;
      const region = floodRoomRegion(grid, cell);
      if (!region) {
        alert('Тази област не е напълно затворена от стени - провери за пролука.');
        return;
      }
      s.pushUndo();
      const id = s.addRoom();
      for (const i of region) {
        grid.cells[i] = C.FLOOR;
        grid.rooms[i] = id;
      }
      s.bumpGrid();
      return;
    }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    s.pushUndo();
    // Rooms and stairs only make sense as rectangles; everything else can be drawn as a straight line.
    const mode = s.brushMode === 'line' && (s.tool === 'room' || s.tool === 'stairs') ? 'rect' : s.brushMode;
    drag.current = { start: cell, last: cell, mode };
    if (mode === 'brush') {
      const roomId = s.tool === 'room' ? (s.selectedRoom ?? s.addRoom()) : null;
      paintCell(grid, cell, s.tool, roomId);
      s.bumpGrid();
    } else {
      preview.current = { x0: cell % grid.w, y0: (cell / grid.w) | 0, x1: cell % grid.w, y1: (cell / grid.w) | 0, line: mode === 'line' };
    }
  };

  const onMove = (e: React.PointerEvent) => {
    const cell = toCell(e);
    hover.current = cell;
    if (panDrag.current) {
      const dx = e.clientX - panDrag.current.startX;
      const dy = e.clientY - panDrag.current.startY;
      if (Math.hypot(dx, dy) > 3) panDrag.current.moved = true;
      setPan({ x: panDrag.current.panX + dx, y: panDrag.current.panY + dy });
      return;
    }
    if (draggingOrigin.current) {
      if (cell !== null && isWalkable(grid.cells[cell])) {
        const s = useProject.getState();
        s.set({ scenario: { ...s.scenario, origin: cell + offset } });
      }
      return;
    }
    if (useProject.getState().mode === 'edit' && canvasRef.current) {
      canvasRef.current.style.cursor = originDist(e) <= ORIGIN_HIT_R(cs * zoom) ? 'grab' : cursor;
    }
    const d = drag.current;
    if (!d || cell === null || cell === d.last) return;
    const s = useProject.getState();
    if (d.mode === 'brush') {
      const roomId = s.tool === 'room' ? s.selectedRoom : null;
      forLine(d.last % grid.w, (d.last / grid.w) | 0, cell % grid.w, (cell / grid.w) | 0, (x, y) =>
        paintCell(grid, y * grid.w + x, s.tool, roomId),
      );
      s.bumpGrid();
    } else if (preview.current) {
      preview.current = { ...preview.current, x1: cell % grid.w, y1: (cell / grid.w) | 0 };
    }
    d.last = cell;
  };

  const onUp = (e: React.PointerEvent) => {
    if (panDrag.current) {
      const { moved } = panDrag.current;
      panDrag.current = null;
      if (canvasRef.current) canvasRef.current.style.cursor = cursor;
      if (!moved) {
        const s = useProject.getState();
        if (s.mode === 'edit' && s.tool === 'select') {
          const cell = toCell(e);
          if (cell !== null) {
            const r = grid.rooms[cell];
            s.set({ selectedRoom: r >= 0 ? r : null });
          }
        }
      }
      return;
    }
    if (draggingOrigin.current) {
      draggingOrigin.current = false;
      if (canvasRef.current) canvasRef.current.style.cursor = cursor;
      return;
    }
    const d = drag.current;
    drag.current = null;
    const p = preview.current;
    preview.current = null;
    if (!d || d.mode === 'brush' || !p) return;
    const s = useProject.getState();
    if (d.mode === 'line') {
      forLine(p.x0, p.y0, p.x1, p.y1, (x, y) => paintCell(grid, y * grid.w + x, s.tool, null));
      s.bumpGrid();
      return;
    }
    if (s.tool === 'room') {
      if (Math.abs(p.x1 - p.x0) < 2 || Math.abs(p.y1 - p.y0) < 2) return;
      const id = s.addRoom();
      paintRoomRect(grid, p.x0, p.y0, p.x1, p.y1, id);
    } else if (s.tool === 'stairs') {
      paintStairsRect(grid, p.x0, p.y0, p.x1, p.y1);
    } else {
      fillRect(grid, p.x0, p.y0, p.x1, p.y1, s.tool, null);
    }
    s.bumpGrid();
  };

  const tool = useProject((s) => s.tool);
  const mode = useProject((s) => s.mode);
  const cursor = mode !== 'edit' ? 'grab' : tool === 'select' ? 'grab' : tool === 'fill' ? 'pointer' : 'cell';

  return (
    <div ref={wrapRef} className="absolute inset-0 flex items-center justify-center overflow-hidden">
      <canvas
        ref={canvasRef}
        className="shrink-0 rounded-lg shadow-2xl shadow-black/20 ring-1 ring-black/10 bg-white touch-none"
        style={{ cursor, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'center' }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={() => (hover.current = null)}
      />
      <div className="pointer-events-none absolute bottom-3 right-3 z-10 flex overflow-hidden rounded-lg bg-surface/95 text-sm text-ink-dim shadow-lg shadow-black/10 ring-1 ring-line backdrop-blur">
        <button type="button" className="pointer-events-auto px-3 py-1.5 hover:bg-black/5 hover:text-ink" onClick={() => setZoom((z) => Math.max(0.5, z / 1.2))}>−</button>
        <button type="button" className="pointer-events-auto border-x border-line px-3 py-1.5 tabular-nums hover:bg-black/5 hover:text-ink" title="Нулирай изгледа" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>{Math.round(zoom * 100)}%</button>
        <button type="button" className="pointer-events-auto px-3 py-1.5 hover:bg-black/5 hover:text-ink" onClick={() => setZoom((z) => Math.min(4, z * 1.2))}>+</button>
      </div>
    </div>
  );
}
