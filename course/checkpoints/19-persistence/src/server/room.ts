/**
 * Module 15 — the room becomes AUTHORITATIVE. Clients no longer report their
 * position; they send INPUT batches. The server queues them and, on a fixed
 * 20 Hz simulation tick, runs the SHARED `stepPlayer` on each player against its
 * own world. The resulting position is the truth, synced to everyone.
 *
 * The magic: `stepPlayer` is the exact function the client's PlayerController
 * runs for local prediction. Same code + same world + same inputs = the server
 * and client agree to floating-point noise. One movement function, run in two
 * places — the backbone of the reconciliation you'll add in Module 17.
 *
 * A PlayerS happens to have exactly the fields PlayerPhys needs (x,y,z,vx,vy,vz,
 * grounded,swimming), so we can simulate straight onto the synced state object.
 */
import { Client, Room } from "colyseus";
import { isSolid } from "../shared/blocks";
import { MSG, TICK_MS, type EditReq, type InitPayload, type InputMsg } from "../shared/protocol";
import { stepPlayer, type PlayerPhys } from "../shared/movement";
import {
  generateWorld,
  getVoxel,
  packXYZ,
  setVoxel,
  surfaceY,
  unpackX,
  unpackY,
  unpackZ,
  type VoxelWorld,
} from "../shared/voxel";
import { PlayerS, ZoneState } from "../shared/schema";
import { EditLog, PlayerStore } from "./persistence";

const EDIT_REACH = 7; // max distance (blocks) from player to an edit

export class ZoneRoom extends Room<ZoneState> {
  world!: VoxelWorld;
  private queues = new Map<string, InputMsg[]>();
  /** Every accepted edit, flattened as [p, b, p, b, ...] — the world's history. */
  private editLog: number[] = [];
  private journal!: EditLog;
  private store!: PlayerStore;
  private pkeys = new Map<string, string>(); // sessionId -> player key

  onCreate(options: { dataDir?: string }): void {
    this.state = new ZoneState();
    this.world = generateWorld();

    // Persistence: load the journal and REPLAY it onto the fresh baseline, so
    // the world comes back exactly as players left it.
    const dataDir = options?.dataDir ?? "data";
    this.journal = new EditLog(dataDir);
    this.store = new PlayerStore(dataDir);
    this.editLog = this.journal.load();
    for (let i = 0; i + 1 < this.editLog.length; i += 2) {
      const pk = this.editLog[i]!;
      setVoxel(this.world, unpackX(pk), unpackY(pk), unpackZ(pk), this.editLog[i + 1]!);
    }
    console.log(`[zone] replayed ${this.editLog.length / 2} persisted edits`);

    this.onMessage(MSG.ping, (client, t: number) => client.send(MSG.pong, t));

    this.onMessage(MSG.input, (client, batch: InputMsg[]) => {
      const q = this.queues.get(client.sessionId);
      if (q) for (const inp of batch) q.push(inp);
    });

    // Block edits: VALIDATE, apply to the authoritative world, then broadcast to
    // everyone. Reject invalid edits back to the sender so they can roll back.
    this.onMessage(MSG.edit, (client, m: EditReq) => this.handleEdit(client, m));

    this.setSimulationInterval(() => this.tick(), TICK_MS);
  }

  private handleEdit(client: Client, m: EditReq): void {
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    const x = unpackX(m.p);
    const y = unpackY(m.p);
    const z = unpackZ(m.p);

    // Reach check: no editing blocks across the map.
    const d = Math.hypot(p.x - (x + 0.5), p.y - (y + 0.5), p.z - (z + 0.5));
    const cur = getVoxel(this.world, x, y, z);
    const breaking = m.b === 0; // Block.Air
    const valid =
      d <= EDIT_REACH &&
      x >= 0 && x < this.world.sizeX &&
      y >= 0 && y < this.world.sizeY &&
      z >= 0 && z < this.world.sizeZ &&
      (breaking ? isSolid(cur) : cur === 0); // break solids; place only into air

    if (!valid) {
      client.send(MSG.reject, [m.p]); // roll this one back on the client
      return;
    }

    setVoxel(this.world, x, y, z, m.b);
    const packed = packXYZ(x, y, z);
    this.editLog.push(packed, m.b);
    this.journal.append(packed, m.b); // durably record it
    this.broadcast(MSG.edits, [m.p, m.b]); // to EVERYONE, including the sender
  }

  private tick(): void {
    for (const [id, queue] of this.queues) {
      const p = this.state.players.get(id);
      if (!p) continue;
      for (const inp of queue) {
        stepPlayer(this.world, p as unknown as PlayerPhys, inp);
        p.yaw = inp.yaw;
        p.lastSeq = inp.seq; // tell the client how far we've simulated (Module 17)
      }
      queue.length = 0;
    }
  }

  onJoin(client: Client, options: { name?: string; pkey?: string }): void {
    const p = new PlayerS();
    p.name = (options?.name ?? "wanderer").slice(0, 16);

    // Restore the player's last position if we've seen this pkey before.
    const saved = options?.pkey ? this.store.get(options.pkey) : undefined;
    if (saved) {
      p.x = saved.x;
      p.y = saved.y;
      p.z = saved.z;
    } else {
      const cx = Math.floor(this.world.sizeX / 2);
      const cz = Math.floor(this.world.sizeZ / 2);
      p.x = cx + 0.5;
      p.y = surfaceY(this.world, cx, cz) + 1;
      p.z = cz + 0.5;
    }
    if (options?.pkey) this.pkeys.set(client.sessionId, options.pkey);
    this.state.players.set(client.sessionId, p);
    this.queues.set(client.sessionId, []);

    const init: InitPayload = {
      id: client.sessionId,
      spawn: { x: p.x, y: p.y, z: p.z },
      seed: this.world.seed,
      edits: this.editLog, // fold the world's edit history in before meshing
    };
    client.send(MSG.init, init);
    console.log(`[zone] + ${p.name} (${client.sessionId}) — ${this.state.players.size} online`);
  }

  onLeave(client: Client): void {
    // Save this player's last position on the way out.
    const pkey = this.pkeys.get(client.sessionId);
    const p = this.state.players.get(client.sessionId);
    if (pkey && p) {
      this.store.set(pkey, { x: p.x, y: p.y, z: p.z });
      this.store.save();
    }
    this.state.players.delete(client.sessionId);
    this.queues.delete(client.sessionId);
    this.pkeys.delete(client.sessionId);
    console.log(`[zone] - ${client.sessionId} — ${this.state.players.size} online`);
  }

  onDispose(): void {
    this.store.save(); // final flush when the room empties out
  }
}
