import { useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer, Noise, Vignette } from "@react-three/postprocessing";
import type { ZoneSpec } from "@ruderal/shared";
import { loadZone, type LoadedZone } from "./loader";
import { PlayerController } from "./player/PlayerController";
import { SkyAndLight } from "./scene/SkyAndLight";
import { Vegetation } from "./scene/Vegetation";
import { World } from "./scene/World";
import { Hud } from "./ui/Hud";

export default function App() {
  const [zone, setZone] = useState<LoadedZone | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const lastBucket = useRef(-1);

  useEffect(() => {
    loadZone("/zones/ams-westerkerk.zpk.gz").then(setZone, (e) => setError(String(e)));
  }, []);

  if (error) {
    return (
      <div style={{ padding: 32, color: "#3a352c" }}>
        <h2>zone failed to load</h2>
        <pre>{error}</pre>
        <p>run `pnpm bake` to (re)generate packages/client/public/zones/.</p>
      </div>
    );
  }
  if (!zone) {
    return (
      <div style={{ padding: 32, color: "#3a352c", letterSpacing: "0.06em" }}>retrieving zone…</div>
    );
  }

  const spec: ZoneSpec = {
    id: zone.pack.header.id,
    name: zone.pack.header.name,
    centerLon: zone.pack.header.centerLon,
    centerLat: zone.pack.header.centerLat,
    sizeMeters: zone.pack.header.sizeX,
  };

  const onProgress = (done: number, total: number) => {
    // throttle state churn: only update at 2% steps
    const bucket = Math.floor((done / total) * 50);
    if (bucket !== lastBucket.current) {
      lastBucket.current = bucket;
      setProgress(done / total);
    }
  };

  return (
    <>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ fov: 74, near: 0.1, far: 1500 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
      >
        <SkyAndLight zoneSize={zone.vz.sizeX} />
        <World vz={zone.vz} spawn={zone.spawn} onProgress={onProgress} />
        <Vegetation vz={zone.vz} />
        <PlayerController vz={zone.vz} spawn={zone.spawn} />
        <EffectComposer>
          <Bloom mipmapBlur luminanceThreshold={0.85} intensity={0.4} />
          <Vignette eskil={false} offset={0.25} darkness={0.55} />
          <Noise opacity={0.035} />
        </EffectComposer>
      </Canvas>
      <Hud spec={spec} loading={progress < 0.999} progress={progress} />
    </>
  );
}
