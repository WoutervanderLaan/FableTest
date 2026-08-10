/**
 * Module 01 — raw Three.js, no React, no R3F.
 *
 * This is the whole engine in one function: a Scene holds objects, a Camera
 * decides the viewpoint, a Renderer draws the Scene from the Camera onto a
 * <canvas>, and an animation loop does that ~60×/second. Everything R3F gives
 * you later is a declarative wrapper around exactly these pieces.
 */
import * as THREE from "three";

export function startScene(container: HTMLElement) {
  // 1. The Scene — a container ("graph") for everything we want to draw.
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#cfc8b8"); // Ruderal's warm paper gray

  // 2. The Camera — where we look FROM and the lens.
  //    (fov degrees, aspect ratio, near clip, far clip)
  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    100,
  );
  camera.position.set(2.5, 2.5, 3.5);
  camera.lookAt(0, 0, 0);

  // 3. The Renderer — owns the WebGL context and the actual <canvas> element.
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  // 4. An object to look at: geometry (shape) + material (surface) = a Mesh.
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: "#e8a33d" }); // amber
  const cube = new THREE.Mesh(geometry, material);
  scene.add(cube);

  // 5. Light. MeshStandardMaterial is physically based — with no light it's black.
  const sun = new THREE.DirectionalLight("#ffffff", 2.5);
  sun.position.set(3, 5, 2);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight("#cdd4cc", "#6b5f4e", 1.0)); // sky/ground fill

  // 6. Keep it crisp when the window resizes.
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // 7. The render loop. `t` is milliseconds since start. setAnimationLoop is the
  //    Three.js-blessed way to drive it (it also plays nice with WebXR).
  renderer.setAnimationLoop((t) => {
    const time = t / 1000;
    cube.rotation.x = time * 0.6;
    cube.rotation.y = time * 0.9;
    renderer.render(scene, camera);
  });
}
