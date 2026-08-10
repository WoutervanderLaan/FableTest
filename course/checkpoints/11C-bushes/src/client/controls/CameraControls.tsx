/**
 * Module 02B — a camera you can inspect things with. Orbit, pan, dolly, and a
 * WASD/QE fly, all smoothed.
 *
 * This is drei's <OrbitControls> built by hand, plus keyboard movement. It's
 * ~120 lines and worth writing once, because every 3D tool you'll ever use has
 * this exact control scheme and knowing why it feels good is transferable.
 *
 * THE MODEL: spherical coordinates around a target point.
 *
 *   target        the point we orbit and look at
 *   radius        distance from target        ← wheel
 *   theta         azimuth, around Y           ← horizontal drag
 *   phi           polar angle from +Y         ← vertical drag
 *
 * Position is derived, never stored:
 *
 *   x = target.x + r·sin(phi)·sin(theta)
 *   y = target.y + r·cos(phi)
 *   z = target.z + r·sin(phi)·cos(theta)
 *
 * phi is clamped just inside 0..PI. Exactly at a pole the camera's "up" is
 * undefined and the view flips — the classic gimbal snap.
 *
 * THE FEEL: every input writes to a *desired* value; each frame the *current*
 * value eases toward it by `1 - exp(-lambda·dt)`. That formula (and not a
 * fixed `* 0.1`) is what makes the motion identical at 30, 60 and 144fps.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/** Frame-rate-independent damping: fraction of the way to move this frame. */
export function damp(lambda: number, dt: number): number {
  return 1 - Math.exp(-lambda * dt);
}

const EPS = 1e-4;

export interface CameraControlsProps {
  target?: [number, number, number];
  radius?: number;
  /** Higher = snappier. 6–12 feels responsive; 2–3 feels cinematic. */
  lambda?: number;
  minRadius?: number;
  maxRadius?: number;
  /** Units per second for WASD. */
  moveSpeed?: number;
}

export function CameraControls({
  target = [0, 0, 0],
  radius = 8,
  lambda = 9,
  minRadius = 0.6,
  maxRadius = 400,
  moveSpeed = 6,
}: CameraControlsProps) {
  const { camera, gl } = useThree();

  // Desired (input writes here) and current (render reads here).
  const want = useRef({
    theta: Math.PI * 0.25,
    phi: Math.PI * 0.38,
    radius,
    target: new THREE.Vector3(...target),
  });
  const now = useRef({
    theta: Math.PI * 0.25,
    phi: Math.PI * 0.38,
    radius,
    target: new THREE.Vector3(...target),
  });

  const keys = useRef(new Set<string>());
  const scratch = useMemo(
    () => ({ forward: new THREE.Vector3(), right: new THREE.Vector3(), move: new THREE.Vector3() }),
    [],
  );

  useEffect(() => {
    const el = gl.domElement;
    let dragging: 0 | 1 | 2 | null = null;
    let lastX = 0;
    let lastY = 0;

    const onDown = (e: PointerEvent) => {
      dragging = e.button as 0 | 1 | 2;
      lastX = e.clientX;
      lastY = e.clientY;
      el.setPointerCapture(e.pointerId);
    };

    const onMove = (e: PointerEvent) => {
      if (dragging === null) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      const w = want.current;

      // left button (or any drag with shift held) = orbit
      if (dragging === 0 && !e.shiftKey) {
        w.theta -= dx * 0.005;
        w.phi -= dy * 0.005;
        w.phi = Math.max(EPS, Math.min(Math.PI - EPS, w.phi)); // never hit a pole
        return;
      }

      // right/middle button (or shift+left) = pan, in the camera's own plane.
      // Scaling by radius keeps the drag feeling 1:1 at any zoom level.
      const panScale = w.radius * 0.0015;
      scratch.right.setFromMatrixColumn(camera.matrix, 0); // camera X axis
      scratch.forward.setFromMatrixColumn(camera.matrix, 1); // camera Y axis
      w.target.addScaledVector(scratch.right, -dx * panScale);
      w.target.addScaledVector(scratch.forward, dy * panScale);
    };

    const onUp = (e: PointerEvent) => {
      dragging = null;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };

    // Multiplicative zoom: each notch changes radius by a percentage, so it
    // feels the same whether you're 1 unit or 200 units away. Additive zoom
    // crawls when far and overshoots when close.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const w = want.current;
      w.radius = Math.max(minRadius, Math.min(maxRadius, w.radius * Math.exp(e.deltaY * 0.001)));
    };

    const onContext = (e: Event) => e.preventDefault(); // right-drag shouldn't open a menu
    const onKeyDown = (e: KeyboardEvent) => keys.current.add(e.code);
    const onKeyUp = (e: KeyboardEvent) => keys.current.delete(e.code);
    const onBlur = () => keys.current.clear(); // don't get stuck moving on alt-tab

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("contextmenu", onContext);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("contextmenu", onContext);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [camera, gl, minRadius, maxRadius, scratch]);

  useFrame((_state, delta) => {
    const w = want.current;
    const c = now.current;

    // --- keyboard fly: move the TARGET, camera follows ---
    const k = keys.current;
    if (k.size) {
      // forward is the view direction flattened to the ground plane, so W
      // always walks along the floor instead of burrowing into it
      scratch.forward.set(Math.sin(c.theta), 0, Math.cos(c.theta)).normalize();
      scratch.right.set(scratch.forward.z, 0, -scratch.forward.x);
      scratch.move.set(0, 0, 0);

      if (k.has("KeyW")) scratch.move.sub(scratch.forward);
      if (k.has("KeyS")) scratch.move.add(scratch.forward);
      if (k.has("KeyA")) scratch.move.sub(scratch.right);
      if (k.has("KeyD")) scratch.move.add(scratch.right);
      if (k.has("KeyE")) scratch.move.y += 1;
      if (k.has("KeyQ")) scratch.move.y -= 1;

      if (scratch.move.lengthSq() > 0) {
        const boost = k.has("ShiftLeft") || k.has("ShiftRight") ? 3 : 1;
        scratch.move.normalize().multiplyScalar(moveSpeed * boost * delta);
        w.target.add(scratch.move);
      }
    }

    // --- ease current toward desired ---
    const t = damp(lambda, delta);
    c.theta += (w.theta - c.theta) * t;
    c.phi += (w.phi - c.phi) * t;
    c.radius += (w.radius - c.radius) * t;
    c.target.lerp(w.target, t);

    // --- derive the camera position from the spherical coords ---
    const sinPhi = Math.sin(c.phi);
    camera.position.set(
      c.target.x + c.radius * sinPhi * Math.sin(c.theta),
      c.target.y + c.radius * Math.cos(c.phi),
      c.target.z + c.radius * sinPhi * Math.cos(c.theta),
    );
    camera.lookAt(c.target);
  });

  return null;
}
