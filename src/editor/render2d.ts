import { AGENT_STATE as S, C, type GridData, type Room } from '../sim/types';
import type { Simulation } from '../sim/engine';
import { forLine } from './tools';
import { AGENT_COLORS, DISASTERS, TRAPPED_COLOR } from '../components/labels';

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Draw the preview as a straight line of cells instead of a rectangle. */
  line?: boolean;
}

export interface DrawParams {
  g: GridData;
  rooms: Room[];
  cs: number;
  bg: HTMLImageElement | null;
  bgOpacity: number;
  sim: Simulation | null;
  hazardOverlay: boolean;
  heat: Float32Array | null;
  heatMax: number;
  origin: number | null;
  originColor: string;
  preview: Rect | null;
  hover: number | null;
  editing: boolean;
  selectedRoom: number | null;
  showRoomNames: boolean;
  showRoomCounts: boolean;
  centroids: Map<number, { x: number; y: number }>;
  /** Drawing one floor of a multi-storey building: index of this floor's first cell in the building (sim, hazard and heat arrays cover the whole building). */
  cellOffset?: number;
  /** Stair cells from the floor below, shown as a placement guide while editing. */
  stairOverlay?: GridData | null;
}

const off = typeof document !== 'undefined' ? document.createElement('canvas') : null;

export function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function heatColor(t: number): [number, number, number] {
  // green → yellow → red
  if (t < 0.5) {
    const k = t / 0.5;
    return [34 + (250 - 34) * k, 197 + (204 - 197) * k, 94 + (21 - 94) * k];
  }
  const k = (t - 0.5) / 0.5;
  return [250 + (220 - 250) * k, 204 + (38 - 204) * k, 21 + (38 - 21) * k];
}

/** Fills an RGBA buffer (1 px per cell) with cell, hazard and heat colors. Shared by 2D and 3D floor textures. */
export function fillCellPixels(
  data: Uint8ClampedArray,
  g: GridData,
  rooms: Room[],
  opts: { transparentVoid: boolean; translucent: boolean; selectedRoom?: number | null; sim?: Simulation | null; hazardOverlay?: boolean; heat?: Float32Array | null; heatMax?: number; cellOffset?: number },
) {
  const off0 = opts.cellOffset ?? 0;
  const roomRgb = new Map(rooms.map((r) => [r.id, hexToRgb(r.color)]));
  // Only while a run is live - like the 3D view, results mode shows plain rooms + the wait-time heatmap, not the frozen hazard.
  const hz = opts.hazardOverlay !== false ? opts.sim?.hazard : undefined;
  const n = g.w * g.h;
  for (let i = 0; i < n; i++) {
    const c = g.cells[i];
    let r = 0, gg = 0, b = 0, a = 0;
    switch (c) {
      case C.FLOOR: {
        const rgb = roomRgb.get(g.rooms[i]);
        if (rgb) {
          [r, gg, b] = rgb;
          if (g.rooms[i] === opts.selectedRoom) {
            r *= 0.8; gg *= 0.8; b *= 0.8;
          }
          a = opts.translucent ? 150 : 255;
        } else {
          r = 226; gg = 232; b = 240;
          a = opts.translucent ? 150 : 255;
        }
        break;
      }
      case C.WALL: r = 51; gg = 65; b = 85; a = 255; break;
      case C.EXIT: r = 22; gg = 163; b = 74; a = 255; break;
      case C.DOOR: r = 217; gg = 170; b = 100; a = 255; break;
      case C.STAIRS: {
        const stripe = ((i / g.w) | 0) % 2;
        r = stripe ? 167 : 196; gg = stripe ? 139 : 181; b = stripe ? 250 : 253; a = 255;
        break;
      }
      default:
        if (!opts.transparentVoid) { r = 241; gg = 245; b = 249; a = 255; }
    }
    // Hazard overlay.
    if (hz) {
      const L = hz.level[i + off0];
      const A = hz.aux[i + off0];
      let or = 0, og = 0, ob = 0, t = 0;
      if (hz.type === 'fire') {
        if (L > 0) { or = 239 + 10 * L; og = 68 + 60 * (1 - L); ob = 20; t = 0.95; }
        else if (A > 0) { or = 100; og = 100; ob = 110; t = 0.55 * A; }
      } else if (hz.type === 'earthquake') {
        if (L > 0) { or = 120; og = 84; ob = 52; t = 1; }
      } else if (hz.type === 'flood') {
        if (L > 0) { or = 37; og = 99; ob = 235; t = Math.min(0.9, 0.35 + L); }
      } else if (hz.type === 'gas') {
        if (L > 0) { or = 22; og = 163; ob = 74; t = 0.25 + 0.4 * L; }
      }
      if (t > 0) {
        r += (or - r) * t; gg += (og - gg) * t; b += (ob - b) * t;
        a = Math.max(a, 255 * t);
      }
    }
    if (opts.heat && opts.heatMax && opts.heat[i + off0] > 0) {
      const [hr, hg, hb] = heatColor(Math.sqrt(opts.heat[i + off0] / opts.heatMax));
      const t = 0.85;
      r += (hr - r) * t; gg += (hg - gg) * t; b += (hb - b) * t;
      a = 255;
    }
    const k = i * 4;
    data[k] = r; data[k + 1] = gg; data[k + 2] = b; data[k + 3] = a;
  }
}

