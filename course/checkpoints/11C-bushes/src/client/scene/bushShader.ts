/**
 * Module 11C — the bush shaders.
 *
 * A bush is a few hundred flat leaf cards arranged on a sphere. Left alone,
 * that lights like a pile of flat cards — because it IS a pile of flat cards.
 *
 * The fix, and the single most important idea in this module, is in the
 * vertex shader:
 *
 *     vNormal = aNormal;   // the SPHERE's outward normal, not the card's
 *
 * Each leaf reports the normal of the sphere it sits on rather than its own
 * flat face. The lighting then varies smoothly from one side of the bush to
 * the other, so a heap of cards reads as one soft, rounded volume. Everything
 * else here — the leaf silhouette, the wind, the colour variation — is detail
 * on top of that one substitution.
 */

export const BUSH_VERT = /* glsl */ `
precision highp float;

attribute vec3 aCenter;   // which bush this leaf belongs to (world position)
attribute vec3 aOffset;   // leaf position relative to that centre
attribute vec3 aNormal;   // outward normal of the bush surface here
attribute vec3 aCardDir;  // a random unit direction, for chaotic leaf orientation
attribute vec4 aRandom;   // x: roll  y: scale  z: tint  w: wind phase

uniform float uTime;
uniform float uLeafSize;
uniform float uLeafChaos;    // 0 = cards lie flat on the sphere, 1 = point anywhere
uniform float uPuff;         // random outward offset, for a ragged silhouette
uniform vec2  uWindDir;
uniform float uWindStrength;
uniform float uWindSpeed;
uniform float uNormalBlend;  // 0 = shade by SPHERE normal, 1 = shade by CARD normal

varying vec2  vUv;
varying vec3  vNormal;
varying float vTint;
varying float vExposure;     // 1 on top/outside, 0 underneath — cheap AO

void main() {
  vUv = uv;
  vTint = aRandom.z;

  // The bush's own surface normal at this point — the direction from its
  // centre. This is the value the lighting wants.
  vec3 n = normalize(aNormal);

  // ---- which way does this leaf actually point? ---------------------------
  // Real foliage doesn't lie flat against an imaginary sphere; leaves stick
  // out at every angle. uLeafChaos blends each card from "tangent to the
  // bush" toward "pointing anywhere", and THAT is what makes the normal
  // question below a real question.
  vec3 cardN = normalize(mix(n, aCardDir, uLeafChaos));

  // an orthonormal basis in the card's own plane. Any vector not parallel to
  // cardN seeds the cross product; swap seeds near the poles so it never
  // degenerates to zero length.
  vec3 seed = abs(cardN.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 t = normalize(cross(seed, cardN));
  vec3 b = cross(cardN, t);

  // random roll within that plane, so cards don't all align
  float a = aRandom.x * 6.2831853;
  vec3 tt =  t * cos(a) + b * sin(a);
  vec3 bb = -t * sin(a) + b * cos(a);

  float scale = uLeafSize * aRandom.y;
  vec3 local = tt * (position.x * scale) + bb * (position.y * scale);

  // ---- wind ---------------------------------------------------------------
  // Leaves further from the bush's core move more, and the whole bush shares
  // one travelling wave so neighbouring bushes gust together.
  vec2 wd = normalize(uWindDir + 1e-6);
  float phase = dot(aCenter.xz, wd) * 0.35 - uTime * uWindSpeed + aRandom.w * 6.2831853;
  float gust = sin(phase) * 0.65 + sin(phase * 2.7 + 1.1) * 0.35;
  float lever = clamp(length(aOffset) / max(uLeafSize, 0.001) * 0.15, 0.0, 1.0);

  vec3 offset = aOffset;
  offset.xz += wd * gust * uWindStrength * lever;
  offset.y  += gust * uWindStrength * 0.25 * lever;

  // push each card outward by a random amount, so the silhouette is ragged
  // instead of a clean ball
  offset += n * (aRandom.y - 0.65) * uPuff;

  vec3 worldPos = aCenter + offset + local;

  // ---- normals: the whole trick -------------------------------------------
  // Two candidates, and the choice is the entire module:
  //   cardN — the direction this leaf physically faces. Physically honest,
  //           and because neighbouring leaves face wildly different ways it
  //           makes the bush a speckled mess of independently-lit flakes.
  //   n     — the bush's overall surface normal. A lie, but a useful one: the
  //           lighting now varies smoothly around the volume, so a heap of
  //           cards reads as one soft, rounded plant.
  vNormal = normalize(mix(n, cardN, uNormalBlend));

  // Cheap ambient occlusion: how much of the sky can this leaf see? Leaves on
  // the underside of the bush are in its shadow.
  vExposure = n.y * 0.5 + 0.5;

  gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
}
`;

export const BUSH_FRAG = /* glsl */ `
precision highp float;

uniform vec3  uLeafColorA;
uniform vec3  uLeafColorB;
uniform vec3  uSunDir;
uniform vec3  uSunColor;
uniform vec3  uSkyColor;
uniform float uTranslucency;
uniform float uLeafRound;   // 0 = pointed lens, 1 = round blob

varying vec2  vUv;
varying vec3  vNormal;
varying float vTint;
varying float vExposure;

void main() {
  // ---- the leaf silhouette, as an SDF (module 09C) -------------------------
  // A "lens": the intersection of two offset circles. max() is intersection
  // for signed distance fields, and two overlapping discs meet at two points —
  // which is exactly a leaf's pointed tip and stem.
  vec2 p = vUv * 2.0 - 1.0;
  float sep = mix(0.62, 0.05, uLeafRound);
  float rad = mix(1.22, 1.0, uLeafRound);
  float d = max(length(p - vec2(0.0, -sep)) - rad,
                length(p - vec2(0.0,  sep)) - rad);

  // Cutting the shape here rather than with a texture keeps the repo free of
  // image assets and gives you a shape you can tune with a slider.
  if (d > 0.0) discard;

  vec3 N = normalize(vNormal);
  vec3 L = normalize(uSunDir);

  vec3 albedo = mix(uLeafColorA, uLeafColorB, vTint);

  // midrib: a subtle darker line down the leaf
  albedo *= 1.0 - 0.25 * smoothstep(0.09, 0.0, abs(p.x));
  // darken toward the leaf edge, so overlapping cards stay readable
  albedo *= 0.82 + 0.18 * smoothstep(0.0, -0.45, d);

  float ao = mix(0.45, 1.0, vExposure);
  float diffuse = max(dot(N, L), 0.0);
  vec3 lit = albedo * (uSkyColor * 0.55 + uSunColor * diffuse * 1.05) * ao;

  // leaves are thin: they glow when lit from behind
  float back = max(dot(N, -L), 0.0);
  lit += albedo * uSunColor * pow(back, 2.5) * uTranslucency;

  gl_FragColor = vec4(lit, 1.0);
}
`;
