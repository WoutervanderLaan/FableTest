import { Mesh, Object3D } from "three";

export function enableShadows(
  root: Object3D,
  cast = true,
  receive = true,
): Object3D {
  root.traverse((object) => {
    if (object instanceof Mesh) {
      object.castShadow = cast;
      object.receiveShadow = receive;
    }
  });
  return root;
}
