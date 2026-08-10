/**
 * Module 11C — bushes from leaf cards on a sphere.
 *
 * The build order, which is also the lesson:
 *   1. distribute points evenly on a sphere        (Fibonacci spiral)
 *   2. deform that sphere so it isn't a ball       (squash + lumps)
 *   3. put a leaf card at each point, in the tangent plane
 *   4. hand the shader the SPHERE normal, not the card's own
 *   5. drive every random choice from a SEED, so bushes differ
 *
 * Every bush in the scene lives in ONE instanced geometry — a hundred bushes
 * still cost one draw call.
 */
import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useControlRef, useControls } from "../debug/useControls";
import { BUSH_FRAG, BUSH_VERT } from "./bushShader";

/**
 * A tiny seeded PRNG (mulberry32). `Math.random()` is unusable here: we need
 * the same seed to rebuild the same bush every time, or a re-render would
 * reshuffle every leaf. Same requirement as the voxel generator in module 05,
 * for the same reason.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A single leaf card: a quad in x/y, -0.5..0.5, with uvs. */
function makeLeafGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    "position",
    new THREE.BufferAttribute(
      new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]),
      3,
    ),
  );
  geo.setAttribute(
    "uv",
    new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2),
  );
  geo.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1));
  return geo;
}

export interface BushSpec {
  position: [number, number, number];
  seed: number;
  radius?: number;
}

