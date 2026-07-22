/**
 * Module 13 — the client now connects to the server on load. The world and
 * controller are unchanged (still local); we've just opened a Colyseus room and
 * surface its status in the HUD. Nothing syncs yet — that's Module 14.
 *
 * The server URL comes from VITE_SERVER_URL (for deployment, Module 20),
 * defaulting to localhost.
 */
import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer, Noise, Vignette } from "@react-three/postprocessing";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { meshWorld } from "../shared/mesher";
import { generateWorld, surfaceY } from "../shared/voxel";
import { Net } from "./net/connection";
import { netStatus } from "./net/status";
import { PlayerController } from "./PlayerController";
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

  const { world, spawn } = useMemo(() => {
    const world = generateWorld();
    const cx = Math.floor(world.sizeX / 2);
    const cz = Math.floor(world.sizeZ / 2);
    const spawn = { x: cx + 0.5, y: surfaceY(world, cx, cz) + 1, z: cz + 0.5 };
    return { world, spawn };
  }, []);

  // Connect once on mount.
  useEffect(() => {
    let alive = true;
    Net.join(SERVER_URL, localStorage.getItem("name") ?? "wanderer")
      .then((n) => {
        if (!alive) return n.leave();
        net.current = n;
        netStatus.connected = true;
        netStatus.error = "";
      })
      .catch((e) => {
        netStatus.error = String(e.message ?? e);
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
  }, []);

  const voxelMat = useMemo(() => makeVoxelMaterial(), []);
  const geo = useMemo(() => buildGeometry(meshWorld(world)), [world, version]);
  useEffect(() => () => geo.dispose(), [geo]);
  const onEdit = useCallback(() => setVersion((v) => v + 1), []);
  const sendMove = useCallback(
    (x: number, y: number, z: number, yaw: number) => net.current?.sendMove(x, y, z, yaw),
    [],
  );

  return (
    <>
      <Canvas shadows camera={{ fov: 74, near: 0.1, far: 1500 }}>
        <SkyAndLight center={world.sizeX / 2} />
        <mesh geometry={geo} material={voxelMat} castShadow receiveShadow />
        <Vegetation world={world} />
        <Water size={world.sizeX} />
        <RemotePlayers net={net} />
        <PlayerController world={world} spawn={spawn} onEdit={onEdit} sendMove={sendMove} />

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
