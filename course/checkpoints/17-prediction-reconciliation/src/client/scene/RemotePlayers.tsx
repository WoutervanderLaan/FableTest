/**
 * Module 16 — remote players, now SMOOTH. Instead of snapping each avatar to the
 * latest synced position (which stutters, because state arrives ~10×/second),
 * we feed every update into a per-player SnapshotBuffer and render the sampled
 * position from ~120 ms ago. Same avatars as Module 14; the only change is that
 * a buffer sits between "synced state" and "what we draw."
 */
import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import type { Net } from "../net/connection";
import { INTERP_DELAY_MS, SnapshotBuffer } from "../net/interpolation";

function makeAvatar(color: THREE.Color): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 1.05, 0.32),
    new THREE.MeshLambertMaterial({ color }),
  );
  body.position.y = 0.95;
  body.castShadow = true;
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.42, 0.42),
    new THREE.MeshLambertMaterial({ color: color.clone().multiplyScalar(1.1) }),
  );
  head.position.y = 1.68;
  head.castShadow = true;
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.1, 0.05),
    new THREE.MeshStandardMaterial({ color: "#e8a33d", emissive: "#e8a33d", emissiveIntensity: 0.6 }),
  );
  visor.position.set(0, 1.7, 0.2);
  g.add(body, head, visor);
  return g;
}

function colorFromName(name: string): THREE.Color {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  const hue = ((h >>> 0) % 360) / 360;
  return new THREE.Color().setHSL(hue, 0.45, 0.55);
}

interface Remote {
  group: THREE.Group;
  buf: SnapshotBuffer;
}

export function RemotePlayers({ net }: { net: React.RefObject<Net | null> }) {
  const group = useMemo(() => new THREE.Group(), []);
  const remotes = useMemo(() => new Map<string, Remote>(), []);

  useFrame(() => {
    const n = net.current;
    if (!n) return;
    const players = n.room.state.players;
    const renderT = performance.now() - INTERP_DELAY_MS;

    players.forEach((p, id) => {
      if (id === n.id) return;
      let r = remotes.get(id);
      if (!r) {
        r = { group: makeAvatar(colorFromName(p.name)), buf: new SnapshotBuffer() };
        group.add(r.group);
        remotes.set(id, r);
      }
      // Record the latest synced state, then draw where they were ~120ms ago.
      r.buf.push(p.x, p.y, p.z, p.yaw);
      const s = r.buf.sample(renderT);
      if (s) {
        r.group.position.set(s.x, s.y, s.z);
        r.group.rotation.y = s.yaw;
      }
    });

    for (const [id, r] of remotes) {
      if (id === n.id || !players.has(id)) {
        group.remove(r.group);
        r.group.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.geometry.dispose();
            (o.material as THREE.Material).dispose();
          }
        });
        remotes.delete(id);
      }
    }
  });

  return <primitive object={group} />;
}
