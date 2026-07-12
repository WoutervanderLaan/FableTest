/**
 * Colyseus connection wrapper. colyseus.js keeps ONE handler per message
 * type, so this class registers each once and fans out to subscribers
 * (controller applies edits; debris listens to collapses; HUD to damage).
 */

import { Client, type Room } from "colyseus.js";
import { MSG, ROOM_NAME, type InputMsg } from "@ruderal/shared";

export interface InitPayload {
  id: string;
  spawn: { x: number; y: number; z: number };
  edits: number[];
}

export interface DamageMsg {
  p: number;
  d: number;
  need: number;
}

type EventMap = {
  edits: number[];
  reject: number[];
  collapse: number[];
  damage: DamageMsg;
  leave: number;
};

export class Net {
  latencyMs = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private listeners: { [K in keyof EventMap]: Set<(v: EventMap[K]) => void> } = {
    edits: new Set(),
    reject: new Set(),
    collapse: new Set(),
    damage: new Set(),
    leave: new Set(),
  };

  private constructor(
    readonly room: Room,
    readonly id: string,
    readonly init: InitPayload,
  ) {}

  static async join(url: string, name: string): Promise<Net> {
    const client = new Client(url);
    const room = await client.joinOrCreate(ROOM_NAME, { name });
    const init = await new Promise<InitPayload>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("server sent no init payload")), 10000);
      room.onMessage(MSG.init, (payload: InitPayload) => {
        clearTimeout(timeout);
        resolve(payload);
      });
    });
    const net = new Net(room, init.id, init);

    room.onMessage(MSG.edits, (pairs: number[]) => net.emit("edits", pairs));
    room.onMessage(MSG.reject, (pairs: number[]) => net.emit("reject", pairs));
    room.onMessage(MSG.collapse, (pairs: number[]) => net.emit("collapse", pairs));
    room.onMessage(MSG.damage, (m: DamageMsg) => net.emit("damage", m));
    room.onMessage(MSG.pong, (t: number) => {
      net.latencyMs = Math.round(performance.now() - t);
    });
    room.onLeave((code) => net.emit("leave", code));

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

  sendInputs(batch: InputMsg[]): void {
    if (batch.length > 0) this.room.send(MSG.input, batch);
  }

  place(p: number, b: number): void {
    this.room.send(MSG.edit, { p, b });
  }

  hit(p: number): void {
    this.room.send(MSG.hit, { p });
  }

  throwProjectile(dx: number, dy: number, dz: number): void {
    this.room.send(MSG.throw, { dx, dy, dz });
  }

  leave(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.room.leave();
  }
}
