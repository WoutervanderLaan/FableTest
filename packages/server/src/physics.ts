/**
 * Server-owned Rapier world (Phase 2). The static world is ONE voxels
 * collider built from the shell of the voxel volume (solid voxels touching
 * non-solid), updated incrementally on edits — breaking a block un-fills its
 * cell and conservatively fills newly exposed solid neighbours.
 *
 * The @dimforge/rapier3d-compat version is pinned identically in server and
 * client package.json: prediction and cosmetic debris run the same build.
 */

import RAPIER from "@dimforge/rapier3d-compat";
import { GRAVITY, isSolid, type VoxelZone } from "@ruderal/shared";

export interface ProjectileBody {
  id: string;
  body: RAPIER.RigidBody;
  colliderHandle: number;
  block: number;
  bornAt: number;
  impacted: boolean;
}

export interface Impact {
  id: string;
  /** voxel most likely struck */
  vx: number;
  vy: number;
  vz: number;
  /** world position of the projectile at impact */
  px: number;
  py: number;
  pz: number;
}

/** Rapier voxel cell (ix,iy,iz) spans [ix,ix+1]·size — identical to our block
 *  grid, so no translation offset (verified empirically by test/physics-probe). */
const VOXEL_OFFSET = 0;

export class ZonePhysics {
  readonly world: RAPIER.World;
  private readonly voxelCollider: RAPIER.Collider;
  private readonly events: RAPIER.EventQueue;
  readonly projectiles = new Map<string, ProjectileBody>();
  private byColliderHandle = new Map<number, ProjectileBody>();

  static async create(vz: VoxelZone): Promise<ZonePhysics> {
    await RAPIER.init();
    return new ZonePhysics(vz);
  }

  private constructor(private vz: VoxelZone) {
    this.world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
    this.events = new RAPIER.EventQueue(true);

    // shell voxels only: solid with at least one non-solid face neighbour
    const coords: number[] = [];
    const { sizeX, sizeY, sizeZ, voxels } = vz;
    const solidAt = (x: number, y: number, z: number): boolean => {
      if (y < 0) return true;
      if (y >= sizeY || x < 0 || x >= sizeX || z < 0 || z >= sizeZ) return false;
      return isSolid(voxels[(y * sizeZ + z) * sizeX + x]);
    };
    for (let y = 0; y < sizeY; y++) {
      for (let z = 0; z < sizeZ; z++) {
        for (let x = 0; x < sizeX; x++) {
          if (!isSolid(voxels[(y * sizeZ + z) * sizeX + x])) continue;
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
    const desc = RAPIER.ColliderDesc.voxels(new Int32Array(coords), { x: 1, y: 1, z: 1 }).setTranslation(
      VOXEL_OFFSET,
      VOXEL_OFFSET,
      VOXEL_OFFSET,
    );
    this.voxelCollider = this.world.createCollider(desc);
  }

  /** Keep the collider in sync with a voxel edit. */
  applyEdit(x: number, y: number, z: number, solid: boolean): void {
    this.voxelCollider.setVoxel(x, y, z, solid);
    if (!solid) {
      // breaking may expose interior voxels the shell never contained
      const n: Array<[number, number, number]> = [
        [x - 1, y, z],
        [x + 1, y, z],
        [x, y - 1, z],
        [x, y + 1, z],
        [x, y, z - 1],
        [x, y, z + 1],
      ];
      for (const [nx, ny, nz] of n) {
        if (ny < 0 || ny >= this.vz.sizeY || nx < 0 || nx >= this.vz.sizeX || nz < 0 || nz >= this.vz.sizeZ) continue;
        if (isSolid(this.vz.voxels[(ny * this.vz.sizeZ + nz) * this.vz.sizeX + nx])) {
          this.voxelCollider.setVoxel(nx, ny, nz, true);
        }
      }
    }
  }

  spawnProjectile(id: string, px: number, py: number, pz: number, vx: number, vy: number, vz: number, block: number): void {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(px, py, pz).setLinvel(vx, vy, vz).setCcdEnabled(true),
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.ball(0.22)
        .setDensity(2.2)
        .setRestitution(0.35)
        .setFriction(0.9)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body,
    );
    const p: ProjectileBody = { id, body, colliderHandle: collider.handle, block, bornAt: Date.now(), impacted: false };
    this.projectiles.set(id, p);
    this.byColliderHandle.set(collider.handle, p);
  }

  removeProjectile(id: string): void {
    const p = this.projectiles.get(id);
    if (!p) return;
    this.byColliderHandle.delete(p.colliderHandle);
    this.world.removeRigidBody(p.body);
    this.projectiles.delete(id);
  }

  /** Step the world; returns first-impacts (one per projectile lifetime). */
  step(dtSeconds: number): Impact[] {
    this.world.timestep = dtSeconds;
    const impacts: Impact[] = [];
    // capture pre-step velocities so the impact voxel is along the incoming path
    const preVel = new Map<string, { x: number; y: number; z: number }>();
    for (const [id, p] of this.projectiles) preVel.set(id, { ...p.body.linvel() });

    this.world.step(this.events);

    this.events.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      const p = this.byColliderHandle.get(h1) ?? this.byColliderHandle.get(h2);
      if (!p || p.impacted) return;
      p.impacted = true;
      const t = p.body.translation();
      const v = preVel.get(p.id) ?? { x: 0, y: -1, z: 0 };
      const len = Math.hypot(v.x, v.y, v.z) || 1;
      impacts.push({
        id: p.id,
        vx: Math.floor(t.x + (v.x / len) * 0.6),
        vy: Math.floor(t.y + (v.y / len) * 0.6),
        vz: Math.floor(t.z + (v.z / len) * 0.6),
        px: t.x,
        py: t.y,
        pz: t.z,
      });
    });
    return impacts;
  }
}
