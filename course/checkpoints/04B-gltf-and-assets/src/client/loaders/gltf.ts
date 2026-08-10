/**
 * A tiny suspense-aware glTF loader — the whole of what drei's `useGLTF` does
 * for you, in about 40 lines.
 *
 * Three ideas, and none of them are glTF-specific:
 *   1. A module-level CACHE keyed by url, so ten <Crate/>s parse one file once.
 *   2. React Suspense's contract: a hook that isn't ready THROWS a promise.
 *      React catches it, shows the nearest <Suspense fallback>, and re-renders
 *      when the promise settles. Throwing an Error instead surfaces in an
 *      error boundary. That's the entire protocol.
 *   3. GLTFLoader.loadAsync() — the promise-returning form of loader.load().
 */
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

const loader = new GLTFLoader();

type Entry =
  | { status: "pending"; promise: Promise<unknown> }
  | { status: "ok"; gltf: GLTF }
  | { status: "error"; error: unknown };

const cache = new Map<string, Entry>();

/** Suspense-throwing read. Must be called inside a <Suspense> boundary. */
export function useGLTF(url: string): GLTF {
  const entry = cache.get(url);

  if (!entry) {
    const promise = loader.loadAsync(url).then(
      (gltf) => cache.set(url, { status: "ok", gltf }),
      (error) => cache.set(url, { status: "error", error }),
    );
    cache.set(url, { status: "pending", promise });
    throw promise; // ← suspend
  }

  if (entry.status === "pending") throw entry.promise;
  if (entry.status === "error") throw entry.error;
  return entry.gltf;
}

/** Warm the cache before anything renders (e.g. on a loading screen). */
export function preloadGLTF(url: string): void {
  if (!cache.has(url)) {
    const promise = loader.loadAsync(url).then(
      (gltf) => cache.set(url, { status: "ok", gltf }),
      (error) => cache.set(url, { status: "error", error }),
    );
    cache.set(url, { status: "pending", promise });
  }
}

/**
 * A loaded glTF arrives shadow-blind: `castShadow`/`receiveShadow` default to
 * false on every mesh, so a model dropped into module 04's lighting rig looks
 * flat and floats. Walk the tree once and opt in.
 */
export function enableShadows(root: THREE.Object3D, cast = true, receive = true): THREE.Object3D {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = cast;
      o.receiveShadow = receive;
    }
  });
  return root;
}

/**
 * Dispose only the MATERIALS under `root`.
 *
 * Read this next to `disposeTree` below and note what is missing: geometry.
 * `clone(true)` copies the node tree but shares geometries and materials with
 * the cached original, so a clone must only dispose what it actually owns. If
 * you cloned materials per-instance (module 04C's tinting), this is the
 * correct cleanup; disposing the shared geometry here would blank out every
 * other instance of the model on screen.
 */
export function disposeMaterials(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
    }
  });
}

/**
 * Dispose geometries AND materials. Only correct for a tree you built or
 * deep-copied yourself — never for a `clone(true)` of a cached gltf.scene,
 * and never for the cached original (other components still need it).
 */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
    }
  });
}
