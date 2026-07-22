/**
 * In-game overlays that need pointer-lock released to interact: the zone-travel
 * map (M) and the trade composer / incoming-offer prompt (T). Kept out of the
 * render loop entirely — pure React over the canvas. Amber is the action color.
 */

import { useEffect, useMemo, useState } from "react";
import { BLOCK_COLOR, Block } from "@ruderal/shared";
import type { Net, TradeIncoming, TradeResult } from "../net/connection";
import type { ZoneEntry } from "../App";
import { editorStatus } from "../player/status";

const PAPER = "#f4efe3";
const INK = "#3a352c";
const BORDER = "#b8b2a7";
const AMBER = "#e8a33d";

const TRADEABLE = [Block.Brick, Block.BrickDark, Block.Wood, Block.Concrete, Block.Moss];
const BLOCK_LABEL: Record<number, string> = {
  [Block.Brick]: "brick",
  [Block.BrickDark]: "dark brick",
  [Block.Wood]: "wood",
  [Block.Concrete]: "concrete",
  [Block.Moss]: "moss",
};

function cssColor(b: number): string {
  const c = BLOCK_COLOR[b];
  return `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;
}

const panel: React.CSSProperties = {
  background: PAPER,
  color: INK,
  border: `1px solid ${BORDER}`,
  borderTop: `4px solid ${AMBER}`,
  borderRadius: 2,
  boxShadow: "0 2px 12px rgba(58,53,44,0.35)",
  padding: 18,
  letterSpacing: "0.04em",
  pointerEvents: "auto",
};

interface Props {
  net: Net;
  zones: ZoneEntry[];
  currentZoneId: string;
  onTravel: (zoneId: string) => void;
}

export function Overlays({ net, zones, currentZoneId, onTravel }: Props) {
  const [open, setOpen] = useState<null | "travel" | "trade">(null);
  const [incoming, setIncoming] = useState<TradeIncoming | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // give/want composer state
  const [giveB, setGiveB] = useState<number>(Block.Brick);
  const [giveN, setGiveN] = useState(5);
  const [wantB, setWantB] = useState<number>(Block.Wood);
  const [wantN, setWantN] = useState(5);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyM") setOpen((o) => (o === "travel" ? null : "travel"));
      else if (e.code === "KeyT") setOpen((o) => (o === "trade" ? null : "trade"));
      else if (e.code === "Escape") setOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // opening a panel releases pointer lock so the user can click
  useEffect(() => {
    if (open && document.pointerLockElement) document.exitPointerLock();
  }, [open]);

  useEffect(() => {
    const offs = [
      net.on("tradeIncoming", (t: TradeIncoming) => {
        setIncoming(t);
        if (document.pointerLockElement) document.exitPointerLock();
      }),
      net.on("tradeResult", (r: TradeResult) => {
        setToast(r.ok ? "trade complete" : `trade failed — ${r.reason ?? "declined"}`);
        setIncoming((cur) => (cur && cur.id === r.id ? null : cur));
        setTimeout(() => setToast(null), 3200);
      }),
    ];
    return () => offs.forEach((o) => o());
  }, [net]);

  const inv = editorStatus.inv;

  const doOffer = () => {
    net.tradeOffer({ b: giveB, n: giveN }, { b: wantB, n: wantN });
    setOpen(null);
    setToast("offer sent to nearest player");
    setTimeout(() => setToast(null), 2600);
  };

  return (
    <>
      {open === "travel" && (
        <Backdrop onClose={() => setOpen(null)}>
          <div style={{ ...panel, width: 360 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>travel</div>
            <div style={{ fontSize: 10, opacity: 0.65, marginBottom: 12 }}>
              your inventory travels with you between zones
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {zones.map((z) => {
                const here = z.id === currentZoneId;
                return (
                  <button
                    key={z.id}
                    disabled={here}
                    onClick={() => {
                      onTravel(z.id);
                      setOpen(null);
                    }}
                    style={{
                      textAlign: "left",
                      background: here ? "#eee7d5" : "#fbf8ef",
                      border: `2px solid ${here ? AMBER : BORDER}`,
                      borderRadius: 2,
                      padding: "8px 10px",
                      font: "inherit",
                      color: INK,
                      cursor: here ? "default" : "pointer",
                      opacity: here ? 0.7 : 1,
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 13 }}>
                      {z.name} {here && <span style={{ color: AMBER }}>· here</span>}
                    </div>
                    <div style={{ fontSize: 10, opacity: 0.7 }}>{z.blurb}</div>
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: 10, opacity: 0.5, marginTop: 12 }}>M or Esc to close</div>
          </div>
        </Backdrop>
      )}

      {open === "trade" && (
        <Backdrop onClose={() => setOpen(null)}>
          <div style={{ ...panel, width: 320 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 700, textTransform: "uppercase", marginBottom: 12 }}>offer a trade</div>
            <StackPicker label="you give" b={giveB} n={giveN} setB={setGiveB} setN={setGiveN} inv={inv} />
            <div style={{ textAlign: "center", margin: "8px 0", color: AMBER }}>⇅</div>
            <StackPicker label="you want" b={wantB} n={wantN} setB={setWantB} setN={setWantN} />
            <button
              onClick={doOffer}
              style={{
                marginTop: 14,
                width: "100%",
                padding: "9px 0",
                background: AMBER,
                color: INK,
                border: "none",
                borderRadius: 2,
                font: "inherit",
                fontWeight: 700,
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              offer to nearest player
            </button>
            <div style={{ fontSize: 10, opacity: 0.5, marginTop: 10 }}>T or Esc to close</div>
          </div>
        </Backdrop>
      )}

      {incoming && (
        <Backdrop onClose={() => {}}>
          <div style={{ ...panel, width: 300 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 700, textTransform: "uppercase", marginBottom: 10 }}>
              trade from {incoming.fromName}
            </div>
            <div style={{ fontSize: 13, marginBottom: 4 }}>
              they give you: <b>{incoming.give.n}× {BLOCK_LABEL[incoming.give.b] ?? incoming.give.b}</b>
            </div>
            <div style={{ fontSize: 13, marginBottom: 12 }}>
              you give them: <b>{incoming.want.n}× {BLOCK_LABEL[incoming.want.b] ?? incoming.want.b}</b>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => {
                  net.tradeAccept(incoming.id);
                  setIncoming(null);
                }}
                style={btn(AMBER)}
              >
                accept
              </button>
              <button
                onClick={() => {
                  net.tradeDecline(incoming.id);
                  setIncoming(null);
                }}
                style={btn("#c9beac")}
              >
                decline
              </button>
            </div>
          </div>
        </Backdrop>
      )}

      {toast && (
        <div
          style={{
            position: "fixed",
            top: 70,
            left: "50%",
            transform: "translateX(-50%)",
            background: PAPER,
            color: INK,
            border: `1px solid ${BORDER}`,
            borderLeft: `4px solid ${AMBER}`,
            borderRadius: 2,
            padding: "8px 14px",
            fontSize: 12,
            letterSpacing: "0.04em",
            pointerEvents: "none",
            boxShadow: "0 1px 6px rgba(58,53,44,0.3)",
          }}
        >
          {toast}
        </div>
      )}
    </>
  );
}

function btn(bg: string): React.CSSProperties {
  return {
    flex: 1,
    padding: "9px 0",
    background: bg,
    color: INK,
    border: "none",
    borderRadius: 2,
    font: "inherit",
    fontWeight: 700,
    textTransform: "uppercase",
    cursor: "pointer",
  };
}

function Backdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(58,53,44,0.35)",
        pointerEvents: "auto",
      }}
    >
      {children}
    </div>
  );
}

function StackPicker({
  label,
  b,
  n,
  setB,
  setN,
  inv,
}: {
  label: string;
  b: number;
  n: number;
  setB: (b: number) => void;
  setN: (n: number) => void;
  inv?: Record<string, number>;
}) {
  const options = useMemo(() => TRADEABLE, []);
  return (
    <div>
      <div style={{ fontSize: 10, textTransform: "uppercase", opacity: 0.7, marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {options.map((opt) => {
            const have = inv ? inv[String(opt)] ?? 0 : undefined;
            return (
              <button
                key={opt}
                onClick={() => setB(opt)}
                title={BLOCK_LABEL[opt]}
                style={{
                  width: 30,
                  height: 30,
                  background: cssColor(opt),
                  border: `2px solid ${b === opt ? AMBER : BORDER}`,
                  borderRadius: 2,
                  cursor: "pointer",
                  position: "relative",
                  opacity: have !== undefined && have === 0 ? 0.4 : 1,
                }}
              />
            );
          })}
        </div>
        <input
          type="number"
          min={1}
          max={999}
          value={n}
          onChange={(e) => setN(Math.max(1, Math.min(999, Number(e.target.value) || 1)))}
          style={{
            width: 52,
            marginLeft: "auto",
            background: "#fbf8ef",
            border: `1px solid ${BORDER}`,
            borderRadius: 2,
            padding: "6px",
            font: "inherit",
            color: INK,
          }}
        />
      </div>
      {inv && <div style={{ fontSize: 9, opacity: 0.6, marginTop: 3 }}>you hold: {inv[String(b)] ?? 0}</div>}
    </div>
  );
}
