import { create } from "zustand";
import { syncKiln, unlockAudio } from "./audio";
import {
  buyResearch,
  callVote,
  createGame,
  decreeClause,
  demolishBuilding,
  placeBuilding,
  repealClause,
  resolveEvent,
  setPressure,
  setRadius,
  stepMinute,
  toggleHeater,
  toggleSurge,
  upgradeBuilding,
} from "./sim/engine";
import { loadSim, saveSim } from "./sim/save";
import type { BuildingKind, CircleId, ClauseId, DealKind, ResearchId, SimState } from "./sim/types";

export type PanelId = "charter" | "chronicle" | "help" | "survey" | null;

interface Result {
  ok: boolean;
  reason?: string;
}

interface GameStore {
  sim: SimState | null;
  phase: "title" | "play";
  rev: number;
  buildKind: BuildingKind | null;
  selectedId: number | null;
  panel: PanelId;
  heat: boolean;
  clauseId: ClauseId | null;
  deals: Partial<Record<CircleId, DealKind | null>>;
  notice: string | null;
  pendingTile: { q: number; r: number } | null;
  coarse: boolean;
  boot: () => void;
  start: (seed: number) => void;
  resume: () => void;
  drive: (dt: number) => void;
  setSpeed: (speed: 0 | 1 | 2 | 4) => void;
  togglePause: () => void;
  chooseBuild: (kind: BuildingKind | null) => void;
  select: (id: number | null) => void;
  setPanel: (panel: PanelId) => void;
  toggleHeat: () => void;
  focusClause: (id: ClauseId | null) => void;
  setDeal: (circle: CircleId, deal: DealKind | null) => void;
  tryPlace: (q: number, r: number) => void;
  confirmTile: () => void;
  setPendingTile: (tile: { q: number; r: number } | null) => void;
  doUpgrade: (id: number) => void;
  doDemolish: (id: number) => void;
  doPressure: (n: 0 | 1 | 2 | 3 | 4) => void;
  doRadius: (n: 1 | 2 | 3 | 4) => void;
  doSurge: () => void;
  doHeater: (id: number) => void;
  doResearch: (id: ResearchId) => void;
  doVote: () => void;
  doDecree: () => void;
  doRepeal: (id: ClauseId) => void;
  doResolve: (choice: string) => void;
  toggleMute: () => void;
  dismissNotice: () => void;
}

let acc = 0;

function touchAudio(sim: SimState): void {
  syncKiln(sim.kiln.pressure, sim.kiln.running && sim.kiln.pressure > 0, sim.kiln.surge, sim.muted);
}

