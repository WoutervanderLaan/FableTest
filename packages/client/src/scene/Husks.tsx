/**
 * Husks (Phase 4). Interpolated ~120 ms in the past from server schema, like
 * remote players. Visually: hunched, overgrown figures — the ruin's biomass
 * turned hostile. Sickly biolum eyes (emissive) tie them to the mycelial
 * palette; never amber (amber is reserved for player agency).
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { INTERP_DELAY_MS } from "@ruderal/shared";
import type { Net } from "../net/connection";
import { SnapshotBuffer } from "../net/interpolation";
import { combatStatus } from "../player/status";

function makeHuskMesh(): THREE.Group {
  const g = new THREE.Group();
  const flesh = new THREE.MeshLambertMaterial({ color: "#4a5540" });
  const growth = new THREE.MeshLambertMaterial({ color: "#5f7a3e" });
  const eye = new THREE.MeshLambertMaterial({ color: "#9cc94f", emissive: "#7a9e2e", emissiveIntensity: 0.8 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.34), flesh);
  torso.position.y = 0.7;
  torso.rotation.x = 0.28; // hunched
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), flesh);
  head.position.set(0, 1.18, -0.14);
  const hump = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.3), growth);
  hump.position.set(0, 1.0, 0.12);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 0.14), flesh);
  armL.position.set(-0.32, 0.7, -0.05);
  const armR = armL.clone();
  armR.position.x = 0.32;
  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.04), eye);
  eyeL.position.set(-0.08, 1.2, -0.31);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.08;

  for (const m of [torso, head, hump, armL, armR, eyeL, eyeR]) {
    m.castShadow = true;
    g.add(m);
  }
  return g;
}

interface Entry {
  group: THREE.Group;
  buffer: SnapshotBuffer;
  hp: number;
}

export function Husks({ net }: { net: Net }) {
  const root = useMemo(() => new THREE.Group(), []);
  const entries = useRef(new Map<string, Entry>());

  useEffect(() => {
    const map = entries.current;
    return () => {
      for (const e of map.values()) root.remove(e.group);
      map.clear();
    };
  }, [root]);

  useFrame(() => {
    const state = net.room.state as {
      husks?: {
        forEach(cb: (h: { x: number; y: number; z: number; yaw: number; hp: number }, id: string) => void): void;
      };
    };
    const seen = new Set<string>();
    let count = 0;
    state.husks?.forEach((h, id) => {
      seen.add(id);
      count++;
      let entry = entries.current.get(id);
      if (!entry) {
        entry = { group: makeHuskMesh(), buffer: new SnapshotBuffer(), hp: h.hp };
        entries.current.set(id, entry);
        root.add(entry.group);
      }
      entry.hp = h.hp;
      entry.buffer.push(h.x, h.y, h.z, h.yaw);
    });
    for (const [id, entry] of entries.current) {
      if (!seen.has(id)) {
        root.remove(entry.group);
        entries.current.delete(id);
      }
    }

    combatStatus.targetHuskId = null; // recomputed by controller raycast each frame

    const renderT = performance.now() - INTERP_DELAY_MS;
    for (const entry of entries.current.values()) {
      const s = entry.buffer.sample(renderT);
      if (s) {
        entry.group.position.set(s.x, s.y, s.z);
        entry.group.rotation.y = s.yaw;
      }
    }
  });

  return <primitive object={root} />;
}
