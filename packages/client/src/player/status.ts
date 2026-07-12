/** Mutable per-frame player status, polled by the HUD at low frequency so the
 *  render loop never touches React state. */
export const playerStatus = {
  x: 0,
  y: 0,
  z: 0,
  yaw: 0,
  locked: false,
  swimming: false,
};

export function headingLabel(yaw: number): string {
  // yaw 0 faces -z = north; positive yaw turns west→ (three YXZ convention)
  const dirs = ["N", "NW", "W", "SW", "S", "SE", "E", "NE"];
  const a = ((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return dirs[Math.round(a / (Math.PI / 4)) % 8];
}
