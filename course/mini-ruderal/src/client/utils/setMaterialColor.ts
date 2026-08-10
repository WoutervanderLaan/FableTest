import { Mesh, MeshStandardMaterial, Object3D } from "three";

export const setMaterialColor = (root: Object3D, color: string) => {
  root.traverse((object) => {
    if (
      object instanceof Mesh &&
      object.material instanceof MeshStandardMaterial
    ) {
      const material = object.material.clone();
      material.color.set(color);

      object.material = material;
    }
  });
  return root;
};
