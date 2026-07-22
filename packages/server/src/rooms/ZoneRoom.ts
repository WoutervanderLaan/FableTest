/**
 * The authoritative zone room (Phases 1–4). One room = one geographic zone,
 * matched by zoneId (Colyseus filterBy). The room acquires its world from the
 * ZoneService on create and releases it on dispose (autoDispose = the room
 * dies when empty, which is what triggers zone hibernation).
 *
 * Systems, in tick order: player movement (shared sim) → creatures (shared
 * sim) → projectiles → drops → health regen → trade expiry.
 */

import { Client, Room } from "@colyseus/core";
import {
  Block,
  DROP_OF,
  DROP_PICKUP_RADIUS,
  EDIT_BURST,
  EDIT_REFILL_PER_S,
  HARDNESS,
  HUSK_MELEE_RANGE,
  INPUT_QUEUE_MAX,
  MAX_CLIENTS,
  MAX_INPUT_DT,
  MELEE_DAMAGE,
  MELEE_RANGE,
  MSG,
  NODE_RESPAWN_MS,
  NODE_YIELDS,
  PATCH_MS,
  PLACEABLE,
  PLAYER,
  PLAYER_MAX_HP,
  PLAYER_REGEN_DELAY_MS,
  PLAYER_REGEN_PER_S,
  PROJECTILE_CREATURE_DAMAGE,
  PROJECTILE_DAMAGE,
  PROJECTILE_TTL_MS,
  REACH,
  SUPPORT_BUDGET,
  START_INVENTORY,
  THROW_COOLDOWN_MS,
  THROW_SPEED,
  TICK_MS,
  TRADE_RANGE,
  TRADE_TTL_MS,
  collectUnsupported,
  findSpawn,
  getVoxel,
  hash01,
  isSolid,
  packXYZ,
  stepPlayer,
  surfaceY,
  unpackX,
  unpackY,
  unpackZ,
  type InputMsg,
  type PlayerPhys,
} from "@ruderal/shared";
import { CreatureManager, type HuskTarget } from "../creatures";
import type { LoadedZone, ZoneService } from "../zoneservice";
import type { PlayerRecord } from "../playerstore";
import { DropS, HuskS, PlayerS, ProjectileS, ZoneState } from "../schema";

export interface ZoneRoomOptions {
  service: ZoneService;
  zoneId?: string;
}

interface TokenBucket {
  tokens: number;
  last: number;
}

interface Session {
  phys: PlayerPhys;
  inputs: InputMsg[];
  editTokens: TokenBucket;
  simBudget: { simTime: number; wallStart: number };
  lastThrow: number;
  lastMelee: number;
  lastDamageAt: number;
  regenAccum: number;
  pkey: string;
  client: Client;
}

interface PendingTrade {
  id: string;
  from: string;
  to: string;
  give: { b: number; n: number };
  want: { b: number; n: number };
  expiresAt: number;
}

const HUSK_CAP = Number(process.env.HUSK_CAP ?? 5);
const HUSK_SPAWN_MS = Number(process.env.HUSK_SPAWN_MS ?? 20_000);
const NODE_RESPAWN = Number(process.env.NODE_RESPAWN_MS ?? NODE_RESPAWN_MS);

/** Test-only registry: lets the integration suite reach live rooms to drive
 *  deterministic scenarios. Populated only when RUDERAL_TEST is set. */
export const testRoomRegistry = new Map<string, ZoneRoom>();

export class ZoneRoom extends Room<ZoneState> {
  maxClients = MAX_CLIENTS;
  autoDispose = true; // empty room disposes → zone hibernates

  private service!: ZoneService;
  private zoneId!: string;
  private loaded!: LoadedZone;

  private sessions = new Map<string, Session>();
  private creatures!: CreatureManager;
  private trades = new Map<string, PendingTrade>();
  private respawnTimers = new Set<ReturnType<typeof setTimeout>>();

  private joinCount = 0;
  private projSeq = 0;
  private dropSeq = 0;
  private tradeSeq = 0;
  private lastHuskSpawn = 0;

