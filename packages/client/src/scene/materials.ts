/**
 * Voxel materials. Flat palette + vertex-color AO does most of the look;
 * a fragment-shader per-voxel value jitter (keyed on world position so it
 * survives greedy merging) breaks up large faces into readable "material".
 */

import * as THREE from "three";

export function makeVoxelMaterial(): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vJPos;\nvarying vec3 vJNorm;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvJPos = (modelMatrix * vec4(position, 1.0)).xyz;\nvJNorm = normalize(mat3(modelMatrix) * normal);",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vJPos;\nvarying vec3 vJNorm;",
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
{
  // per-voxel value jitter: step half a voxel back along the normal to land
  // inside the block this fragment belongs to, then hash its cell
  vec3 cell = floor(vJPos - vJNorm * 0.5) + 0.5;
  float jn = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  diffuseColor.rgb *= (0.90 + 0.20 * jn);
}`,
      );
  };
  return mat;
}

export function makeWaterMaterial(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    color: new THREE.Color("#3e8e7e"),
    transparent: true,
    opacity: 0.78,
    emissive: new THREE.Color("#1d4a42"),
    emissiveIntensity: 0.35,
  });
}
