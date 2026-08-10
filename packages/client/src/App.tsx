import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer, Noise, Vignette } from "@react-three/postprocessing";
import { setVoxelAt, unpackX, unpackY, unpackZ, type ZoneSpec } from "@ruderal/shared";
import { loadZone } from "./loader";
import { Net } from "./net/connection";
import { PlayerController } from "./player/PlayerController";
import { Debris } from "./scene/Debris";
import { Entities } from "./scene/Entities";
import { Husks } from "./scene/Husks";
import { RemotePlayers } from "./scene/RemotePlayers";
import { SkyAndLight } from "./scene/SkyAndLight";
import { Vegetation } from "./scene/Vegetation";
import { WorldView } from "./scene/World";
import { Hud } from "./ui/Hud";
import { Overlays } from "./ui/Overlays";
import { WorldManager } from "./world/WorldManager";
import { netStatus } from "./player/status";

const PAPER = "#f4efe3";
const INK = "#3a352c";
const BORDER = "#b8b2a7";
const AMBER = "#e8a33d";

export interface ZoneEntry {
  id: string;
  name: string;
  file: string;
  blurb: string;
  centerLon: number;
  centerLat: number;
  waterPct: number;
  buildingPct: number;
}

type Stage = { k: "menu"; error?: string } | { k: "connecting" } | { k: "playing" };

interface Session {
  net: Net;
  world: WorldManager;
  spec: ZoneSpec;
  spawn: { x: number; y: number; z: number };
  entry: ZoneEntry;
}

const defaultServerUrl = () => import.meta.env.VITE_SERVER_URL ?? `ws://${location.hostname}:2567`;

function playerKey(): string {
  let k = localStorage.getItem("ruderal:pkey");
  if (!k) {
    k = "pk_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem("ruderal:pkey", k);
  }
  return k;
}

export default function App() {
  const [manifest, setManifest] = useState<ZoneEntry[] | null>(null);
  const [stage, setStage] = useState<Stage>({ k: "menu" });
  const [sessionKey, setSessionKey] = useState(0);
  const [progress, setProgress] = useState(0);
  const session = useRef<Session | null>(null);
  const lastBucket = useRef(-1);
  const nameRef = useRef("wanderer");
  const urlRef = useRef(defaultServerUrl());

  useEffect(() => {
    fetch("/zones/zones.json")
      .then((r) => r.json())
      .then((j) => setManifest(j.zones ?? []))
      .catch(() => setManifest([]));
  }, []);

  const teardown = () => {
    if (session.current) {
      session.current.net.leave();
      session.current.world.dispose();
      session.current = null;
    }
  };

  const play = useCallback(async (name: string, url: string, zoneId: string) => {
    nameRef.current = name;
    urlRef.current = url;
    const entry = manifest?.find((z) => z.id === zoneId) ?? manifest?.[0];
    if (!entry) {
      setStage({ k: "menu", error: "no zones available — run `pnpm bake`" });
      return;
    }
    teardown();
    setProgress(0);
    lastBucket.current = -1;
    setStage({ k: "connecting" });
    try {
      const net = await Net.join(url, name, entry.id, playerKey());
      const { pack, vz } = await loadZone(`/zones/${entry.file}`);
      // fold the persisted overlay into the baseline BEFORE meshing
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
      netStatus.zoneName = entry.name;
      session.current = {
        net,
        world,
        spawn: net.init.spawn,
        entry,
        spec: {
          id: pack.header.id,
          name: pack.header.name,
          centerLon: pack.header.centerLon,
          centerLat: pack.header.centerLat,
          sizeMeters: pack.header.sizeX,
        },
      };
      setSessionKey((n) => n + 1);
      setStage({ k: "playing" });
    } catch (err) {
      teardown();
      setStage({ k: "menu", error: String(err) });
    }
  }, [manifest]);

  const travel = useCallback(
    (zoneId: string) => {
      if (session.current?.entry.id === zoneId) return;
      void play(nameRef.current, urlRef.current, zoneId);
    },
    [play],
  );

  if (stage.k === "menu" || stage.k === "connecting") {
    return (
      <Menu
        busy={stage.k === "connecting"}
        error={stage.k === "menu" ? stage.error : undefined}
        zones={manifest}
        onPlay={play}
      />
    );
  }

  const s = session.current!;
  return (
    <>
      <Canvas
        key={sessionKey}
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
        <Husks net={s.net} />
        <Entities net={s.net} />
        <Debris net={s.net} world={s.world} />
        <EffectComposer>
          <Bloom mipmapBlur luminanceThreshold={0.85} intensity={0.4} />
          <Vignette eskil={false} offset={0.25} darkness={0.55} />
          <Noise opacity={0.035} />
        </EffectComposer>
      </Canvas>
      <Hud spec={s.spec} loading={progress < 0.999} progress={progress} />
      <Overlays net={s.net} zones={manifest ?? []} currentZoneId={s.entry.id} onTravel={travel} />
    </>
  );
}

