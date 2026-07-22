/**
 * Module 14 — render everyone else. Each frame we reconcile a pool of block
 * avatars against the synced `state.players` map: add an avatar when a player
 * appears, remove it when they leave, and copy positions in between.
 *
 * This is imperative on purpose (a THREE.Group we mutate, dropped in with a
 * single <primitive>) — the player set and their transforms change every frame,
 * which is exactly the kind of churn you keep OUT of React. The real Ruderal's
 * RemotePlayers.tsx works the same way.
 */
import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import type { Net } from "../net/connection";

/** A tiny block figure: colored torso + head + amber visor, feet at local y=0. */
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

export function RemotePlayers({ net }: { net: React.RefObject<Net | null> }) {
  const group = useMemo(() => new THREE.Group(), []);
  const avatars = useMemo(() => new Map<string, THREE.Group>(), []);

  useFrame(() => {
    const n = net.current;
    if (!n) return;
    const players = n.room.state.players;

    players.forEach((p, id) => {
      if (id === n.id) return; // skip ourselves
      let av = avatars.get(id);
      if (!av) {
        av = makeAvatar(colorFromName(p.name));
        group.add(av);
        avatars.set(id, av);
      }
      av.position.set(p.x, p.y, p.z);
      av.rotation.y = p.yaw;
    });

    // Remove avatars for players who left.
    for (const [id, av] of avatars) {
      if (id === n.id || !players.has(id)) {
        group.remove(av);
        av.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.geometry.dispose();
            (o.material as THREE.Material).dispose();
          }
        });
        avatars.delete(id);
      }
    }
  });

  return <primitive object={group} />;
}