export const useGame = create<GameStore>((set, get) => {
  const bump = (notice?: string | null) => {
    const sim = get().sim;
    if (sim) {
      saveSim(sim);
      touchAudio(sim);
    }
    set({ rev: get().rev + 1, notice: notice === undefined ? get().notice : notice });
  };

  const apply = (fn: (sim: SimState) => Result | void) => {
    const sim = get().sim;
    if (!sim) return;
    const res = fn(sim);
    if (res && res.ok === false) bump(res.reason ?? "That did not hold.");
    else bump(null);
  };

  return {
    sim: null,
    phase: "title",
    rev: 0,
    buildKind: null,
    selectedId: null,
    panel: null,
    heat: false,
    clauseId: null,
    deals: {},
    notice: null,
    pendingTile: null,
    coarse: false,
    boot: () => {
      const coarse =
        typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
      set({ coarse });
    },
    start: (seed: number) => {
      acc = 0;
      unlockAudio();
      const sim = createGame(seed);
      set({
        sim,
        phase: "play",
        rev: get().rev + 1,
        buildKind: null,
        selectedId: null,
        panel: null,
        heat: false,
        clauseId: "thin-broth",
        deals: {},
        notice: null,
        pendingTile: null,
      });
      touchAudio(sim);
    },
    resume: () => {
      const sim = loadSim();
      if (!sim) return;
      acc = 0;
      unlockAudio();
      sim.speed = 1;
      set({
        sim,
        phase: "play",
        rev: get().rev + 1,
        buildKind: null,
        selectedId: null,
        panel: null,
        notice: null,
        pendingTile: null,
      });
      touchAudio(sim);
    },
    drive: (dt: number) => {
      const sim = get().sim;
      if (!sim || sim.outcome || sim.pendingEvent || sim.speed === 0) return;
      if (typeof document !== "undefined" && document.hidden) return;
      acc += Math.min(dt, 0.1) * sim.speed * 10;
      let steps = 0;
      let dirty = false;
      while (acc >= 1 && steps < 40) {
        acc -= 1;
        steps += 1;
        stepMinute(sim);
        dirty = true;
        if (sim.pendingEvent || sim.outcome) break;
      }
      if (!dirty) return;
      if (sim.minute % 10 === 0 || sim.pendingEvent || sim.outcome) {
        if (sim.minute % 60 === 0 || sim.outcome) saveSim(sim);
        touchAudio(sim);
        set({ rev: get().rev + 1 });
      }
    },
    setSpeed: (speed) => {
      const sim = get().sim;
      if (!sim || sim.outcome) return;
      sim.speed = speed;
      bump(null);
    },
    togglePause: () => {
      const sim = get().sim;
      if (!sim || sim.outcome) return;
      sim.speed = sim.speed === 0 ? 1 : 0;
      bump(null);
    },
    chooseBuild: (kind) =>
      set({
        buildKind: get().buildKind === kind ? null : kind,
        pendingTile: null,
        panel: null,
        rev: get().rev + 1,
      }),
    select: (id) => set({ selectedId: id, rev: get().rev + 1 }),
    setPanel: (panel) =>
      set({
        panel: get().panel === panel ? null : panel,
        buildKind: panel ? null : get().buildKind,
        rev: get().rev + 1,
      }),
    toggleHeat: () => set({ heat: !get().heat, rev: get().rev + 1 }),
    focusClause: (id) => set({ clauseId: id, deals: {}, rev: get().rev + 1 }),
    setDeal: (circle, deal) => {
      const deals = { ...get().deals };
      deals[circle] = get().deals[circle] === deal ? null : deal;
      set({ deals, rev: get().rev + 1 });
    },
    tryPlace: (q, r) => {
      if (get().coarse) {
        set({ pendingTile: { q, r }, rev: get().rev + 1 });
        return;
      }
      apply((sim) => {
        const kind = get().buildKind;
        if (!kind) return;
        return placeBuilding(sim, kind, q, r);
      });
    },
    confirmTile: () => {
      const tile = get().pendingTile;
      const kind = get().buildKind;
      if (!tile || !kind) return;
      apply((sim) => placeBuilding(sim, kind, tile.q, tile.r));
      set({ pendingTile: null });
    },
    setPendingTile: (tile) => set({ pendingTile: tile, rev: get().rev + 1 }),
    doUpgrade: (id) => apply((sim) => upgradeBuilding(sim, id)),
    doDemolish: (id) => {
      apply((sim) => demolishBuilding(sim, id));
      if (get().selectedId === id) set({ selectedId: null });
    },
    doPressure: (n) => apply((sim) => setPressure(sim, n)),
    doRadius: (n) => apply((sim) => setRadius(sim, n)),
    doSurge: () => apply((sim) => toggleSurge(sim)),
    doHeater: (id) => apply((sim) => toggleHeater(sim, id)),
    doResearch: (id) => apply((sim) => buyResearch(sim, id)),
    doVote: () => {
      const id = get().clauseId;
      if (!id) return;
      apply((sim) => callVote(sim, id, get().deals));
      set({ deals: {} });
    },
    doDecree: () => {
      const id = get().clauseId;
      if (!id) return;
      apply((sim) => decreeClause(sim, id));
    },
    doRepeal: (id) => apply((sim) => repealClause(sim, id)),
    doResolve: (choice) => {
      const sim = get().sim;
      if (!sim?.pendingEvent) return;
      const was = sim.pendingEvent;
      resolveEvent(sim, choice);
      const panel = was === "victory" ? "chronicle" : get().panel;
      saveSim(sim);
      touchAudio(sim);
      set({ rev: get().rev + 1, panel, notice: null });
    },
    toggleMute: () => {
      const sim = get().sim;
      if (!sim) return;
      sim.muted = !sim.muted;
      bump(null);
    },
    dismissNotice: () => set({ notice: null, rev: get().rev + 1 }),
  };
});
