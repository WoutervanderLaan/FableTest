import { join } from "node:path";
import { surfaceY, getVoxel } from "@ruderal/shared";
import { ServerWorld } from "../src/world";
import { ZonePhysics } from "../src/physics";

const t0 = performance.now();
const world = new ServerWorld("/home/user/FableTest/packages/client/public/zones/ams-westerkerk.zpk.gz");
console.log("world load+voxelize:", (performance.now() - t0).toFixed(0), "ms");

const t1 = performance.now();
const phys = await ZonePhysics.create(world.vz);
console.log("physics create (shell voxels collider):", (performance.now() - t1).toFixed(0), "ms");

// drop a ball over the street near spawn; expect rest y ≈ surfaceTop + radius
const x = 249.5, z = 260.5;
const sy = surfaceY(world.vz, 249, 260); // top solid block index; its top face is at sy+1
console.log("street surface block y:", sy, "block:", getVoxel(world.vz, 249, sy, 260));
phys.spawnProjectile("test", x, sy + 6, z, 0, 0, 0, 10);
let impactAt: number | null = null;
for (let i = 0; i < 120; i++) {
  const impacts = phys.step(1 / 20);
  if (impacts.length && impactAt === null) impactAt = i;
}
const t = phys.projectiles.get("test")!.body.translation();
console.log(`rest pos y=${t.y.toFixed(2)} (expected ≈ ${(sy + 1 + 0.22).toFixed(2)}), impact at step ${impactAt}`);
const err = Math.abs(t.y - (sy + 1 + 0.22));
console.log(err < 0.15 ? "OFFSET OK" : `OFFSET WRONG by ${err.toFixed(2)}`);
