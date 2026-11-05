import { BUILDINGS } from "@/game/sim/content";
import { createGame, placeBuilding, upgradeBuilding } from "@/game/sim/engine";
import { hexDist } from "@/game/sim/hex";
import { disableSaving } from "@/game/sim/save";
import type { BuildingKind, SimState } from "@/game/sim/types";

/*
 * Dev-only showcase (open the game with ?showcase): a paused demo city with one of every
 * building around the Kiln, built in memory with saving switched off, so buildings can be
 * reviewed without touching the real save — even while a game runs in another tab.
 */

export function isShowcase(): boolean {
  return import.meta.env.DEV && typeof window !== "undefined" && new URLSearchParams(window.location.search).has("showcase");
}

const ORDER: BuildingKind[] = ["tent", "hut", "longhouse", "mess", "infirmary", "survey", "depot", "ironworks", "vent"];

export function buildShowcase(): SimState {
  disableSaving();
  const params = new URLSearchParams(window.location.search);
  const seed = Number(params.get("seed") ?? 192011);
  const sim = createGame(seed);
  sim.pendingEvent = null;
  sim.speed = 0;
  sim.minute = Number(params.get("hour") ?? 12) * 60;
  sim.resources.timber = 5000;
  sim.resources.iron = 5000;

  const free = (pred: (q: number, r: number, deposit: string) => boolean) =>
    sim.tiles.find((t) => t.buildingId == null && !(t.q === 0 && t.r === 0) && pred(t.q, t.r, t.deposit));
  const put = (kind: BuildingKind, pred: (q: number, r: number, deposit: string) => boolean) => {
    const t = free(pred);
    if (t) placeBuilding(sim, kind, t.q, t.r);
    return t;
  };

  // Ring 1 first, so the newest buildings sit right beside the Kiln.
  for (const kind of ORDER) {
    const base = kind === "hut" || kind === "longhouse" ? "tent" : kind;
    const t = put(base, (q, r, d) => d === "none" && hexDist(q, r) <= 2);
    if (t && base !== kind) {
      const b = sim.buildings.find((x) => x.q === t.q && x.r === t.r)!;
      upgradeBuilding(sim, b.id);
      if (kind === "longhouse") upgradeBuilding(sim, b.id);
    }
  }
  put("peat", (_q, _r, d) => d === "peat");
  put("wood", (_q, _r, d) => d === "timber");
  put("trappers", (_q, _r, d) => d === "lichen");
  put("salvage", (_q, _r, d) => d === "scrap");
  void BUILDINGS;
  return sim;
}
