/**
 * Husks (Phase 4). Server-authoritative creatures that reuse the SAME shared
 * movement/collision the players and prediction use — a husk is just another
 * PlayerPhys driven by an AI intent instead of a keyboard. Sub-unit movement
 * intent scales their speed below the player walk speed without forking
 * stepPlayer (its intent is clamped to ≤1 then multiplied by WALK_SPEED).
 *
 * Behaviour is a small utility state machine, thought about on a budget
 * (HUSK_THINK_MS) rather than every tick: wander → chase nearest player in
 * aggro range → melee when adjacent → siege a player-placed block when one
 * stands between husk and target. Siege routes through the ordinary block
 * damage system, so the support lattice and durability all apply — attacking a
 * wall is the same code as a player mining it.
 */

import {
  HUSK_AGGRO_RANGE,
  HUSK_ATTACK_COOLDOWN_MS,
  HUSK_BLOCK_HIT_MS,
  HUSK_DAMAGE,
  HUSK_HP,
  HUSK_MELEE_RANGE,
  HUSK_MOVE_SCALE,
  HUSK_THINK_MS,
  hash01,
  isSolid,
  raycastVoxel,
  stepPlayer,
  type InputMsg,
  type PlayerPhys,
} from "@ruderal/shared";
import type { ServerWorld } from "./world";

export const HuskState = { Wander: 0, Chase: 1, Attack: 2, Siege: 3 } as const;

export interface HuskTarget {
  sid: string;
  x: number;
  y: number;
  z: number;
  hp: number;
}

export interface CreatureContext {
  world: ServerWorld;
  /** live, alive players the husk can perceive */
  players: () => HuskTarget[];
  /** deal damage to a player from a husk */
  hurtPlayer: (sid: string, amount: number, huskId: string) => void;
  /** damage a placed block during a siege (routes through durability) */
  siegeBlock: (x: number, y: number, z: number, amount: number) => void;
  /** a husk died: drop loot here */
  onHuskDeath: (x: number, y: number, z: number) => void;
}

export interface Husk {
  id: string;
  phys: PlayerPhys;
  hp: number;
  yaw: number;
  state: number;
  lastThink: number;
  lastAttack: number;
  lastBlockHit: number;
  // wander target heading
  wanderDx: number;
  wanderDz: number;
  wanderUntil: number;
  // stuck detection for hop / siege
  prevX: number;
  prevZ: number;
  stuckFrames: number;
  targetSid: string | null;
}

export class CreatureManager {
  readonly husks = new Map<string, Husk>();
  private seq = 0;

  constructor(private ctx: CreatureContext) {}

  get count(): number {
    return this.husks.size;
  }

  spawnAt(x: number, y: number, z: number): Husk {
    const id = `h${this.seq++}`;
    const husk: Husk = {
      id,
      phys: { x: x + 0.5, y, z: z + 0.5, vx: 0, vy: 0, vz: 0, grounded: false, swimming: false },
      hp: HUSK_HP,
      yaw: 0,
      state: HuskState.Wander,
      lastThink: 0,
      lastAttack: 0,
      lastBlockHit: 0,
      wanderDx: 0,
      wanderDz: 0,
      wanderUntil: 0,
      prevX: x,
      prevZ: z,
      stuckFrames: 0,
      targetSid: null,
    };
    this.husks.set(id, husk);
    return husk;
  }

  /** Apply damage to a husk; returns true if it died. */
  damage(id: string, amount: number): boolean {
    const h = this.husks.get(id);
    if (!h) return false;
    h.hp -= amount;
    if (h.hp <= 0) {
      this.ctx.onHuskDeath(Math.floor(h.phys.x), Math.floor(h.phys.y), Math.floor(h.phys.z));
      this.husks.delete(id);
      return true;
    }
    return false;
  }

