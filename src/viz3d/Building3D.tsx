import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useProject } from '../store/useProject';
import { simRef } from '../store/simControl';
import { AGENT_STATE as S, type GridData } from '../sim/types';
import { defaultOriginCell, isWalkable, roomCentroids } from '../sim/grid';
import { cellFloor, floorCount, floorName, floorOffset, floorRows, floorView, rowFloor } from '../sim/floors';
import { DISASTERS } from '../components/labels';
import { heatColor } from '../editor/render2d';
import { BuildingMesh } from './BuildingMesh';
import { Agents3D } from './Agents3D';
import { Hazards3D } from './Hazards3D';
import { CS, WALL_H, cellWorld, floorShift, floorY, toWorld, viewSpan, worldToCell } from './coords';

/** Whether floor f is drawn: always, unless the view is limited to the active floor. */
function useFloorVisible() {
  const only = useProject((s) => s.onlyActiveFloor);
  const active = useProject((s) => s.activeFloor);
  return (f: number) => !only || f === active;
}

/** Side-by-side layout: a plinth under the floor (so it rests on the ground) and a clickable title in front of it. */
function FloorBase({ g, f, active }: { g: GridData; f: number; active: boolean }) {
  const set = useProject((s) => s.set);
  const W = g.w * CS;
  const H = g.h * CS;
  return (
    <>
      <mesh position={[0, -0.07, 0]} receiveShadow>
        <boxGeometry args={[W + 1.2, 0.12, H + 1.2]} />
        <meshStandardMaterial color={active ? '#c7d7f5' : '#f8fafc'} />
      </mesh>
      <Html position={[0, 0.1, H / 2 + 1.8]} center zIndexRange={[10, 0]}>
        <button
          type="button"
          onClick={() => set({ activeFloor: f })}
          className={`whitespace-nowrap rounded-md px-2.5 py-1 text-sm font-semibold shadow-sm ring-1 transition ${active ? 'bg-accent text-white ring-accent' : 'bg-white/95 text-slate-700 ring-slate-200 hover:bg-slate-100'}`}
        >
          {floorName(f)}
        </button>
      </Html>
    </>
  );
}

