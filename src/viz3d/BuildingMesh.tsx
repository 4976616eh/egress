import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { C, type GridData, type Room } from '../sim/types';
import { fillCellPixels } from '../editor/render2d';
import { CS, LOW_WALL_H, WALL_H, cellWorld } from './coords';
import { stairHeightMap } from './stairs';

type Place = (i: number, o: THREE.Object3D, k: number) => void;

/** One instanced mesh with a box per listed cell. */
function CellBoxes({ g, cells, place, children, castShadow = false }: { g: GridData; cells: number[]; place: Place; children: React.ReactNode; castShadow?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    cells.forEach((i, k) => {
      o.position.set(0, 0, 0);
      o.rotation.set(0, 0, 0);
      o.scale.set(1, 1, 1);
      place(i, o, k);
      o.updateMatrix();
      m.setMatrixAt(k, o.matrix);
    });
    m.count = cells.length;
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [g, cells, place]);
  if (!cells.length) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, cells.length]} castShadow={castShadow} receiveShadow>
      {children}
    </instancedMesh>
  );
}

/** One floor of the building (g is that floor's own grid). `below` is the floor underneath, so the stairwell can be open. */
export function BuildingMesh({ g, below = null, floor = 0, multi = false, ground, flatStairs = false, rooms, version, lowWalls, onFloorClick }: { g: GridData; below?: GridData | null; floor?: number; multi?: boolean; ground?: boolean; flatStairs?: boolean; rooms: Room[]; version: number; lowWalls: boolean; onFloorClick: (e: ThreeEvent<PointerEvent>) => void }) {
  const lists = useMemo(() => {
    const walls: number[] = [], exits: number[] = [], doors: number[] = [], stairs: number[] = [];
    for (let i = 0; i < g.cells.length; i++) {
      const c = g.cells[i];
      if (c === C.WALL) walls.push(i);
      else if (c === C.EXIT) exits.push(i);
      else if (c === C.DOOR) doors.push(i);
      else if (c === C.STAIRS) stairs.push(i);
    }
    return { walls, exits, doors, stairs };
  }, [g, version]);

  const wallH = lowWalls ? LOW_WALL_H : WALL_H;

  const stairHeights = useMemo(() => stairHeightMap(g), [g, version]);

  const placeWall = useMemo<Place>(() => (i, o) => {
    const [x, z] = cellWorld(g, i);
    o.position.set(x, wallH / 2, z);
    o.scale.set(1, wallH, 1);
  }, [g, wallH]);

  const placeLintel = useMemo<Place>(() => (i, o) => {
    const [x, z] = cellWorld(g, i);
    o.position.set(x, 2.6, z);
    o.scale.set(1, 0.8, 1);
  }, [g]);

  const placeExit = useMemo<Place>(() => (i, o) => {
    const [x, z] = cellWorld(g, i);
    o.position.set(x, 1.1, z);
    o.scale.set(1, 2.2, 1);
  }, [g]);

  const placeStep = useMemo<Place>(() => (i, o) => {
    const [x, z] = cellWorld(g, i);
    const h = stairHeights.get(i) ?? 0.15;
    // Floors lying side by side have nothing above them: the stairs are flat treads, marked in colour.
    if (flatStairs) {
      o.position.set(x, 0.06, z);
      o.scale.set(1, 0.12, 1);
    } else if (multi) {
      // With several floors stacked, steps are thin treads so people (and the flights above) stay visible in the stairwell.
      o.position.set(x, h - 0.06, z);
      o.scale.set(1, 0.12, 1);
    } else {
      o.position.set(x, h / 2, z);
      o.scale.set(1, h, 1);
    }
  }, [g, stairHeights, multi, flatStairs]);

  const floorTex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = g.w;
    c.height = g.h;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(g.w, g.h);
    fillCellPixels(img.data, g, rooms, { transparentVoid: true, translucent: false });
    // Walls/exits are geometry; give their floor a neutral tone.
    for (let i = 0; i < g.w * g.h; i++) {
      const cell = g.cells[i];
      if (cell === C.WALL || cell === C.STAIRS) {
        img.data[i * 4] = 203; img.data[i * 4 + 1] = 213; img.data[i * 4 + 2] = 225;
      }
      // The stairwell is open: no slab where the flight from the floor below arrives.
      if (below && cell === C.STAIRS && below.cells[i] === C.STAIRS) img.data[i * 4 + 3] = 0;
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [g, below, version, rooms]);

  const W = g.w * CS;
  const H = g.h * CS;

  return (
    <group>
      {/* ground */}
      {(ground ?? floor === 0) && (
        <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, 0]} receiveShadow>
          <planeGeometry args={[W * 3, H * 3]} />
          <meshStandardMaterial color="#e6ebf1" />
        </mesh>
      )}
      {/* floor slab */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.005, 0]} receiveShadow onPointerDown={onFloorClick}>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial map={floorTex} transparent alphaTest={0.05} />
      </mesh>

      <CellBoxes g={g} cells={lists.walls} place={placeWall} castShadow>
        <boxGeometry args={[CS, 1, CS]} />
        <meshStandardMaterial color="#d3dbe5" transparent opacity={lowWalls ? 1 : 0.92} />
      </CellBoxes>
      {!lowWalls && (
        <CellBoxes g={g} cells={[...lists.doors, ...lists.exits]} place={placeLintel}>
          <boxGeometry args={[CS, 1, CS]} />
          <meshStandardMaterial color="#d3dbe5" />
        </CellBoxes>
      )}
      <CellBoxes g={g} cells={lists.exits} place={placeExit}>
        <boxGeometry args={[CS * 0.9, 1, CS * 0.9]} />
        <meshStandardMaterial color="#22c55e" emissive="#16a34a" emissiveIntensity={0.9} transparent opacity={0.45} depthWrite={false} />
      </CellBoxes>
      <CellBoxes g={g} cells={lists.stairs} place={placeStep} castShadow>
        <boxGeometry args={[CS, 1, CS]} />
        <meshStandardMaterial color="#c4b5fd" />
      </CellBoxes>
    </group>
  );
}
