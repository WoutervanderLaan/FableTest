/**
 * Pointer-lock FPS kinematic controller over the shared voxel collider.
 * Client-authoritative for Phase 0 (single-player); in Phase 1 the same
 * movement code becomes the client-side prediction path.
 */

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { PLAYER, moveWithCollisions, type VoxelZone } from "@ruderal/shared";
import { playerStatus } from "./status";

const WALK_SPEED = 5.5;
const RUN_SPEED = 8.5;
const SWIM_SPEED = 3.0;
const GRAVITY = 24;
const WATER_GRAVITY = 5;
const JUMP_VELOCITY = 8.2;
const SWIM_UP_VELOCITY = 3.4;

interface Props {
  vz: VoxelZone;
  spawn: { x: number; y: number; z: number };
}

export function PlayerController({ vz, spawn }: Props) {
  const { camera, gl } = useThree();
  const pos = useRef({ ...spawn });
  const vel = useRef({ x: 0, y: 0, z: 0 });
  const yaw = useRef(Math.PI * 0.25); // face north-east down the street
  const pitch = useRef(-0.05);
  const keys = useRef(new Set<string>());
  const locked = useRef(false);
  const grounded = useRef(false);
  const swimming = useRef(false);
  const frozen = useRef(false);

  // dev/debug hook: lets tooling (screenshot rigs, future zone inspector)
  // place the camera without walking there
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__ruderal = {
      teleport: (x: number, y: number, z: number, yawV = 0, pitchV = 0, freeze = false) => {
        pos.current = { x, y, z };
        vel.current = { x: 0, y: 0, z: 0 };
        yaw.current = yawV;
        pitch.current = pitchV;
        frozen.current = freeze;
      },
    };
    return () => {
      delete (window as unknown as Record<string, unknown>).__ruderal;
    };
  }, []);

  useEffect(() => {
    const canvas = gl.domElement;
    const onClick = () => {
      if (!locked.current) canvas.requestPointerLock();
    };
    const onLockChange = () => {
      locked.current = document.pointerLockElement === canvas;
      playerStatus.locked = locked.current;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!locked.current) return;
      yaw.current -= e.movementX * 0.0022;
      pitch.current = Math.max(-1.45, Math.min(1.45, pitch.current - e.movementY * 0.0022));
    };
    const onKeyDown = (e: KeyboardEvent) => {
      keys.current.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys.current.delete(e.code);
    };

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
  }, [gl]);

  useFrame((_, rawDt) => {
    if (frozen.current) {
      camera.position.set(pos.current.x, pos.current.y + PLAYER.eyeHeight, pos.current.z);
      camera.rotation.order = "YXZ";
      camera.rotation.set(pitch.current, yaw.current, 0);
      return;
    }
    const dt = Math.min(rawDt, 0.05);
    const k = keys.current;

    let fwd = 0;
    let strafe = 0;
    if (k.has("KeyW") || k.has("ArrowUp")) fwd += 1;
    if (k.has("KeyS") || k.has("ArrowDown")) fwd -= 1;
    if (k.has("KeyD") || k.has("ArrowRight")) strafe += 1;
    if (k.has("KeyA") || k.has("ArrowLeft")) strafe -= 1;

    const sy = Math.sin(yaw.current);
    const cy = Math.cos(yaw.current);
    // camera looks along -Z at yaw 0; forward in world = (-sin(yaw)·? ) — use
    // three's convention: forward = (-sinYaw, 0, -cosYaw), right = (cosYaw, 0, -sinYaw)
    let dx = -sy * fwd + cy * strafe;
    let dz = -cy * fwd - sy * strafe;
    const len = Math.hypot(dx, dz);
    if (len > 0) {
      dx /= len;
      dz /= len;
    }

    const inWater = swimming.current;
    const speed = inWater ? SWIM_SPEED : k.has("ShiftLeft") || k.has("ShiftRight") ? RUN_SPEED : WALK_SPEED;
    // ground movement is snappy, air control is limited
    const control = grounded.current || inWater ? 14 : 3;
    vel.current.x += (dx * speed - vel.current.x) * Math.min(1, control * dt);
    vel.current.z += (dz * speed - vel.current.z) * Math.min(1, control * dt);

    if (inWater) {
      vel.current.y -= WATER_GRAVITY * dt;
      vel.current.y = Math.max(vel.current.y, -2.2);
      if (k.has("Space")) vel.current.y = SWIM_UP_VELOCITY;
    } else {
      vel.current.y -= GRAVITY * dt;
      if (k.has("Space") && grounded.current) vel.current.y = JUMP_VELOCITY;
    }

    const r = moveWithCollisions(
      vz,
      pos.current.x,
      pos.current.y,
      pos.current.z,
      vel.current.x,
      vel.current.y,
      vel.current.z,
      dt,
    );
    grounded.current = r.onGround;
    swimming.current = r.inWater;

    // zone edge: soft invisible wall
    pos.current.x = Math.max(1.2, Math.min(vz.sizeX - 1.2, r.x));
    pos.current.z = Math.max(1.2, Math.min(vz.sizeZ - 1.2, r.z));
    pos.current.y = r.y;
    vel.current = { x: r.vx, y: r.vy, z: r.vz };

    // safety net: fell out of the world → respawn
    if (pos.current.y < -20) {
      pos.current = { ...spawn };
      vel.current = { x: 0, y: 0, z: 0 };
    }

    camera.position.set(pos.current.x, pos.current.y + PLAYER.eyeHeight, pos.current.z);
    camera.rotation.order = "YXZ";
    camera.rotation.set(pitch.current, yaw.current, 0);

    playerStatus.x = pos.current.x;
    playerStatus.y = pos.current.y;
    playerStatus.z = pos.current.z;
    playerStatus.yaw = yaw.current;
    playerStatus.swimming = swimming.current;
  });

  return null;
}
