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
  declare hp: number;
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
    this.hp = 100;
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
  hp: "uint16",
  inv: { map: "uint16" },
});

export class HuskS extends Schema {
  declare x: number;
  declare y: number;
  declare z: number;
  declare yaw: number;
  declare hp: number;
  declare state: number; // 0 wander, 1 chase, 2 attack, 3 siege

  constructor() {
    super();
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.yaw = 0;
    this.hp = 60;
    this.state = 0;
  }
}
defineTypes(HuskS, {
  x: "float32",
  y: "float32",
  z: "float32",
  yaw: "float32",
  hp: "uint16",
  state: "uint8",
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
  declare zoneId: string;
  declare players: MapSchema<PlayerS>;
  declare projectiles: MapSchema<ProjectileS>;
  declare drops: MapSchema<DropS>;
  declare husks: MapSchema<HuskS>;

  constructor() {
    super();
    this.zoneId = "";
    this.players = new MapSchema<PlayerS>();
    this.projectiles = new MapSchema<ProjectileS>();
    this.drops = new MapSchema<DropS>();
    this.husks = new MapSchema<HuskS>();
  }
}
defineTypes(ZoneState, {
  zoneId: "string",
  players: { map: PlayerS },
  projectiles: { map: ProjectileS },
  drops: { map: DropS },
  husks: { map: HuskS },
});