  private get world() {
    return this.loaded.world;
  }
  private get physics() {
    return this.loaded.physics;
  }

  async onCreate(options: ZoneRoomOptions) {
    this.service = options.service;
    this.zoneId = options.zoneId && this.service.has(options.zoneId) ? options.zoneId : this.service.defaultZone();
    this.loaded = await this.service.acquire(this.zoneId);

    this.setState(new ZoneState());
    this.state.zoneId = this.zoneId;
    this.setPatchRate(PATCH_MS);
    this.setSimulationInterval(() => this.tick(), TICK_MS);

    if (process.env.RUDERAL_TEST) testRoomRegistry.set(this.zoneId, this);

    this.creatures = new CreatureManager({
      world: this.world,
      players: () => this.aliveTargets(),
      hurtPlayer: (sid, amount) => this.hurtPlayer(sid, amount),
      siegeBlock: (x, y, z, amount) => this.damageVoxel(x, y, z, amount, null),
      onHuskDeath: (x, y, z) => this.spawnDrop(x, y + 1, z, Block.Salvage),
    });

    this.onMessage(MSG.input, (client, msgs: InputMsg[]) => this.handleInput(client, msgs));
    this.onMessage(MSG.edit, (client, m: { p: number; b: number }) => this.handlePlace(client, m));
    this.onMessage(MSG.hit, (client, m: { p: number }) => this.handleHit(client, m));
    this.onMessage(MSG.throw, (client, m: { dx: number; dy: number; dz: number }) => this.handleThrow(client, m));
    this.onMessage(MSG.attack, (client, m: { id: string }) => this.handleAttack(client, m));
    this.onMessage(MSG.tradeOffer, (client, m) => this.handleTradeOffer(client, m));
    this.onMessage(MSG.tradeAccept, (client, m: { id: string }) => this.handleTradeAccept(client, m));
    this.onMessage(MSG.tradeDecline, (client, m: { id: string }) => this.handleTradeDecline(client, m));
    this.onMessage(MSG.ping, (client, t: number) => client.send(MSG.pong, t));
  }

  onJoin(client: Client, options: { name?: string; pkey?: string }) {
    const name = String(options?.name ?? "wanderer").slice(0, 16) || "wanderer";
    const pkey = String(options?.pkey ?? client.sessionId).slice(0, 64);
    const record = this.service.store.get(pkey, name, this.zoneId);

    const spawn = findSpawn(this.world.vz, this.joinCount++);
    const session: Session = {
      phys: { x: spawn.x, y: spawn.y, z: spawn.z, vx: 0, vy: 0, vz: 0, grounded: false, swimming: false },
      inputs: [],
      editTokens: { tokens: EDIT_BURST, last: Date.now() },
      simBudget: { simTime: 0, wallStart: Date.now() },
      lastThrow: 0,
      lastMelee: 0,
      lastDamageAt: 0,
      regenAccum: 0,
      pkey,
      client,
    };
    this.sessions.set(client.sessionId, session);

    const s = new PlayerS();
    s.name = name;
    s.x = spawn.x;
    s.y = spawn.y;
    s.z = spawn.z;
    s.hp = record.hp > 0 ? record.hp : PLAYER_MAX_HP;
    // restore persisted inventory (new players get the starter kit from the store)
    for (const [b, n] of Object.entries(record.inv)) s.inv.set(b, n);
    if (s.inv.size === 0) for (const [b, n] of Object.entries(START_INVENTORY)) s.inv.set(b, n);
    this.state.players.set(client.sessionId, s);

    client.send(MSG.init, {
      id: client.sessionId,
      zoneId: this.zoneId,
      spawn,
      edits: this.world.editPairs(),
    });
  }

  onLeave(client: Client) {
    this.persistPlayer(client.sessionId);
    this.sessions.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
    for (const [id, t] of this.trades) {
      if (t.from === client.sessionId || t.to === client.sessionId) this.trades.delete(id);
    }
  }

