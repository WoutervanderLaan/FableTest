/**
 * Module 07 — the first-person controller.
 *
 * It reads raw browser input (pointer-lock mouse + WASD), turns it into an
 * `InputSample`, runs the SHARED `stepPlayer`, and points the R3F camera at the
 * result. There is no Three.js movement math here — all of it lives in
 * `src/shared/`. That discipline is what makes Part 4 possible: the server will
 * run the exact same `stepPlayer` on the exact same world.
 *
 * It renders nothing (`return null`) — it only drives the camera each frame.
 */
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { PLAYER } from "../shared/collide";
import { stepPlayer, type PlayerPhys } from "../shared/movement";
import type { VoxelWorld } from "../shared/voxel";

export function PlayerController({
  world,
  spawn,
}: {
  world: VoxelWorld;
  spawn: { x: number; y: number; z: number };
}) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);

  // All mutable state lives in refs — this component never re-renders per frame.
  const phys = useRef<PlayerPhys>({
    x: spawn.x, y: spawn.y, z: spawn.z,
    vx: 0, vy: 0, vz: 0,
    grounded: false, swimming: false,
  });
  const yaw = useRef(0);
  const pitch = useRef(0);
  const keys = useRef<Set<string>>(new Set());
  const locked = useRef(false);

  useEffect(() => {
    const canvas = gl.domElement;
    // YXZ order = yaw around world-up first, then pitch. The right order for an
    // FPS camera (roll stays zero); the real PlayerController uses it too.
    camera.rotation.order = "YXZ";

    const onClick = () => {
      if (!locked.current) void canvas.requestPointerLock();
    };
    const onLockChange = () => {
      locked.current = document.pointerLockElement === canvas;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!locked.current) return;
      const sens = 0.0022;
      yaw.current -= e.movementX * sens;
      pitch.current -= e.movementY * sens;
      const lim = Math.PI / 2 - 0.01; // don't let the view flip over the poles
      pitch.current = Math.max(-lim, Math.min(lim, pitch.current));
    };
    const onKeyDown = (e: KeyboardEvent) => keys.current.add(e.code);
    const onKeyUp = (e: KeyboardEvent) => keys.current.delete(e.code);

    canvas.addEventListener("click", onClick);
    document.addEventListener("pointerlockchange", onLockChange);
    document.addEventListener("mousemove", onMouseMove);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      canvas.removeEventListener("click", onClick);
      document.removeEventListener("pointerlockchange", onLockChange);
      document.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [camera, gl]);

  useFrame((_state, delta) => {
    const k = keys.current;
    // Rotate WASD into WORLD space using the current yaw. At yaw 0 the camera
    // looks down -Z, so W pushes -Z and D pushes +X.
    const sinY = Math.sin(yaw.current);
    const cosY = Math.cos(yaw.current);
    let dx = 0;
    let dz = 0;
    if (k.has("KeyW")) { dx -= sinY; dz -= cosY; }
    if (k.has("KeyS")) { dx += sinY; dz += cosY; }
    if (k.has("KeyD")) { dx += cosY; dz -= sinY; }
    if (k.has("KeyA")) { dx -= cosY; dz += sinY; }

    stepPlayer(world, phys.current, {
      dx,
      dz,
      dt: delta,
      jump: k.has("Space"),
      run: k.has("ShiftLeft") || k.has("ShiftRight"),
    });

    // Camera sits at eye height above the player's feet.
    const p = phys.current;
    camera.position.set(p.x, p.y + PLAYER.eyeHeight, p.z);
    camera.rotation.y = yaw.current;
    camera.rotation.x = pitch.current;
  });

  return null;
}
