#!/usr/bin/env node
/**
 * Generate the course's example assets into ./public.
 *
 *   pnpm make-assets
 *
 * Everything here is written from scratch — no binaries live in git. That's
 * partly hygiene and partly the point: modules 04B/04C ask you to open these
 * files and read them, and a glTF you can open in a text editor teaches the
 * format far better than one you can't.
 *
 * Produces:
 *   public/crate.gltf        a textured, animated cube (glTF 2.0, embedded buffer)
 *   public/crate_color.png   base color  (sRGB)
 *   public/crate_rough.png   roughness   (linear, grayscale)
 *   public/crate_normal.png  tangent-space normal map (linear)
 *   public/uv_checker.png    the UV debug checker from module 04C
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "public");
mkdirSync(outDir, { recursive: true });

// ---------------------------------------------------------------- PNG writer

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** `pixel(x, y) -> [r, g, b]`, each 0..255. Writes an 8-bit RGB PNG. */
function writePNG(file, size, pixel) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter type 0 (None) — simplest, still compresses well
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y);
      raw[o++] = r & 255;
      raw[o++] = g & 255;
      raw[o++] = b & 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type 2 = truecolor RGB
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  writeFileSync(join(outDir, file), png);
  return png.length;
}

// ------------------------------------------------------------------ textures

// A cheap deterministic hash — the same trick module 09C derives for shaders.
function hash01(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const PLANK = 64; // one plank every 64px of a 256px texture

writePNG("crate_color.png", 256, (x, y) => {
  const row = Math.floor(y / PLANK);
  const grain = hash01(Math.floor(x / 2), row, 1);
  const gap = y % PLANK < 3 ? 0.55 : 1; // dark seam between planks
  // Ruderal's palette: weathered wood browns, slightly varied per plank
  const tint = 0.86 + hash01(row, 0, 2) * 0.28;
  const l = gap * tint * (0.9 + grain * 0.2);
  return [Math.min(255, 150 * l), Math.min(255, 122 * l), Math.min(255, 84 * l)];
});

writePNG("crate_rough.png", 256, (x, y) => {
  // seams and grain read as rougher; plank faces are smoother
  const seam = y % PLANK < 3 ? 245 : 150;
  const v = Math.min(255, seam * (0.85 + hash01(x, y, 3) * 0.3));
  return [v, v, v];
});

writePNG("crate_normal.png", 256, (x, y) => {
  // tangent-space normal: flat (0,0,1) encodes to (128,128,255).
  // Carve a V-groove at each plank seam by tilting the normal in Y.
  const d = y % PLANK;
  let ny = 0;
  if (d < 3) ny = (d - 1.5) / 1.5; // -1 .. +1 across the seam
  const nx = (hash01(x, y, 4) - 0.5) * 0.12; // faint grain
  const nz = Math.sqrt(Math.max(0.0001, 1 - nx * nx - ny * ny));
  return [(nx * 0.5 + 0.5) * 255, (ny * 0.5 + 0.5) * 255, (nz * 0.5 + 0.5) * 255];
});

writePNG("uv_checker.png", 256, (x, y) => {
  const cx = Math.floor(x / 32);
  const cy = Math.floor(y / 32);
  const on = (cx + cy) % 2 === 0;
  // one amber square marks (u,v) = (0,0) so you can see orientation & winding
  if (cx === 0 && cy === 0) return [232, 163, 61];
  return on ? [244, 239, 227] : [58, 53, 44];
});

// ---------------------------------------------------------------------- glTF

// A unit cube, 4 unshared vertices per face so each face gets its own normal
// and its own full 0..1 UV square — exactly the reasoning module 06 used for
// voxel faces.
const FACES = [
  { n: [1, 0, 0], v: [[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]] },
  { n: [-1, 0, 0], v: [[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]] },
  { n: [0, 1, 0], v: [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]] },
  { n: [0, -1, 0], v: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]] },
  { n: [0, 0, 1], v: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]] },
  { n: [0, 0, -1], v: [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]] },
];
const UV = [[0, 1], [1, 1], [1, 0], [0, 0]]; // glTF UV origin is top-left

