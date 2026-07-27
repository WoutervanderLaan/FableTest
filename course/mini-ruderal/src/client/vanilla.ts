import * as THREE from "three";

export const startScene = (container: HTMLElement | null) => {
  if (!container) {
    throw new Error("Missing root.");
  }
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#cfc8b8");

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: "#e8a33d" }),
  );

  const box = new THREE.Mesh(
    new THREE.BoxGeometry(2, 1, 1),
    new THREE.MeshStandardMaterial({ color: "#af0d0d" }),
  );
  box.position.x = -2;

  scene.add(cube);
  scene.add(box);

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    100,
  );
  camera.position.set(2.5, 2.5, 3.5);
  camera.lookAt(-1, 0, 0);

  const sun = new THREE.DirectionalLight("#ffffff", 2.5);
  sun.position.set(3, 5, 2);

  scene.add(sun);
  scene.add(new THREE.HemisphereLight("#cdd4cc", "#6b5f4e", 1.0));

  const animate = (t: number) => {
    const time = t / 1000;

    cube.rotation.x = time * 0.5;
    cube.rotation.y = time * 0.6;

    box.rotation.x = time;

    renderer.render(scene, camera);
  };

  container.appendChild(renderer.domElement);
  renderer.setAnimationLoop(animate);

  window.addEventListener("resize", () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  return () => {
    renderer.setAnimationLoop(null);
    renderer.dispose();
    renderer.domElement.remove();
    window.removeEventListener("resize", () => {
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    });
  };
};
