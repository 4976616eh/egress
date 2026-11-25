import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { AGENT_STATE as S } from '../sim/types';
import type { Simulation } from '../sim/engine';
import { AGENT_COLORS, FOLLOW_COLOR, TRAPPED_COLOR } from '../components/labels';
import { useProject } from '../store/useProject';
import { floorShift, toWorld } from './coords';
import { floorCount } from '../sim/floors';
import { stairHeightField } from './stairs';

// Per-agent color state so we only touch the instance buffer when it actually changes.
const BASE = 0, TRAPPED = 1, FOLLOWED = 2;

/** All agents as one instanced capsule mesh; reads sim state every frame. */
export function Agents3D({ sim }: { sim: Simulation }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const n = sim.agents.length;
  const o = useMemo(() => new THREE.Object3D(), []);
  const col = useMemo(() => new THREE.Color(), []);
  const colorState = useMemo(() => new Uint8Array(n), [sim, n]);
  // Height of every stair cell, so people visibly climb the flight instead of sinking into it.
  const stairH = useMemo(() => stairHeightField(sim.g), [sim]);

  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    sim.agents.forEach((a, k) => {
      col.set(AGENT_COLORS[a.kind]);
      m.setColorAt(k, col);
    });
    colorState.fill(BASE);
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [sim, col, colorState]);

  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const { camera, selectedRoom, explode, layout, onlyActiveFloor, activeFloor } = useProject.getState();
    const flat = layout === 'spread' && floorCount(sim.g) > 1;
    // Following a class makes it easy to lose track of which dots belong to it - mark them white.
    const following = camera.preset === 'follow' && selectedRoom !== null;
    let colorDirty = false;
    sim.agents.forEach((a, k) => {
      if (a.state === S.EVACUATED || (onlyActiveFloor && a.fl !== activeFloor)) {
        o.scale.setScalar(0);
      } else {
        const [x, z] = toWorld(sim.g, a.x, a.y);
        const s = a.kind === 'adult' ? 1.3 : a.kind === 'reduced' ? 1.1 : 1;
        // Side by side, the stairs are flat treads: nobody climbs a ramp.
        const r0 = flat ? 0 : stairH[a.cell];
        const ramp = flat ? 0 : a.next >= 0 ? r0 + (stairH[a.next] - r0) * a.progress : r0;
        const [fx, fy] = floorShift(sim.g, a.fl + a.lift, explode, layout);
        o.position.set(x + fx, fy + ramp + 0.36 * s, z);
        o.scale.setScalar(s);
        const want = a.state === S.TRAPPED ? TRAPPED : following && a.room === selectedRoom ? FOLLOWED : BASE;
        if (colorState[k] !== want) {
          colorState[k] = want;
          col.set(want === TRAPPED ? TRAPPED_COLOR : want === FOLLOWED ? FOLLOW_COLOR : AGENT_COLORS[a.kind]);
          m.setColorAt(k, col);
          colorDirty = true;
        }
      }
      o.updateMatrix();
      m.setMatrixAt(k, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    if (colorDirty && m.instanceColor) m.instanceColor.needsUpdate = true;
  });

  if (!n) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, n]} frustumCulled={false} castShadow>
      <capsuleGeometry args={[0.13, 0.45, 4, 8]} />
      <meshStandardMaterial roughness={0.6} />
    </instancedMesh>
  );
}