const positions = [];
const normals = [];
const uvs = [];
const indices = [];
for (const f of FACES) {
  const base = positions.length / 3;
  for (let c = 0; c < 4; c++) {
    positions.push(...f.v[c]);
    normals.push(...f.n);
    uvs.push(...UV[c]);
  }
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

// Animation: one full turn about Y over 4 seconds, as 5 quaternion keyframes.
const times = [0, 1, 2, 3, 4];
const quats = [];
for (let i = 0; i < times.length; i++) {
  const a = (i / (times.length - 1)) * Math.PI * 2;
  quats.push(0, Math.sin(a / 2), 0, Math.cos(a / 2)); // (x, y, z, w)
}

const parts = [
  { name: "POSITION", data: new Float32Array(positions) },
  { name: "NORMAL", data: new Float32Array(normals) },
  { name: "TEXCOORD_0", data: new Float32Array(uvs) },
  { name: "INDICES", data: new Uint16Array(indices) },
  { name: "ANIM_IN", data: new Float32Array(times) },
  { name: "ANIM_OUT", data: new Float32Array(quats) },
];

// Lay the parts out back to back, 4-byte aligned (glTF requires accessor
// offsets to be a multiple of the component size; 4 satisfies every type here).
const views = [];
let offset = 0;
for (const p of parts) {
  const bytes = new Uint8Array(p.data.buffer, p.data.byteOffset, p.data.byteLength);
  views.push({ name: p.name, offset, length: bytes.length, bytes });
  offset += bytes.length;
  offset = (offset + 3) & ~3; // the same pad4 trick as packages/shared/src/zonepack.ts
}
const buffer = new Uint8Array(offset);
for (const v of views) buffer.set(v.bytes, v.offset);

const bv = (i) => ({ buffer: 0, byteOffset: views[i].offset, byteLength: views[i].length });
const min = [-0.5, -0.5, -0.5];
const max = [0.5, 0.5, 0.5];

const gltf = {
  asset: { version: "2.0", generator: "mini-ruderal make-assets" },
  scene: 0,
  scenes: [{ name: "Crate", nodes: [0, 1] }],
  nodes: [
    { name: "Crate", mesh: 0, translation: [0, 0, 0] },
    { name: "Beacon", mesh: 0, translation: [2.2, 0.6, 0], scale: [0.45, 0.45, 0.45] },
  ],
  meshes: [
    {
      name: "CrateMesh",
      primitives: [
        { attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 },
      ],
    },
  ],
  materials: [
    {
      name: "CrateMaterial",
      pbrMetallicRoughness: {
        baseColorTexture: { index: 0 },
        metallicRoughnessTexture: { index: 1 },
        metallicFactor: 0,
        roughnessFactor: 1,
      },
      normalTexture: { index: 2 },
    },
  ],
  textures: [
    { source: 0, sampler: 0 },
    { source: 1, sampler: 0 },
    { source: 2, sampler: 0 },
  ],
  images: [{ uri: "crate_color.png" }, { uri: "crate_rough.png" }, { uri: "crate_normal.png" }],
  samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
  animations: [
    {
      name: "Spin",
      samplers: [{ input: 4, output: 5, interpolation: "LINEAR" }],
      channels: [{ sampler: 0, target: { node: 1, path: "rotation" } }],
    },
  ],
  bufferViews: [bv(0), bv(1), bv(2), bv(3), bv(4), bv(5)],
  accessors: [
    { bufferView: 0, componentType: 5126, count: positions.length / 3, type: "VEC3", min, max },
    { bufferView: 1, componentType: 5126, count: normals.length / 3, type: "VEC3" },
    { bufferView: 2, componentType: 5126, count: uvs.length / 2, type: "VEC2" },
    { bufferView: 3, componentType: 5123, count: indices.length, type: "SCALAR" },
    {
      bufferView: 4,
      componentType: 5126,
      count: times.length,
      type: "SCALAR",
      min: [times[0]],
      max: [times[times.length - 1]],
    },
    { bufferView: 5, componentType: 5126, count: quats.length / 4, type: "VEC4" },
  ],
  buffers: [
    {
      byteLength: buffer.length,
      uri: "data:application/octet-stream;base64," + Buffer.from(buffer).toString("base64"),
    },
  ],
};

writeFileSync(join(outDir, "crate.gltf"), JSON.stringify(gltf, null, 2));

console.log(`Wrote assets to public/:
  crate.gltf        ${JSON.stringify(gltf).length} bytes of JSON, ${buffer.length}-byte embedded buffer
  crate_color.png   base color (sRGB)
  crate_rough.png   roughness (linear)
  crate_normal.png  normal map (linear)
  uv_checker.png    UV debug checker

Open crate.gltf in an editor — it is meant to be read.`);
