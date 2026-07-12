import { useCallback, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer, Noise, Vignette } from "@react-three/postprocessing";
import { setVoxelAt, unpackX, unpackY, unpackZ, type ZoneSpec } from "@ruderal/shared";
import { loadZone } from "./loader";
import { Net } from "./net/connection";
import { PlayerController } from "./player/PlayerController";
import { Debris } from "./scene/Debris";
import { Entities } from "./scene/Entities";
import { RemotePlayers } from "./scene/RemotePlayers";
import { SkyAndLight } from "./scene/SkyAndLight";
import { Vegetation } from "./scene/Vegetation";
import { WorldView } from "./scene/World";
import { Hud } from "./ui/Hud";
import { WorldManager } from "./world/WorldManager";

const PAPER = "#f4efe3";
const INK = "#3a352c";
const BORDER = "#b8b2a7";
const AMBER = "#e8a33d";

type Stage =
  | { k: "menu"; error?: string }
  | { k: "connecting" }
  | { k: "playing" };

interface Session {
  net: Net;
  world: WorldManager;
  spec: ZoneSpec;
  spawn: { x: number; y: number; z: number };
}

const defaultServerUrl = () =>
  import.meta.env.VITE_SERVER_URL ?? `ws://${location.hostname}:2567`;

export default function App() {
  const [stage, setStage] = useState<Stage>({ k: "menu" });
  const [progress, setProgress] = useState(0);
  const session = useRef<Session | null>(null);
  const lastBucket = useRef(-1);

  const play = useCallback(async (name: string, url: string) => {
    setStage({ k: "connecting" });
    try {
      const net = await Net.join(url, name);
      const { pack, vz } = await loadZone("/zones/ams-westerkerk.zpk.gz");
      // fold the persisted world (server's delta overlay) into the baseline
      // BEFORE meshing starts — late joiners reconstruct exactly
      const e = net.init.edits;
      for (let i = 0; i + 1 < e.length; i += 2) {
        setVoxelAt(vz, unpackX(e[i]), unpackY(e[i]), unpackZ(e[i]), e[i + 1]);
      }
      const world = new WorldManager(vz);
      world.onProgress = (done, total) => {
        const bucket = Math.floor((done / total) * 50);
        if (bucket !== lastBucket.current) {
          lastBucket.current = bucket;
          setProgress(done / total);
        }
      };
      world.start(net.init.spawn);
      session.current = {
        net,
        world,
        spawn: net.init.spawn,
        spec: {
          id: pack.header.id,
          name: pack.header.name,
          centerLon: pack.header.centerLon,
          centerLat: pack.header.centerLat,
          sizeMeters: pack.header.sizeX,
        },
      };
      setStage({ k: "playing" });
    } catch (err) {
      session.current = null;
      setStage({ k: "menu", error: String(err) });
    }
  }, []);

  if (stage.k === "menu" || stage.k === "connecting") {
    return <Menu busy={stage.k === "connecting"} error={stage.k === "menu" ? stage.error : undefined} onPlay={play} />;
  }

  const s = session.current!;
  return (
    <>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ fov: 74, near: 0.1, far: 1500 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
      >
        <SkyAndLight zoneSize={s.world.vz.sizeX} />
        <WorldView world={s.world} />
        <Vegetation vz={s.world.vz} />
        <PlayerController world={s.world} net={s.net} spawn={s.spawn} />
        <RemotePlayers net={s.net} />
        <Entities net={s.net} />
        <Debris net={s.net} world={s.world} />
        <EffectComposer>
          <Bloom mipmapBlur luminanceThreshold={0.85} intensity={0.4} />
          <Vignette eskil={false} offset={0.25} darkness={0.55} />
          <Noise opacity={0.035} />
        </EffectComposer>
      </Canvas>
      <Hud spec={s.spec} loading={progress < 0.999} progress={progress} />
    </>
  );
}

function Menu({ busy, error, onPlay }: { busy: boolean; error?: string; onPlay: (name: string, url: string) => void }) {
  const [name, setName] = useState(() => localStorage.getItem("ruderal:name") ?? "");
  const [url, setUrl] = useState(defaultServerUrl);

  const submit = () => {
    const n = name.trim() || "wanderer";
    localStorage.setItem("ruderal:name", n);
    onPlay(n, url);
  };

  const field: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    background: "#fbf8ef",
    border: `1px solid ${BORDER}`,
    borderRadius: 2,
    padding: "8px 10px",
    font: "inherit",
    color: INK,
    marginTop: 4,
  };

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#cfc8b8",
        color: INK,
      }}
    >
      <div
        style={{
          width: 340,
          background: PAPER,
          border: `1px solid ${BORDER}`,
          borderTop: `4px solid ${AMBER}`,
          borderRadius: 2,
          boxShadow: "0 2px 10px rgba(58,53,44,0.3)",
          padding: 24,
          letterSpacing: "0.04em",
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 700, textTransform: "uppercase" }}>Ruderal</div>
        <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 16 }}>
          Westerkerk · Amsterdam — a shared canvas over the real city
        </div>

        <label style={{ fontSize: 11, textTransform: "uppercase" }}>
          field name
          <input
            style={field}
            value={name}
            maxLength={16}
            placeholder="wanderer"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </label>
        <label style={{ fontSize: 11, textTransform: "uppercase", display: "block", marginTop: 12 }}>
          relay (server)
          <input style={field} value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>

        {error && (
          <div style={{ marginTop: 12, fontSize: 11, color: "#8c4a32" }}>
            couldn't join: {error}
          </div>
        )}

        <button
          onClick={submit}
          disabled={busy}
          style={{
            marginTop: 18,
            width: "100%",
            padding: "10px 0",
            background: busy ? BORDER : AMBER,
            color: INK,
            border: "none",
            borderRadius: 2,
            font: "inherit",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            cursor: busy ? "wait" : "pointer",
          }}
        >
          {busy ? "joining…" : "enter the zone"}
        </button>
      </div>
    </div>
  );
}
