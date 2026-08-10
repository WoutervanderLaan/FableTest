import { Mesh, MeshStandardMaterial, Object3D } from "three";

export const disposeMaterial = (root: Object3D) => {
  root.traverse((object) => {
    if (object instanceof Mesh) {
      const material: Array<MeshStandardMaterial> = Array.isArray(
        object.material,
      )
        ? object.material
        : [object.material];

      material.forEach((m) => m.dispose());
    }
  });

  return root;
};