  onDispose() {
    for (const sid of this.sessions.keys()) this.persistPlayer(sid);
    for (const t of this.respawnTimers) clearTimeout(t);
    this.respawnTimers.clear();
    if (testRoomRegistry.get(this.zoneId) === this) testRoomRegistry.delete(this.zoneId);
    this.service.release(this.zoneId);
  }

  // ---------------- test hooks (RUDERAL_TEST only) ----------------

  get testWorld() {
    return this.world;
  }
  get testCreatures() {
    return this.creatures;
  }
  debugTeleport(sid: string, x: number, y: number, z: number) {
    const session = this.sessions.get(sid);
    const s = this.state.players.get(sid);
    if (!session || !s) return;
    Object.assign(session.phys, { x, y, z, vx: 0, vy: 0, vz: 0 });
    s.x = x;
    s.y = y;
    s.z = z;
  }
  debugPlace(x: number, y: number, z: number, b: number) {
    this.commitEdit(x, y, z, b);
  }
  debugPlayerHp(sid: string): number {
    return this.state.players.get(sid)?.hp ?? -1;
  }

  private persistPlayer(sid: string): void {
    const session = this.sessions.get(sid);
    const s = this.state.players.get(sid);
    if (!session || !s) return;
    const inv: Record<string, number> = {};
    s.inv.forEach((v, k) => {
      inv[k] = v;
    });
    const record: PlayerRecord = { name: s.name, inv, hp: s.hp, lastZone: this.zoneId };
    this.service.store.save(session.pkey, record);
  }

  // ---------------- input ----------------

  private handleInput(client: Client, msgs: InputMsg[]) {
    if (!Array.isArray(msgs)) return;
    const session = this.sessions.get(client.sessionId);
    if (!session) return;
    for (const m of msgs) {
      if (typeof m?.seq !== "number" || typeof m?.dt !== "number") continue;
      if (session.inputs.length >= INPUT_QUEUE_MAX) session.inputs.shift();
      session.inputs.push({
        seq: m.seq >>> 0,
        dt: Math.min(Math.max(m.dt, 0), MAX_INPUT_DT),
        dx: Number(m.dx) || 0,
        dz: Number(m.dz) || 0,
        run: !!m.run,
        jump: !!m.jump,
        yaw: Number(m.yaw) || 0,
      });
    }
  }

  // ---------------- tick ----------------

  private tick() {
    const now = Date.now();
    const dt = TICK_MS / 1000;

    this.simulatePlayers(now);
    this.creatures.tick(now, dt);
    this.mirrorHusks();
    this.maybeSpawnHusk(now);
    this.simulateProjectiles(now);
    this.pickupDrops();
    this.regenHealth(now, dt);
    this.expireTrades(now);
  }

  private simulatePlayers(now: number) {
    for (const [sid, session] of this.sessions) {
      const p = session.phys;
      const s = this.state.players.get(sid);
      if (!s) continue;
      const budget = session.simBudget;

      let allowance = ((now - budget.wallStart) / 1000) * 1.25 + 0.25 - budget.simTime;
      while (session.inputs.length > 0) {
        const input = session.inputs.shift()!;
        if (input.dt <= allowance) {
          stepPlayer(this.world.vz, p, input);
          budget.simTime += input.dt;
          allowance -= input.dt;
        }
        s.lastSeq = input.seq;
        if (input.yaw !== undefined) s.yaw = input.yaw;
      }
      if (p.y < -20) this.respawnPlayer(sid);
      s.x = p.x;
      s.y = p.y;
      s.z = p.z;
      s.vx = p.vx;
      s.vy = p.vy;
      s.vz = p.vz;
      s.grounded = p.grounded;
      s.swimming = p.swimming;
    }
  }

