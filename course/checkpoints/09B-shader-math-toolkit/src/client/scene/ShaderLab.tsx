/**
 * Module 09B — the shader-math playground.
 *
 * Every panel below is the SAME quad with the SAME vertex shader; only a few
 * lines of fragment math differ. That's deliberate: it isolates the one thing
 * you're studying, which is how the maths turns a coordinate into a colour.
 *
 * Each fragment body gets this preamble, so a panel only has to set `col`:
 *
 *     vec2  uv     0..1 across the quad
 *     float uTime  seconds
 *     plot(uv, y, t)   draw a curve y = f(uv.x)
 *     AMBER / TEAL / INK / PAPER   the Ruderal palette
 */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PREAMBLE = /* glsl */ `
  precision highp float;
  uniform float uTime;
  varying vec2 vUv;

  const vec3 AMBER = vec3(0.910, 0.639, 0.239);
  const vec3 TEAL  = vec3(0.243, 0.557, 0.494);
  const vec3 INK   = vec3(0.227, 0.208, 0.173);
  const vec3 PAPER = vec3(0.957, 0.937, 0.890);

  // Draw the curve y = f(x) as a soft line. t is half the line thickness.
  float plot(vec2 uv, float y, float t) {
    return smoothstep(t, 0.0, abs(uv.y - y));
  }
`;

/**
 * Build a ShaderMaterial from just the body of main().
 *
 * `extraHeader` lets a later module inject its own helper functions above
 * main() without copying the preamble — module 09C uses it for noise and SDFs.
 */
