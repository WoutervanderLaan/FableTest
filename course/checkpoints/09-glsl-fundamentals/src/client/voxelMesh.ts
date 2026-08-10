/**
 * Module 06 — the thin client-side bridge: MeshData arrays → THREE.BufferGeometry.
 *
 * This is the ONLY place the mesher's output touches Three.js. Notice how little
 * there is to it: the mesher already produced exactly the four arrays a
 * BufferGeometry wants, so we just wrap them (zero copies, zero reshaping).
 */
import * as THREE from "three";
import type { MeshData } from "../shared/mesher";

export function buildGeometry(md: MeshData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(md.positions, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(md.normals, 3));
  g.setAttribute("color", new THREE.BufferAttribute(md.colors, 3));
  g.setIndex(new THREE.BufferAttribute(md.indices, 1));
  g.computeBoundingSphere(); // so frustum culling & shadows know the mesh's extent
  return g;
}
