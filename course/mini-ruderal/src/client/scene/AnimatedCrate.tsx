import { useEffect, useMemo } from "react";
import { useGLTF } from "../loaders/gltf";
import { AnimationClip, AnimationMixer, LoopRepeat } from "three";
import { enableShadows } from "../utils/enableShadows";
import { useFrame } from "@react-three/fiber";

type AnimatedCrateProps = {
  position?: [number, number, number];
  scale?: number;
  clipName?: string;
};
export const AnimatedCrate = ({
  position = [0, 0, 0],
  scale = 1,
  clipName,
}: AnimatedCrateProps) => {
  const gltf = useGLTF("/crate.gltf");

  const { scene, mixer } = useMemo(() => {
    const scene = enableShadows(gltf.scene.clone());
    return { scene, mixer: new AnimationMixer(scene) };
  }, [gltf]);

  useEffect(() => {
    const clip = clipName
      ? AnimationClip.findByName(gltf.animations, clipName)
      : gltf.animations[0];

    if (clip) {
      const action = mixer.clipAction(clip);
      action.setLoop(LoopRepeat, Infinity);
      action.play();

      return () => {
        action.stop();
        mixer.uncacheClip(clip);
        mixer.stopAllAction();
      };
    }
  }, [gltf, mixer, clipName]);

  useFrame((_state, delta) => mixer.update(delta));

  return <primitive object={scene} position={position} scale={scale} />;
};
