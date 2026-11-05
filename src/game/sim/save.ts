import { z } from "zod";
import type { SimState } from "./types";

const KEY = "hearthlaw.save.v1";

const Envelope = z.object({
  schemaVersion: z.literal(1),
  sim: z
    .object({
      seed: z.number(),
      minute: z.number(),
      rng: z.tuple([z.number(), z.number(), z.number(), z.number()]),
      resources: z.object({
        fuel: z.number(),
        timber: z.number(),
        iron: z.number(),
        raw: z.number(),
        meals: z.number(),
      }),
      tiles: z.array(z.object({ q: z.number(), r: z.number() }).passthrough()),
      buildings: z.array(z.object({ id: z.number(), kind: z.string() }).passthrough()),
    })
    .passthrough(),
});

export function saveSim(sim: SimState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ schemaVersion: 1, sim }));
  } catch {
    /* storage full or blocked — the city still runs */
  }
}

export function loadSim(): SimState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = Envelope.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const sim = parsed.data.sim as unknown as SimState;
    sim.speed = 0;
    sim.terrain ??= "pit";
    return sim;
  } catch {
    return null;
  }
}

export function hasSave(): boolean {
  return loadSim() != null;
}

export function clearSave(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}
