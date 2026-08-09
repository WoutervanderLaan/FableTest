import {
  MagnificationTextureFilter,
  Texture,
  TextureLoader,
  Wrapping,
} from "three";
import { configureTextureVariant } from "../utils/configureTextureVariant";

const loader = new TextureLoader();

type CacheEntry =
  | { status: "ok"; texture: Texture }
  | { status: "error"; error: unknown }
  | { status: "pending"; promise: Promise<unknown> };

const textureCache = new Map<string, CacheEntry>();
const variantsCache = new Map<string, Texture>();

export type TextureOptions = {
  /** true for color/emissive maps, false for normal/roughness/AO data maps. */
  srgb?: boolean;
  /** Tile the texture this many times across the 0..1 UV square. */
  repeat?: [number, number];
  /** THREE.RepeatWrapping (default) | ClampToEdgeWrapping | MirroredRepeatWrapping */
  wrap?: Wrapping;
  /** Sharpen textures viewed at a grazing angle. 1 = off; 4-16 is typical. */
  anisotropy?: number;
  /** NearestFilter for a crisp, pixel-art look; LinearFilter (default) to smooth. */
  magFilter?: MagnificationTextureFilter;
};

export const useTexture = (url: string, options: TextureOptions): Texture => {
  const entry = textureCache.get(url);

  if (!entry) {
    const promise = loader.loadAsync(url).then(
      (texture) => textureCache.set(url, { status: "ok", texture }),
      (error) => textureCache.set(url, { status: "error", error }),
    );

    textureCache.set(url, { status: "pending", promise });
    throw promise;
  }

  if (entry.status === "pending") throw entry.promise;
  if (entry.status === "error") throw entry.error;

  const key = `${url}|${JSON.stringify(options)}`;

  const variant = variantsCache.get(key);

  if (variant) return variant;

  const newVariant = configureTextureVariant(entry.texture.clone(), options);
  variantsCache.set(key, newVariant);

  return newVariant;
};

export const useTextures = <const Key extends string>(
  textureRecord: Record<Key, [string, TextureOptions]>,
): Record<Key, Texture> => {
  const textures = {} as Record<Key, Texture>;

  Object.keys(textureRecord).forEach((key) => {
    const [url, options] = textureRecord[key as Key];

    textures[key as Key] = useTexture(url, options);
  });

  return textures;
};
