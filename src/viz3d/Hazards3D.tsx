import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { Simulation } from '../sim/engine';
import { C } from '../sim/types';
import { useProject } from '../store/useProject';
import { CS, cellWorld, floorShift } from './coords';

const DOOR_TOP = 2.2; // door-opening height agents actually use, matches BuildingMesh's exit/lintel geometry

/** Two instanced layers (main + secondary) whose look depends on the disaster. */
export function Hazards3D({ sim }: { sim: Simulation }) {
  const g = sim.g;
  const N = g.w * g.h;
  const main = useRef<THREE.InstancedMesh>(null);
  const second = useRef<THREE.InstancedMesh>(null);
  const light = useRef<THREE.PointLight>(null);
  const o = useMemo(() => new THREE.Object3D(), []);
  const type = sim.hazard.type;
  const floorOf = sim.floorOf;

  useFrame(({ clock }) => {
    const hz = sim.hazard;
    const L = hz.level;
    const A = hz.aux;
    const t = clock.elapsedTime;
    const { explode, layout, onlyActiveFloor, activeFloor } = useProject.getState();
    const m = main.current;
    const s2 = second.current;
    let n1 = 0;
    let n2 = 0;
    for (let i = 0; i < N; i++) {
      const l = L[i];
      const a = A[i];
      if (!l && !a) continue;
      const fl = floorOf[i];
      if (onlyActiveFloor && fl !== activeFloor) continue;
      const [sx, yb] = floorShift(g, fl, explode, layout);
      const [cx, z] = cellWorld(g, i);
      const x = cx + sx;
      if (m && l > 0) {
        o.rotation.set(0, 0, 0);
        if (type === 'fire') {
          const flick = 0.75 + 0.25 * Math.sin(t * 9 + i * 1.7) * Math.sin(t * 5.3 + i);
          const h = (0.25 + l * 1.5) * flick;
          o.position.set(x, yb + h / 2, z);
          o.scale.set(0.9, h, 0.9);
        } else if (type === 'earthquake') {
          const h = 0.35 + ((i * 7919) % 5) * 0.08;
          o.position.set(x, yb + h / 2, z);
          o.rotation.set(((i * 31) % 7) * 0.08, ((i * 17) % 11) * 0.3, ((i * 13) % 5) * 0.08);
          o.scale.set(1.05, h, 1.05);
        } else if (type === 'flood') {
          const ripple = 0.015 * Math.sin(t * 2 + i * 0.7);
          const h = Math.max(0.03, l + ripple);
          o.position.set(x, yb + h / 2, z);
          o.scale.set(1, h, 1);
        } else {
          const pulse = 0.94 + 0.06 * Math.sin(t * 0.8 + i * 0.3);
          const h = 2.6 * pulse;
          o.position.set(x, yb + h / 2, z);
          o.scale.set(1, h, 1);
        }
        o.updateMatrix();
        m.setMatrixAt(n1++, o.matrix);
      }
      if (s2 && type === 'fire' && a > 0 && !l) {
        const h = 0.9 * a + 0.3;
        o.rotation.set(0, 0, 0);
        o.position.set(x, yb + 2.6 - h / 2 + 0.1 * Math.sin(t * 1.5 + i), z);
        o.scale.set(1, h, 1);
        o.updateMatrix();
        s2.setMatrixAt(n2++, o.matrix);
      }
      // Water pours in through doors and exits - the visible "source" of a flood.
      if (s2 && type === 'flood' && l > 0 && (g.cells[i] === C.DOOR || g.cells[i] === C.EXIT)) {
        const flow = 0.85 + 0.15 * Math.sin(t * 6 + i * 2.1);
        const h = Math.max(0.1, (DOOR_TOP - l) * flow);
        o.rotation.set(0, 0, 0);
        o.position.set(x, yb + l + h / 2, z);
        o.scale.set(0.35, h, 0.35);
        o.updateMatrix();
        s2.setMatrixAt(n2++, o.matrix);
      }
    }
    if (m) {
      m.count = n1;
      m.instanceMatrix.needsUpdate = true;
    }
    if (s2) {
      s2.count = n2;
      s2.instanceMatrix.needsUpdate = true;
    }
    if (light.current) {
      light.current.intensity = 6 + 3 * Math.sin(t * 11) * Math.sin(t * 4.1);
      const [lx, ly] = floorShift(g, floorOf[sim.hazard.origin], explode, layout);
      light.current.position.x = ox + lx;
      light.current.position.y = ly + 1.5;
    }
  });

  const [ox, oz] = cellWorld(g, sim.hazard.origin);

  const material = {
    fire: <meshStandardMaterial color="#f97316" emissive="#ea580c" emissiveIntensity={1.6} transparent opacity={0.9} />,
    earthquake: <meshStandardMaterial color="#78533a" roughness={1} />,
    flood: <meshStandardMaterial color="#1d6fe0" emissive="#1d4ed8" emissiveIntensity={0.15} transparent opacity={0.82} roughness={0.08} metalness={0.25} />,
    gas: <meshStandardMaterial color="#65b870" transparent opacity={0.24} depthWrite={false} />,
  }[type];

  return (
    <group>
      <instancedMesh ref={main} args={[undefined, undefined, N]} frustumCulled={false} castShadow={type === 'earthquake'}>
        <boxGeometry args={[CS, 1, CS]} />
        {material}
      </instancedMesh>
      {type === 'fire' && (
        <instancedMesh ref={second} args={[undefined, undefined, N]} frustumCulled={false}>
          <boxGeometry args={[CS, 1, CS]} />
          <meshStandardMaterial color="#44403c" transparent opacity={0.4} depthWrite={false} />
        </instancedMesh>
      )}
      {type === 'fire' && <pointLight ref={light} position={[ox, 1.5, oz]} color="#fb923c" distance={14} decay={1.5} />}
      {type === 'flood' && (
        <instancedMesh ref={second} args={[undefined, undefined, N]} frustumCulled={false}>
          <boxGeometry args={[CS, 1, CS]} />
          <meshStandardMaterial color="#93c5fd" emissive="#60a5fa" emissiveIntensity={0.4} transparent opacity={0.7} />
        </instancedMesh>
      )}
    </group>
  );
}
