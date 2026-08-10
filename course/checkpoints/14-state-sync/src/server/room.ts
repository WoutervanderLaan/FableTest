/**
 * Module 13 — the ZoneRoom. A Colyseus Room is one running "match": it owns the
 * synchronized state, and its lifecycle hooks fire as clients come and go.
 *
 * At this stage the room is a lobby: it accepts joins, spawns a PlayerS in the
 * state, greets each client with an `init` payload, and cleans up on leave. No
 * simulation yet — players don't move on the server until Module 15.
 *
 * The server keeps its OWN copy of the voxel world (generated deterministically
 * from the same code the client runs), which it will use to simulate movement
 * (Module 15) and validate edits (Module 18).
 */
import { Client, Room } from "colyseus";
import { MSG, type InitPayload, type MoveMsg } from "../shared/protocol";
import { generateWorld, surfaceY, type VoxelWorld } from "../shared/voxel";
import { PlayerS, ZoneState } from "../shared/schema";

export class ZoneRoom extends Room<ZoneState> {
  world!: VoxelWorld;

  onCreate(): void {
    this.state = new ZoneState();
    this.world = generateWorld(); // same seed/algorithm as the client
    this.onMessage(MSG.ping, (client, t: number) => client.send(MSG.pong, t));

    // Module 14: trust the client's reported position and write it to state.
    // Colyseus then syncs the change to everyone automatically. (This is
    // CLIENT-AUTHORITATIVE and cheatable — Module 15 fixes it.)
    this.onMessage(MSG.move, (client, m: MoveMsg) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      p.x = m.x;
      p.y = m.y;
      p.z = m.z;
      p.yaw = m.yaw;
    });
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
    console.log(`[zone] - ${client.sessionId} — ${this.state.players.size} online`);
  }
}
