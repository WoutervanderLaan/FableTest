/**
 * Module 18D (deep-dive) — server-authoritative enemy AI.
 *
 * The payoff of the shared-`stepPlayer` design pays off a THIRD time here: husks
 * move through the exact same physics as players and the exact same collider.
 * Their "brain" just decides an input each tick (chase the nearest player, or
 * wander) and hands it to `stepPlayer`. Client prediction, server authority, and
 * now NPC AI — one movement function, three callers. That's the real Ruderal's
 * `creatures.ts` in miniature.
 */
import { stepPlayer, type PlayerPhys } from "../shared/movement";
import { HuskS, type ZoneState } from "../shared/schema";
import { surfaceY, type VoxelWorld } from "../shared/voxel";

const AGGRO_RANGE = 22; // blocks

interface Husk {
  phys: PlayerPhys;
  wanderDir: number;
  wanderT: number;
}

export class CreatureManager {
  private husks = new Map<string, Husk>();
  private nextId = 0;

  constructor(
    private world: VoxelWorld,
    private state: ZoneState,
  ) {}

  spawn(count: number): void {
    for (let i = 0; i < count; i++) {
      const x = 8 + Math.floor(Math.random() * (this.world.sizeX - 16));
      const z = 8 + Math.floor(Math.random() * (this.world.sizeZ - 16));
      const y = surfaceY(this.world, x, z) + 1;
      const id = "h" + this.nextId++;
      this.husks.set(id, {
        phys: { x: x + 0.5, y, z: z + 0.5, vx: 0, vy: 0, vz: 0, grounded: false, swimming: false },
        wanderDir: Math.random() * Math.PI * 2,
        wanderT: 0,
      });
      const hs = new HuskS();
      hs.x = x + 0.5;
      hs.y = y;
      hs.z = z + 0.5;
      this.state.husks.set(id, hs);
    }
  }

  tick(dt: number): void {
    for (const [id, h] of this.husks) {
      // Find the nearest player (squared distance — no sqrt in the hot loop).
      let tx = 0;
      let tz = 0;
      let found = false;
      let bestD = Infinity;
      this.state.players.forEach((p) => {
        const d = (p.x - h.phys.x) ** 2 + (p.z - h.phys.z) ** 2;
        if (d < bestD) {
          bestD = d;
          tx = p.x;
          tz = p.z;
          found = true;
        }
      });

      let dx = 0;
      let dz = 0;
      const chasing = found && bestD < AGGRO_RANGE * AGGRO_RANGE;

      if (chasing) {
        // Head straight for the player.
        dx = tx - h.phys.x;
        dz = tz - h.phys.z;
        const len = Math.hypot(dx, dz) || 1;
        dx /= len;
        dz /= len;
      } else {
        // Wander: pick a new heading every few seconds, amble slowly.
        h.wanderT -= dt;
        if (h.wanderT <= 0) {
          h.wanderDir = Math.random() * Math.PI * 2;
          h.wanderT = 2 + Math.random() * 3;
        }
        dx = Math.sin(h.wanderDir) * 0.5;
        dz = Math.cos(h.wanderDir) * 0.5;
      }

      // The same physics step players use. Run when chasing.
      stepPlayer(this.world, h.phys, { dx, dz, dt, jump: false, run: chasing });

      const hs = this.state.husks.get(id);
      if (hs) {
        hs.x = h.phys.x;
        hs.y = h.phys.y;
        hs.z = h.phys.z;
        if (dx !== 0 || dz !== 0) hs.yaw = Math.atan2(dx, dz);
        hs.state = chasing ? 1 : 0;
      }
    }
  }
}
