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
import { MSG, TICK_MS, type InitPayload, type InputMsg } from "../shared/protocol";
import { stepPlayer, type PlayerPhys } from "../shared/movement";
import { generateWorld, surfaceY, type VoxelWorld } from "../shared/voxel";
import { PlayerS, ZoneState } from "../shared/schema";

export class ZoneRoom extends Room<ZoneState> {
  world!: VoxelWorld;
  private queues = new Map<string, InputMsg[]>();

  onCreate(): void {
    this.state = new ZoneState();
    this.world = generateWorld();
    this.onMessage(MSG.ping, (client, t: number) => client.send(MSG.pong, t));

    // Queue incoming inputs; the tick drains them. We never trust a position —
    // only inputs, which the server itself turns into movement.
    this.onMessage(MSG.input, (client, batch: InputMsg[]) => {
      const q = this.queues.get(client.sessionId);
      if (q) for (const inp of batch) q.push(inp);
    });

    // Fixed-rate authoritative simulation.
    this.setSimulationInterval(() => this.tick(), TICK_MS);
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

  onJoin(client: Client, options: { name?: string }): void {
    const p = new PlayerS();
    p.name = (options?.name ?? "wanderer").slice(0, 16);
    const cx = Math.floor(this.world.sizeX / 2);
    const cz = Math.floor(this.world.sizeZ / 2);
    p.x = cx + 0.5;
    p.y = surfaceY(this.world, cx, cz) + 1;
    p.z = cz + 0.5;
    this.state.players.set(client.sessionId, p);
    this.queues.set(client.sessionId, []);

    const init: InitPayload = {
      id: client.sessionId,
      spawn: { x: p.x, y: p.y, z: p.z },
      seed: this.world.seed,
      edits: [],
    };
    client.send(MSG.init, init);
    console.log(`[zone] + ${p.name} (${client.sessionId}) — ${this.state.players.size} online`);
  }

  onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
    this.queues.delete(client.sessionId);
    console.log(`[zone] - ${client.sessionId} — ${this.state.players.size} online`);
  }
}
