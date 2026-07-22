/**
 * Module 13 — the wire contract. This is `src/shared/` on purpose: the client
 * and the server both import it, so they can never disagree about message names
 * or shapes. (The real Ruderal centralizes the same thing in
 * `packages/shared/src/protocol.ts`.)
 *
 * We grow this file across Part 4. The full message set is declared up front so
 * the constant names stay stable; modules wire up the handlers as they need
 * them.
 */
import type { InputSample } from "./movement";

export const ROOM_NAME = "zone";
export const SERVER_PORT = 2567;

/** Server simulation tick (Module 15): 20 Hz. */
export const TICK_MS = 50;

/**
 * Short message keys. Two channels exist in Colyseus:
 *   - automatic STATE SYNC (the schema) for entity positions
 *   - explicit MESSAGES (these) for everything else
 * Voxel edits are messages, not state — see Module 18.
 */
export const MSG = {
  init: "IN", // server → client, once, on join
  move: "mv", // client → server, position (Module 14; replaced in 15)
  input: "in", // client → server, input batch (Module 15+)
  edit: "ed", // client → server, a block edit request (Module 18)
  edits: "ED", // server → clients, confirmed edits (Module 18)
  reject: "RJ", // server → sender, rejected edits to roll back (Module 18)
  ping: "pi",
  pong: "PO",
} as const;

/** What the client sends to move (client-authoritative, Module 14 only). */
export interface MoveMsg {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/** One input sample plus a sequence number + facing (Module 15+). */
export interface InputMsg extends InputSample {
  seq: number;
  yaw: number;
}

/** Sent once when you join: who you are, where you spawn, the world seed. */
export interface InitPayload {
  id: string;
  spawn: { x: number; y: number; z: number };
  seed: number;
  /** Persisted block edits to fold in before meshing (empty until Module 18/19). */
  edits: number[];
}
