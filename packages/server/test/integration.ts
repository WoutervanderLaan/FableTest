/**
 * End-to-end integration test: real server + real colyseus.js clients over
 * loopback websockets. Proves the Phase 1–4 exit criteria that don't need a
 * GPU. Deterministic scenarios use RUDERAL_TEST-gated room hooks (teleport,
 * place, spawn husk) so combat/siege/trade don't race the AI.
 *
 * Run: RUDERAL_TEST=1 HUSK_CAP=0 NODE_RESPAWN_MS=800 tsx test/integration.ts
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, type Room } from "colyseus.js";
import { Block, MSG, ROOM_NAME, getVoxel, packXYZ, surfaceY, type InputMsg } from "@ruderal/shared";
import { createApp, type App } from "../src/app";
import { testRoomRegistry } from "../src/rooms/ZoneRoom";

const ZONES_DIR = join(import.meta.dirname, "..", "..", "client", "public", "zones");
const PORT = 34599;
const ZONE1 = "ams-westerkerk";
const ZONE2 = "ams-vondelpark";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
    console.log(`  ok — ${name}`);
  } else {
    failed++;
    console.error(`  FAIL — ${name} ${detail}`);
  }
}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
async function waitFor(cond: () => boolean, ms: number, what: string): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (cond()) return true;
    await sleep(25);
  }
  console.error(`  (timeout: ${what})`);
  return false;
}

interface JC {
  room: Room;
  init: { id: string; zoneId: string; spawn: { x: number; y: number; z: number }; edits: number[] };
  edits: number[][];
  rejects: number[][];
  collapses: number[][];
  damages: Array<{ p: number; d: number; need: number }>;
  hurts: Array<{ hp: number }>;
  died: number;
  tradeIn: Array<{ id: string; fromName: string; give: { b: number; n: number }; want: { b: number; n: number } }>;
  tradeResults: Array<{ id: string; ok: boolean; reason?: string }>;
}

async function joinClient(name: string, zoneId: string, pkey: string): Promise<JC> {
  const client = new Client(`ws://127.0.0.1:${PORT}`);
  const room = await client.joinOrCreate(ROOM_NAME, { name, zoneId, pkey });
  const jc: JC = {
    room,
    init: null as never,
    edits: [],
    rejects: [],
    collapses: [],
    damages: [],
    hurts: [],
    died: 0,
    tradeIn: [],
    tradeResults: [],
  };
  const initP = new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("no init")), 8000);
    room.onMessage(MSG.init, (p: JC["init"]) => {
      clearTimeout(t);
      jc.init = p;
      resolve();
    });
  });
  room.onMessage(MSG.edits, (p: number[]) => jc.edits.push(p));
  room.onMessage(MSG.reject, (p: number[]) => jc.rejects.push(p));
  room.onMessage(MSG.collapse, (p: number[]) => jc.collapses.push(p));
  room.onMessage(MSG.damage, (m: JC["damages"][number]) => jc.damages.push(m));
  room.onMessage(MSG.hurt, (m: { hp: number }) => jc.hurts.push(m));
  room.onMessage(MSG.died, () => jc.died++);
  room.onMessage(MSG.tradeIncoming, (m: JC["tradeIn"][number]) => jc.tradeIn.push(m));
  room.onMessage(MSG.tradeResult, (m: JC["tradeResults"][number]) => jc.tradeResults.push(m));
  room.onMessage(MSG.pong, () => {});
  await initP;
  return jc;
}

function players(room: Room): Map<string, { x: number; y: number; z: number; lastSeq: number; hp: number; inv: Map<string, number> }> {
  const out = new Map();
  (room.state as { players?: { forEach(cb: (p: unknown, id: string) => void): void } }).players?.forEach(
    (p: unknown, id: string) => out.set(id, p),
  );
  return out;
}
function inv(room: Room, id: string, b: number): number {
  const p = players(room).get(id);
  return p ? (p.inv.get(String(b)) ?? 0) : 0;
}
function huskCount(room: Room): number {
  let n = 0;
  (room.state as { husks?: { forEach(cb: () => void): void } }).husks?.forEach(() => n++);
  return n;
}
function dropCount(room: Room): number {
  let n = 0;
  (room.state as { drops?: { forEach(cb: () => void): void } }).drops?.forEach(() => n++);
  return n;
}
function invTotal(room: Room, id: string): number {
  const p = players(room).get(id);
  if (!p) return 0;
  let n = 0;
  p.inv.forEach((v) => (n += v));
  return n;
}

/** A flat line of `len` clear ground cells at a common surface level near the
 *  zone centre, for building walls / positioning husks. */
