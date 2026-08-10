/**
 * Module 11a — patching a built-in material with `onBeforeCompile`.
 *
 * Writing a ShaderMaterial from scratch (Module 09/10) means re-implementing
 * lighting, fog, shadows — everything. Often you want Three.js's PBR/Lambert
 * shader AND one small tweak. `onBeforeCompile` gives you the built-in shader
 * source right before it's compiled, so you can splice code into it by
 * string-replacing the well-known `#include <...>` chunk markers.
 *
 * Here: a per-voxel value jitter. We hash each block's world-space cell and
 * nudge its brightness ±10%, so big flat faces get a subtle noisy "material"
 * instead of reading as one dead-flat color. Keying on the world cell (not the
 * vertex) means the jitter is stable per block and survives face merging — the
 * exact trick from the real `scene/materials.ts`.
 */
import * as THREE from "three";

export function makeVoxelMaterial(): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });

  mat.onBeforeCompile = (shader) => {
    // Vertex: expose the world-space position + normal as varyings.
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vJPos;\nvarying vec3 vJNorm;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n" +
          "vJPos = (modelMatrix * vec4(position, 1.0)).xyz;\n" +
          "vJNorm = normalize(mat3(modelMatrix) * normal);",
      );

    // Fragment: after Three.js computes the base color, hash the cell and jitter.
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vJPos;\nvarying vec3 vJNorm;",
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        {
          // Step half a voxel back along the normal to land INSIDE the block
          // this face belongs to, then hash that integer cell.
          vec3 cell = floor(vJPos - vJNorm * 0.5) + 0.5;
          float jn = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          diffuseColor.rgb *= (0.90 + 0.20 * jn);
        }`,
      );
  };

  return mat;
}
