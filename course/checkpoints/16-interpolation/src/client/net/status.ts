/**
 * A plain mutable store for connection status. The render loop and HUD read it
 * without going through React state (which would re-render the whole app every
 * frame). The real Ruderal uses the same "mutable status object polled by the
 * HUD" pattern in `player/status.ts`.
 */
export const netStatus = {
  connected: false,
  players: 0,
  latencyMs: 0,
  error: "",
};
