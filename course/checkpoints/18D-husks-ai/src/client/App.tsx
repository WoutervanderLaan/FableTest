/**
 * Module 18 — block edits are now shared and authoritative.
 *
 * Edit flow (OPTIMISTIC with rollback):
 *   1. You click. We apply the edit locally right away (instant feel), remember
 *      the old block, and send the request to the server.
 *   2. The server validates it. If OK, it broadcasts to EVERYONE (including us):
 *      we (re)apply it and forget the rollback. If not, it sends us a `reject`
 *      and we restore the old block.
 *   3. Edits from OTHER players arrive on the same `edits` channel and apply.
 *
 * On join we also fold the server's whole edit history (`init.edits`) into the
 * world before it matters, so a late joiner sees the world as it currently is.
 */
import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer, Noise, Vignette } from "@react-three/postprocessing";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { meshWorld } from "../shared/mesher";
import {
  generateWorld,
  getVoxel,
  packXYZ,
  setVoxel,
  surfaceY,
  unpackX,
  unpackY,
  unpackZ,
} from "../shared/voxel";
import { Net } from "./net/connection";
import { netStatus } from "./net/status";
import { PlayerController } from "./PlayerController";
import { Husks } from "./scene/Husks";
import { RemotePlayers } from "./scene/RemotePlayers";
import { SkyAndLight } from "./scene/SkyAndLight";
import { Vegetation } from "./scene/Vegetation";
import { makeVoxelMaterial } from "./scene/materials";
import { Hud } from "./ui/Hud";
import { buildGeometry } from "./voxelMesh";

const WATER_LEVEL = 9;
const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "ws://localhost:2567";

function Water({ size }: { size: number }) {
  return (
    <mesh
      position={[size / 2, WATER_LEVEL + 0.9, size / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
    >
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial color="#3e8e7e" transparent opacity={0.75} />
    </mesh>
  );
}

export function App() {
  const [version, setVersion] = useState(0);
  const net = useRef<Net | null>(null);
  // Optimistically-applied edits awaiting server confirmation: packed p -> old block.
  const optimistic = useRef<Map<number, number>>(new Map());

  const { world, spawn } = useMemo(() => {
    const world = generateWorld();
    const cx = Math.floor(world.sizeX / 2);
    const cz = Math.floor(world.sizeZ / 2);
    const spawn = { x: cx + 0.5, y: surfaceY(world, cx, cz) + 1, z: cz + 0.5 };
    return { world, spawn };
  }, []);

  const remesh = useCallback(() => setVersion((v) => v + 1), []);

  // Local, optimistic edit: apply now, remember old, send to server.
  const applyEdit = useCallback(
    (x: number, y: number, z: number, b: number) => {
      const p = packXYZ(x, y, z);
      optimistic.current.set(p, getVoxel(world, x, y, z));
      setVoxel(world, x, y, z, b);
      remesh();
      net.current?.place(p, b);
    },
    [world, remesh],
  );

  // Connect once on mount + wire the edit channels.
  useEffect(() => {
    let alive = true;
    Net.join(SERVER_URL, localStorage.getItem("name") ?? "wanderer")
      .then((n) => {
        if (!alive) return n.leave();
        net.current = n;
        netStatus.connected = true;
        netStatus.error = "";

        // Fold the server's edit history into our freshly-generated world.
        const e = n.init.edits;
        for (let i = 0; i + 1 < e.length; i += 2) {
          setVoxel(world, unpackX(e[i]!), unpackY(e[i]!), unpackZ(e[i]!), e[i + 1]!);
        }

        // Confirmed edits (ours + everyone's): apply and clear any rollback.
        n.on("edits", (pairs) => {
          for (let i = 0; i + 1 < pairs.length; i += 2) {
            const p = pairs[i]!;
            setVoxel(world, unpackX(p), unpackY(p), unpackZ(p), pairs[i + 1]!);
            optimistic.current.delete(p);
          }
          remesh();
        });

        // Rejected edits: restore the old block we saved.
        n.on("reject", (arr) => {
          for (const p of arr) {
            const old = optimistic.current.get(p);
            if (old !== undefined) setVoxel(world, unpackX(p), unpackY(p), unpackZ(p), old);
            optimistic.current.delete(p);
          }
          remesh();
        });

        remesh();
      })
      .catch((err) => {
        netStatus.error = String(err.message ?? err);
      });

    const poll = setInterval(() => {
      if (net.current) {
        netStatus.players = net.current.playerCount;
        netStatus.latencyMs = net.current.latencyMs;
      }
    }, 500);
    return () => {
      alive = false;
      clearInterval(poll);
      net.current?.leave();
      net.current = null;
      netStatus.connected = false;
    };
  }, [world, remesh]);

  const voxelMat = useMemo(() => makeVoxelMaterial(), []);
  const geo = useMemo(() => buildGeometry(meshWorld(world)), [world, version]);
  useEffect(() => () => geo.dispose(), [geo]);

  return (
    <>
      <Canvas shadows camera={{ fov: 74, near: 0.1, far: 1500 }}>
        <SkyAndLight center={world.sizeX / 2} />
        <mesh geometry={geo} material={voxelMat} castShadow receiveShadow />
        <Vegetation world={world} />
        <Water size={world.sizeX} />
        <RemotePlayers net={net} />
        <Husks net={net} />
        <PlayerController world={world} spawn={spawn} edit={applyEdit} net={net} />

        <EffectComposer>
          <Bloom mipmapBlur luminanceThreshold={0.85} intensity={0.4} />
          <Vignette eskil={false} offset={0.25} darkness={0.55} />
          <Noise opacity={0.035} />
        </EffectComposer>
      </Canvas>
      <Hud />
    </>
  );
}
