/**
 * Colyseus synchronized state — deliberately SMALL (plan §3.5): players,
 * projectiles, drops. Voxel data never goes through schema sync; edits
 * travel as compact broadcast messages and chunks re-derive locally.
 *
 * NOTE: fields are `declare`d and assigned in constructors — real class
 * field initializers would shadow the accessors defineTypes installs
 * (useDefineForClassFields semantics) and break the encoder.
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
  declare lastSeq: number;
  declare grounded: boolean;
  declare swimming: boolean;
  declare inv: MapSchema<number>;

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
    this.inv = new MapSchema<number>();
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
  inv: { map: "uint16" },
});

export class ProjectileS extends Schema {
  declare x: number;
  declare y: number;
  declare z: number;
  declare b: number;

  constructor() {
    super();
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.b = 0;
  }
}
defineTypes(ProjectileS, { x: "float32", y: "float32", z: "float32", b: "uint8" });

export class DropS extends Schema {
  declare x: number;
  declare y: number;
  declare z: number;
  declare b: number;

  constructor() {
    super();
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.b = 0;
  }
}
defineTypes(DropS, { x: "float32", y: "float32", z: "float32", b: "uint8" });

export class ZoneState extends Schema {
  declare players: MapSchema<PlayerS>;
  declare projectiles: MapSchema<ProjectileS>;
  declare drops: MapSchema<DropS>;

  constructor() {
    super();
    this.players = new MapSchema<PlayerS>();
    this.projectiles = new MapSchema<ProjectileS>();
    this.drops = new MapSchema<DropS>();
  }
}
defineTypes(ZoneState, {
  players: { map: PlayerS },
  projectiles: { map: ProjectileS },
  drops: { map: DropS },
});
