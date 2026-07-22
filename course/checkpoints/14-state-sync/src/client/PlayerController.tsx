/**
 * Module 08 — the controller gains editing. Each frame it casts a ray from the
 * camera to find the block you're looking at, and shows an amber wireframe on
 * it. Left-click removes that block; right-click places one against the face
 * you hit. Editing mutates the shared world and calls `onEdit()` so the mesh
 * rebuilds.
 *
 * This is the whole Minecraft loop in ~120 lines, and every piece of it —
 * raycast, break, place-against-normal — is shared code the server will reuse.
 */
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Block } from "../shared/blocks";
import { PLAYER } from "../shared/collide";
import { stepPlayer, type PlayerPhys } from "../shared/movement";
import { raycastVoxel, type VoxelHit } from "../shared/raycast";
import { setVoxel, type VoxelWorld } from "../shared/voxel";

const REACH = 6; // how far you can edit, in blocks
const PLACE_BLOCK = Block.Amber;

export function PlayerController({
  world,
  spawn,
  onEdit,
  sendMove,
}: {
  world: VoxelWorld;
  spawn: { x: number; y: number; z: number };
  onEdit: () => void;
  sendMove?: (x: number, y: number, z: number, yaw: number) => void;
}) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);

  const phys = useRef<PlayerPhys>({
    x: spawn.x, y: spawn.y, z: spawn.z,
    vx: 0, vy: 0, vz: 0,
    grounded: false, swimming: false,
  });
  const yaw = useRef(0);
  const pitch = useRef(0);
  const keys = useRef<Set<string>>(new Set());
  const locked = useRef(false);
  const hit = useRef<VoxelHit | null>(null);
  const highlight = useRef<THREE.LineSegments>(null);
  const moveAccum = useRef(0); // throttle how often we tell the server our position

  // A unit-cube wireframe we move onto the targeted block each frame.
  const highlightGeo = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(1.001, 1.001, 1.001)),
    [],
  );
  const fwd = useMemo(() => new THREE.Vector3(), []);

  // Don't let the player place a block inside their own body.
  const overlapsPlayer = (cx: number, cy: number, cz: number): boolean => {
    const p = phys.current;
    return (
      cx >= Math.floor(p.x - PLAYER.halfWidth) && cx <= Math.floor(p.x + PLAYER.halfWidth) &&
      cy >= Math.floor(p.y) && cy <= Math.floor(p.y + PLAYER.height) &&
      cz >= Math.floor(p.z - PLAYER.halfWidth) && cz <= Math.floor(p.z + PLAYER.halfWidth)
    );
  };

  useEffect(() => {
    const canvas = gl.domElement;
    camera.rotation.order = "YXZ";

    const onClick = () => {
      if (!locked.current) void canvas.requestPointerLock();
    };
    const onLockChange = () => {
      locked.current = document.pointerLockElement === canvas;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!locked.current) return;
      const sens = 0.0022;
      yaw.current -= e.movementX * sens;
      pitch.current -= e.movementY * sens;
      const lim = Math.PI / 2 - 0.01;
      pitch.current = Math.max(-lim, Math.min(lim, pitch.current));
    };
    const onMouseDown = (e: MouseEvent) => {
      if (!locked.current) return;
      const h = hit.current;
      if (!h) return;
      if (e.button === 0) {
        // break the block we're looking at
        setVoxel(world, h.x, h.y, h.z, Block.Air);
        onEdit();
      } else if (e.button === 2) {
        // place against the face we hit (block cell + face normal)
        const px = h.x + h.nx;
        const py = h.y + h.ny;
        const pz = h.z + h.nz;
        if (!overlapsPlayer(px, py, pz)) {
          setVoxel(world, px, py, pz, PLACE_BLOCK);
          onEdit();
        }
      }
    };
    const onContext = (e: Event) => e.preventDefault(); // let right-click place
    const onKeyDown = (e: KeyboardEvent) => keys.current.add(e.code);
    const onKeyUp = (e: KeyboardEvent) => keys.current.delete(e.code);

    canvas.addEventListener("click", onClick);
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("contextmenu", onContext);
    document.addEventListener("pointerlockchange", onLockChange);
    document.addEventListener("mousemove", onMouseMove);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("contextmenu", onContext);
      document.removeEventListener("pointerlockchange", onLockChange);
      document.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [camera, gl, world, onEdit]);

  useFrame((_state, delta) => {
    const k = keys.current;
    const sinY = Math.sin(yaw.current);
    const cosY = Math.cos(yaw.current);
    let dx = 0;
    let dz = 0;
    if (k.has("KeyW")) { dx -= sinY; dz -= cosY; }
    if (k.has("KeyS")) { dx += sinY; dz += cosY; }
    if (k.has("KeyD")) { dx += cosY; dz -= sinY; }
    if (k.has("KeyA")) { dx -= cosY; dz += sinY; }

    stepPlayer(world, phys.current, {
      dx, dz, dt: delta,
      jump: k.has("Space"),
      run: k.has("ShiftLeft") || k.has("ShiftRight"),
    });

    const p = phys.current;
    camera.position.set(p.x, p.y + PLAYER.eyeHeight, p.z);
    camera.rotation.y = yaw.current;
    camera.rotation.x = pitch.current;

    // Tell the server where we are, ~20×/second (not every frame).
    moveAccum.current += delta;
    if (sendMove && moveAccum.current >= 0.05) {
      moveAccum.current = 0;
      sendMove(p.x, p.y, p.z, yaw.current);
    }

    // Targeting: cast from the eye along the view direction.
    camera.getWorldDirection(fwd);
    const h = raycastVoxel(
      world,
      camera.position.x, camera.position.y, camera.position.z,
      fwd.x, fwd.y, fwd.z,
      REACH,
    );
    hit.current = h;
    if (highlight.current) {
      highlight.current.visible = !!h;
      if (h) highlight.current.position.set(h.x + 0.5, h.y + 0.5, h.z + 0.5);
    }
  });

  return (
    <lineSegments ref={highlight} geometry={highlightGeo} frustumCulled={false}>
      <lineBasicMaterial color="#e8a33d" />
    </lineSegments>
  );
}
