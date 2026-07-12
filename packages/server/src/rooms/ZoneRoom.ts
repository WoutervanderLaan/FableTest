/**
 * The authoritative zone. One room = one geographic zone (plan §3.5).
 *
 * - movement: clients stream inputs; the server simulates them through the
 *   SAME shared stepPlayer/collider the client predicts with, and snapshots
 *   position + lastSeq at 10 Hz for client reconciliation
 * - edits: validated (reach, rate, rules, inventory), applied, journaled,
 *   broadcast; invalid requests get a targeted rollback message
 * - structure: every break/place runs the support lattice; unsupported
 *   clusters are removed server-side and broadcast as a collapse
 * - projectiles: server-owned Rapier bodies; first impact damages the voxel
 */

import { Client, Room } from "colyseus";
import {
  Block,
  DROP_OF,
  DROP_PICKUP_RADIUS,
  EDIT_BURST,
  EDIT_REFILL_PER_S,
  HARDNESS,
  INPUT_QUEUE_MAX,
  MAX_CLIENTS,
  MAX_INPUT_DT,
  MSG,
  PATCH_MS,
  PLACEABLE,
  PLAYER,
  PROJECTILE_DAMAGE,
  PROJECTILE_TTL_MS,
  REACH,
  SUPPORT_BUDGET,
  THROW_COOLDOWN_MS,
  THROW_SPEED,
  TICK_MS,
  collectUnsupported,
  findSpawn,
  getVoxel,
  isSolid,
  packXYZ,
  START_INVENTORY,
  stepPlayer,
  unpackX,
  unpackY,
  unpackZ,
  type InputMsg,
  type PlayerPhys,
} from "@ruderal/shared";
import type { EditLog } from "../editlog";
import type { ZonePhysics } from "../physics";
import type { ServerWorld } from "../world";
import { DropS, PlayerS, ProjectileS, ZoneState } from "../schema";

export interface ZoneRoomContext {
  world: ServerWorld;
  log: EditLog;
  physics: ZonePhysics;
}

interface TokenBucket {
  tokens: number;
  last: number;
}

export class ZoneRoom extends Room<ZoneState> {
  maxClients = MAX_CLIENTS;
  autoDispose = false;

  private world!: ServerWorld;
  private log!: EditLog;
  private physics!: ZonePhysics;

  private inputs = new Map<string, InputMsg[]>();
  private phys = new Map<string, PlayerPhys>();
  private editTokens = new Map<string, TokenBucket>();
  private simBudget = new Map<string, { simTime: number; wallStart: number }>();
  private lastThrow = new Map<string, number>();
  private joinCount = 0;
  private projSeq = 0;
  private dropSeq = 0;

  onCreate(ctx: ZoneRoomContext) {
    this.world = ctx.world;
    this.log = ctx.log;
    this.physics = ctx.physics;

    this.setState(new ZoneState());
    this.setPatchRate(PATCH_MS);
    this.setSimulationInterval(() => this.tick(), TICK_MS);

    this.onMessage(MSG.input, (client, msgs: InputMsg[]) => {
      if (!Array.isArray(msgs)) return;
      const q = this.inputs.get(client.sessionId);
      if (!q) return;
      for (const m of msgs) {
        if (typeof m?.seq !== "number" || typeof m?.dt !== "number") continue;
        if (q.length >= INPUT_QUEUE_MAX) q.shift();
        q.push({
          seq: m.seq >>> 0,
          dt: Math.min(Math.max(m.dt, 0), MAX_INPUT_DT),
          dx: Number(m.dx) || 0,
          dz: Number(m.dz) || 0,
          run: !!m.run,
          jump: !!m.jump,
          yaw: Number(m.yaw) || 0,
        });
      }
    });

    this.onMessage(MSG.edit, (client, m: { p: number; b: number }) => this.handlePlace(client, m));
    this.onMessage(MSG.hit, (client, m: { p: number }) => this.handleHit(client, m));
    this.onMessage(MSG.throw, (client, m: { dx: number; dy: number; dz: number }) => this.handleThrow(client, m));
    this.onMessage(MSG.ping, (client, t: number) => client.send(MSG.pong, t));
  }

