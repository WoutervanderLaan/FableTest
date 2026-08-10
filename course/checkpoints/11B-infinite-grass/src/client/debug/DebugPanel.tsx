/**
 * Module 02B — the panel itself. Plain DOM, sitting over the canvas.
 *
 * It is SELECTION-AWARE: click an object in the scene (via <Selectable/>) and
 * the panel switches to that object's controls. With ten tunable things in a
 * scene, a flat list of a hundred sliders is unusable; showing only what you
 * just clicked is what makes the workflow fast.
 */
import { useSyncExternalStore } from "react";
import { debugStore, type Control } from "./store";

const PAPER = "#f4efe3";
const AMBER = "#e8a33d";

function Row({ group, name, control }: { group: string; name: string; control: Control }) {
  const label = control.label ?? name;
  const value = debugStore.get(group, name) ?? control.value;

  const labelEl = (
    <label style={{ flex: "0 0 96px", opacity: 0.7, fontSize: 12 }}>{label}</label>
  );

  if (control.type === "number") {
    const v = value as number;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        {labelEl}
        <input
          type="range"
          min={control.min ?? 0}
          max={control.max ?? 1}
          step={control.step ?? 0.01}
          value={v}
          onChange={(e) => debugStore.set(group, name, Number(e.target.value))}
          style={{ flex: 1, accentColor: AMBER }}
        />
        <span style={{ flex: "0 0 54px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
          {Number.isInteger(v) ? v : v.toFixed(3)}
        </span>
      </div>
    );
  }

  if (control.type === "boolean") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        {labelEl}
        <input
          type="checkbox"
          checked={value as boolean}
          onChange={(e) => debugStore.set(group, name, e.target.checked)}
          style={{ accentColor: AMBER }}
        />
      </div>
    );
  }

  if (control.type === "color") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        {labelEl}
        <input
          type="color"
          value={value as string}
          onChange={(e) => debugStore.set(group, name, e.target.value)}
          style={{ flex: 1, height: 22, background: "none", border: "none" }}
        />
        <span style={{ flex: "0 0 54px", textAlign: "right" }}>{value as string}</span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
      {labelEl}
      <select
        value={value as string}
        onChange={(e) => debugStore.set(group, name, e.target.value)}
        style={{ flex: 1, background: "#2a2620", color: PAPER, border: "1px solid #4a443a" }}
      >
        {control.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

export function DebugPanel() {
  // one subscription for the whole panel
  useSyncExternalStore(debugStore.subscribe, debugStore.getSnapshot, debugStore.getSnapshot);

  const groups = debugStore.groupNames();
  const selected = debugStore.selected;
  const schema = selected ? debugStore.schemaOf(selected) : undefined;

  return (
    <div
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        width: 300,
        font: "13px ui-monospace, SFMono-Regular, Menlo, monospace",
        color: PAPER,
        background: "rgba(20,18,15,0.88)",
        borderRadius: 8,
        padding: 10,
        maxHeight: "calc(100vh - 24px)",
        overflowY: "auto",
      }}
    >
      {/* group tabs — clicking one is the same as clicking the object */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
        {groups.map((g) => (
          <button
            key={g}
            onClick={() => debugStore.select(g)}
            style={{
              font: "inherit",
              fontSize: 11,
              padding: "3px 8px",
              borderRadius: 5,
              cursor: "pointer",
              border: "1px solid " + (g === selected ? AMBER : "#4a443a"),
              background: g === selected ? "rgba(232,163,61,0.18)" : "transparent",
              color: g === selected ? AMBER : PAPER,
            }}
          >
            {g}
          </button>
        ))}
      </div>

      {schema && selected ? (
        Object.entries(schema).map(([name, control]) => (
          <Row key={name} group={selected} name={name} control={control} />
        ))
      ) : (
        <div style={{ opacity: 0.6 }}>No controls registered.</div>
      )}

      <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid #3a352c", opacity: 0.5, fontSize: 11, lineHeight: 1.6 }}>
        click an object to select it
        <br />
        drag = orbit · right-drag = pan · wheel = zoom
        <br />
        WASD = move · Q/E = down/up · shift = faster
      </div>
    </div>
  );
}
