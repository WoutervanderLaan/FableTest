/**
 * Module 03 — building geometry from raw buffers.
 *
 * A THREE.BufferGeometry is just typed arrays: `position` (xyz per vertex),
 * `normal` (which way the surface faces, for lighting), optional `color` (per
 * vertex), and an `index` (which vertices form each triangle). Every mesh in
 * Three.js — including BoxGeometry — is ultimately this.
 *
 * `MeshBuilder` accumulates triangles and bakes them into one geometry. It is a
 * deliberate miniature of the voxel mesher you'll write in Module 06: emit a
 * quad per visible face, bake a color into its vertices, done.
 */
import * as THREE from "three";

type V3 = [number, number, number];

export class MeshBuilder {
  private positions: number[] = [];
  private normals: number[] = [];
  private colors: number[] = [];
  private indices: number[] = [];

  /**
   * Add one quad (= two triangles). Corners a→b→c→d must wind
   * counter-clockwise as seen from the front (the side `n` points toward), or
   * the face will point the wrong way and get back-face culled.
   */
  quad(a: V3, b: V3, c: V3, d: V3, n: V3, color: THREE.Color): void {
    const base = this.positions.length / 3;
    for (const p of [a, b, c, d]) {
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(n[0], n[1], n[2]);
      this.colors.push(color.r, color.g, color.b);
    }
    // Triangles (a,b,c) and (a,c,d) — a fan across the quad's 4 vertices.
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    g.setIndex(this.indices);
    return g;
  }
}

/** A unit cube built face-by-face — no BoxGeometry. Centered on the origin. */
export function makeCube(color = new THREE.Color("#e8a33d")): THREE.BufferGeometry {
  const m = new MeshBuilder();
  const h = 0.5;
  m.quad([-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h], [0, 0, 1], color); // +Z front
  m.quad([h, -h, -h], [-h, -h, -h], [-h, h, -h], [h, h, -h], [0, 0, -1], color); // -Z back
  m.quad([h, -h, h], [h, -h, -h], [h, h, -h], [h, h, h], [1, 0, 0], color); // +X right
  m.quad([-h, -h, -h], [-h, -h, h], [-h, h, h], [-h, h, -h], [-1, 0, 0], color); // -X left
  m.quad([-h, h, h], [h, h, h], [h, h, -h], [-h, h, -h], [0, 1, 0], color); // +Y top
  m.quad([-h, -h, -h], [h, -h, -h], [h, -h, h], [-h, -h, h], [0, -1, 0], color); // -Y bottom
  return m.build();
}

/**
 * An n×n patchwork of upward-facing quads on the ground plane, each a palette
 * color. This is the mesher's core loop in embryo — one colored quad per cell.
 */
export function makePatchwork(n = 16): THREE.BufferGeometry {
  const m = new MeshBuilder();
  const palette = ["#6fa24b", "#c7c94f", "#3e8e7e", "#b8b2a7", "#8c7a5c"].map(
    (c) => new THREE.Color(c),
  );
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const col = palette[(x * 3 + z * 7) % palette.length]!;
      // +Y-facing quad for cell (x,z); winding matches the cube's top face.
      m.quad([x, 0, z + 1], [x + 1, 0, z + 1], [x + 1, 0, z], [x, 0, z], [0, 1, 0], col);
    }
  }
  return m.build();
}