  onJoin(client: Client, options: { name?: string }) {
    const name = String(options?.name ?? "wanderer").slice(0, 16) || "wanderer";
    const spawn = findSpawn(this.world.vz, this.joinCount++);

    const p: PlayerPhys = { x: spawn.x, y: spawn.y, z: spawn.z, vx: 0, vy: 0, vz: 0, grounded: false, swimming: false };
    this.phys.set(client.sessionId, p);
    this.inputs.set(client.sessionId, []);
    this.editTokens.set(client.sessionId, { tokens: EDIT_BURST, last: Date.now() });
    this.simBudget.set(client.sessionId, { simTime: 0, wallStart: Date.now() });

    const s = new PlayerS();
    s.name = name;
    s.x = spawn.x;
    s.y = spawn.y;
    s.z = spawn.z;
    for (const [b, n] of Object.entries(START_INVENTORY)) s.inv.set(b, n);
    this.state.players.set(client.sessionId, s);

    client.send(MSG.init, {
      id: client.sessionId,
      spawn,
      edits: this.world.editPairs(),
    });
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.phys.delete(client.sessionId);
    this.inputs.delete(client.sessionId);
    this.editTokens.delete(client.sessionId);
    this.simBudget.delete(client.sessionId);
    this.lastThrow.delete(client.sessionId);
  }

  onDispose() {
    this.log.compact(this.world.editPairs());
  }

  // ---------------- tick ----------------

  private tick() {
    const now = Date.now();

    // movement: drain each player's input queue through the shared simulation
    for (const [sid, q] of this.inputs) {
      const p = this.phys.get(sid);
      const s = this.state.players.get(sid);
      const budget = this.simBudget.get(sid);
      if (!p || !s || !budget) continue;

      // anti-speedhack: simulated time may not outrun wall time by >25%
      let allowance = ((now - budget.wallStart) / 1000) * 1.25 + 0.25 - budget.simTime;
      while (q.length > 0) {
        const input = q.shift()!;
        if (input.dt <= allowance) {
          stepPlayer(this.world.vz, p, input);
          budget.simTime += input.dt;
          allowance -= input.dt;
        }
        s.lastSeq = input.seq; // always ack, even when throttled
        if (input.yaw !== undefined) s.yaw = input.yaw;
      }
      if (p.y < -20) {
        const spawn = findSpawn(this.world.vz, this.joinCount++);
        Object.assign(p, { x: spawn.x, y: spawn.y, z: spawn.z, vx: 0, vy: 0, vz: 0 });
      }
      s.x = p.x;
      s.y = p.y;
      s.z = p.z;
      s.vx = p.vx;
      s.vy = p.vy;
      s.vz = p.vz;
      s.grounded = p.grounded;
      s.swimming = p.swimming;
    }

    // projectiles
    const impacts = this.physics.step(TICK_MS / 1000);
    for (const impact of impacts) {
      if (process.env.RUDERAL_DEBUG) {
        console.log(
          `[impact] voxel ${impact.vx},${impact.vy},${impact.vz} block=${getVoxel(this.world.vz, impact.vx, impact.vy, impact.vz)} at ${impact.px.toFixed(1)},${impact.py.toFixed(1)},${impact.pz.toFixed(1)}`,
        );
      }
      this.damageVoxel(impact.vx, impact.vy, impact.vz, PROJECTILE_DAMAGE, null);
    }
    for (const [id, pb] of this.physics.projectiles) {
      const s = this.state.projectiles.get(id);
      if (now - pb.bornAt > PROJECTILE_TTL_MS) {
        this.physics.removeProjectile(id);
        this.state.projectiles.delete(id);
        continue;
      }
      if (s) {
        const t = pb.body.translation();
        s.x = t.x;
        s.y = t.y;
        s.z = t.z;
      }
    }

    // drops: proximity pickup
    for (const [id, d] of this.state.drops) {
      for (const [sid, p] of this.phys) {
        const dx = d.x - p.x;
        const dy = d.y - (p.y + 0.9);
        const dz = d.z - p.z;
        if (dx * dx + dy * dy + dz * dz <= DROP_PICKUP_RADIUS * DROP_PICKUP_RADIUS) {
          const s = this.state.players.get(sid);
          if (s) {
            const k = String(d.b);
            s.inv.set(k, Math.min(999, (s.inv.get(k) ?? 0) + 1));
          }
          this.state.drops.delete(id);
          break;
        }
      }
    }
  }

