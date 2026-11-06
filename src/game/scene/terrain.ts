import { HEX_SIZE, hexToWorld } from "@/game/sim/hex";
import type { SimState } from "@/game/sim/types";

/**
 * Height of the snowfield at a world point. Each point blends the nearby tile tops, weighted so
 * a tile's middle stays level with its own top and only the band near its edge eases into the
 * next. Shared by the snowfield mesh and everything that walks or lies on it.
 */
export function makeHeightAt(sim: Pick<SimState, "tiles" | "terrain">): (x: number, z: number) => number {
  const tops = sim.tiles.map((t) => hexToWorld(t.q, t.r, sim.terrain));
  const reach = HEX_SIZE * 1.2;
  return (x, z) => {
    let sum = 0;
    let wsum = 0;
    for (const [tx, ty, tz] of tops) {
      const dx = x - tx;
      const dz = z - tz;
      if (Math.abs(dx) >= reach || Math.abs(dz) >= reach) continue;
      const d = Math.hypot(dx, dz);
      if (d >= reach) continue;
      const w = (1 - d / reach) ** 4;
      sum += w * ty;
      wsum += w;
    }
    return wsum > 0 ? sum / wsum : 0;
  };
}
