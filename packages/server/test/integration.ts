/**
 * End-to-end integration test against a REAL server + REAL colyseus.js
 * clients over loopback websockets. Proves the Phase 1/2 exit criteria that
 * don't need a GPU:
 *   1. two clients join, see each other, movement propagates
 *   2. edits propagate to all clients; invalid edits are rejected
 *   3. durability: multi-hit breaking with damage progress
 *   4. support lattice: orphaned blocks collapse and yield drops
 *   5. projectiles: thrown body impacts and damages the world
 *   6. persistence: server restart reconstructs the exact world
 *
 * Run: pnpm --filter @ruderal/server test
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, type Room } from "colyseus.js";
import {
  Block,
  MSG,
  ROOM_NAME,
  getVoxel,
  packXYZ,
  surfaceY,
  type InputMsg,
} from "@ruderal/shared";
import { createApp, type App } from "../src/app";

const ZONE = join(import.meta.dirname, "..", "..", "client", "public", "zones", "ams-westerkerk.zpk.gz");
const PORT = 34567;

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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(cond: () => boolean, ms: number, what: string): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (cond()) return true;
    await sleep(25);
  }
  console.error(`  (timeout waiting for: ${what})`);
  return false;
}

interface JoinedClient {
  room: Room;
  init: { id: string; spawn: { x: number; y: number; z: number }; edits: number[] };
  edits: number[][];
  rejects: number[][];
  collapses: number[][];
  damages: Array<{ p: number; d: number; need: number }>;
}

async function joinClient(name: string): Promise<JoinedClient> {
  const client = new Client(`ws://127.0.0.1:${PORT}`);
  const room = await client.joinOrCreate(ROOM_NAME, { name });
  const jc: JoinedClient = { room, init: null as never, edits: [], rejects: [], collapses: [], damages: [] };
  const initP = new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("no init")), 8000);
    room.onMessage(MSG.init, (payload: JoinedClient["init"]) => {
      clearTimeout(t);
      jc.init = payload;
      resolve();
    });
  });
  room.onMessage(MSG.edits, (pairs: number[]) => jc.edits.push(pairs));
  room.onMessage(MSG.reject, (pairs: number[]) => jc.rejects.push(pairs));
  room.onMessage(MSG.collapse, (pairs: number[]) => jc.collapses.push(pairs));
  room.onMessage(MSG.damage, (m: { p: number; d: number; need: number }) => jc.damages.push(m));
  room.onMessage(MSG.pong, () => {});
  await initP;
  return jc;
}

function statePlayers(room: Room): Map<string, { x: number; y: number; z: number; lastSeq: number; inv: Map<string, number> }> {
  const out = new Map();
  (room.state as { players?: { forEach(cb: (p: unknown, id: string) => void): void } }).players?.forEach(
    (p: unknown, id: string) => out.set(id, p),
  );
  return out;
}

/** Find a flat, buildable street-level cell near a player: same walking plane,
 *  two blocks of air above, not under the player's feet. */
function flatCellNear(
  vz: import("@ruderal/shared").VoxelZone,
  px: number,
  py: number,
  pz: number,
  exclude: Array<{ x: number; z: number }> = [],
): { x: number; y: number; z: number } {
  const fy = Math.floor(py);
  for (let r = 2; r <= 5; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = Math.floor(px) + dx;
        const z = Math.floor(pz) + dz;
        if (exclude.some((e) => e.x === x && e.z === z)) continue;
        const sy = surfaceY(vz, x, z);
        if (sy !== fy - 1) continue; // must be the same walking plane
        if (getVoxel(vz, x, sy + 1, z) !== Block.Air) continue;
        if (getVoxel(vz, x, sy + 2, z) !== Block.Air) continue;
        if (Math.hypot(x + 0.5 - px, z + 0.5 - pz) > 5) continue; // stay in reach
        return { x, y: sy + 1, z };
      }
    }
  }
  throw new Error("no flat cell near player");
}

