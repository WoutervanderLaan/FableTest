/**
 * Module 04D — playing animation clips that shipped inside a glTF.
 *
 * A glTF animation is three things:
 *   - a set of KEYFRAMES (time → value) per animated property,
 *   - a CHANNEL binding those keyframes to one node's position/rotation/scale,
 *   - a CLIP grouping channels into one named animation ("Spin", "Walk").
 *
 * three's AnimationMixer is the playback engine: it owns the clock, blends
 * overlapping actions, and writes results onto the object graph. You feed it
 * `delta` once per frame and it does the rest.
 *
 * The critical detail is BINDING: a mixer drives the exact object tree you
 * hand it. Because we clone per instance (module 04B), each instance needs its
 * OWN mixer bound to its OWN clone — one shared mixer would animate one crate
 * and leave the rest frozen.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { enableShadows, useGLTF } from "../loaders/gltf";

export function AnimatedCrate({
  url = "/crate.gltf",
  position = [0, 0, 0] as [number, number, number],
  scale = 1,
  /** playback rate: 1 = as authored, 0.5 = half speed, -1 = backwards */
  timeScale = 1,
  clipName,
}: {
  url?: string;
  position?: [number, number, number];
  scale?: number;
  timeScale?: number;
  clipName?: string;
}) {
  const gltf = useGLTF(url);

  // one clone + one mixer per instance, rebuilt only if the file changes
  const { scene, mixer } = useMemo(() => {
    const scene = enableShadows(gltf.scene.clone(true));
    return { scene, mixer: new THREE.AnimationMixer(scene) };
  }, [gltf]);

  useEffect(() => {
    const clip = clipName
      ? THREE.AnimationClip.findByName(gltf.animations, clipName)
      : gltf.animations[0];
    if (!clip) return;

    const action = mixer.clipAction(clip);
    action.timeScale = timeScale;
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.play();

    return () => {
      action.stop();
      // release the mixer's cached bindings to this clip
      mixer.uncacheClip(clip);
    };
  }, [gltf, mixer, clipName, timeScale]);

  // stopAllAction on unmount so a removed crate can't keep driving objects.
  // (Braces matter: stopAllAction() RETURNS the mixer, and an effect cleanup
  // must return void or a destructor — a bare arrow would return the mixer.)
  useEffect(() => {
    return () => {
      mixer.stopAllAction();
    };
  }, [mixer]);

  useFrame((_state, delta) => mixer.update(delta));

  return <primitive object={scene} position={position} scale={scale} />;
}
