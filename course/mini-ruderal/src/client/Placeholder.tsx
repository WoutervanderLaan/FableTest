/**
 * Part 0 baseline — this file is the "hello world" your course starts from.
 *
 * Right now it's plain DOM: no Three.js, no Canvas. That's on purpose — Module
 * 01 opens the hood on raw Three.js, and Module 02 brings in React Three Fiber.
 * You'll rewrite this file many times. When in doubt about where a module
 * should end up, copy the matching folder from `../../checkpoints/` over `src/`.
 */

const PAPER = "#f4efe3";
const INK = "#3a352c";
const BORDER = "#b8b2a7";
const AMBER = "#e8a33d";

export function Placeholder() {
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
          width: 460,
          maxWidth: "90vw",
          background: PAPER,
          border: `1px solid ${BORDER}`,
          borderTop: `4px solid ${AMBER}`,
          borderRadius: 2,
          boxShadow: "0 2px 10px rgba(58,53,44,0.3)",
          padding: 28,
          letterSpacing: "0.04em",
        }}
      >
        <div
          style={{ fontSize: 22, fontWeight: 700, textTransform: "uppercase" }}
        >
          Mini-Ruderal
        </div>
        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
          your workspace for the R3F · Three.js · shaders · multiplayer course
        </div>

        <div
          style={{
            marginTop: 20,
            padding: "12px 14px",
            background: "#fbf8ef",
            border: `1px solid ${BORDER}`,
            borderRadius: 2,
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          If you can read this, the scaffold works:{" "}
          <b>Vite + React 19 + TypeScript</b> are booting correctly. ✅
          <br />
          <br />
          Open <code>../lessons/00-orientation.md</code> to get your bearings,
          then start <code>01-threejs-from-scratch.md</code>.
        </div>

        <div style={{ fontSize: 11, opacity: 0.65, marginTop: 18 }}>
          Edit <code>src/client/App.tsx</code> and this page hot-reloads. That
          feedback loop is your whole life for the next 21 modules — get
          comfortable with it.
        </div>
      </div>
    </div>
  );
}
