import { useMemo } from "react";
import { makePatchwork } from "../meshbuilder";

export const Ground = () => {
  const geometry = useMemo(() => makePatchwork(1000).center(), []);

  return (
    <mesh receiveShadow geometry={geometry}>
      <meshStandardMaterial vertexColors />
    </mesh>
  );
};