function RoomLabels({ g }: { g: GridData }) {
  const rooms = useProject((s) => s.rooms);
  const showRoomNames = useProject((s) => s.showRoomNames);
  const showRoomCounts = useProject((s) => s.showRoomCounts);
  const version = useProject((s) => s.gridVersion);
  const mode = useProject((s) => s.mode);
  const explode = useProject((s) => s.explode);
  const layout = useProject((s) => s.layout);
  const selectedRoom = useProject((s) => s.selectedRoom);
  const visible = useFloorVisible();
  useProject((s) => s.simTick); // re-render ~10×/s during a run
  const centroids = useMemo(() => roomCentroids(g), [g, version]);
  const visibleRoomCount = rooms.reduce((n, room) => {
    const c = centroids.get(room.id);
    return c && visible(rowFloor(g, c.y)) ? n + 1 : n;
  }, 0);
  const compactLabels = visibleRoomCount > 12;
  const sim = mode !== 'edit' ? simRef.current : null;
  const out = new Map<number, number>();
  const total = new Map<number, number>();
  if (sim)
    for (const a of sim.agents) {
      total.set(a.room, (total.get(a.room) ?? 0) + 1);
      if (a.state === S.EVACUATED) out.set(a.room, (out.get(a.room) ?? 0) + 1);
    }
  if (!showRoomNames && !showRoomCounts) return null;
  return (
    <>
      {rooms.map((r) => {
        // Dense plans cannot fit every label without covering rooms; show only the selected label.
        if (compactLabels && selectedRoom !== r.id) return null;
        const c = centroids.get(r.id);
        if (!c) return null;
        const f = rowFloor(g, c.y);
        if (!visible(f)) return null;
        const [x, z] = toWorld(g, c.x, c.y);
        const [sx, sy] = floorShift(g, f, explode, layout);
        const people = r.children + r.adults + r.reducedMobility;
        const t = total.get(r.id) ?? 0;
        const o = out.get(r.id) ?? 0;
        const doneRoom = sim && t > 0 && o === t;
        return (
          <Html key={r.id} position={[x + sx, sy + 3.6, z]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
            <div
              title={`${r.name}${showRoomCounts ? ` · ${sim ? `${o}/${t} навън` : `${people} души`}` : ''}`}
              className={`w-max max-w-[5.5rem] overflow-hidden rounded px-1 py-0.5 text-center text-[10px] leading-tight ${doneRoom ? 'bg-emerald-50/80 text-emerald-800' : 'bg-white/75 text-slate-700'}`}
            >
              {showRoomNames && <span className="block truncate font-semibold">{r.name}</span>}
              {showRoomCounts && <span className="block truncate tabular-nums">{sim ? `${o}/${t} навън` : `${people} души`}</span>}
            </div>
          </Html>
        );
      })}
    </>
  );
}

function HeatOverlay({ g }: { g: GridData }) {
  const results = useProject((s) => s.results);
  const explode = useProject((s) => s.explode);
  const layout = useProject((s) => s.layout);
  const visible = useFloorVisible();
  const floors = floorCount(g);
  const rows = floorRows(g);
  // One texture per floor.
  const texs = useMemo(() => {
    if (!results) return [];
    return Array.from({ length: floors }, (_, f) => {
      const off = floorOffset(g, f);
      const c = document.createElement('canvas');
      c.width = g.w;
      c.height = rows;
      const ctx = c.getContext('2d')!;
      const img = ctx.createImageData(g.w, rows);
      for (let i = 0; i < g.w * rows; i++) {
        const v = results.heat[off + i];
        if (v <= 0 || !results.heatMax) continue;
        const k = Math.sqrt(v / results.heatMax);
        const [r, gg, b] = heatColor(k);
        img.data.set([r, gg, b, 120 + 135 * k], i * 4);
      }
      ctx.putImageData(img, 0, 0);
      const t = new THREE.CanvasTexture(c);
      t.magFilter = THREE.NearestFilter;
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    });
  }, [results, g, floors, rows]);
  return (
    <>
      {texs.map(
        (tex, f) =>
          visible(f) && (
            <mesh key={f} rotation-x={-Math.PI / 2} position={[floorShift(g, f, explode, layout)[0], floorShift(g, f, explode, layout)[1] + 0.03, 0]}>
              <planeGeometry args={[g.w * CS, rows * CS]} />
              <meshBasicMaterial map={tex} transparent depthWrite={false} />
            </mesh>
          ),
      )}
    </>
  );
}

function OriginMarker({ g }: { g: GridData }) {
  const savedOrigin = useProject((s) => s.scenario.origin);
  const type = useProject((s) => s.scenario.type);
  const explode = useProject((s) => s.explode);
  const layout = useProject((s) => s.layout);
  const visible = useFloorVisible();
  const ref = useRef<THREE.Mesh>(null);
  const dragging = useRef(false);
  const { camera, gl } = useThree();
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const hitPoint = useMemo(() => new THREE.Vector3(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);
  const projected = useMemo(() => new THREE.Vector3(), []);
  const defaultOrigin = useMemo(() => defaultOriginCell(g), [g]);
  const origin = savedOrigin !== null && savedOrigin >= 0 && savedOrigin < g.cells.length && isWalkable(g.cells[savedOrigin]) ? savedOrigin : null;
  const cellRef = useRef(origin ?? defaultOrigin);
  cellRef.current = origin ?? defaultOrigin;
  const cell = origin ?? defaultOrigin;
  const floor = cellFloor(g, cell);

  /** Where floor f sits in the world, read fresh (the slider / layout can change while dragging). */
  const shift = (f: number): [number, number] => {
    const st = useProject.getState();
    return floorShift(g, f, st.explode, st.layout);
  };
  const elev = () => shift(cellFloor(g, cellRef.current))[1];

  useFrame(({ clock }) => {
    if (ref.current && !dragging.current) ref.current.position.y = elev() + 1.2 + 0.15 * Math.sin(clock.elapsedTime * 3);
  });

  // Hit-tested by screen distance (not raycasting the mesh) since the marker reads as only a few
  // px on screen at typical camera distances - a raycast-only hit box would be too hard to grab.
  useEffect(() => {
    const dom = gl.domElement;
    const HIT_R = 24;
    const markerShown = () => {
      const s = useProject.getState();
      return !s.onlyActiveFloor || cellFloor(g, cellRef.current) === s.activeFloor;
    };

    const screenPos = () => {
      const [x, z] = cellWorld(g, cellRef.current);
      const sh = shift(cellFloor(g, cellRef.current));
      projected.set(x + sh[0], sh[1] + 1.2, z).project(camera);
      const r = dom.getBoundingClientRect();
      return { x: r.left + ((projected.x + 1) / 2) * r.width, y: r.top + ((1 - projected.y) / 2) * r.height };
    };
    const toNdc = (e: PointerEvent) => {
      const r = dom.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      return ndc;
    };

    const onDown = (e: PointerEvent) => {
      if (useProject.getState().mode !== 'edit' || !markerShown()) return;
      const p = screenPos();
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > HIT_R) return;
      dragging.current = true;
      if (controls) controls.enabled = false;
      dom.style.cursor = 'grabbing';
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) {
        if (useProject.getState().mode === 'edit' && markerShown()) {
          const p = screenPos();
          dom.style.cursor = Math.hypot(e.clientX - p.x, e.clientY - p.y) <= HIT_R ? 'grab' : 'auto';
        }
        return;
      }
      // The marker is dragged across the floor being edited (the active floor).
      const s = useProject.getState();
      const f = Math.min(s.activeFloor, floorCount(g) - 1);
      const sh = shift(f);
      plane.constant = -sh[1];
      raycaster.setFromCamera(toNdc(e), camera);
      if (!raycaster.ray.intersectPlane(plane, hitPoint)) return;
      const floorGrid = floorView(g, f);
      const local = worldToCell(floorGrid, hitPoint.x - sh[0], hitPoint.z);
      if (local === null || !isWalkable(floorGrid.cells[local])) return;
      s.set({ scenario: { ...s.scenario, origin: local + floorOffset(g, f) } });
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      if (controls) controls.enabled = true;
      dom.style.cursor = 'auto';
    };

    dom.addEventListener('pointerdown', onDown);
    dom.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      dom.removeEventListener('pointerdown', onDown);
      dom.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [gl, camera, controls, g, plane, raycaster, hitPoint, ndc, projected]);

  if (!visible(floor)) return null;
  const [x, z] = cellWorld(g, cell);
  const [sx, sy] = floorShift(g, floor, explode, layout);
  return (
    <mesh ref={ref} position={[x + sx, sy + 1.2, z]} rotation-x={Math.PI}>
      <coneGeometry args={[0.35, 0.8, 16]} />
      <meshStandardMaterial color={DISASTERS[type].color} emissive={DISASTERS[type].color} emissiveIntensity={0.5} />
    </mesh>
  );
}

function CameraRig({ g }: { g: GridData }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const preset = useProject((s) => s.camera);
  const mode = useProject((s) => s.mode);
  const shake = useRef(new THREE.Vector3());
  const layout = useProject((s) => s.layout);
  const explode = useProject((s) => s.explode);
  const activeFloor = useProject((s) => s.activeFloor);
  const onlyActiveFloor = useProject((s) => s.onlyActiveFloor);
  const floors = floorCount(g);
  const D = Math.max(g.w, floorRows(g)) * CS;
  const spread = layout === 'spread' && floors > 1;
  const span = viewSpan(g, layout);

  // Editing the hazard marker temporarily disables orbit controls while it is dragged.
  // Re-enable them when the simulation starts so zoom and orbit remain available.
  useEffect(() => {
    if (!controls) return;
    controls.enabled = true;
    controls.enableZoom = true;
  }, [controls, mode]);

  useEffect(() => {
    if (!controls) return;
    if (spread) {
      // Floors lie side by side: look at the whole row from the front.
      if (preset.preset === 'iso') camera.position.set(0, span * 0.5, span * 0.75 + D * 0.2);
      else if (preset.preset === 'top') camera.position.set(0, span * 0.8 + D * 0.5, 0.01);
      controls.target.set(0, 0, 0);
      controls.update();
      return;
    }
    // Aim at the middle of the whole stack of floors.
    const top = floorY(floors - 1, useProject.getState().explode) + WALL_H;
    const ty = floors > 1 ? top / 2 : 0;
    if (preset.preset === 'iso') {
      camera.position.set(D * 0.55, D * 0.85 + ty * 1.2, D * 0.95);
      controls.target.set(0, ty, 0);
    } else if (preset.preset === 'top') {
      camera.position.set(0, D * 1.5 + top, 0.01);
      controls.target.set(0, ty, 0);
    }
    controls.update();
  }, [preset.n, controls, camera, D, floors, spread, span]);

  useEffect(() => {
    if (!controls || !onlyActiveFloor) return;
    const [x, y] = floorShift(g, activeFloor, explode, layout);
    // Keep the focused floor below the two floating toolbar rows at the top of the viewport.
    const center = new THREE.Vector3(x, y + WALL_H / 2 + Math.max(3, D * 0.15), 0);
    const direction = camera.position.clone().sub(controls.target).normalize();
    const floorDistance = Math.max(g.w, floorRows(g)) * CS * 0.8;
    camera.position.copy(center).add(direction.multiplyScalar(Math.max(controls.minDistance, floorDistance)));
    controls.target.copy(center);
    controls.update();
  }, [controls, camera, g, activeFloor, onlyActiveFloor, layout, explode, preset.n]);

  useFrame(() => {
    camera.position.sub(shake.current);
    shake.current.set(0, 0, 0);
    const s = useProject.getState();
    const sim = simRef.current;
    if (!sim || s.mode === 'edit') return;
    // Earthquake: shake while everyone drops, covers and holds.
    if (s.mode === 'run' && sim.hazard.type === 'earthquake' && sim.t < sim.hazard.preDelay) {
      shake.current.set((Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.35);
      camera.position.add(shake.current);
    }
    // Follow the selected room's class.
    if (s.camera.preset === 'follow' && s.selectedRoom !== null && controls) {
      let sx = 0, sy = 0, sz = 0, n = 0;
      for (const a of sim.agents) {
        if (a.room !== s.selectedRoom || a.state === S.EVACUATED) continue;
        const [x, z] = toWorld(sim.g, a.x, a.y);
        const [fx, fy] = floorShift(sim.g, a.fl + a.lift, s.explode, s.layout);
        sx += x + fx; sy += fy; sz += z; n++;
      }
      if (n) {
        const dx = (sx / n - controls.target.x) * 0.08;
        const dy = (sy / n - controls.target.y) * 0.08;
        const dz = (sz / n - controls.target.z) * 0.08;
        controls.target.x += dx;
        controls.target.y += dy;
        controls.target.z += dz;
        camera.position.x += dx;
        camera.position.y += dy;
        camera.position.z += dz;
      }
    }
  });
  return null;
}

export default function Building3D() {
  const g = useProject((s) => s.grid);
  const version = useProject((s) => s.gridVersion);
  const rooms = useProject((s) => s.rooms);
  const lowWalls = useProject((s) => s.lowWalls);
  const mode = useProject((s) => s.mode);
  const simId = useProject((s) => s.simId);
  const explode = useProject((s) => s.explode);
  const layout = useProject((s) => s.layout);
  const activeFloor = useProject((s) => s.activeFloor);
  const visible = useFloorVisible();
  const sim = mode !== 'edit' ? simRef.current : null;
  const floors = floorCount(g);
  const D = Math.max(g.w, floorRows(g)) * CS;
  const spread = layout === 'spread' && floors > 1;
  const span = viewSpan(g, layout);
  // Each floor as its own grid (sharing memory with the building).
  const views = useMemo(() => Array.from({ length: floors }, (_, f) => floorView(g, f)), [g, floors]);

  const onFloorClick = (f: number) => (e: ThreeEvent<PointerEvent>) => {
    const s = useProject.getState();
    if (s.mode !== 'edit') return;
    const cell = worldToCell(views[f], e.point.x - floorShift(g, f, explode, layout)[0], e.point.z);
    if (cell === null) return;
    if (views[f].rooms[cell] >= 0 && e.delta < 4) {
      s.set({ selectedRoom: views[f].rooms[cell], activeFloor: f });
    }
  };

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [D * 0.55, D * 0.85, D * 0.95], fov: 40, near: 0.1, far: span * 12 }}
      gl={{ preserveDrawingBuffer: true }}
    >
      <color attach="background" args={['#eef2f6']} />
      <hemisphereLight args={['#ffffff', '#cbd5e1', 0.9]} />
      <directionalLight
        position={[span * 0.3, span * 0.8 + floors * 6, span * 0.4]}
        intensity={1.4}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-span * 0.7}
        shadow-camera-right={span * 0.7}
        shadow-camera-top={span * 0.7}
        shadow-camera-bottom={-span * 0.7}
        shadow-camera-far={span * 3 + floors * 12}
        shadow-bias={-0.0005}
      />
      {spread && (
        <mesh rotation-x={-Math.PI / 2} position={[0, -0.14, 0]} receiveShadow>
          <planeGeometry args={[span + D * 2, D * 3]} />
          <meshStandardMaterial color="#e6ebf1" />
        </mesh>
      )}
      {views.map((v, f) => {
        if (!visible(f)) return null;
        const [sx, sy] = floorShift(g, f, explode, layout);
        return (
          <group key={`${version}-${f}`} position={[sx, sy, 0]}>
            {spread && <FloorBase g={v} f={f} active={f === activeFloor} />}
            <BuildingMesh
              g={v}
              below={!spread && f > 0 ? views[f - 1] : null}
              floor={f}
              multi={floors > 1}
              ground={!spread && f === 0}
              flatStairs={spread}
              rooms={rooms}
              version={version}
              lowWalls={lowWalls}
              onFloorClick={onFloorClick(f)}
            />
          </group>
        );
      })}
      {sim && <Agents3D key={`a${simId}`} sim={sim} />}
      {sim && mode === 'run' && <Hazards3D key={`h${simId}`} sim={sim} />}
      {mode === 'results' && <HeatOverlay g={g} />}
      {mode === 'edit' && <OriginMarker g={g} />}
      <RoomLabels g={g} />
      <CameraRig g={g} />
      <OrbitControls makeDefault enableZoom zoomSpeed={0.8} maxPolarAngle={Math.PI / 2.1} minDistance={4} maxDistance={span * 3 + floors * 20} />
    </Canvas>
  );
}
