import { type GLTF, GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { wait } from "../utils/wait";

const loader = new GLTFLoader();

type CacheEntry =
  | { status: "ok"; gltf: GLTF }
  | { status: "error"; error: unknown }
  | { status: "pending"; promise: Promise<unknown> };

const cache = new Map<string, CacheEntry>();

export const useGLTF = (url: string) => {
  const entry = cache.get(url);

  if (!entry) {
    const promise = loader.loadAsync(url).then(
      async (gltf) => {
        await wait(1000);
        cache.set(url, { status: "ok", gltf });
      },
      (error) => cache.set(url, { status: "error", error }),
    );

    cache.set(url, { status: "pending", promise });

    throw promise;
  }

  if (entry.status === "error") {
    throw entry.error;
  } else if (entry.status === "pending") {
    throw entry.promise;
  } else {
    return entry.gltf;
  }
};

export const preloadGLTF = (url: string) => {
  if (!cache.has(url)) {
    const promise = loader.loadAsync(url).then(
      (gltf) => cache.set(url, { status: "ok", gltf }),
      (error) => cache.set(url, { status: "error", error }),
    );

    cache.set(url, { status: "pending", promise });
  }
};
