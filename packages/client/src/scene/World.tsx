/** Thin React boundary around the imperative WorldManager chunk layer. */

import type { WorldManager } from "../world/WorldManager";

export function WorldView({ world }: { world: WorldManager }) {
  return <primitive object={world.group} />;
}
