/**
 * Pointer-lock FPS controller, now networked:
 * - prediction: inputs run through the SAME shared stepPlayer the server
 *   uses, are streamed to the server, and re-played on top of each
 *   authoritative snapshot (rewind–replay reconciliation)
 * - edits: optimistic local application with confirm/timeout/reject rollback
 * - Phase 2 verbs: hold-LMB to break (server-accumulated damage), RMB to
 *   place from inventory, Q to throw
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  Block,
  HARDNESS,
  PLACEABLE,
  PLAYER,
  REACH,
  getVoxel,
  packXYZ,
  raycastVoxel,
  stepPlayer,
  unpackX,
  unpackY,
  unpackZ,
  type InputMsg,
  type PlayerPhys,
} from "@ruderal/shared";
import type { Net } from "../net/connection";
import type { WorldManager } from "../world/WorldManager";
import { editorStatus, netStatus, playerStatus } from "./status";

const HIT_INTERVAL_MS = 220;
const EDIT_CONFIRM_TIMEOUT_MS = 1200;
const SEND_INTERVAL_MS = 50;

interface Props {
  world: WorldManager;
  net: Net;
  spawn: { x: number; y: number; z: number };
}

export function PlayerController({ world, net, spawn }: Props) {
  const { camera, gl } = useThree();
  const vz = world.vz;

  const phys = useRef<PlayerPhys>({ ...spawn, vx: 0, vy: 0, vz: 0, grounded: false, swimming: false });
  const yaw = useRef(Math.PI * 0.25);
  const pitch = useRef(-0.05);
  const keys = useRef(new Set<string>());
  const locked = useRef(false);
  const frozen = useRef(false);

  const seq = useRef(0);
  const pending = useRef<InputMsg[]>([]);
  const sendBatch = useRef<InputMsg[]>([]);
  const lastSend = useRef(0);
  const lastReconciledSeq = useRef(-1);

  const lastHitAt = useRef(0);
  const localHits = useRef(new Map<number, number>());
  const serverDamage = useRef(new Map<number, { d: number; need: number }>());
  const pendingEdits = useRef(new Map<number, { prev: number; timer: ReturnType<typeof setTimeout> }>());

  const highlight = useMemo(() => {
    const geo = new THREE.BoxGeometry(1.002, 1.002, 1.002);
    const edges = new THREE.EdgesGeometry(geo);
    const mat = new THREE.LineBasicMaterial({ color: "#e8a33d" });
    const lines = new THREE.LineSegments(edges, mat);
    lines.visible = false;
    return lines;
  }, []);

  // ---- network handlers ----
  useEffect(() => {
    const confirmPending = (pairs: number[]) => {
      for (let i = 0; i + 1 < pairs.length; i += 2) {
        const entry = pendingEdits.current.get(pairs[i]);
        if (entry) {
          clearTimeout(entry.timer);
          pendingEdits.current.delete(pairs[i]);
        }
      }
    };
    const offs = [
      net.on("edits", (pairs) => {
        confirmPending(pairs);
        world.applyEdits(pairs);
      }),
      net.on("collapse", (pairs) => {
        confirmPending(pairs);
        // collapse pairs carry the PREVIOUS block (for debris); world → air
        const airPairs: number[] = [];
        for (let i = 0; i + 1 < pairs.length; i += 2) airPairs.push(pairs[i], Block.Air);
        world.applyEdits(airPairs);
      }),
      net.on("reject", (pairs) => {
        for (let i = 0; i + 1 < pairs.length; i += 2) {
          const p = pairs[i];
          const entry = pendingEdits.current.get(p);
          if (entry) {
            clearTimeout(entry.timer);
            pendingEdits.current.delete(p);
          }
          world.applyEdits([p, pairs[i + 1]]); // authoritative truth
        }
      }),
      net.on("damage", (m) => {
        serverDamage.current.set(m.p, { d: m.d, need: m.need });
      }),
      net.on("leave", () => {
        netStatus.connected = false;
      }),
    ];
    netStatus.connected = true;
    return () => offs.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [net, world]);

  // ---- input listeners ----
  useEffect(() => {
    const canvas = gl.domElement;
    const onClick = () => {
      if (!locked.current) canvas.requestPointerLock();
    };
    const onLockChange = () => {
      locked.current = document.pointerLockElement === canvas;
      playerStatus.locked = locked.current;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!locked.current) return;
      yaw.current -= e.movementX * 0.0022;
      pitch.current = Math.max(-1.45, Math.min(1.45, pitch.current - e.movementY * 0.0022));
    };
    const onKeyDown = (e: KeyboardEvent) => {
      keys.current.add(e.code);
      if (locked.current) {
        if (e.code.startsWith("Digit")) {
          const slot = Number(e.code.slice(5)) - 1;
          const bar = hotbarBlocks();
          if (slot >= 0 && slot < bar.length) editorStatus.selected = bar[slot];
        }
        if (e.code === "KeyQ") throwFromCamera();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keys.current.delete(e.code);
    const onContextMenu = (e: Event) => e.preventDefault();

    canvas.addEventListener("click", onClick);
    canvas.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("pointerlockchange", onLockChange);
    document.addEventListener("mousemove", onMouseMove);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("pointerlockchange", onLockChange);
      document.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl]);

  // dev/debug hook for tooling (screenshot rigs, zone inspector)
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__ruderal = {
      teleport: (x: number, y: number, z: number, yawV = 0, pitchV = 0, freeze = false) => {
        phys.current = { x, y, z, vx: 0, vy: 0, vz: 0, grounded: false, swimming: false };
        yaw.current = yawV;
        pitch.current = pitchV;
        frozen.current = freeze;
      },
      stats: () => ({
        x: phys.current.x,
        y: phys.current.y,
        z: phys.current.z,
        worldEdits: world.appliedEdits,
        players: netStatus.players,
        ping: netStatus.pingMs,
        connected: netStatus.connected,
      }),
      probe: () => {
        const e = eye();
        const d = cameraDir();
        const hit = raycastVoxel(vz, e.x, e.y, e.z, d.x, d.y, d.z, REACH);
        const inv = ownInv();
        const invObj: Record<string, number> = {};
        inv?.forEach((v: number, k: string) => {
          invObj[k] = v;
        });
        return { eye: e, dir: { x: d.x, y: d.y, z: d.z }, pitch: pitch.current, hit, inv: invObj, selected: editorStatus.selected };
      },
    };
    return () => {
      delete (window as unknown as Record<string, unknown>).__ruderal;
    };
  }, []);

  const hotbarBlocks = () => [Block.Brick, Block.BrickDark, Block.Wood, Block.Concrete, Block.Moss];

  const cameraDir = (): THREE.Vector3 => {
    const d = new THREE.Vector3();
    camera.getWorldDirection(d);
    return d;
  };

  const throwFromCamera = () => {
    const d = cameraDir();
    net.throwProjectile(d.x, d.y, d.z);
  };

  const eye = () => ({
    x: phys.current.x,
    y: phys.current.y + PLAYER.eyeHeight,
    z: phys.current.z,
  });

  const ownInv = (): Map<string, number> | null => {
    const state = net.room.state as { players?: { get(id: string): { inv?: Map<string, number> } | undefined } };
    return (state.players?.get(net.id)?.inv as Map<string, number> | undefined) ?? null;
  };

  const optimisticEdit = (p: number, b: number) => {
    const prev = getVoxel(vz, unpackX(p), unpackY(p), unpackZ(p));
    if (pendingEdits.current.has(p)) return; // one in-flight edit per cell
    const timer = setTimeout(() => {
      // never confirmed: revert to what we knew
      if (pendingEdits.current.delete(p)) world.applyEdits([p, prev]);
    }, EDIT_CONFIRM_TIMEOUT_MS);
    pendingEdits.current.set(p, { prev, timer });
    world.applyEdits([p, b]);
  };

  const tryBreak = (now: number) => {
    const e = eye();
    const d = cameraDir();
    const hit = raycastVoxel(vz, e.x, e.y, e.z, d.x, d.y, d.z, REACH);
    if (!hit) {
      editorStatus.breakP = null;
      return;
    }
    const p = packXYZ(hit.x, hit.y, hit.z);
    const need = HARDNESS[hit.block];
    if (!need) {
      editorStatus.breakP = null;
      return;
    }
    if (now - lastHitAt.current < HIT_INTERVAL_MS) return;
    lastHitAt.current = now;

    net.hit(p);
    const local = (localHits.current.get(p) ?? 0) + 1;
    localHits.current.set(p, local);
    const server = serverDamage.current.get(p);
    const predicted = Math.max(local, server?.d ?? 0);
    editorStatus.breakP = p;
    editorStatus.breakProgress = Math.min(1, predicted / need);
    if (predicted >= need) {
      optimisticEdit(p, Block.Air);
      localHits.current.delete(p);
      serverDamage.current.delete(p);
      editorStatus.breakP = null;
    }
  };

  const tryPlace = () => {
    const e = eye();
    const d = cameraDir();
    const hit = raycastVoxel(vz, e.x, e.y, e.z, d.x, d.y, d.z, REACH);
    if (!hit) return;
    const x = hit.x + hit.nx;
    const y = hit.y + hit.ny;
    const z = hit.z + hit.nz;
    const b = editorStatus.selected;
    const current = getVoxel(vz, x, y, z);
    if (!PLACEABLE.has(b)) return;
    if (current !== Block.Air && current !== Block.Water) return;
    // don't build inside yourself
    const pp = phys.current;
    if (
      x + 1 > pp.x - PLAYER.halfWidth &&
      x < pp.x + PLAYER.halfWidth &&
      z + 1 > pp.z - PLAYER.halfWidth &&
      z < pp.z + PLAYER.halfWidth &&
      y + 1 > pp.y &&
      y < pp.y + PLAYER.height
    ) {
      return;
    }
    const inv = ownInv();
    if (inv && (inv.get(String(b)) ?? 0) <= 0) return;
    const p = packXYZ(x, y, z);
    optimisticEdit(p, b);
    net.place(p, b);
  };

  // mouse buttons: track held state for hold-to-break
  const mouseDown = useRef<{ left: boolean; right: boolean }>({ left: false, right: false });
  useEffect(() => {
    const canvas = gl.domElement;
    const down = (e: MouseEvent) => {
      if (!locked.current) return;
      if (e.button === 0) mouseDown.current.left = true;
      if (e.button === 2) {
        mouseDown.current.right = true;
        tryPlace();
      }
    };
    const up = (e: MouseEvent) => {
      if (e.button === 0) {
        mouseDown.current.left = false;
        editorStatus.breakP = null;
      }
      if (e.button === 2) mouseDown.current.right = false;
    };
    canvas.addEventListener("mousedown", down);
    window.addEventListener("mouseup", up);
    return () => {
      canvas.removeEventListener("mousedown", down);
      window.removeEventListener("mouseup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl]);

  // low-frequency HUD sync
  useEffect(() => {
    const t = setInterval(() => {
      netStatus.pingMs = net.latencyMs;
      const state = net.room.state as { players?: { size?: number } };
      netStatus.players = state.players?.size ?? 0;
      const inv = ownInv();
      if (inv) {
        const snapshot: Record<string, number> = {};
        inv.forEach((v: number, k: string) => {
          snapshot[k] = v;
        });
        editorStatus.inv = snapshot;
      }
    }, 200);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [net]);

  useFrame((_, rawDt) => {
    const now = performance.now();
    const p = phys.current;

    if (frozen.current) {
      camera.position.set(p.x, p.y + PLAYER.eyeHeight, p.z);
      camera.rotation.order = "YXZ";
      camera.rotation.set(pitch.current, yaw.current, 0);
      return;
    }

    // ---- build + predict this frame's input ----
    const k = keys.current;
    let fwd = 0;
    let strafe = 0;
    if (k.has("KeyW") || k.has("ArrowUp")) fwd += 1;
    if (k.has("KeyS") || k.has("ArrowDown")) fwd -= 1;
    if (k.has("KeyD") || k.has("ArrowRight")) strafe += 1;
    if (k.has("KeyA") || k.has("ArrowLeft")) strafe -= 1;

    const sy = Math.sin(yaw.current);
    const cy = Math.cos(yaw.current);
    const input: InputMsg = {
      seq: ++seq.current,
      dt: Math.min(rawDt, 0.05),
      dx: -sy * fwd + cy * strafe,
      dz: -cy * fwd - sy * strafe,
      run: k.has("ShiftLeft") || k.has("ShiftRight"),
      jump: k.has("Space"),
      yaw: yaw.current,
    };
    stepPlayer(vz, p, input);
    pending.current.push(input);
    sendBatch.current.push(input);
    if (now - lastSend.current >= SEND_INTERVAL_MS) {
      net.sendInputs(sendBatch.current);
      sendBatch.current = [];
      lastSend.current = now;
    }

    // ---- reconcile against latest server snapshot ----
    const state = net.room.state as {
      players?: {
        get(id: string):
          | {
              x: number;
              y: number;
              z: number;
              vx: number;
              vy: number;
              vz: number;
              lastSeq: number;
              grounded: boolean;
              swimming: boolean;
            }
          | undefined;
      };
    };
    const s = state.players?.get(net.id);
    if (s && s.lastSeq !== lastReconciledSeq.current) {
      lastReconciledSeq.current = s.lastSeq;
      while (pending.current.length > 0 && pending.current[0].seq <= s.lastSeq) pending.current.shift();
      const tmp: PlayerPhys = {
        x: s.x,
        y: s.y,
        z: s.z,
        vx: s.vx,
        vy: s.vy,
        vz: s.vz,
        grounded: s.grounded,
        swimming: s.swimming,
      };
      for (const i of pending.current) stepPlayer(vz, tmp, i);
      const err = Math.hypot(tmp.x - p.x, tmp.y - p.y, tmp.z - p.z);
      if (err > 0.01) Object.assign(p, tmp);
    }

    // ---- editing ----
    if (locked.current && mouseDown.current.left) tryBreak(now);

    // highlight targeted voxel
    {
      const e = eye();
      const d = cameraDir();
      const hit = raycastVoxel(vz, e.x, e.y, e.z, d.x, d.y, d.z, REACH);
      if (hit) {
        highlight.visible = true;
        highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
      } else {
        highlight.visible = false;
      }
    }

    camera.position.set(p.x, p.y + PLAYER.eyeHeight, p.z);
    camera.rotation.order = "YXZ";
    camera.rotation.set(pitch.current, yaw.current, 0);

    playerStatus.x = p.x;
    playerStatus.y = p.y;
    playerStatus.z = p.z;
    playerStatus.yaw = yaw.current;
    playerStatus.swimming = p.swimming;
  });

  return <primitive object={highlight} />;
}
