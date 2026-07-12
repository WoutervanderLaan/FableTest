/**
 * Other players: sampled from Colyseus state each frame into per-player
 * snapshot buffers, rendered ~120 ms in the past for smooth interpolation.
 * Avatars are weathered-toned block figures with a marigold visor — amber is
 * the reserved color of player agency (plan §4), and other players ARE agency.
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { INTERP_DELAY_MS, hash01, hashString } from "@ruderal/shared";
import type { Net } from "../net/connection";
import { SnapshotBuffer } from "../net/interpolation";

const BODY_TONES = ["#8a8378", "#7a6a55", "#6e5f52", "#5d6660", "#75705f"];

function makeAvatar(name: string): THREE.Group {
  const g = new THREE.Group();
  const seed = hashString(name);
  const tone = new THREE.Color(BODY_TONES[Math.floor(hash01(seed, 1) * BODY_TONES.length)]);

  const bodyMat = new THREE.MeshLambertMaterial({ color: tone });
  const headMat = new THREE.MeshLambertMaterial({ color: tone.clone().multiplyScalar(1.25) });
  const visorMat = new THREE.MeshLambertMaterial({
    color: "#e8a33d",
    emissive: "#e8a33d",
    emissiveIntensity: 0.5,
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.56, 1.05, 0.32), bodyMat);
  body.position.y = 0.85;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.38), headMat);
  head.position.y = 1.6;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.05), visorMat);
  visor.position.set(0, 1.64, -0.2);

  for (const m of [body, head, visor]) {
    m.castShadow = true;
    g.add(m);
  }
  return g;
}

interface RemoteEntry {
  group: THREE.Group;
  buffer: SnapshotBuffer;
}

export function RemotePlayers({ net }: { net: Net }) {
  const root = useMemo(() => new THREE.Group(), []);
  const entries = useRef(new Map<string, RemoteEntry>());

  useEffect(() => {
    const map = entries.current;
    return () => {
      for (const e of map.values()) root.remove(e.group);
      map.clear();
    };
  }, [root]);

  useFrame(() => {
    const state = net.room.state as {
      players?: {
        forEach(cb: (p: { name: string; x: number; y: number; z: number; yaw: number }, id: string) => void): void;
      };
    };
    const seen = new Set<string>();
    state.players?.forEach((p, id) => {
      if (id === net.id) return;
      seen.add(id);
      let entry = entries.current.get(id);
      if (!entry) {
        entry = { group: makeAvatar(p.name || id), buffer: new SnapshotBuffer() };
        entries.current.set(id, entry);
        root.add(entry.group);
      }
      entry.buffer.push(p.x, p.y, p.z, p.yaw);
    });
    // departures
    for (const [id, entry] of entries.current) {
      if (!seen.has(id)) {
        root.remove(entry.group);
        entries.current.delete(id);
      }
    }
    // render the (slightly) past
    const renderT = performance.now() - INTERP_DELAY_MS;
    for (const entry of entries.current.values()) {
      const s = entry.buffer.sample(renderT);
      if (s) {
        entry.group.position.set(s.x, s.y, s.z);
        entry.group.rotation.y = s.yaw + Math.PI; // avatar model faces +z
      }
    }
  });

  return <primitive object={root} />;
}