  /** Nearest husk within radius of a point (for melee / projectile hits). */
  nearestHusk(x: number, y: number, z: number, radius: number): Husk | null {
    let best: Husk | null = null;
    let bestD2 = radius * radius;
    for (const h of this.husks.values()) {
      const dx = h.phys.x - x;
      const dy = h.phys.y + 0.9 - y;
      const dz = h.phys.z - z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 <= bestD2) {
        bestD2 = d2;
        best = h;
      }
    }
    return best;
  }

  tick(now: number, dt: number): void {
    const players = this.ctx.players();
    for (const h of this.husks.values()) {
      if (now - h.lastThink >= HUSK_THINK_MS) {
        h.lastThink = now;
        this.think(h, now, players);
      }
      this.act(h, now, dt);
    }
  }

  private think(h: Husk, now: number, players: HuskTarget[]): void {
    // acquire nearest alive player within aggro range
    let target: HuskTarget | null = null;
    let bestD2 = HUSK_AGGRO_RANGE * HUSK_AGGRO_RANGE;
    for (const p of players) {
      const dx = p.x - h.phys.x;
      const dy = p.y - h.phys.y;
      const dz = p.z - h.phys.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 <= bestD2) {
        bestD2 = d2;
        target = p;
      }
    }

    if (!target) {
      h.state = HuskState.Wander;
      h.targetSid = null;
      if (now >= h.wanderUntil) {
        const a = hash01(this.seq, Math.floor(h.phys.x), Math.floor(h.phys.z), now & 0xffff) * Math.PI * 2;
        h.wanderDx = Math.cos(a);
        h.wanderDz = Math.sin(a);
        h.wanderUntil = now + 2000 + hash01(now, h.phys.x | 0, h.phys.z | 0) * 3000;
      }
      return;
    }

    h.targetSid = target.sid;
    const dist = Math.hypot(target.x - h.phys.x, target.y - h.phys.y, target.z - h.phys.z);
    h.state = dist <= HUSK_MELEE_RANGE ? HuskState.Attack : HuskState.Chase;
  }

  private act(h: Husk, now: number, dt: number): void {
    const players = this.ctx.players();
    const target = h.targetSid ? players.find((p) => p.sid === h.targetSid) : undefined;

    let dx = 0;
    let dz = 0;
    let jump = false;

    if (target && (h.state === HuskState.Chase || h.state === HuskState.Attack || h.state === HuskState.Siege)) {
      const tx = target.x - h.phys.x;
      const tz = target.z - h.phys.z;
      const len = Math.hypot(tx, tz) || 1;
      const dirX = tx / len;
      const dirZ = tz / len;
      h.yaw = Math.atan2(-dirX, -dirZ); // face the target (YXZ, -z forward)

      const dist = Math.hypot(tx, target.y - h.phys.y, tz);
      if (dist <= HUSK_MELEE_RANGE) {
        h.state = HuskState.Attack;
        if (now - h.lastAttack >= HUSK_ATTACK_COOLDOWN_MS) {
          h.lastAttack = now;
          this.ctx.hurtPlayer(target.sid, HUSK_DAMAGE, h.id);
        }
      } else {
        // move toward target at reduced speed (sub-unit intent scales speed)
        dx = dirX * HUSK_MOVE_SCALE;
        dz = dirZ * HUSK_MOVE_SCALE;

        // stuck? either hop a step-up, or besiege a placed block in the way
        const movedSq = (h.phys.x - h.prevX) ** 2 + (h.phys.z - h.prevZ) ** 2;
        if (h.phys.grounded && movedSq < 0.0004) {
          h.stuckFrames++;
          if (h.stuckFrames > 3) {
            const blocked = this.blockInFront(h, dirX, dirZ);
            if (blocked && this.ctx.world.baselineBlock(blocked.x, blocked.y, blocked.z) === 0) {
              // player-placed obstruction → siege it
              h.state = HuskState.Siege;
              if (now - h.lastBlockHit >= HUSK_BLOCK_HIT_MS) {
                h.lastBlockHit = now;
                this.ctx.siegeBlock(blocked.x, blocked.y, blocked.z, 1);
              }
            } else {
              jump = true; // natural terrain step-up
            }
            h.stuckFrames = 0;
          }
        } else {
          h.stuckFrames = 0;
        }
      }
    } else {
      // wander
      dx = h.wanderDx * HUSK_MOVE_SCALE * 0.6;
      dz = h.wanderDz * HUSK_MOVE_SCALE * 0.6;
      if (dx !== 0 || dz !== 0) h.yaw = Math.atan2(-dx, -dz);
      const movedSq = (h.phys.x - h.prevX) ** 2 + (h.phys.z - h.prevZ) ** 2;
      if (h.phys.grounded && movedSq < 0.0004) {
        h.wanderUntil = 0; // pick a new heading next think
        jump = true;
      }
    }

    h.prevX = h.phys.x;
    h.prevZ = h.phys.z;

    const input: InputMsg = { seq: 0, dt, dx, dz, run: false, jump };
    stepPlayer(this.ctx.world.vz, h.phys, input);
  }

  /** Raycast a short distance ahead at torso height; return the solid cell hit. */
  private blockInFront(h: Husk, dirX: number, dirZ: number): { x: number; y: number; z: number } | null {
    const ox = h.phys.x;
    const oy = h.phys.y + 1.0;
    const oz = h.phys.z;
    const hit = raycastVoxel(this.ctx.world.vz, ox, oy, oz, dirX, 0, dirZ, 1.5);
    if (hit && isSolid(hit.block)) return { x: hit.x, y: hit.y, z: hit.z };
    // also check foot height (low walls)
    const low = raycastVoxel(this.ctx.world.vz, ox, h.phys.y + 0.3, oz, dirX, 0, dirZ, 1.5);
    if (low && isSolid(low.block)) return { x: low.x, y: low.y, z: low.z };
    return null;
  }
}
