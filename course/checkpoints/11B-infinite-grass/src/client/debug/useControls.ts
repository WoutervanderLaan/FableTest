/**
 * Module 02B — the hook that makes adding a knob a one-liner.
 *
 *   const { speed } = useControls("Cube", {
 *     speed: { type: "number", value: 1, min: 0, max: 5, step: 0.01 },
 *   });
 *
 * Two ways to read a control, and the choice matters:
 *
 *   useControls()  → re-renders the component when a value changes.
 *                    Use for things React actually renders (counts, colors
 *                    passed as props, toggles that add/remove objects).
 *
 *   useControlRef() → NEVER re-renders; returns a getter you call inside
 *                    useFrame. Use for anything you're feeding to a uniform
 *                    or mutating imperatively 60× a second. Dragging a slider
 *                    should not re-render your scene graph.
 */
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { debugStore, type Schema, type Values } from "./store";

export function useControls<S extends Schema>(group: string, schema: S): Values<S> {
  // Register once per (group, schema identity). The schema is almost always an
  // object literal, so we key on the group name and the field names instead of
  // the object identity — otherwise every render would re-register.
  const fields = Object.keys(schema).join(",");
  const schemaRef = useRef(schema);
  schemaRef.current = schema;

  useEffect(() => {
    const token = debugStore.register(group, schemaRef.current);
    return () => debugStore.unregister(group, token);
  }, [group, fields]);

  useSyncExternalStore(debugStore.subscribe, debugStore.getSnapshot, debugStore.getSnapshot);

  return useMemo(() => {
    const out = {} as Values<S>;
    for (const name of Object.keys(schemaRef.current)) {
      const stored = debugStore.get(group, name);
      // during the very first render the effect hasn't run yet
      (out as Record<string, unknown>)[name] = stored ?? schemaRef.current[name].value;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, fields, debugStore.getSnapshot()]);
}

/**
 * Register the same controls but read them WITHOUT subscribing. Returns a
 * getter for use inside useFrame.
 */
export function useControlRef<S extends Schema>(
  group: string,
  schema: S,
): <K extends keyof S & string>(name: K) => Values<S>[K] {
  const fields = Object.keys(schema).join(",");
  const schemaRef = useRef(schema);
  schemaRef.current = schema;

  useEffect(() => {
    const token = debugStore.register(group, schemaRef.current);
    return () => debugStore.unregister(group, token);
  }, [group, fields]);

  return useCallback(
    <K extends keyof S & string>(name: K) =>
      (debugStore.get(group, name) ?? schemaRef.current[name].value) as Values<S>[K],
    [group],
  );
}

/** Imperatively select which group the panel shows (used by <Selectable/>). */
export function selectGroup(group: string | null) {
  debugStore.select(group);
}
