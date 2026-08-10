/**
 * Module 11B — the grass shaders.
 *
 * Everything interesting happens in the VERTEX shader. Each blade is three
 * vertices; the shader decides where in the world that blade lives, how tall
 * it is, which way it faces, and how the wind bends it — all from a hash of
 * its own world position.
 *
 * The infinite trick in one line: the blade's world position is
 *
 *     world = aCell + uCenter
 *
 * where `uCenter` is the camera's position SNAPPED to the grid spacing. Because
 * uCenter only ever moves in whole cells, `world` always lands on the same
 * fixed world lattice — so hashing it gives a blade that keeps its identity
 * (height, colour, lean) no matter how the field slides underneath the camera.
 * Hash the instance index instead and every blade re-rolls its dice as the
 * field shifts: the whole meadow visibly boils. That distinction is the entire
 * technique.
 */

export const GRASS_VERT = /* glsl */ `
precision highp float;

// per-instance: this blade's cell offset within the local grid, in metres
attribute vec2 aCell;

uniform vec2  uCenter;        // camera position, snapped to cell size
uniform float uTime;
uniform float uBladeWidth;
uniform float uBladeHeight;
uniform float uHeightVary;    // 0..1 random height spread
uniform float uJitter;        // 0..1 how far a blade strays from its cell centre
uniform float uRadius;        // blades fade out beyond this distance
uniform vec2  uWindDir;
uniform float uWindStrength;
uniform float uWindSpeed;
uniform float uWindScale;     // spatial frequency of the gust wave
uniform float uCameraFacing;  // 0 = keep own angle, 1 = fully face the camera
uniform vec3  uCameraPos;

varying float vHeight;        // 0 at the root, 1 at the tip
varying float vFade;          // 1 near the camera, 0 at the cull radius
varying vec3  vNormal;
varying float vTint;          // per-blade colour variation

// The hash from module 09C, in two dimensions.
float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

void main() {
  // ---- 1. where does this blade live? -------------------------------------
  // Snapped centre + local cell offset = a position on a FIXED world lattice.
  vec2 cellWorld = aCell + uCenter;

  // Randomness keyed on that lattice position, so it never changes as the
  // field slides. Different salts give independent-looking values.
  float r1 = hash21(cellWorld);
  float r2 = hash21(cellWorld + 41.7);
  float r3 = hash21(cellWorld + 91.3);
  float r4 = hash21(cellWorld + 17.1);

  // Push the blade off its cell centre, or the grid reads as a grid.
  vec2 world = cellWorld + (vec2(r1, r2) - 0.5) * uJitter;

  // ---- 2. cull / fade by distance ------------------------------------------
  float dist = length(world - uCameraPos.xz);
  // A square patch looks like a square. Fading to zero height on a circle
  // turns it into a disc, and the last 25% fades out inside the fog.
  vFade = 1.0 - smoothstep(uRadius * 0.75, uRadius, dist);

  // ---- 3. build the blade --------------------------------------------------
  float height = uBladeHeight * (1.0 - uHeightVary * r3) * vFade;
  float t = position.y;              // 0 at the base, 1 at the tip
  vHeight = t;
  vTint = r4;

  // Face the camera a little: a blade seen exactly edge-on is invisible, so
  // blending its own angle toward the view direction keeps coverage even.
  float ownAngle = r1 * 6.2831853;
  vec2 toCam = uCameraPos.xz - world;
  float camAngle = atan(toCam.x, toCam.y);
  // mix angles via their vectors, so 359° and 1° don't average to 180°
  vec2 dirOwn = vec2(sin(ownAngle), cos(ownAngle));
  vec2 dirCam = vec2(sin(camAngle), cos(camAngle));
  vec2 dir = normalize(mix(dirOwn, dirCam, uCameraFacing) + 1e-6);

  // the blade's width axis is perpendicular to its facing direction
  vec3 side = vec3(dir.y, 0.0, -dir.x);
  vec3 local = side * (position.x * uBladeWidth) + vec3(0.0, t * height, 0.0);

  // ---- 4. wind --------------------------------------------------------------
  // One travelling wave across the whole field (so gusts sweep, rather than
  // every blade wobbling independently) plus a per-blade phase offset.
  vec2 wd = normalize(uWindDir + 1e-6);
  float phase = dot(world, wd) * uWindScale - uTime * uWindSpeed + r2 * 6.2831853;
  float gust = sin(phase) * 0.6 + sin(phase * 2.3 + 1.7) * 0.4;

  // Bend grows with the SQUARE of height: the root stays planted and the tip
  // travels, which is how a real blade hinges.
  float bend = t * t;
  local.xz += wd * gust * uWindStrength * bend * height;

  vec3 worldPos = vec3(world.x, 0.0, world.y) + local;

  // ---- 5. normals ----------------------------------------------------------
  // A blade's true normal is its flat face, which makes a field of grass shade
  // like a heap of shards. Tilting the normal toward straight up makes the
  // meadow read as one soft surface lit like the ground it grows from — the
  // same trick as Ruderal's Vegetation.tsx.
  vec3 faceNormal = vec3(dir.x, 0.0, dir.y);
  vNormal = normalize(mix(vec3(0.0, 1.0, 0.0), faceNormal, 0.25));

  gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
}
`;

export const GRASS_FRAG = /* glsl */ `
precision highp float;

uniform vec3  uBaseColor;
uniform vec3  uTipColor;
uniform vec3  uSunDir;
uniform vec3  uSunColor;
uniform vec3  uSkyColor;
uniform vec3  uFogColor;
uniform float uTranslucency;

varying float vHeight;
varying float vFade;
varying vec3  vNormal;
varying float vTint;

void main() {
  if (vFade <= 0.001) discard;      // fully faded blades cost nothing further

  vec3 N = normalize(vNormal);
  vec3 L = normalize(uSunDir);

  // Root-to-tip gradient, plus a per-blade tint so the field isn't uniform.
  vec3 albedo = mix(uBaseColor, uTipColor, vHeight);
  albedo *= 0.85 + 0.3 * vTint;

  // Fake ambient occlusion: light doesn't reach down between the blades.
  float ao = mix(0.55, 1.0, vHeight);

  float diffuse = max(dot(N, L), 0.0);
  vec3 lit = albedo * (uSkyColor * 0.35 + uSunColor * diffuse * 0.85) * ao;

  // Translucency: grass is thin, so it GLOWS when the sun is behind it. This
  // one term does more for "looks like a real meadow" than anything else here.
  float back = max(dot(N, -L), 0.0);
  lit += albedo * uSunColor * pow(back, 3.0) * uTranslucency * vHeight;

  // Fade the far blades into the fog so the cull radius is invisible.
  gl_FragColor = vec4(mix(uFogColor, lit, vFade), 1.0);
}
`;
