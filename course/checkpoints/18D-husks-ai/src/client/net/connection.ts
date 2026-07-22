/**
 * Module 18 — the connection wrapper gains block editing + a tiny event system.
 *
 * colyseus.js allows only ONE handler per message type, so we register each once
 * in `join` and fan the message out to any number of subscribers via `on(...)`.
 * (The real Ruderal's `net/connection.ts` uses the exact same pattern, for edits,
 * damage, collapses, and more.)
 */
import { Client, type Room } from "colyseus.js";
import { MSG, ROOM_NAME, type InitPayload, type InputMsg } from "../../shared/protocol";
import type { ZoneState } from "../../shared/schema";

type EventMap = {
  edits: number[]; // [p, b, p, b, ...] confirmed edits, for everyone
  reject: number[]; // [p, ...] edits to roll back (sender only)
};

export class Net {
  latencyMs = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private listeners: { [K in keyof EventMap]: Set<(v: EventMap[K]) => void> } = {
    edits: new Set(),
    reject: new Set(),
  };

  private constructor(
    readonly room: Room<ZoneState>,
    readonly id: string,
    readonly init: InitPayload,
  ) {}

  static async join(url: string, name: string): Promise<Net> {
    const client = new Client(url);
    const room = await client.joinOrCreate<ZoneState>(ROOM_NAME, { name });

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
    room.onMessage(MSG.edits, (pairs: number[]) => net.emit("edits", pairs));
    room.onMessage(MSG.reject, (arr: number[]) => net.emit("reject", arr));

    net.pingTimer = setInterval(() => room.send(MSG.ping, performance.now()), 2000);
    room.send(MSG.ping, performance.now());
    return net;
  }

  on<K extends keyof EventMap>(event: K, cb: (v: EventMap[K]) => void): () => void {
    this.listeners[event].add(cb);
    return () => this.listeners[event].delete(cb);
  }

  private emit<K extends keyof EventMap>(event: K, v: EventMap[K]): void {
    for (const cb of this.listeners[event]) cb(v);
  }

  get playerCount(): number {
    return this.room.state.players.size;
  }

  sendInputs(batch: InputMsg[]): void {
    if (batch.length > 0) this.room.send(MSG.input, batch);
  }

  /** Request a block edit: a packed coord + block id. */
  place(p: number, b: number): void {
    this.room.send(MSG.edit, { p, b });
  }

  leave(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    void this.room.leave();
  }
}