function Menu({
  busy,
  error,
  zones,
  onPlay,
}: {
  busy: boolean;
  error?: string;
  zones: ZoneEntry[] | null;
  onPlay: (name: string, url: string, zoneId: string) => void;
}) {
  const [name, setName] = useState(() => localStorage.getItem("ruderal:name") ?? "");
  const [url, setUrl] = useState(defaultServerUrl);
  const [zoneId, setZoneId] = useState<string>("");

  useEffect(() => {
    if (zones && zones.length > 0 && !zoneId) setZoneId(zones[0].id);
  }, [zones, zoneId]);

  const submit = (zid: string) => {
    const n = name.trim() || "wanderer";
    localStorage.setItem("ruderal:name", n);
    onPlay(n, url, zid);
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
        overflow: "auto",
      }}
    >
      <div
        style={{
          width: 380,
          background: PAPER,
          border: `1px solid ${BORDER}`,
          borderTop: `4px solid ${AMBER}`,
          borderRadius: 2,
          boxShadow: "0 2px 10px rgba(58,53,44,0.3)",
          padding: 24,
          letterSpacing: "0.04em",
          margin: 24,
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 700, textTransform: "uppercase" }}>Ruderal</div>
        <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 16 }}>
          a shared canvas over the real city — build, scavenge, endure
        </div>

        <label style={{ fontSize: 11, textTransform: "uppercase" }}>
          field name
          <input
            style={field}
            value={name}
            maxLength={16}
            placeholder="wanderer"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label style={{ fontSize: 11, textTransform: "uppercase", display: "block", marginTop: 12 }}>
          relay (server)
          <input style={field} value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>

        <div style={{ fontSize: 11, textTransform: "uppercase", marginTop: 16, marginBottom: 6 }}>choose a zone</div>
        {!zones && <div style={{ fontSize: 11, opacity: 0.6 }}>loading zones…</div>}
        {zones?.length === 0 && <div style={{ fontSize: 11, color: "#8c4a32" }}>no zones — run `pnpm bake`</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {zones?.map((z) => (
            <button
              key={z.id}
              onClick={() => setZoneId(z.id)}
              style={{
                textAlign: "left",
                background: zoneId === z.id ? "#fff7e6" : "#fbf8ef",
                border: `2px solid ${zoneId === z.id ? AMBER : BORDER}`,
                borderRadius: 2,
                padding: "8px 10px",
                font: "inherit",
                color: INK,
                cursor: "pointer",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13 }}>{z.name}</div>
              <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>{z.blurb}</div>
              <div style={{ fontSize: 9, opacity: 0.55, marginTop: 3 }}>
                {z.waterPct}% water · {z.buildingPct}% built
              </div>
            </button>
          ))}
        </div>

        {error && <div style={{ marginTop: 12, fontSize: 11, color: "#8c4a32" }}>couldn't join: {error}</div>}

        <button
          onClick={() => zoneId && submit(zoneId)}
          disabled={busy || !zoneId}
          style={{
            marginTop: 18,
            width: "100%",
            padding: "10px 0",
            background: busy || !zoneId ? BORDER : AMBER,
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
