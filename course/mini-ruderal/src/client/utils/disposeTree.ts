import { Mesh, Object3D } from "three";
import { disposeMaterial } from "./disposeMaterial";

export const disposeTree = (root: Object3D) => {
  disposeMaterial(root).traverse((object) => {
    if (object instanceof Mesh) {
      object.geometry.dispose();
    }
  });
  return root;
};