export function drawPlan(ctx: CanvasRenderingContext2D, p: DrawParams) {
  const { g, cs } = p;
  const W = g.w * cs;
  const H = g.h * cs;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, W, H);
  if (p.bg) {
    ctx.globalAlpha = p.bgOpacity;
    ctx.drawImage(p.bg, 0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  // Cell layer: 1 px per cell, scaled up without smoothing.
  if (off) {
    if (off.width !== g.w || off.height !== g.h) {
      off.width = g.w;
      off.height = g.h;
    }
    const octx = off.getContext('2d')!;
    const img = octx.createImageData(g.w, g.h);
    fillCellPixels(img.data, g, p.rooms, {
      transparentVoid: true,
      translucent: !!p.bg,
      selectedRoom: p.selectedRoom,
      sim: p.sim,
      hazardOverlay: p.hazardOverlay,
      heat: p.heat,
      heatMax: p.heatMax,
      cellOffset: p.cellOffset,
    });
    octx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, W, H);
  }

  if (p.editing && p.stairOverlay) {
    ctx.save();
    ctx.fillStyle = 'rgba(14,165,233,0.12)';
    ctx.strokeStyle = 'rgba(2,132,199,0.95)';
    ctx.lineWidth = Math.max(1.5, cs * 0.08);
    ctx.setLineDash([Math.max(2, cs * 0.2), Math.max(2, cs * 0.12)]);
    for (let i = 0; i < p.stairOverlay.cells.length; i++) {
      if (p.stairOverlay.cells[i] !== C.STAIRS) continue;
      const x = (i % g.w) * cs;
      const y = ((i / g.w) | 0) * cs;
      ctx.fillRect(x + 1, y + 1, cs - 2, cs - 2);
      ctx.strokeRect(x + 1, y + 1, cs - 2, cs - 2);
    }
    ctx.restore();
  }

  if (p.editing && cs >= 8) {
    ctx.strokeStyle = 'rgba(15,23,42,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= g.w; x++) { ctx.moveTo(x * cs + 0.5, 0); ctx.lineTo(x * cs + 0.5, H); }
    for (let y = 0; y <= g.h; y++) { ctx.moveTo(0, y * cs + 0.5); ctx.lineTo(W, y * cs + 0.5); }
    ctx.stroke();
  }

  // Room labels.
  const outByRoom = new Map<number, number>();
  const totalByRoom = new Map<number, number>();
  if (p.sim) {
    for (const a of p.sim.agents) {
      totalByRoom.set(a.room, (totalByRoom.get(a.room) ?? 0) + 1);
      if (a.state === S.EVACUATED) outByRoom.set(a.room, (outByRoom.get(a.room) ?? 0) + 1);
    }
  }
  const fs = Math.max(10, Math.min(15, cs * 1.4));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const room of p.rooms) {
    const c = p.centroids.get(room.id);
    if (!c) continue;
    const x = (c.x + 0.5) * cs;
    const y = (c.y + 0.5) * cs;
    const bothLabels = p.showRoomNames && p.showRoomCounts;
    if (p.showRoomNames) {
      ctx.font = `600 ${fs}px system-ui, sans-serif`;
      ctx.fillStyle = '#0f172a';
      ctx.fillText(room.name, x, y + (bothLabels ? -fs * 0.6 : 0));
    }
    if (p.showRoomCounts) {
      ctx.font = `${fs * 0.85}px system-ui, sans-serif`;
      ctx.fillStyle = '#475569';
      const people = room.children + room.adults + room.reducedMobility;
      const label = p.sim ? `${outByRoom.get(room.id) ?? 0}/${totalByRoom.get(room.id) ?? 0} навън` : `${people} души`;
      ctx.fillText(label, x, y + (bothLabels ? fs * 0.6 : 0));
    }
  }

  // Hazard origin marker.
  if (p.origin !== null && !p.sim) {
    const x = ((p.origin % g.w) + 0.5) * cs;
    const y = (((p.origin / g.w) | 0) + 0.5) * cs;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(6, cs * 0.9), 0, Math.PI * 2);
    ctx.fillStyle = p.originColor + '55';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = p.originColor;
    ctx.stroke();
  }

  // Agents.
  if (p.sim) {
    const rad = Math.max(1.6, cs * 0.32);
    const rowOff = (p.cellOffset ?? 0) / g.w;
    for (const a of p.sim.agents) {
      if (a.state === S.EVACUATED) continue;
      // Only the people on the floor being drawn.
      const ly = a.y - rowOff;
      if (ly < -1 || ly > g.h) continue;
      ctx.beginPath();
      ctx.arc((a.x + 0.5) * cs, (ly + 0.5) * cs, rad, 0, Math.PI * 2);
      ctx.fillStyle = a.state === S.TRAPPED ? TRAPPED_COLOR : AGENT_COLORS[a.kind];
      ctx.fill();
    }
  }

  if (p.preview) {
    const { x0, y0, x1, y1 } = p.preview;
    ctx.strokeStyle = '#0f172a';
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1.5;
    if (p.preview.line) forLine(x0, y0, x1, y1, (x, y) => ctx.strokeRect(x * cs + 0.5, y * cs + 0.5, cs - 1, cs - 1));
    else ctx.strokeRect(Math.min(x0, x1) * cs, Math.min(y0, y1) * cs, (Math.abs(x1 - x0) + 1) * cs, (Math.abs(y1 - y0) + 1) * cs);
    ctx.setLineDash([]);
  }
  if (p.hover !== null && p.editing) {
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1;
    ctx.strokeRect((p.hover % g.w) * cs + 0.5, ((p.hover / g.w) | 0) * cs + 0.5, cs - 1, cs - 1);
  }
}

export { DISASTERS };
