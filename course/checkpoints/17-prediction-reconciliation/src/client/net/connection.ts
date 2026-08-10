/**
 * Module 13 — the client's connection to the server. `Net.join` opens a
 * Colyseus room, waits for the server's one-time `init` payload, and starts a
 * 2-second ping/pong so we can show latency.
 *
 * We wrap Colyseus in our own `Net` class so the rest of the client has a small,
 * intentional surface (join, leave, read state) instead of touching the room
 * everywhere. The real Ruderal's `net/connection.ts` does exactly this.
 */
import { Client, type Room } from "colyseus.js";
import { MSG, ROOM_NAME, type InitPayload, type InputMsg } from "../../shared/protocol";
import type { ZoneState } from "../../shared/schema";

export class Net {
  latencyMs = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  private constructor(
    readonly room: Room<ZoneState>,
    readonly id: string,
    readonly init: InitPayload,
  ) {}

  static async join(url: string, name: string): Promise<Net> {
    const client = new Client(url);
    const room = await client.joinOrCreate<ZoneState>(ROOM_NAME, { name });

    // The server sends exactly one `init` message right after we join.
    const init = await new Promise<InitPayload>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("server sent no init")), 10000);
      room.onMessage(MSG.init, (payload: InitPayload) => {
        clearTimeout(timeout);
        resolve(payload);
      });
    });

    const net = new Net(room, init.id, init);
    room.onMessage(MSG.pong, (t: number) => {
      net.latencyMs = Math.round(performance.now() - t);
    });
    net.pingTimer = setInterval(() => room.send(MSG.ping, performance.now()), 2000);
    room.send(MSG.ping, performance.now());
    return net;
  }

  get playerCount(): number {
    return this.room.state.players.size;
  }

  /** Module 15: send a batch of inputs for the server to simulate authoritatively. */
  sendInputs(batch: InputMsg[]): void {
    if (batch.length > 0) this.room.send(MSG.input, batch);
  }

  leave(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    void this.room.leave();
  }
}
