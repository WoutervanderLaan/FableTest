/**
 * Module 05 — block ids + palette.
 *
 * This lives in `src/shared/` because it is engine-agnostic pure data: no
 * Three.js, no DOM. The client renders with it; in Part 4 the server will
 * reason about it too. Keeping it dependency-free is what lets the SAME code
 * run in a browser and in Node — the core trick of the whole architecture.
 *
 * (The real Ruderal has 18 blocks in `packages/shared/src/blocks.ts`; we keep a
 * readable 8. Amber is reserved for the player — nothing generated uses it.)
 */

export const Block = {
  Air: 0,
  Soil: 1,
  Grass: 2,
  Stone: 3,
  Sand: 4,
  Water: 5,
  Wood: 6,
  Leaves: 7,
  Amber: 8,
} as const;

export type BlockId = (typeof Block)[keyof typeof Block];
export const BLOCK_COUNT = Object.values(Block).length;

function rgb(hex: number): [number, number, number] {
  return [
    ((hex >> 16) & 0xff) / 255,
    ((hex >> 8) & 0xff) / 255,
    (hex & 0xff) / 255,
  ];
}

/** Base color per block id. Face shading + jitter are applied later, at mesh time. */
export const BLOCK_COLOR: ReadonlyArray<[number, number, number]> = [
  rgb(0x000000), // Air (never rendered)
  rgb(0x7a6a55), // Soil
  rgb(0x7a6a55), // Grass — SIDES read as soil; the green top is in BLOCK_TOP_COLOR
  rgb(0x8a8681), // Stone
  rgb(0xc9b98f), // Sand
  rgb(0x3e8e7e), // Water
  rgb(0x7a5c3e), // Wood
  rgb(0x7da65b), // Leaves
  rgb(0xe8a33d), // Amber — player agency only
];

/** Some blocks paint their +Y (top) face a different color than their sides. */
export const BLOCK_TOP_COLOR: ReadonlyArray<[number, number, number] | null> = [
  null, // Air
  null, // Soil
  rgb(0x6fa24b), // Grass — green top over soil sides
  null, // Stone
  null, // Sand
  null, // Water
  null, // Wood
  null, // Leaves
  null, // Amber
];

/** Solid for collision (Module 07). Water is swimmable, not solid. */
export function isSolid(id: number): boolean {
  return id !== Block.Air && id !== Block.Water;
}

/** Opaque for meshing (Module 06). A face is drawn only against a non-opaque neighbor. */
export function isOpaque(id: number): boolean {
  return id !== Block.Air && id !== Block.Water;
}

/**
 * Directional light baked into vertex colors: top bright, sides mid, bottom
 * dark. This one table is most of why the flat-colored world reads as 3D.
 * Keyed by face direction: py = +Y (top), ny = -Y (bottom), etc.
 */
export const FACE_SHADE: Readonly<Record<string, number>> = {
  py: 1.0,
  ny: 0.5,
  px: 0.78,
  nx: 0.72,
  pz: 0.86,
  nz: 0.66,
};