  // ---------------- edits ----------------

  private takeEditToken(sid: string): boolean {
    const tb = this.editTokens.get(sid);
    if (!tb) return false;
    const now = Date.now();
    tb.tokens = Math.min(EDIT_BURST, tb.tokens + ((now - tb.last) / 1000) * EDIT_REFILL_PER_S);
    tb.last = now;
    if (tb.tokens < 1) return false;
    tb.tokens -= 1;
    return true;
  }

  private inReach(sid: string, x: number, y: number, z: number): boolean {
    const p = this.phys.get(sid);
    if (!p) return false;
    const dx = x + 0.5 - p.x;
    const dy = y + 0.5 - (p.y + PLAYER.eyeHeight);
    const dz = z + 0.5 - p.z;
    return dx * dx + dy * dy + dz * dz <= REACH * REACH;
  }

  private reject(client: Client, p: number) {
    client.send(MSG.reject, [p, getVoxel(this.world.vz, unpackX(p), unpackY(p), unpackZ(p))]);
  }

  private handlePlace(client: Client, m: { p: number; b: number }) {
    if (typeof m?.p !== "number" || typeof m?.b !== "number") return;
    const x = unpackX(m.p);
    const y = unpackY(m.p);
    const z = unpackZ(m.p);
    const s = this.state.players.get(client.sessionId);
    if (!s) return;

    const current = getVoxel(this.world.vz, x, y, z);
    const invKey = String(m.b);
    const valid =
      this.takeEditToken(client.sessionId) &&
      PLACEABLE.has(m.b) &&
      (current === Block.Air || current === Block.Water) &&
      this.inReach(client.sessionId, x, y, z) &&
      (s.inv.get(invKey) ?? 0) > 0 &&
      !this.overlapsAnyPlayer(x, y, z);

    if (!valid) {
      this.reject(client, m.p);
      return;
    }

    s.inv.set(invKey, (s.inv.get(invKey) ?? 0) - 1);
    this.commitEdit(x, y, z, m.b);
    // a placement with no path to ground falls right back down
    this.runSupportCheck([[x, y, z]]);
  }

  private handleHit(client: Client, m: { p: number }) {
    if (typeof m?.p !== "number") return;
    const x = unpackX(m.p);
    const y = unpackY(m.p);
    const z = unpackZ(m.p);
    if (!this.takeEditToken(client.sessionId)) return;
    if (!this.inReach(client.sessionId, x, y, z)) return;
    this.damageVoxel(x, y, z, 1, client);
  }

