/**
 * Module 04D — camera work and layout, the parts of "a stunning scene" that
 * aren't shaders.
 *
 * The one piece of real math here is FRAME-RATE-INDEPENDENT DAMPING.
 *
 * The tempting way to smooth a value is `current += (target - current) * 0.1`
 * every frame. It looks fine at 60fps and is subtly wrong: at 144fps it
 * converges 2.4× faster, at 30fps half as fast. Your camera feel becomes a
 * function of the player's monitor.
 *
 * The fix is exponential decay. Over time dt, the fraction of the remaining
 * distance you should cover is:
 *
 *     t = 1 - exp(-lambda * dt)
 *
 * `lambda` is a rate in "e-folds per second" — higher is snappier — and the
 * result is identical at any frame rate. This is the same shape as Module 07's
 * `control` factor and the interpolation in Part 4.
 */
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/** Fraction of the way to move this frame, independent of frame rate. */
export function damp(lambda: number, dt: number): number {
  return 1 - Math.exp(-lambda * dt);
}

/** Classic ease-in-out curve on 0..1. Same smoothstep you meet in GLSL. */
export function smoothstep(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

/**
 * A slow orbit that eases toward wherever `target` points.
 *
 * `makeDefault` is deliberately NOT used: we drive R3F's existing camera by
 * mutating it in useFrame, which is the cheapest possible camera controller
 * and never triggers a React render.
 */
export function CameraRig({
  target = [8, 2, 8] as [number, number, number],
  radius = 22,
  height = 9,
  speed = 0.12,
  lambda = 2.5,
}) {
  const { camera } = useThree();
  const look = useRef(new THREE.Vector3(...target));
  const desired = useMemo(() => new THREE.Vector3(), []);
  const goal = useMemo(() => new THREE.Vector3(...target), [target]);

  useFrame((state, delta) => {
    const a = state.clock.elapsedTime * speed;
    desired.set(
      goal.x + Math.cos(a) * radius,
      goal.y + height,
      goal.z + Math.sin(a) * radius,
    );

    // ease position AND the look-at target, so cuts never snap
    const t = damp(lambda, delta);
    camera.position.lerp(desired, t);
    look.current.lerp(goal, t);
    camera.lookAt(look.current);
  });

  return null;
}

/**
 * Lay children out on a circle. Composition is mostly arithmetic: rings,
 * grids and jitter beat hand-placing forty objects.
 */
export function Ring({
  count,
  radius,
  center = [0, 0, 0] as [number, number, number],
  children,
}: {
  count: number;
  radius: number;
  center?: [number, number, number];
  children: (pos: [number, number, number], i: number) => React.ReactNode;
}) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const a = (i / count) * Math.PI * 2;
        const pos: [number, number, number] = [
          center[0] + Math.cos(a) * radius,
          center[1],
          center[2] + Math.sin(a) * radius,
        ];
        return <group key={i}>{children(pos, i)}</group>;
      })}
    </>
  );
}