export function makeLabMaterial(body: string, extraHeader = ""): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: `${PREAMBLE}
      ${extraHeader}
      void main() {
        vec2 uv = vUv;
        vec3 col = vec3(0.0);
        ${body}
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    uniforms: { uTime: { value: 0 } },
  });
}

/**
 * The eight panels. Read them in order — each one introduces exactly one idea,
 * and later modules (10, 11, 12D) are built entirely out of these.
 */
export const PANELS: { name: string; body: string }[] = [
  {
    // 1. UV SPACE. The domain everything else operates on: a unit square.
    // Red rises with x, green with y — so the corners tell you the orientation.
    name: "uv",
    body: `col = vec3(uv, 0.0);`,
  },
  {
    // 2. STEP vs SMOOTHSTEP. step() is a hard cliff and aliases badly.
    // smoothstep() ramps between two edges with an ease-in-out curve, and is
    // the single most used function in shader work — antialiased everything.
    name: "step / smoothstep",
    body: `
      float hard = step(0.5, uv.x);
      float soft = smoothstep(0.35, 0.65, uv.x);
      float v = uv.y > 0.5 ? hard : soft;
      col = mix(INK, PAPER, v);
    `,
  },
  {
    // 3. MIX. Linear interpolation, the workhorse: mix(a, b, t) = a + (b-a)*t.
    // Two colours and a 0..1 knob gets you every gradient you'll ever need.
    name: "mix",
    body: `
      col = mix(AMBER, TEAL, uv.x);
      col = mix(col, PAPER, smoothstep(0.75, 1.0, uv.y));
    `,
  },
  {
    // 4. LENGTH / DISTANCE FIELDS. length(uv - c) is the distance to a point;
    // thresholding it gives a circle. Keep the DISTANCE around (rather than
    // just a mask) and you can ring it, glow it, or outline it for free.
    name: "distance",
    body: `
      float d = length(uv - 0.5);
      float disc  = smoothstep(0.32, 0.30, d);
      float rings = 0.5 + 0.5 * sin(d * 60.0 - uTime * 2.0);
      col = mix(INK, TEAL, disc * rings) + AMBER * smoothstep(0.34, 0.32, d) * 0.25;
    `,
  },
  {
    // 5. POLAR COORDINATES. atan(y, x) gives the angle, length() the radius.
    // Swapping cartesian for polar turns stripes into spokes and boxes into
    // rings — it's a change of domain, not a change of maths.
    name: "polar",
    body: `
      vec2 p = uv - 0.5;
      float a = atan(p.y, p.x);          // -PI .. PI
      float r = length(p);
      float spokes = 0.5 + 0.5 * sin(a * 8.0 + uTime);
      col = mix(INK, AMBER, spokes * smoothstep(0.45, 0.10, r));
    `,
  },
  {
    // 6. WAVES. sin() is your oscillator: amplitude * sin(frequency*x + phase).
    // Multiply x to change frequency, add uTime to animate, scale the result
    // for amplitude. Note 0.5+0.5*sin(..) to map -1..1 into 0..1.
    name: "waves",
    body: `
      float freq = 12.0;
      float y = 0.5 + 0.18 * sin(uv.x * freq + uTime * 2.0);
      col = mix(INK, PAPER, plot(uv, y, 0.02));
      col = mix(col, TEAL, plot(uv, 0.5 + 0.18 * sin(uv.x * freq * 0.5 - uTime), 0.02));
    `,
  },
  {
    // 7. FRACT — repetition. fract(x) keeps the fractional part, so fract(uv*n)
    // tiles the unit square n times. This is how you get grids, bricks and
    // stripes without any extra geometry.
    name: "fract",
    body: `
      vec2 g = fract(uv * 4.0);            // 0..1 WITHIN each cell
      vec2 cell = floor(uv * 4.0);         // which cell we're in
      float checker = mod(cell.x + cell.y, 2.0);
      vec3 base = mix(INK, INK * 1.8, checker);

      // distance to the nearest cell edge, per axis; a line is where EITHER
      // axis is close to an edge — hence max(), not min()
      float lx = smoothstep(0.06, 0.0, min(g.x, 1.0 - g.x));
      float ly = smoothstep(0.06, 0.0, min(g.y, 1.0 - g.y));
      col = mix(base, AMBER, max(lx, ly));
    `,
  },
  {
    // 8. CURVES. pow() reshapes a 0..1 ramp: >1 eases in, <1 eases out. This
    // is exactly the pow(h, 0.65) horizon bias and pow(dot, 6.0) sun tightness
    // you'll write in module 10.
    name: "curves",
    body: `
      col = INK;
      col = mix(col, PAPER, plot(uv, uv.x, 0.012));              // linear
      col = mix(col, AMBER, plot(uv, uv.x * uv.x, 0.012));       // ease in
      col = mix(col, TEAL,  plot(uv, sqrt(uv.x), 0.012));        // ease out
      col = mix(col, vec3(0.78, 0.79, 0.31),
                plot(uv, smoothstep(0.0, 1.0, uv.x), 0.012));    // S-curve
    `,
  },
];

export function Panel({
  body,
  position,
  header = "",
}: {
  body: string;
  position: [number, number, number];
  header?: string;
}) {
  const material = useMemo(() => makeLabMaterial(body, header), [body, header]);
  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
  });
  return (
    <mesh position={position} material={material}>
      <planeGeometry args={[1.8, 1.8]} />
    </mesh>
  );
}

/** The 8 panels in a 4×2 grid. */
export function ShaderLab() {
  return (
    <>
      {PANELS.map((p, i) => (
        <Panel
          key={p.name}
          body={p.body}
          position={[(i % 4) * 2 - 3, 1 - Math.floor(i / 4) * 2, 0]}
        />
      ))}
    </>
  );
}

/**
 * The same maths in 3D. A hand-written Lambert + Blinn-Phong sphere: no
 * MeshStandardMaterial, no lights — just dot products.
 *
 *   dot(N, L)             how much this point faces the light  → diffuse
 *   pow(dot(N, H), s)     how close to a mirror bounce          → specular
 *   pow(1 - dot(N, V), f) how edge-on the surface is            → fresnel rim
 *
 * Those three lines are most of real-time lighting. Module 09C reuses the
 * fresnel term for water and glass.
 */
const LIT_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewPos;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const LIT_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vViewPos;

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(-vViewPos);                 // view space: eye is at origin
    // keep the light in front of the sphere (+z in view space) so it orbits
    // across the face instead of disappearing behind it
    vec3 L = normalize(vec3(sin(uTime * 0.6) * 0.9, 0.55, 0.85));
    vec3 H = normalize(L + V);                     // half-vector

    float diffuse  = max(dot(N, L), 0.0);
    float specular = pow(max(dot(N, H), 0.0), 48.0);
    float fresnel  = pow(1.0 - max(dot(N, V), 0.0), 3.0);

    vec3 col = vec3(0.243, 0.557, 0.494) * (0.15 + 0.85 * diffuse);
    col += vec3(1.0, 0.92, 0.78) * specular * 0.6;
    col += vec3(0.910, 0.639, 0.239) * fresnel * 0.5;

    gl_FragColor = vec4(col, 1.0);
  }
`;

export function LitSphere({ position = [0, 3.4, 0] as [number, number, number] }) {
  const ref = useRef<THREE.ShaderMaterial>(null);
  useFrame((state) => {
    if (ref.current) ref.current.uniforms.uTime.value = state.clock.elapsedTime;
  });
  return (
    <mesh position={position}>
      <sphereGeometry args={[1.1, 48, 32]} />
      <shaderMaterial
        ref={ref}
        vertexShader={LIT_VERT}
        fragmentShader={LIT_FRAG}
        uniforms={{ uTime: { value: 0 } }}
      />
    </mesh>
  );
}