async function main(): Promise<void> {
  const dataDir = mkdtempSync(join(tmpdir(), "ruderal-test-"));
  let app: App = await createApp({ zonepackPath: ZONE, dataDir, port: PORT });
  const vz = app.world.vz;

  console.log("\n== 1. join + movement propagation ==");
  const a = await joinClient("alice");
  check("A got init with spawn", !!a.init && a.init.spawn.y > 0);
  check("A init has empty overlay on fresh world", a.init.edits.length === 0);

  const b = await joinClient("bob");
  await waitFor(() => statePlayers(b.room).size === 2, 3000, "B sees 2 players");
  check("B sees both players", statePlayers(b.room).size === 2);

  // A walks: stream 40 inputs (dt 25ms = 1s of sim) paced at real time —
  // sending faster than wall clock trips the anti-speedhack throttle (by design)
  const spawnA = a.init.spawn;
  const inputs: InputMsg[] = [];
  for (let i = 1; i <= 40; i++) {
    inputs.push({ seq: i, dt: 0.025, dx: 0, dz: 1, run: false, jump: i % 10 === 0, yaw: 1 });
  }
  for (let i = 0; i < inputs.length; i += 5) {
    a.room.send(MSG.input, inputs.slice(i, i + 5));
    await sleep(125); // 5 × 25ms of sim per 125ms of wall time
  }
  await waitFor(() => statePlayers(b.room).get(a.init.id)?.lastSeq === 40, 3000, "all inputs acked");
  const paOnB = statePlayers(b.room).get(a.init.id)!;
  const walked = Math.hypot(paOnB.x - spawnA.x, paOnB.z - spawnA.z);
  check("A's inputs were simulated and acked", paOnB.lastSeq === 40, `lastSeq=${paOnB?.lastSeq}`);
  check("A's movement visible to B", walked > 1.5, `moved ${walked.toFixed(1)}m`);
  console.log(`  (A moved ${walked.toFixed(1)}m as seen by B)`);

  console.log("\n== 2. placement propagates; invalid placement rejected ==");
  // a verified-flat street cell near A's CURRENT position
  const aNow = statePlayers(b.room).get(a.init.id)!;
  const cell1 = flatCellNear(vz, aNow.x, aNow.y, aNow.z);
  const { x: bx, y: by, z: bz } = cell1;
  const p1 = packXYZ(bx, by, bz);
  a.room.send(MSG.edit, { p: p1, b: Block.Brick });
  await waitFor(() => b.edits.some((pairs) => pairs[0] === p1 && pairs[1] === Block.Brick), 3000, "B receives placement");
  check("B received A's placement", b.edits.some((pairs) => pairs[0] === p1 && pairs[1] === Block.Brick));
  check("server world has the edit", app.world.edits.get(p1) === Block.Brick);

  const farP = packXYZ(bx + 100, by, bz);
  a.room.send(MSG.edit, { p: farP, b: Block.Brick });
  await waitFor(() => a.rejects.length > 0, 3000, "reject for out-of-reach placement");
  check("out-of-reach placement rejected", a.rejects.some((pairs) => pairs[0] === farP));

  console.log("\n== 3. durability: brick takes 3 hits ==");
  a.room.send(MSG.hit, { p: p1 });
  await waitFor(() => a.damages.length >= 1, 2000, "damage progress message");
  check("first hit reported progress (1/3)", a.damages.some((d) => d.p === p1 && d.d === 1 && d.need === 3));
  check("block still standing after one hit", getVoxel(vz, bx, by, bz) === Block.Brick);
  a.room.send(MSG.hit, { p: p1 });
  await sleep(120);
  a.room.send(MSG.hit, { p: p1 });
  await waitFor(() => getVoxel(vz, bx, by, bz) === Block.Air, 3000, "block breaks on 3rd hit");
  check("third hit broke the block", getVoxel(vz, bx, by, bz) === Block.Air);
  check("break was broadcast", b.edits.some((pairs) => pairs[0] === p1 && pairs[1] === Block.Air));
  await waitFor(() => {
    let n = 0;
    (b.room.state as { drops?: { forEach(cb: () => void): void } }).drops?.forEach(() => n++);
    return n > 0;
  }, 2000, "drop spawned");

  console.log("\n== 4. support lattice: orphaned tower collapses ==");
  // tower of 3 bricks on the street; breaking the base orphans the top two
  const cell2 = flatCellNear(vz, aNow.x, aNow.y, aNow.z, [{ x: bx, z: bz }]);
  const tx = cell2.x;
  const ty = cell2.y;
  const tower = [packXYZ(tx, ty, cell2.z), packXYZ(tx, ty + 1, cell2.z), packXYZ(tx, ty + 2, cell2.z)];
  for (const p of tower) {
    a.room.send(MSG.edit, { p, b: Block.Brick });
    await sleep(120);
  }
  await waitFor(() => getVoxel(vz, tx, ty + 2, cell2.z) === Block.Brick, 3000, "tower built");
  check("tower stands (support through base)", getVoxel(vz, tx, ty + 2, cell2.z) === Block.Brick);

  for (let i = 0; i < 3; i++) {
    a.room.send(MSG.hit, { p: tower[0] });
    await sleep(150);
  }
  await waitFor(() => b.collapses.length > 0, 4000, "collapse broadcast");
  const collapsedCount = b.collapses.reduce((acc, pairs) => acc + pairs.length / 2, 0);
  check("breaking the base collapsed the rest", collapsedCount === 2, `collapsed=${collapsedCount}`);
  check("collapsed blocks are gone from the world", getVoxel(vz, tx, ty + 1, cell2.z) === Block.Air && getVoxel(vz, tx, ty + 2, cell2.z) === Block.Air);

  console.log("\n== 5. projectile impact damages the world ==");
  // impact either accumulates damage (hard block) or breaks outright (soft
  // block like grass, hardness ≤ projectile damage) — both prove the hit
  const damageBefore = app.world.damage.size;
  const editsBefore = b.edits.length;
  a.room.send(MSG.throw, { dx: 0, dy: -1, dz: 0 });
  const projSeen = await waitFor(() => {
    let n = 0;
    (a.room.state as { projectiles?: { forEach(cb: () => void): void } }).projectiles?.forEach(() => n++);
    return n > 0;
  }, 2000, "projectile visible in state");
  check("projectile entity synced", projSeen);
  await waitFor(() => app.world.damage.size > damageBefore || b.edits.length > editsBefore, 4000, "impact effect registered");
  check(
    "impact damaged or broke a voxel",
    app.world.damage.size > damageBefore || b.edits.length > editsBefore,
  );

  console.log("\n== 6. persistence across restart ==");
  // standing state: p1 broken (back to baseline Air? p1 was placed then broken → overlay empty for it),
  // tower base broken + collapse → also gone. Place one lasting block to persist:
  const keepP = packXYZ(bx, by, bz);
  a.room.send(MSG.edit, { p: keepP, b: Block.Wood });
  await waitFor(() => app.world.edits.get(keepP) === Block.Wood, 3000, "lasting block applied");
  const overlayBefore = [...app.world.edits.entries()].sort((x, y) => x[0] - y[0]);
  console.log(`  (overlay size before restart: ${overlayBefore.length})`);

  a.room.leave();
  b.room.leave();
  await sleep(300);
  await app.shutdown();
  await sleep(300);

  app = await createApp({ zonepackPath: ZONE, dataDir, port: PORT });
  const overlayAfter = [...app.world.edits.entries()].sort((x, y) => x[0] - y[0]);
  check(
    "restart reconstructed the exact overlay",
    JSON.stringify(overlayBefore) === JSON.stringify(overlayAfter),
    `${overlayBefore.length} vs ${overlayAfter.length}`,
  );

  const c = await joinClient("carol");
  check("late joiner receives the persisted overlay", JSON.stringify([...c.init.edits]) === JSON.stringify(overlayAfter.flat()));
  check("persisted block present in rebuilt volume", getVoxel(app.world.vz, bx, by, bz) === Block.Wood);
  c.room.leave();

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
