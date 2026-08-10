/**
 * Module 02B — a tiny debug-control store.
 *
 * The goal is an API you'll actually use: adding a tweakable value should be
 * ONE line, right next to the code that consumes it.
 *
 *     const { strength } = useControls("Wind", {
 *       strength: { type: "number", value: 0.4, min: 0, max: 2, step: 0.01 },
 *     });
 *
 * If registering a knob is any more work than that, you won't bother, and
 * you'll go back to editing constants and reloading — which is the slow loop
 * this whole module exists to kill.
 *
 * The store is deliberately OUTSIDE React: values change on every slider drag
 * (potentially every frame), and pushing that through component state would
 * re-render the scene tree constantly. React subscribes via
 * useSyncExternalStore; the render loop can also just read `store.get()`
 * directly with no re-render at all.
 */

export type Control =
  | { type: "number"; value: number; min?: number; max?: number; step?: number; label?: string }
  | { type: "boolean"; value: boolean; label?: string }
  | { type: "color"; value: string; label?: string }
  | { type: "select"; value: string; options: string[]; label?: string };

export type Schema = Record<string, Control>;

/** Extracts `{ speed: number, on: boolean }` from a schema object. */
export type Values<S extends Schema> = {
  [K in keyof S]: S[K] extends { value: infer V } ? V : never;
};

interface Group {
  name: string;
  schema: Schema;
  /** Bumped when a group re-registers, so stale unmounts don't delete it. */
  token: number;
}

type Listener = () => void;

class DebugStore {
  private groups = new Map<string, Group>();
  private values = new Map<string, unknown>();
  private listeners = new Set<Listener>();
  private _selected: string | null = null;
  /** Snapshot identity — changed on every mutation so React re-renders. */
  private version = { groups: [] as string[], selected: null as string | null, v: 0 };

  private key(group: string, name: string) {
    return `${group}.${name}`;
  }

  private emit() {
    this.version = {
      groups: [...this.groups.keys()],
      selected: this._selected,
      v: this.version.v + 1,
    };
    for (const l of this.listeners) l();
  }

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  /** Stable snapshot for useSyncExternalStore. */
  getSnapshot = () => this.version;

  register(group: string, schema: Schema): number {
    const existing = this.groups.get(group);
    const token = (existing?.token ?? 0) + 1;
    this.groups.set(group, { name: group, schema, token });
    // seed defaults, but never clobber a value the user already dragged
    for (const [name, control] of Object.entries(schema)) {
      const k = this.key(group, name);
      if (!this.values.has(k)) this.values.set(k, control.value);
    }
    if (this._selected === null) this._selected = group;
    this.emit();
    return token;
  }

  unregister(group: string, token: number) {
    // Only remove if nobody re-registered in the meantime (StrictMode double
    // mounts, hot reload). Without this guard a remount deletes its own group.
    const g = this.groups.get(group);
    if (!g || g.token !== token) return;
    this.groups.delete(group);
    if (this._selected === group) this._selected = this.groups.keys().next().value ?? null;
    this.emit();
  }

  /** Read one value. Safe to call every frame — no allocation, no subscribe. */
  get<T>(group: string, name: string): T {
    return this.values.get(this.key(group, name)) as T;
  }

  set(group: string, name: string, value: unknown) {
    this.values.set(this.key(group, name), value);
    this.emit();
  }

  groupNames(): string[] {
    return [...this.groups.keys()];
  }

  schemaOf(group: string): Schema | undefined {
    return this.groups.get(group)?.schema;
  }

  get selected(): string | null {
    return this._selected;
  }

  select(group: string | null) {
    if (this._selected === group) return;
    this._selected = group;
    this.emit();
  }
}

export const debugStore = new DebugStore();