  private handleThrow(client: Client, m: { dx: number; dy: number; dz: number }) {
    const now = Date.now();
    if (now - (this.lastThrow.get(client.sessionId) ?? 0) < THROW_COOLDOWN_MS) return;
    const p = this.phys.get(client.sessionId);
    if (!p) return;
    const len = Math.hypot(Number(m?.dx) || 0, Number(m?.dy) || 0, Number(m?.dz) || 0);
    if (!len) return;
    this.lastThrow.set(client.sessionId, now);

    const dx = m.dx / len;
    const dy = m.dy / len;
    const dz = m.dz / len;
    const id = `p${this.projSeq++}`;
    const ex = p.x + dx * 0.7;
    const ey = p.y + PLAYER.eyeHeight + dy * 0.7;
    const ez = p.z + dz * 0.7;
    this.physics.spawnProjectile(
      id,
      ex,
      ey,
      ez,
      dx * THROW_SPEED + p.vx * 0.5,
      dy * THROW_SPEED,
      dz * THROW_SPEED + p.vz * 0.5,
      Block.Rubble,
    );
    const ps = new ProjectileS();
    ps.x = ex;
    ps.y = ey;
    ps.z = ez;
    ps.b = Block.Rubble;
    this.state.projectiles.set(id, ps);
  }

  private damageVoxel(x: number, y: number, z: number, amount: number, byClient: Client | null) {
    const b = getVoxel(this.world.vz, x, y, z);
    if (!isSolid(b)) return;
    const need = HARDNESS[b];
    if (!need) return; // unbreakable
    const p = packXYZ(x, y, z);
    const d = (this.world.damage.get(p) ?? 0) + amount;
    if (d < need) {
      this.world.damage.set(p, d);
      byClient?.send(MSG.damage, { p, d, need });
      return;
    }
    this.breakBlock(x, y, z, b);
  }

  private breakBlock(x: number, y: number, z: number, prev: number) {
    this.commitEdit(x, y, z, Block.Air);
    this.spawnDropFor(x, y, z, prev);
    const seeds: Array<[number, number, number]> = [
      [x - 1, y, z],
      [x + 1, y, z],
      [x, y - 1, z],
      [x, y + 1, z],
      [x, y, z - 1],
      [x, y, z + 1],
    ];
    this.runSupportCheck(seeds);
  }

  private runSupportCheck(seeds: Array<[number, number, number]>) {
    const falling = collectUnsupported(this.world.vz, this.world.pack.terrain, seeds, SUPPORT_BUDGET);
    if (falling.length === 0) return;
    const pairs: number[] = [];
    let drops = 0;
    for (const f of falling) {
      const prev = this.world.applyEdit(f.x, f.y, f.z, Block.Air);
      if (prev === null) continue;
      const p = packXYZ(f.x, f.y, f.z);
      this.log.append(p, Block.Air);
      this.physics.applyEdit(f.x, f.y, f.z, false);
      pairs.push(p, prev);
      if (drops < 30 && this.spawnDropFor(f.x, f.y, f.z, prev)) drops++;
    }
    if (pairs.length > 0) this.broadcast(MSG.collapse, pairs);
  }

  private commitEdit(x: number, y: number, z: number, b: number) {
    const prev = this.world.applyEdit(x, y, z, b);
    if (prev === null) return;
    const p = packXYZ(x, y, z);
    this.log.append(p, b);
    this.physics.applyEdit(x, y, z, isSolid(b));
    this.broadcast(MSG.edits, [p, b]);
  }

  private spawnDropFor(x: number, y: number, z: number, brokenBlock: number): boolean {
    const yields = DROP_OF[brokenBlock];
    if (!yields) return false;
    if (this.state.drops.size >= 300) {
      const first = this.state.drops.keys().next().value;
      if (first) this.state.drops.delete(first);
    }
    const d = new DropS();
    d.x = x + 0.5;
    d.y = y + 0.35;
    d.z = z + 0.5;
    d.b = yields;
    this.state.drops.set(`d${this.dropSeq++}`, d);
    return true;
  }

  private overlapsAnyPlayer(x: number, y: number, z: number): boolean {
    for (const p of this.phys.values()) {
      if (
        x + 1 > p.x - PLAYER.halfWidth &&
        x < p.x + PLAYER.halfWidth &&
        z + 1 > p.z - PLAYER.halfWidth &&
        z < p.z + PLAYER.halfWidth &&
        y + 1 > p.y &&
        y < p.y + PLAYER.height
      ) {
        return true;
      }
    }
    return false;
  }
}
