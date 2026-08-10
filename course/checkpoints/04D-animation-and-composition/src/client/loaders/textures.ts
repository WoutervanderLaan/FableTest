/**
 * Suspense-aware texture loading — same three ideas as loaders/gltf.ts
 * (module-level cache, throw a promise, share the result), plus the one
 * setting that separates a correct render from a subtly wrong one:
 * COLOR SPACE.
 *
 * A texture is either a picture or a lookup table:
 *
 *   - Picture ("what color is this?")  → base color / emissive.
 *     Authored in sRGB. Must be tagged THREE.SRGBColorSpace so three converts
 *     it to linear before lighting math. Forget this and everything looks
 *     washed out and pale.
 *
 *   - Data ("how rough is this? which way does the surface face?")
 *     → roughness, metalness, normal, AO, displacement.
 *     These are NUMBERS that happen to be stored as pixels. They must stay
 *     linear (THREE.NoColorSpace). Tag one as sRGB and you silently corrupt
 *     the values — normals bend wrong, roughness goes blotchy.
 *
 * Rule of thumb: if a human would call it "a picture", it's sRGB. Otherwise
 * it's data.
 */
import * as THREE from "three";

const loader = new THREE.TextureLoader();

type Entry =
  | { status: "pending"; promise: Promise<unknown> }
  | { status: "ok"; texture: THREE.Texture }
  | { status: "error"; error: unknown };

const cache = new Map<string, Entry>();

export interface TextureOptions {
  /** true for color/emissive maps, false for normal/roughness/AO data maps. */
  srgb?: boolean;
  /** Tile the texture this many times across the 0..1 UV square. */
  repeat?: [number, number];
  /** THREE.RepeatWrapping (default) | ClampToEdgeWrapping | MirroredRepeatWrapping */
  wrap?: THREE.Wrapping;
  /** Sharpen textures viewed at a grazing angle. 1 = off; 4-16 is typical. */
  anisotropy?: number;
  /** NearestFilter for a crisp, pixel-art look; LinearFilter (default) to smooth. */
  magFilter?: THREE.MagnificationTextureFilter;
}

function configure(tex: THREE.Texture, o: TextureOptions): THREE.Texture {
  tex.colorSpace = o.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = o.wrap ?? THREE.RepeatWrapping;
  if (o.repeat) tex.repeat.set(o.repeat[0], o.repeat[1]);
  if (o.anisotropy) tex.anisotropy = o.anisotropy;
  if (o.magFilter) tex.magFilter = o.magFilter;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Configured variants, keyed by url + options. One image can be sampled many
 * ways (tiled 8× on the ground, 1× on a crate), and `.clone()` gives us a
 * separate sampler that SHARES the uploaded GPU image.
 *
 * This second cache is not an optimization, it's a correctness fix: a render
 * function runs on every frame-triggering update, so cloning inline would mint
 * a new THREE.Texture each time and leak GPU objects steadily.
 */
const variants = new Map<string, THREE.Texture>();

/**
 * Suspense-throwing texture read.
 *
 * Note this is a "use*" function that calls no React hooks — it only reads
 * caches and may throw. That means the usual rules-of-hooks constraints don't
 * apply: it's safe inside loops and conditionals (see `useTextures`).
 */
export function useTexture(url: string, options: TextureOptions = {}): THREE.Texture {
  const entry = cache.get(url);

  if (!entry) {
    const promise = loader.loadAsync(url).then(
      (texture) => cache.set(url, { status: "ok", texture }),
      (error) => cache.set(url, { status: "error", error }),
    );
    cache.set(url, { status: "pending", promise });
    throw promise;
  }

  if (entry.status === "pending") throw entry.promise;
  if (entry.status === "error") throw entry.error;

  const key = url + "|" + JSON.stringify(options);
  let variant = variants.get(key);
  if (!variant) {
    variant = configure(entry.texture.clone(), options);
    variants.set(key, variant);
  }
  return variant;
}

/** Load several at once. Safe to loop — see the note on `useTexture`. */
export function useTextures<K extends string>(
  spec: Record<K, [string, TextureOptions]>,
): Record<K, THREE.Texture> {
  const out = {} as Record<K, THREE.Texture>;
  for (const key of Object.keys(spec) as K[]) {
    const [url, options] = spec[key];
    out[key] = useTexture(url, options);
  }
  return out;
}
