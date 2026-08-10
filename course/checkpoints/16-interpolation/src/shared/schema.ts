/**
 * Module 13 — the Colyseus synchronized state.
 *
 * A `Schema` is a class Colyseus watches: mutate a field on the server and the
 * change is efficiently sent to every client automatically (only the diff, not
 * the whole state). We keep it SMALL and put only what remote clients must see
 * to render each other — positions, facing, velocity — never the voxel volume
 * (that's far too big; edits travel as messages instead, Module 18).
 *
 * This lives in `src/shared/` so server and client share the exact same schema.
 *
 * IMPORTANT: fields are `declare`d (type-only) and assigned in the constructor,
 * with `defineTypes` installing the real accessors. Writing normal class-field
 * initializers would shadow those accessors under ES2022 semantics and silently
 * break the encoder. This is a real Ruderal gotcha (see its `schema.ts`).
 */
import { MapSchema, Schema, defineTypes } from "@colyseus/schema";

export class PlayerS extends Schema {
  declare name: string;
  declare x: number;
  declare y: number;
  declare z: number;
  declare yaw: number;
  declare vx: number;
  declare vy: number;
  declare vz: number;
  /** Last input sequence the server has applied — drives reconciliation (Module 17). */
  declare lastSeq: number;
  declare grounded: boolean;
  declare swimming: boolean;

  constructor() {
    super();
    this.name = "";
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.yaw = 0;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.lastSeq = 0;
    this.grounded = false;
    this.swimming = false;
  }
}
defineTypes(PlayerS, {
  name: "string",
  x: "float32",
  y: "float32",
  z: "float32",
  yaw: "float32",
  vx: "float32",
  vy: "float32",
  vz: "float32",
  lastSeq: "uint32",
  grounded: "boolean",
  swimming: "boolean",
});

export class ZoneState extends Schema {
  declare players: MapSchema<PlayerS>;

  constructor() {
    super();
    this.players = new MapSchema<PlayerS>();
  }
}
defineTypes(ZoneState, {
  players: { map: PlayerS },
});
