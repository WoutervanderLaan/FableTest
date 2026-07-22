/**
 * Module 07 — plain DOM overlay: a crosshair + a controls hint. It sits OUTSIDE
 * the <Canvas> (it's HTML, not 3D) with `pointerEvents: none` so clicks pass
 * through to the canvas and trigger pointer lock. The real Ruderal's HUD works
 * the same way — DOM over the canvas, never React state in the render loop.
 */
export function Hud() {
  return (
    <>
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          width: 6,
          height: 6,
          marginLeft: -3,
          marginTop: -3,
          borderRadius: 3,
          background: "#e8a33d",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "fixed",
          bottom: 16,
          left: "50%",
          transform: "translateX(-50%)",
          font: "12px ui-monospace, monospace",
          letterSpacing: "0.04em",
          color: "#3a352c",
          background: "rgba(244,239,227,0.85)",
          padding: "6px 12px",
          borderRadius: 2,
          pointerEvents: "none",
        }}
      >
        click to look · WASD move · space jump · shift run · esc release
      </div>
    </>
  );
}
