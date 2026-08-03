/**
 * Module 07B — a Rapier physics world sitting alongside the hand-rolled
 * collider, not replacing it.
 *
 * Division of labour, and the reasoning behind it:
 *
 *   THE PLAYER  → shared/movement.ts + shared/collide.ts (hand-rolled)
 *     Must be deterministic and reproducible frame-for-frame, because in
 *     Part 4 the client predicts with the same function the server uses to
 *     confirm. A general physics engine is the wrong tool for that: it's a
 *     black box full of solver iterations and floating-point accumulation.
 *
 *   EVERYTHING ELSE → Rapier (this file)
 *     Tumbling debris, thrown blocks, props knocked over. Nobody needs these
 *     to be reproducible; they need to look *right*, and rigid-body dynamics
 *     with friction and restitution is genuinely hard to write yourself.
 *
 * That is exactly how the real Ruderal is split — see the note at the top of
 * packages/shared/src/collide.ts and packages/server/src/physics.ts.
 */
import RAPIER from "@dimforge/rapier3d-compat";
import { isSolid } from "../../shared/blocks";
import { GRAVITY } from "../../shared/movement";
import { getVoxel, type VoxelWorld } from "../../shared/voxel";

export interface Physics {
  world: RAPIER.World;
  /** Dynamic bodies we spawned, in spawn order. */
  bodies: RAPIER.RigidBody[];
}

/**
 * Build the static world collider from voxels.
 *
 * Rapier has a purpose-built voxel shape: `ColliderDesc.voxels` takes a flat
 * Int32Array of (x,y,z) triples and a cell size. Cell (ix,iy,iz) spans
 * [ix, ix+1]·size — which is *exactly* our block convention, so there is no
 * translation offset to apply.
 *
 * We only feed it SHELL voxels: solid cells with at least one non-solid face
 * neighbour. That's the same "only the surface matters" insight the mesher is
 * built on (module 06) — a block buried inside a hill can never be touched, so
 * it costs nothing but memory. On a 64×40×64 world this is the difference
 * between ~160k cells and ~15k.
 */
export async function createPhysics(vw: VoxelWorld): Promise<Physics> {
  await RAPIER.init(); // loads the wasm; safe to call repeatedly

  const world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });

  const coords: number[] = [];
  const solidAt = (x: number, y: number, z: number) => isSolid(getVoxel(vw, x, y, z));

  for (let y = 0; y < vw.sizeY; y++) {
    for (let z = 0; z < vw.sizeZ; z++) {
      for (let x = 0; x < vw.sizeX; x++) {
        if (!solidAt(x, y, z)) continue;
        if (
          !solidAt(x - 1, y, z) ||
          !solidAt(x + 1, y, z) ||
          !solidAt(x, y - 1, z) ||
          !solidAt(x, y + 1, z) ||
          !solidAt(x, y, z - 1) ||
          !solidAt(x, y, z + 1)
        ) {
          coords.push(x, y, z);
        }
      }
    }
  }

  world.createCollider(
    RAPIER.ColliderDesc.voxels(new Int32Array(coords), { x: 1, y: 1, z: 1 }),
  );

  return { world, bodies: [] };
}

/** Spawn a tumbling cube. `half` is the half-extent, so 0.25 = a 0.5m block. */
export function spawnBox(
  p: Physics,
  x: number,
  y: number,
  z: number,
  vx = 0,
  vy = 0,
  vz = 0,
  half = 0.25,
): RAPIER.RigidBody {
  const body = p.world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y, z)
      .setLinvel(vx, vy, vz)
      // a little spin so it tumbles instead of sliding like a brick
      .setAngvel({ x: Math.random() - 0.5, y: Math.random() - 0.5, z: Math.random() - 0.5 })
      // continuous collision detection: stops a fast throw tunnelling through
      // a 1m wall between steps. Same problem module 07's substepping solves.
      .setCcdEnabled(true),
  );

  p.world.createCollider(
    RAPIER.ColliderDesc.cuboid(half, half, half).setRestitution(0.25).setFriction(0.9),
    body,
  );

  p.bodies.push(body);
  return body;
}

/** Drop the oldest bodies once we exceed `max`, so debris can't grow forever. */
export function trimBodies(p: Physics, max: number): void {
  while (p.bodies.length > max) {
    const body = p.bodies.shift();
    if (body) p.world.removeRigidBody(body); // removes its colliders too
  }
}

/**
 * Step the simulation with a FIXED timestep.
 *
 * Rapier integrates assuming a constant dt (default 1/60). Feeding it a raw,
 * variable frame delta makes the simulation jittery and frame-rate dependent —
 * the same class of bug as the naive damping in module 04D. Instead we bank
 * elapsed time and run whole steps, capping the backlog so a tab that was
 * backgrounded for 10s doesn't try to catch up with 600 steps at once.
 */
export function stepPhysics(p: Physics, dt: number, acc: { t: number }): void {
  const FIXED = 1 / 60;
  acc.t = Math.min(acc.t + dt, 0.25); // cap the backlog at 15 steps
  while (acc.t >= FIXED) {
    p.world.step();
    acc.t -= FIXED;
  }
}