  private simulateProjectiles(now: number) {
    const impacts = this.physics.step(TICK_MS / 1000);
    for (const impact of impacts) {
      this.damageVoxel(impact.vx, impact.vy, impact.vz, PROJECTILE_DAMAGE, null);
    }
    for (const [id, pb] of this.physics.projectiles) {
      const s = this.state.projectiles.get(id);
      const t = pb.body.translation();
      // projectile → husk hit (husks aren't Rapier bodies; proximity test)
      const husk = this.creatures.nearestHusk(t.x, t.y, t.z, 0.7);
      if (husk) {
        this.creatures.damage(husk.id, PROJECTILE_CREATURE_DAMAGE);
        this.physics.removeProjectile(id);
        this.state.projectiles.delete(id);
        continue;
      }
      if (now - pb.bornAt > PROJECTILE_TTL_MS) {
        this.physics.removeProjectile(id);
        this.state.projectiles.delete(id);
        continue;
      }
      if (s) {
        s.x = t.x;
        s.y = t.y;
        s.z = t.z;
      }
    }
  }

  private pickupDrops() {
    for (const [id, d] of this.state.drops) {
      for (const [sid, session] of this.sessions) {
        const p = session.phys;
        const dx = d.x - p.x;
        const dy = d.y - (p.y + 0.9);
        const dz = d.z - p.z;
        if (dx * dx + dy * dy + dz * dz <= DROP_PICKUP_RADIUS * DROP_PICKUP_RADIUS) {
          const s = this.state.players.get(sid);
          if (s) invAdd(s, d.b, 1);
          this.state.drops.delete(id);
          break;
        }
      }
    }
  }

  private regenHealth(now: number, dt: number) {
    for (const [sid, session] of this.sessions) {
      const s = this.state.players.get(sid);
      if (!s || s.hp >= PLAYER_MAX_HP) continue;
      if (now - session.lastDamageAt < PLAYER_REGEN_DELAY_MS) continue;
      session.regenAccum += PLAYER_REGEN_PER_S * dt;
      if (session.regenAccum >= 1) {
        const heal = Math.floor(session.regenAccum);
        session.regenAccum -= heal;
        s.hp = Math.min(PLAYER_MAX_HP, s.hp + heal);
      }
    }
  }

  // ---------------- creatures ----------------

  private aliveTargets(): HuskTarget[] {
    const out: HuskTarget[] = [];
    for (const [sid, session] of this.sessions) {
      const s = this.state.players.get(sid);
      if (!s || s.hp <= 0) continue;
      out.push({ sid, x: session.phys.x, y: session.phys.y, z: session.phys.z, hp: s.hp });
    }
    return out;
  }

  private mirrorHusks() {
    for (const husk of this.creatures.husks.values()) {
      let hs = this.state.husks.get(husk.id);
      if (!hs) {
        hs = new HuskS();
        this.state.husks.set(husk.id, hs);
      }
      hs.x = husk.phys.x;
      hs.y = husk.phys.y;
      hs.z = husk.phys.z;
      hs.yaw = husk.yaw;
      hs.hp = Math.max(0, husk.hp);
      hs.state = husk.state;
    }
    for (const id of [...this.state.husks.keys()]) {
      if (!this.creatures.husks.has(id)) this.state.husks.delete(id);
    }
  }

  private maybeSpawnHusk(now: number) {
    if (HUSK_CAP <= 0 || this.creatures.count >= HUSK_CAP) return;
    if (now - this.lastHuskSpawn < HUSK_SPAWN_MS) return;
    if (this.sessions.size === 0) return; // don't populate an empty zone
    this.lastHuskSpawn = now;
    const cell = this.findHuskSpawn();
    if (cell) this.creatures.spawnAt(cell.x, cell.y, cell.z);
  }