export function Bushes({ bushes }: { bushes: BushSpec[] }) {
  const { leavesPerBush, lumpiness, squash } = useControls("Bush · shape", {
    leavesPerBush: { type: "number", value: 260, min: 20, max: 900, step: 10 },
    lumpiness: { type: "number", value: 0.28, min: 0, max: 0.8, step: 0.01 },
    squash: { type: "number", value: 0.82, min: 0.3, max: 1.4, step: 0.01 },
  });

  const look = useControlRef("Bush · look", {
    leafSize: { type: "number", value: 0.34, min: 0.05, max: 1.2, step: 0.01 },
    leafChaos: { type: "number", value: 0.55, min: 0, max: 1, step: 0.01 },
    puff: { type: "number", value: 0.18, min: 0, max: 0.8, step: 0.01 },
    leafRound: { type: "number", value: 0.15, min: 0, max: 1, step: 0.01 },
    normalBlend: { type: "number", value: 0.0, min: 0, max: 1, step: 0.01 },
    translucency: { type: "number", value: 0.55, min: 0, max: 2, step: 0.01 },
    colorA: { type: "color", value: "#41702a" },
    colorB: { type: "color", value: "#93bd4a" },
  });

  const wind = useControlRef("Bush · wind", {
    strength: { type: "number", value: 0.12, min: 0, max: 1, step: 0.01 },
    speed: { type: "number", value: 1.1, min: 0, max: 5, step: 0.01 },
  });

  const geometry = useMemo(() => {
    const leaf = makeLeafGeometry();
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = leaf.index;
    geo.attributes.position = leaf.attributes.position;
    geo.attributes.uv = leaf.attributes.uv;

    const total = bushes.length * leavesPerBush;
    const centers = new Float32Array(total * 3);
    const offsets = new Float32Array(total * 3);
    const normals = new Float32Array(total * 3);
    const cardDirs = new Float32Array(total * 3);
    const randoms = new Float32Array(total * 4);

    // The golden angle is what makes the Fibonacci spiral distribute points
    // evenly instead of clumping into visible spiral arms.
    const GOLDEN = Math.PI * (3 - Math.sqrt(5));

    let o3 = 0;
    let o4 = 0;
    for (const bush of bushes) {
      const rand = mulberry32(bush.seed);
      const radius = bush.radius ?? 1;
      // a few per-bush constants, so bushes differ in more than leaf placement
      const bushSquash = squash * (0.85 + rand() * 0.3);
      const lumpPhase = rand() * 10;

      for (let i = 0; i < leavesPerBush; i++) {
        // ---- 1. even points on a unit sphere (Fibonacci spiral) ----
        const y = 1 - (i / Math.max(1, leavesPerBush - 1)) * 2; // 1 → -1
        const r = Math.sqrt(Math.max(0, 1 - y * y));
        const theta = i * GOLDEN;
        let nx = Math.cos(theta) * r;
        let ny = y;
        let nz = Math.sin(theta) * r;

        // ---- 2. deform: squash + lumps ----
        // A perfect sphere reads as a ball, not a plant. Low-frequency noise on
        // the radius gives it the irregular mass real foliage has.
        const lump =
          1 +
          lumpiness *
            (Math.sin(nx * 2.7 + lumpPhase) * Math.cos(nz * 3.1 - lumpPhase) * 0.5 +
              (rand() - 0.5) * 0.6);
        const rr = radius * lump;

        const px = nx * rr;
        const py = ny * rr * bushSquash;
        const pz = nz * rr;

        centers[o3] = bush.position[0];
        centers[o3 + 1] = bush.position[1];
        centers[o3 + 2] = bush.position[2];

        offsets[o3] = px;
        offsets[o3 + 1] = py;
        offsets[o3 + 2] = pz;

        // The normal is the direction from the bush centre — the *sphere's*
        // normal. This is the value that makes the whole thing work.
        const len = Math.hypot(px, py, pz) || 1;
        normals[o3] = px / len;
        normals[o3 + 1] = py / len;
        normals[o3 + 2] = pz / len;

        // A uniformly random unit direction for this leaf to point in. Sampled
        // from a normal distribution and normalised — picking each component
        // uniformly and normalising would bunch directions toward the cube's
        // corners.
        let gx = 0;
        let gy = 0;
        let gz = 0;
        for (let k = 0; k < 3; k++) {
          const u1 = Math.max(1e-6, rand());
          const u2 = rand();
          const g = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
          if (k === 0) gx = g;
          else if (k === 1) gy = g;
          else gz = g;
        }
        const glen = Math.hypot(gx, gy, gz) || 1;
        cardDirs[o3] = gx / glen;
        cardDirs[o3 + 1] = gy / glen;
        cardDirs[o3 + 2] = gz / glen;
        o3 += 3;

        randoms[o4] = rand(); // roll
        randoms[o4 + 1] = 0.65 + rand() * 0.7; // scale
        randoms[o4 + 2] = rand(); // tint
        randoms[o4 + 3] = rand(); // wind phase
        o4 += 4;
      }
    }

    geo.setAttribute("aCenter", new THREE.InstancedBufferAttribute(centers, 3));
    geo.setAttribute("aOffset", new THREE.InstancedBufferAttribute(offsets, 3));
    geo.setAttribute("aNormal", new THREE.InstancedBufferAttribute(normals, 3));
    geo.setAttribute("aCardDir", new THREE.InstancedBufferAttribute(cardDirs, 3));
    geo.setAttribute("aRandom", new THREE.InstancedBufferAttribute(randoms, 4));
    geo.instanceCount = total;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1000);
    return geo;
  }, [bushes, leavesPerBush, lumpiness, squash]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uLeafSize: { value: 0.34 },
      uLeafChaos: { value: 0.55 },
      uPuff: { value: 0.18 },
      uLeafRound: { value: 0.25 },
      uNormalBlend: { value: 0 },
      uWindDir: { value: new THREE.Vector2(1, 0.35) },
      uWindStrength: { value: 0.12 },
      uWindSpeed: { value: 1.1 },
      uLeafColorA: { value: new THREE.Color("#41702a") },
      uLeafColorB: { value: new THREE.Color("#93bd4a") },
      uSunDir: { value: new THREE.Vector3(0.5, 0.55, 0.4).normalize() },
      uSunColor: { value: new THREE.Color("#ffe6b8") },
      uSkyColor: { value: new THREE.Color("#9fb6c4") },
      uTranslucency: { value: 0.55 },
    }),
    [],
  );

  useFrame((state) => {
    const u = uniforms;
    u.uTime.value = state.clock.elapsedTime;
    u.uLeafSize.value = look("leafSize");
    u.uLeafChaos.value = look("leafChaos");
    u.uPuff.value = look("puff");
    u.uLeafRound.value = look("leafRound");
    u.uNormalBlend.value = look("normalBlend");
    u.uTranslucency.value = look("translucency");
    u.uLeafColorA.value.set(look("colorA"));
    u.uLeafColorB.value.set(look("colorB"));
    u.uWindStrength.value = wind("strength");
    u.uWindSpeed.value = wind("speed");
  });

  return (
    <mesh geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        vertexShader={BUSH_VERT}
        fragmentShader={BUSH_FRAG}
        uniforms={uniforms}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
