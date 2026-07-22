/**
 * Module 18D — render the server's husks. Identical pattern to RemotePlayers:
 * reconcile a pool of figures against `state.husks`, interpolate ~120 ms in the
 * past for smoothness. The husks are entirely server-driven — the client only
 * draws what the authoritative state tells it.
 */
import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import type { Net } from "../net/connection";
import { INTERP_DELAY_MS, SnapshotBuffer } from "../net/interpolation";

/** A hunched figure with sickly-green glowing eyes; feet at local y=0. */
function makeHusk(): THREE.Group {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: "#5c6b4a" });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.9, 0.4), skin);
  torso.position.set(0, 0.85, 0.1);
  torso.rotation.x = 0.5; // hunched forward
  torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skin);
  head.position.set(0, 1.35, 0.35);
  head.castShadow = true;
  const eyeMat = new THREE.MeshStandardMaterial({
    color: "#9cc94f",
    emissive: "#9cc94f",
    emissiveIntensity: 1.2,
  });
  const eyeGeo = new THREE.BoxGeometry(0.08, 0.08, 0.05);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.1, 1.4, 0.56);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeR.position.set(0.1, 1.4, 0.56);
  g.add(torso, head, eyeL, eyeR);
  return g;
}

interface Mob {
  group: THREE.Group;
  buf: SnapshotBuffer;
}

export function Husks({ net }: { net: React.RefObject<Net | null> }) {
  const group = useMemo(() => new THREE.Group(), []);
  const mobs = useMemo(() => new Map<string, Mob>(), []);

  useFrame(() => {
    const n = net.current;
    if (!n) return;
    const husks = n.room.state.husks;
    const renderT = performance.now() - INTERP_DELAY_MS;

    husks.forEach((h, id) => {
      let m = mobs.get(id);
      if (!m) {
        m = { group: makeHusk(), buf: new SnapshotBuffer() };
        group.add(m.group);
        mobs.set(id, m);
      }
      m.buf.push(h.x, h.y, h.z, h.yaw);
      const s = m.buf.sample(renderT);
      if (s) {
        m.group.position.set(s.x, s.y, s.z);
        m.group.rotation.y = s.yaw;
      }
    });

    for (const [id, m] of mobs) {
      if (!husks.has(id)) {
        group.remove(m.group);
        m.group.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.geometry.dispose();
            (o.material as THREE.Material).dispose();
          }
        });
        mobs.delete(id);
      }
    }
  });

  return <primitive object={group} />;
}