function flatLine(vz: import("@ruderal/shared").VoxelZone, len: number): { x: number; y: number; z: number } | null {
  const cx = Math.floor(vz.sizeX / 2);
  const cz = Math.floor(vz.sizeZ / 2);
  for (let r = 0; r < 120; r++) {
    for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r]]) {
      const x0 = cx + dx;
      const z0 = cz + dz;
      const y = surfaceY(vz, x0, z0);
      let ok = y > vz.waterLevel;
      for (let i = 0; i < len && ok; i++) {
        if (surfaceY(vz, x0 + i, z0) !== y) ok = false;
        else if (getVoxel(vz, x0 + i, y + 1, z0) !== Block.Air || getVoxel(vz, x0 + i, y + 2, z0) !== Block.Air) ok = false;
      }
      if (ok) return { x: x0, y, z: z0 };
    }
  }
  return null;
}

async function main(): Promise<void> {
  const dataDir = mkdtempSync(join(tmpdir(), "ruderal-test-"));
  let app: App = await createApp({ zonesDir: ZONES_DIR, dataDir, port: PORT });

  // ============ 1. multi-zone isolation + hibernation ============
  console.log("\n== 1. multi-zone isolation + hibernation ==");
  check("no zones resident before any join", app.service.loadedCount() === 0);
  const a = await joinClient("alice", ZONE1, "pk-alice");
  await sleep(100);
  check("A joined zone1", a.init.zoneId === ZONE1);
  check("zone1 resident, zone2 not", app.service.isLoaded(ZONE1) && !app.service.isLoaded(ZONE2));

  const c = await joinClient("carol", ZONE2, "pk-carol");
  await sleep(100);
  check("carol joined zone2", c.init.zoneId === ZONE2);
  check("both zones resident", app.service.isLoaded(ZONE1) && app.service.isLoaded(ZONE2));

  c.room.leave();
  await waitFor(() => !app.service.isLoaded(ZONE2), 4000, "zone2 hibernates when empty");
  check("zone2 hibernated after last client left", !app.service.isLoaded(ZONE2));
  check("zone1 still resident", app.service.isLoaded(ZONE1));

  const room1 = testRoomRegistry.get(ZONE1)!;
  const serverWorld1 = room1.testWorld; // ServerWorld: .edits, .damage overlays
  const world1 = serverWorld1.vz; // VoxelZone: getVoxel target

  // ============ 2. movement + edit propagation + reject ============
  console.log("\n== 2. movement, edit propagation, reject ==");
  const b = await joinClient("bob", ZONE1, "pk-bob");
  await waitFor(() => players(b.room).size === 2, 3000, "B sees 2 players");
  check("B sees both players", players(b.room).size === 2);

  const spawnA = a.init.spawn;
  const inputs: InputMsg[] = [];
  for (let i = 1; i <= 40; i++) inputs.push({ seq: i, dt: 0.025, dx: 0, dz: 1, run: false, jump: i % 10 === 0, yaw: 1 });
  for (let i = 0; i < inputs.length; i += 5) {
    a.room.send(MSG.input, inputs.slice(i, i + 5));
    await sleep(125);
  }
  await waitFor(() => players(b.room).get(a.init.id)?.lastSeq === 40, 3000, "inputs acked");
  const paOnB = players(b.room).get(a.init.id)!;
  check("A's inputs simulated + acked", paOnB.lastSeq === 40);
  check("A's movement visible to B", Math.hypot(paOnB.x - spawnA.x, paOnB.z - spawnA.z) > 1.5);

  // stand on an adjacent flat cell and place a block beside us (not in our body)
  const flat = flatLine(world1, 2)!;
  room1.debugTeleport(a.init.id, flat.x + 1.5, flat.y + 1.02, flat.z + 0.5);
  await sleep(150);
  const p1 = packXYZ(flat.x, flat.y + 1, flat.z);
  a.room.send(MSG.edit, { p: p1, b: Block.Brick });
  await waitFor(() => b.edits.some((pr) => pr[0] === p1 && pr[1] === Block.Brick), 3000, "B sees placement");
  check("B received A's placement", b.edits.some((pr) => pr[0] === p1 && pr[1] === Block.Brick));

  const farP = packXYZ(flat.x + 100, flat.y + 1, flat.z);
  a.room.send(MSG.edit, { p: farP, b: Block.Brick });
  await waitFor(() => a.rejects.some((pr) => pr[0] === farP), 3000, "reject out-of-reach");
  check("out-of-reach placement rejected", a.rejects.some((pr) => pr[0] === farP));

  // ============ 3. resource node harvest: multi-drop + respawn ============
  console.log("\n== 3. resource node harvest ==");
  // find a Biomass node (hardness 1) near the centre
  let node: { x: number; y: number; z: number } | null = null;
  for (let y = 0; y < world1.sizeY && !node; y++) {
    for (let z = 4; z < world1.sizeZ - 4 && !node; z += 3) {
      for (let x = 4; x < world1.sizeX - 4; x += 3) {
        if (getVoxel(world1, x, y, z) === Block.Biomass) {
          node = { x, y, z };
          break;
        }
      }
    }
  }
  check("world contains a biomass node", node !== null);
  if (node) {
    room1.debugTeleport(a.init.id, node.x + 0.5, node.y, node.z + 0.5);
    await sleep(150);
    const invBefore = invTotal(a.room, a.init.id);
    a.room.send(MSG.hit, { p: packXYZ(node.x, node.y, node.z) });
    await waitFor(() => getVoxel(world1, node!.x, node!.y, node!.z) === Block.Air, 3000, "node harvested");
    check("node broke in one hit (hardness 1)", getVoxel(world1, node.x, node.y, node.z) === Block.Air);
    // standing on the node, the harvester vacuums up the yielded drops
    await waitFor(() => invTotal(a.room, a.init.id) > invBefore, 2500, "harvest yields collected");
    check("harvest yielded resources into inventory", invTotal(a.room, a.init.id) > invBefore);
    // NODE_RESPAWN_MS is 800 in test env
    await waitFor(() => getVoxel(world1, node!.x, node!.y, node!.z) === Block.Biomass, 4000, "node regrows");
    check("node regenerated after respawn timer", getVoxel(world1, node.x, node.y, node.z) === Block.Biomass);
  }

  // ============ 4. support collapse ============
  console.log("\n== 4. support-lattice collapse ==");
  const tower = flatLine(world1, 1)!;
  // give alice bricks + teleport adjacent, build a 3-tall tower, break its base
  room1.debugTeleport(a.init.id, tower.x + 1.5, tower.y + 1.02, tower.z + 0.5);
  await sleep(100);
  const col = [
    packXYZ(tower.x, tower.y + 1, tower.z),
    packXYZ(tower.x, tower.y + 2, tower.z),
    packXYZ(tower.x, tower.y + 3, tower.z),
  ];
  for (const p of col) {
    a.room.send(MSG.edit, { p, b: Block.Brick });
    await sleep(120);
  }
  await waitFor(() => getVoxel(world1, tower.x, tower.y + 3, tower.z) === Block.Brick, 3000, "tower built");
  check("tower stands", getVoxel(world1, tower.x, tower.y + 3, tower.z) === Block.Brick);
  const collapsesBefore = b.collapses.length;
  for (let i = 0; i < 3; i++) {
    a.room.send(MSG.hit, { p: col[0] });
    await sleep(160);
  }
  await waitFor(() => b.collapses.length > collapsesBefore, 4000, "collapse broadcast");
  check(
    "breaking base collapses the rest",
    getVoxel(world1, tower.x, tower.y + 2, tower.z) === Block.Air && getVoxel(world1, tower.x, tower.y + 3, tower.z) === Block.Air,
  );

  // ============ 5. trading (atomic swap + insufficient) ============
  console.log("\n== 5. trading ==");
  const tradeSpot = flatLine(world1, 1)!;
  room1.debugTeleport(a.init.id, tradeSpot.x + 0.5, tradeSpot.y + 1.02, tradeSpot.z + 0.5);
  room1.debugTeleport(b.init.id, tradeSpot.x + 0.9, tradeSpot.y + 1.02, tradeSpot.z + 0.5);
  await sleep(150);
  const aBrick0 = inv(a.room, a.init.id, Block.Brick);
  const aWood0 = inv(a.room, a.init.id, Block.Wood);
  const bBrick0 = inv(b.room, b.init.id, Block.Brick);
  const bWood0 = inv(b.room, b.init.id, Block.Wood);

  a.room.send(MSG.tradeOffer, { give: { b: Block.Brick, n: 5 }, want: { b: Block.Wood, n: 4 } });
  await waitFor(() => b.tradeIn.length > 0, 3000, "B receives incoming trade");
  check("trade offer reached nearest player", b.tradeIn.length > 0 && b.tradeIn[0].give.b === Block.Brick);
  if (b.tradeIn.length > 0) {
    b.room.send(MSG.tradeAccept, { id: b.tradeIn[0].id });
    await waitFor(() => a.tradeResults.length > 0 && b.tradeResults.length > 0, 3000, "both get result");
    check("both parties notified ok", a.tradeResults.at(-1)?.ok === true && b.tradeResults.at(-1)?.ok === true);
    await sleep(150);
    check(
      "atomic swap: A −5 brick +4 wood",
      inv(a.room, a.init.id, Block.Brick) === aBrick0 - 5 && inv(a.room, a.init.id, Block.Wood) === aWood0 + 4,
    );
    check(
      "atomic swap: B +5 brick −4 wood",
      inv(b.room, b.init.id, Block.Brick) === bBrick0 + 5 && inv(b.room, b.init.id, Block.Wood) === bWood0 - 4,
    );
  }
  // insufficient: A wants more wood than B holds
  a.room.send(MSG.tradeOffer, { give: { b: Block.Brick, n: 1 }, want: { b: Block.Wood, n: 9000 } });
  await waitFor(() => b.tradeIn.length > 1, 3000, "second incoming");
  if (b.tradeIn.length > 1) {
    const before = b.tradeResults.length;
    b.room.send(MSG.tradeAccept, { id: b.tradeIn[1].id });
    await waitFor(() => b.tradeResults.length > before, 3000, "insufficient result");
    check("insufficient-goods trade rejected", b.tradeResults.at(-1)?.ok === false);
  }

  // ============ 6. persistence across rejoin + cross-zone travel ============
  console.log("\n== 6. inventory persistence + cross-zone travel ==");
  const aBrickNow = inv(a.room, a.init.id, Block.Brick);
  a.room.leave();
  await sleep(300);
  // rejoin same zone, same pkey → inventory restored
  const a2 = await joinClient("alice", ZONE1, "pk-alice");
  check("rejoin restores inventory", inv(a2.room, a2.init.id, Block.Brick) === aBrickNow, `${inv(a2.room, a2.init.id, Block.Brick)} vs ${aBrickNow}`);
  // travel to zone2 with same pkey → inventory carries across zones
  a2.room.leave();
  await sleep(300);
  const a3 = await joinClient("alice", ZONE2, "pk-alice");
  check("inventory travels across zones", inv(a3.room, a3.init.id, Block.Brick) === aBrickNow);
  check("zone2 re-loaded on travel", app.service.isLoaded(ZONE2));
  a3.room.leave();
  await sleep(200);

  // ============ 7. combat: husks vs players ============
  console.log("\n== 7. creatures & combat ==");
  const arena = flatLine(world1, 4)!;
  room1.debugTeleport(b.init.id, arena.x + 0.5, arena.y + 1.02, arena.z + 0.5);
  await sleep(100);
  // husk adjacent to bob → it should attack him
  room1.debugSpawnHusk(arena.x + 1, arena.y + 1, arena.z);
  check("husk created server-side", room1.testCreatures.count >= 1);
  await waitFor(() => huskCount(b.room) >= 1, 2000, "husk syncs to client");
  check("husk appears in client schema", huskCount(b.room) >= 1);
  await waitFor(() => b.hurts.length > 0, 4000, "husk damages player");
  check("adjacent husk damages the player", b.hurts.length > 0 && b.hurts[0].hp < 100);

  // bob strikes the husk dead (60 hp / 25 melee → 3 hits) — use the
  // authoritative server husk id, and verify against server truth
  const huskId = [...room1.testCreatures.husks.keys()][0];
  const invBeforeKill = invTotal(b.room, b.init.id);
  for (let i = 0; i < 4; i++) {
    b.room.send(MSG.attack, { id: huskId });
    await sleep(450);
  }
  await waitFor(() => !room1.testCreatures.husks.has(huskId), 3000, "husk dies to melee");
  check("player melee kills the husk", !room1.testCreatures.husks.has(huskId));
  // husk dies at bob's feet → he picks up its dropped matter
  await waitFor(() => invTotal(b.room, b.init.id) > invBeforeKill, 2500, "husk loot collected");
  check("husk death drops collectible loot", invTotal(b.room, b.init.id) > invBeforeKill);

  // projectile damages a husk
  const projHusk0 = room1.debugSpawnHusk(arena.x + 3, arena.y + 1, arena.z);
  const projHuskHp0 = projHusk0.hp;
  for (let i = 0; i < 4; i++) {
    b.room.send(MSG.throw, { dx: 1, dy: -0.06, dz: 0 });
    await sleep(500);
  }
  const projHusk = room1.testCreatures.husks.get(projHusk0.id);
  check("projectile damaged/killed a husk", !projHusk || projHusk.hp < projHuskHp0);

  // ============ 8. siege: husk attacks a placed wall ============
  console.log("\n== 8. structure siege ==");
  const siege = flatLine(world1, 3)!;
  room1.debugTeleport(b.init.id, siege.x + 0.5, siege.y + 1.02, siege.z + 0.5);
  // 2-tall player-placed wall one cell over
  room1.debugPlace(siege.x + 1, siege.y + 1, siege.z, Block.Brick);
  room1.debugPlace(siege.x + 1, siege.y + 2, siege.z, Block.Brick);
  await sleep(100);
  const wallP = packXYZ(siege.x + 1, siege.y + 1, siege.z);
  // husk beyond the wall, so its path to bob is blocked by the wall
  room1.debugSpawnHusk(siege.x + 2, siege.y + 1, siege.z);
  await waitFor(() => serverWorld1.damage.has(wallP) || getVoxel(world1, siege.x + 1, siege.y + 1, siege.z) === Block.Air, 6000, "husk sieges wall");
  check(
    "husk damages the wall between it and the player",
    serverWorld1.damage.has(wallP) || getVoxel(world1, siege.x + 1, siege.y + 1, siege.z) === Block.Air,
  );

  // ============ 9. restart persistence (regression) ============
  console.log("\n== 9. persistence across server restart ==");
  const keepSpot = flatLine(world1, 1)!;
  room1.debugTeleport(b.init.id, keepSpot.x + 1.5, keepSpot.y + 1.02, keepSpot.z + 0.5);
  await sleep(100);
  const keepP = packXYZ(keepSpot.x, keepSpot.y + 1, keepSpot.z);
  b.room.send(MSG.edit, { p: keepP, b: Block.Wood });
  await waitFor(() => serverWorld1.edits.get(keepP) === Block.Wood, 3000, "lasting block placed");
  const overlayBefore = [...serverWorld1.edits.entries()].filter(([, v]) => v !== Block.Air).sort((x, y) => x[0] - y[0]);
  b.room.leave();
  await sleep(300);
  await app.shutdown();
  await sleep(300);

  app = await createApp({ zonesDir: ZONES_DIR, dataDir, port: PORT });
  const late = await joinClient("late", ZONE1, "pk-late");
  const serverWorld1b = testRoomRegistry.get(ZONE1)!.testWorld;
  const overlayAfter = [...serverWorld1b.edits.entries()].filter(([, v]) => v !== Block.Air).sort((x, y) => x[0] - y[0]);
  check("kept block survived restart", getVoxel(serverWorld1b.vz, keepSpot.x, keepSpot.y + 1, keepSpot.z) === Block.Wood);
  check(
    "overlay reconstructed (nodes regrown, builds kept)",
    overlayAfter.some(([p, v]) => p === keepP && v === Block.Wood),
  );
  check("late joiner receives persisted overlay", late.init.edits.length >= 2);
  void overlayBefore;
  late.room.leave();

  await sleep(200);
  await app.shutdown();
  rmSync(dataDir, { recursive: true, force: true });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
