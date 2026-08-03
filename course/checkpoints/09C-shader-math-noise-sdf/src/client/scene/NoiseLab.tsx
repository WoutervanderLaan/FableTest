/**
 * Module 09C — noise, domain warping and signed distance fields.
 *
 * The whole module is built on ONE primitive: a hash that turns a coordinate
 * into a repeatable pseudo-random number. Everything else — value noise, fbm,
 * warping, clouds, terrain — is that hash plus interpolation plus addition.
 *
 * Read NOISE_HELPERS from top to bottom; each function uses only the one above
 * it, so the whole tower is legible in one pass.
 */
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { Panel } from "./ShaderLab";

export const NOISE_HELPERS = /* glsl */ `
  // ---- 1. HASH --------------------------------------------------------
  // A coordinate in, a repeatable 0..1 out. No state, no seed array.
  // dot() collapses the vector to one number; sin() scrambles it; the big
  // multiply pushes the interesting variation up past the decimal point;
  // fract() keeps only that. Not a good hash by cryptographic standards —
  // but it is one line, needs no memory, and is stable frame to frame.
  float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
  }

  // ---- 2. VALUE NOISE -------------------------------------------------
  // Hash the four corners of the integer lattice cell, then interpolate.
  // The smoothstep curve on the blend factor (f*f*(3-2f)) is what makes the
  // result look organic instead of like a stretched grid: it kills the
  // derivative discontinuity at cell edges.
  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  // ---- 3. FBM (fractal brownian motion) -------------------------------
  // Sum octaves: each one doubles the frequency (lacunarity) and halves the
  // amplitude (gain). Big shapes come from the first octave, fine detail from
  // the last. This is the single most useful noise construct there is.
  float fbm(vec2 p) {
    float sum = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 5; i++) {
      sum += amp * valueNoise(p);
      p *= 2.0;
      amp *= 0.5;
    }
    return sum;
  }

  // ---- 4. SIGNED DISTANCE FIELDS --------------------------------------
  // f(p) < 0 inside, 0 on the surface, > 0 outside — and the VALUE is the
  // distance, which is what makes outlines, glows and smooth blends free.
  float sdCircle(vec2 p, float r) {
    return length(p) - r;
  }
  float sdBox(vec2 p, vec2 b) {
    vec2 d = abs(p) - b;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  }
  // Smooth minimum: a union that MELTS the two shapes together instead of
  // creasing them. k controls the blend radius.
  float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
  }
`;

export const NOISE_PANELS: { name: string; body: string }[] = [
  {
    // 1. WHITE NOISE. Every pixel independent — no structure at any scale.
    // Useful for dithering and grain, useless for terrain.
    name: "hash",
    body: `col = vec3(hash21(floor(uv * 64.0)));`,
  },
  {
    // 2. VALUE NOISE. The same hash, but sampled on a lattice and
    // interpolated: now neighbouring points are RELATED. This is the
    // difference between static and structure.
    name: "value noise",
    body: `col = vec3(valueNoise(uv * 6.0));`,
  },
  {
    // 3. FBM. Five octaves of value noise summed. Note how it reads as
    // terrain, cloud or rust depending only on how you colour it.
    name: "fbm",
    body: `
      float n = fbm(uv * 4.0);
      col = mix(INK, TEAL, n);
      col = mix(col, PAPER, smoothstep(0.55, 0.85, n));
    `,
  },
  {
    // 4. DOMAIN WARPING. Instead of colouring fbm, use fbm to DISPLACE the
    // coordinate you sample fbm at. Two extra lines; turns bland cloud into
    // marbled, flowing, organic structure. The single best return on effort
    // in procedural texturing.
    name: "domain warp",
    body: `
      vec2 p = uv * 3.0;
      vec2 q = vec2(fbm(p + uTime * 0.05), fbm(p + vec2(5.2, 1.3)));
      float n = fbm(p + 4.0 * q);
      col = mix(INK, AMBER, n);
      col = mix(col, TEAL, smoothstep(0.4, 0.8, n));
    `,
  },
  {
    // 5. SDFs. A circle and a box combined three ways: hard union (min),
    // smooth union (smin), and subtraction (max with a negated field).
    // The distance value also gives us the outline for free.
    name: "sdf + smin",
    body: `
      vec2 p = (uv - 0.5) * 2.0;
      float a = sdCircle(p - vec2(-0.28, 0.0), 0.30);
      float b = sdBox(p - vec2(0.28, 0.0), vec2(0.26, 0.20));
      float k = 0.15 + 0.12 * sin(uTime);
      float d = smin(a, b, k);
      col = mix(TEAL, INK, smoothstep(0.0, 0.01, d));      // fill
      col = mix(col, AMBER, smoothstep(0.02, 0.0, abs(d))); // outline
      col *= 0.75 + 0.25 * sin(d * 60.0);                   // distance bands
    `,
  },
  {
    // 6. BANDING vs DITHER. Quantise a smooth ramp to 6 levels and you get
    // ugly bands (top). Add a tiny per-pixel hash BEFORE quantising and the
    // error scatters into noise your eye reads as a smooth gradient (bottom).
    // This is why module 12's postprocessing adds a Noise pass.
    name: "dither",
    body: `
      float levels = 6.0;
      float n = hash21(floor(gl_FragCoord.xy)) - 0.5;
      float banded   = floor(uv.x * levels) / levels;
      float dithered = floor(uv.x * levels + n) / levels;
      col = vec3(uv.y > 0.5 ? banded : dithered);
    `,
  },
];

/** The six noise panels, in a 3×2 grid. */
export function NoiseLab() {
  return (
    <>
      {NOISE_PANELS.map((p, i) => (
        <Panel
          key={p.name}
          body={p.body}
          header={NOISE_HELPERS}
          position={[(i % 3) * 2 - 2, 1 - Math.floor(i / 3) * 2, 0]}
        />
      ))}
    </>
  );
}

/**
 * Noise in 3D: an fbm-displaced surface with a fresnel rim.
 *
 * The vertex shader samples fbm to push vertices along the normal — the same
 * fbm that made a grayscale square is now making geometry. The fragment shader
 * adds the fresnel term from module 09B, which is what sells water and glass:
 * surfaces get brighter at grazing angles.
 */
const WATER_VERT = /* glsl */ `
  ${NOISE_HELPERS}
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  varying float vHeight;

  void main() {
    vec2 p = position.xy * 1.5 + vec2(uTime * 0.08, 0.0);
    float h = fbm(p) - 0.5;
    vHeight = h;

    vec3 displaced = position + vec3(0.0, 0.0, h * 0.6);
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(displaced, 1.0);
    vViewPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const WATER_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  varying float vHeight;

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(-vViewPos);
    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);

    vec3 deep    = vec3(0.06, 0.20, 0.22);
    vec3 shallow = vec3(0.243, 0.557, 0.494);
    vec3 col = mix(deep, shallow, smoothstep(-0.25, 0.25, vHeight));
    col += vec3(0.910, 0.639, 0.239) * fresnel * 0.6;

    gl_FragColor = vec4(col, 1.0);
  }
`;

export function NoiseSurface({ position = [0, 3.6, 0] as [number, number, number] }) {
  const ref = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
  useFrame((state) => {
    if (ref.current) ref.current.uniforms.uTime.value = state.clock.elapsedTime;
  });
  return (
    <mesh position={position} rotation={[-0.9, 0, 0]}>
      <planeGeometry args={[5, 3, 160, 96]} />
      <shaderMaterial
        ref={ref}
        vertexShader={WATER_VERT}
        fragmentShader={WATER_FRAG}
        uniforms={uniforms}
      />
    </mesh>
  );
}
