/**
 * Module 02B — click an object, and the panel switches to its controls.
 *
 * R3F gives every mesh pointer events for free (it raycasts under the hood),
 * so "selection" is one onClick. `e.stopPropagation()` matters: without it a
 * click passes through to every object behind the one you hit, and the last
 * one wins instead of the nearest.
 */
import type { ThreeEvent } from "@react-three/fiber";
import type { ReactNode } from "react";
import { selectGroup } from "./useControls";

export function Selectable({ group, children }: { group: string; children: ReactNode }) {
  return (
    <group
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation(); // only the nearest hit selects
        selectGroup(group);
      }}
      onPointerOver={() => (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "default")}
    >
      {children}
    </group>
  );
}
