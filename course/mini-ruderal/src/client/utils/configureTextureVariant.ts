import { NoColorSpace, RepeatWrapping, SRGBColorSpace, Texture } from "three";
import { TextureOptions } from "../loaders/textures";

export const configureTextureVariant = (
  texture: Texture,
  options: TextureOptions,
) => {
  texture.colorSpace = options.srgb ? SRGBColorSpace : NoColorSpace;
  texture.wrapS = texture.wrapT = options.wrap ?? RepeatWrapping;
  if (options.repeat) texture.repeat.set(...options.repeat);
  if (options.anisotropy) texture.anisotropy = options.anisotropy;
  if (options.magFilter) texture.magFilter = options.magFilter;
  texture.needsUpdate = true;

  return texture;
};