  /** A solid, walkable, headroom-clear cell away from all players. */
  findHuskSpawn(): { x: number; y: number; z: number } | null {
    const vz = this.world.vz;
    for (let i = 0; i < 40; i++) {
      const x = 4 + Math.floor(hash01(this.projSeq, i, Date.now() & 0xffff) * (vz.sizeX - 8));
      const z = 4 + Math.floor(hash01(i, this.projSeq, (Date.now() >> 4) & 0xffff) * (vz.sizeZ - 8));
      const sy = surfaceY(vz, x, z);
      if (sy <= vz.waterLevel) continue;
      const ground = getVoxel(vz, x, sy, z);
      if (!isSolid(ground) || ground === Block.Water) continue;
      if (getVoxel(vz, x, sy + 1, z) !== Block.Air || getVoxel(vz, x, sy + 2, z) !== Block.Air) continue;
      let tooClose = false;
      for (const session of this.sessions.values()) {
        if (Math.hypot(session.phys.x - x, session.phys.z - z) < 18) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;
      return { x, y: sy + 1, z };
    }
    return null;
  }

  /** Test/debug hook used by the integration suite. */
  debugSpawnHusk(x: number, y: number, z: number) {
    return this.creatures.spawnAt(x, y, z);
  }

  private handleAttack(client: Client, m: { id: string }) {
    const session = this.sessions.get(client.sessionId);
    const s = this.state.players.get(client.sessionId);
    if (!session || !s || s.hp <= 0) return;
    const now = Date.now();
    if (now - session.lastMelee < 400) return;
    session.lastMelee = now;

    const husk = m?.id ? this.creatures.husks.get(m.id) : null;
    const target =
      husk ??
      this.creatures.nearestHusk(session.phys.x, session.phys.y + PLAYER.eyeHeight, session.phys.z, MELEE_RANGE);
    if (!target) return;
    const d = Math.hypot(target.phys.x - session.phys.x, target.phys.y - session.phys.y, target.phys.z - session.phys.z);
    if (d > MELEE_RANGE + HUSK_MELEE_RANGE) return;
    this.creatures.damage(target.id, MELEE_DAMAGE);
  }

  // ---------------- health ----------------

  private hurtPlayer(sid: string, amount: number, _huskId?: string) {
    const session = this.sessions.get(sid);
    const s = this.state.players.get(sid);
    if (!session || !s || s.hp <= 0) return;
    session.lastDamageAt = Date.now();
    s.hp = Math.max(0, s.hp - amount);
    session.client.send(MSG.hurt, { hp: s.hp });
    if (s.hp <= 0) {
      this.respawnPlayer(sid);
      session.client.send(MSG.died, {});
    }
  }

  private respawnPlayer(sid: string) {
    const session = this.sessions.get(sid);
    const s = this.state.players.get(sid);
    if (!session || !s) return;
    const spawn = findSpawn(this.world.vz, this.joinCount++);
    Object.assign(session.phys, { x: spawn.x, y: spawn.y, z: spawn.z, vx: 0, vy: 0, vz: 0 });
    s.hp = PLAYER_MAX_HP;
    session.lastDamageAt = Date.now();
  }

  // ---------------- edits ----------------

  private takeEditToken(sid: string): boolean {
    const session = this.sessions.get(sid);
    if (!session) return false;
    const tb = session.editTokens;
    const now = Date.now();
    tb.tokens = Math.min(EDIT_BURST, tb.tokens + ((now - tb.last) / 1000) * EDIT_REFILL_PER_S);
    tb.last = now;
    if (tb.tokens < 1) return false;
    tb.tokens -= 1;
    return true;
  }

  private inReach(sid: string, x: number, y: number, z: number): boolean {
    const session = this.sessions.get(sid);
    if (!session) return false;
    const p = session.phys;
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
    const valid =
      this.takeEditToken(client.sessionId) &&
      PLACEABLE.has(m.b) &&
      (current === Block.Air || current === Block.Water) &&
      this.inReach(client.sessionId, x, y, z) &&
      invGet(s, m.b) > 0 &&
      !this.overlapsAnyEntity(x, y, z);

    if (!valid) {
      this.reject(client, m.p);
      return;
    }

    invTake(s, m.b, 1);
    this.commitEdit(x, y, z, m.b);
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
    const session = this.sessions.get(client.sessionId);
    if (!session) return;
    const now = Date.now();
    if (now - session.lastThrow < THROW_COOLDOWN_MS) return;
    const p = session.phys;
    const len = Math.hypot(Number(m?.dx) || 0, Number(m?.dy) || 0, Number(m?.dz) || 0);
    if (!len) return;
    session.lastThrow = now;

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
    if (!need) return;
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
    const isNode = this.world.isNodeCell(x, y, z) && prev === this.world.baselineBlock(x, y, z);
    this.commitEdit(x, y, z, Block.Air);

    if (isNode) {
      this.spawnNodeYield(x, y, z, prev);
      this.scheduleNodeRespawn(x, y, z, prev);
    } else {
      this.spawnDropFor(x, y, z, prev);
    }

    this.runSupportCheck([
      [x - 1, y, z],
      [x + 1, y, z],
      [x, y - 1, z],
      [x, y + 1, z],
      [x, y, z - 1],
      [x, y, z + 1],
    ]);
  }

  private spawnNodeYield(x: number, y: number, z: number, nodeBlock: number) {
    const rolls = NODE_YIELDS[nodeBlock];
    if (!rolls) return;
    let seed = packXYZ(x, y, z) ^ this.dropSeq;
    for (const [block, min, max] of rolls) {
      const r = hash01(seed++, x, z);
      const n = min + Math.floor(r * (max - min + 1));
      for (let k = 0; k < n; k++) this.spawnDrop(x, y, z, block);
    }
  }

  private scheduleNodeRespawn(x: number, y: number, z: number, nodeBlock: number) {
    const timer = setTimeout(() => {
      this.respawnTimers.delete(timer);
      // only regrow if nobody has built over the cell
      if (getVoxel(this.world.vz, x, y, z) !== Block.Air) return;
      this.commitEdit(x, y, z, nodeBlock);
    }, NODE_RESPAWN);
    this.respawnTimers.add(timer);
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
      this.loaded.log.append(p, Block.Air);
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
    this.loaded.log.append(p, b);
    this.physics.applyEdit(x, y, z, isSolid(b));
    this.broadcast(MSG.edits, [p, b]);
  }

  private spawnDropFor(x: number, y: number, z: number, brokenBlock: number): boolean {
    const yields = DROP_OF[brokenBlock];
    if (!yields) return false;
    this.spawnDrop(x, y, z, yields);
    return true;
  }

  private spawnDrop(x: number, y: number, z: number, block: number) {
    if (this.state.drops.size >= 300) {
      const first = this.state.drops.keys().next().value;
      if (first) this.state.drops.delete(first);
    }
    const d = new DropS();
    d.x = x + 0.5;
    d.y = y + 0.35;
    d.z = z + 0.5;
    d.b = block;
    this.state.drops.set(`d${this.dropSeq++}`, d);
  }

  private overlapsAnyEntity(x: number, y: number, z: number): boolean {
    const boxHit = (px: number, py: number, pz: number) =>
      x + 1 > px - PLAYER.halfWidth &&
      x < px + PLAYER.halfWidth &&
      z + 1 > pz - PLAYER.halfWidth &&
      z < pz + PLAYER.halfWidth &&
      y + 1 > py &&
      y < py + PLAYER.height;
    for (const session of this.sessions.values()) {
      if (boxHit(session.phys.x, session.phys.y, session.phys.z)) return true;
    }
    for (const husk of this.creatures.husks.values()) {
      if (boxHit(husk.phys.x, husk.phys.y, husk.phys.z)) return true;
    }
    return false;
  }

  // ---------------- trading ----------------

  private handleTradeOffer(client: Client, m: { give?: { b: number; n: number }; want?: { b: number; n: number } }) {
    const from = this.sessions.get(client.sessionId);
    const fromS = this.state.players.get(client.sessionId);
    if (!from || !fromS) return;
    const give = normStack(m?.give);
    const want = normStack(m?.want);
    if (!give || !want) return;
    if (invGet(fromS, give.b) < give.n) return; // can't offer what you don't have

    // nearest OTHER player in range
    let toSid: string | null = null;
    let bestD2 = TRADE_RANGE * TRADE_RANGE;
    for (const [sid, session] of this.sessions) {
      if (sid === client.sessionId) continue;
      const d2 =
        (session.phys.x - from.phys.x) ** 2 +
        (session.phys.y - from.phys.y) ** 2 +
        (session.phys.z - from.phys.z) ** 2;
      if (d2 <= bestD2) {
        bestD2 = d2;
        toSid = sid;
      }
    }
    if (!toSid) return;
    const toSession = this.sessions.get(toSid)!;

    const id = `t${this.tradeSeq++}`;
    this.trades.set(id, {
      id,
      from: client.sessionId,
      to: toSid,
      give,
      want,
      expiresAt: Date.now() + TRADE_TTL_MS,
    });
    toSession.client.send(MSG.tradeIncoming, {
      id,
      from: client.sessionId,
      fromName: fromS.name,
      give,
      want,
    });
  }

  private handleTradeAccept(client: Client, m: { id: string }) {
    const trade = this.trades.get(m?.id);
    if (!trade || trade.to !== client.sessionId) return;
    this.trades.delete(trade.id);

    const fromS = this.state.players.get(trade.from);
    const toS = this.state.players.get(trade.to);
    const fromSession = this.sessions.get(trade.from);
    const toSession = this.sessions.get(trade.to);
    if (!fromS || !toS || !fromSession || !toSession) {
      this.tradeResult(trade, false, "player left");
      return;
    }
    // still in range?
    const d2 =
      (fromSession.phys.x - toSession.phys.x) ** 2 +
      (fromSession.phys.y - toSession.phys.y) ** 2 +
      (fromSession.phys.z - toSession.phys.z) ** 2;
    if (d2 > TRADE_RANGE * TRADE_RANGE) {
      this.tradeResult(trade, false, "out of range");
      return;
    }
    // both sides solvent?
    if (invGet(fromS, trade.give.b) < trade.give.n || invGet(toS, trade.want.b) < trade.want.n) {
      this.tradeResult(trade, false, "insufficient goods");
      return;
    }
    // atomic swap: from gives `give`, receives `want`; to the inverse
    invTake(fromS, trade.give.b, trade.give.n);
    invTake(toS, trade.want.b, trade.want.n);
    invAdd(toS, trade.give.b, trade.give.n);
    invAdd(fromS, trade.want.b, trade.want.n);
    this.tradeResult(trade, true);
  }

  private handleTradeDecline(client: Client, m: { id: string }) {
    const trade = this.trades.get(m?.id);
    if (!trade || (trade.to !== client.sessionId && trade.from !== client.sessionId)) return;
    this.trades.delete(trade.id);
    this.tradeResult(trade, false, "declined");
  }

  private tradeResult(trade: PendingTrade, ok: boolean, reason?: string) {
    const payload = { id: trade.id, ok, reason };
    this.sessions.get(trade.from)?.client.send(MSG.tradeResult, payload);
    this.sessions.get(trade.to)?.client.send(MSG.tradeResult, payload);
  }

  private expireTrades(now: number) {
    for (const [id, t] of this.trades) {
      if (now >= t.expiresAt) {
        this.trades.delete(id);
        this.tradeResult(t, false, "expired");
      }
    }
  }
}

// ---- inventory helpers (PlayerS.inv is a MapSchema<number> keyed by block id string) ----

function invGet(s: PlayerS, b: number): number {
  return s.inv.get(String(b)) ?? 0;
}
function invAdd(s: PlayerS, b: number, n: number): void {
  s.inv.set(String(b), Math.min(9999, invGet(s, b) + n));
}
function invTake(s: PlayerS, b: number, n: number): boolean {
  const have = invGet(s, b);
  if (have < n) return false;
  s.inv.set(String(b), have - n);
  return true;
}

function normStack(v: unknown): { b: number; n: number } | null {
  if (!v || typeof v !== "object") return null;
  const b = Math.floor(Number((v as { b: unknown }).b));
  const n = Math.floor(Number((v as { n: unknown }).n));
  if (!Number.isFinite(b) || !Number.isFinite(n)) return null;
  if (b <= 0 || b > 64 || n <= 0 || n > 9999) return null;
  return { b, n };
}
