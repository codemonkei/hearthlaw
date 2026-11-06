import { detectFxQuality, FX_ORDER, type FxQuality } from "./fx";
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
import { clearSave, loadSim, saveSim } from "./sim/save";
import type { BuildingKind, CircleId, ClauseId, DealKind, Difficulty, ResearchId, SimState } from "./sim/types";

const FX_KEY = "hearthlaw.fx";
const DIFFICULTY_KEY = "hearthlaw.difficulty";
const DOCK_KEY = "hearthlaw.dock";
const TIPS_KEY = "hearthlaw.tips";
const PLAYED_KEY = "hearthlaw.played";

/** Tips follow the player's own choice; with none made they are on until a first game has ended. */
function loadTips(): boolean {
  const v = read(TIPS_KEY);
  if (v === "on") return true;
  if (v === "off") return false;
  return read(PLAYED_KEY) !== "1";
}

function store(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage blocked — the choice lasts this session */
  }
}

function read(key: string): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** The saved tier, or on the very first run a guess from the device, saved so it stays put. */
function loadFx(): FxQuality {
  const v = read(FX_KEY);
  if (v === "high" || v === "medium" || v === "low") return v;
  if (typeof window === "undefined") return "high";
  const guess = detectFxQuality();
  store(FX_KEY, guess);
  return guess;
}

function loadDifficulty(): Difficulty {
  const v = read(DIFFICULTY_KEY);
  return v === "easy" || v === "hard" ? v : "medium";
}

export type PanelId = "charter" | "chronicle" | "help" | "survey" | "settings" | null;

interface Result {
  ok: boolean;
  reason?: string;
}

interface GameStore {
  sim: SimState | null;
  phase: "title" | "play";
  rev: number;
  buildKind: BuildingKind | null;
  /** Phones: the build cards can be folded away. Desktop always shows them. */
  dockOpen: boolean;
  toggleDock: () => void;
  /** Guided tips: on for a first game, off by default after one has ended. */
  tips: boolean;
  setTips: (on: boolean) => void;
  dismissTip: (id: string) => void;
  selectedId: number | null;
  panel: PanelId;
  heat: boolean;
  /** Visual quality: post-processing, shadow resolution, pixel ratio. Presentation only. */
  fx: FxQuality;
  /** Difficulty for the next new game. A running game keeps the one it started with. */
  difficulty: Difficulty;
  clauseId: ClauseId | null;
  deals: Partial<Record<CircleId, DealKind | null>>;
  notice: string | null;
  pendingTile: { q: number; r: number } | null;
  coarse: boolean;
  boot: () => void;
  start: (seed: number) => void;
  resume: () => void;
  /** Abandon the current city: delete the save and return to the title. */
  reset: () => void;
  /** Save and return to the title; Continue picks the city up again. */
  quit: () => void;
  /** Write the save now (the page is being hidden or closed). */
  flushSave: () => void;
  /** Real time of the last save, for the Settings line. */
  savedAt: number | null;
  drive: (dt: number) => void;
  setSpeed: (speed: 0 | 1 | 2 | 4) => void;
  togglePause: () => void;
  chooseBuild: (kind: BuildingKind | null) => void;
  select: (id: number | null) => void;
  setPanel: (panel: PanelId) => void;
  toggleHeat: () => void;
  /** Test mode: free building, upgrades, heaters and research; time can be scrubbed while paused. */
  toggleTestMode: () => void;
  /** Move the clock while paused (test mode). Does not simulate the skipped time. */
  scrubTo: (minute: number) => void;
  /** Step to the next graphics tier (low → medium → high → low). */
  toggleFx: () => void;
  setFx: (fx: FxQuality) => void;
  setDifficulty: (d: Difficulty) => void;
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
    set({ rev: get().rev + 1, savedAt: sim ? Date.now() : get().savedAt, notice: notice === undefined ? get().notice : notice });
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
    dockOpen: read(DOCK_KEY) !== "0",
    tips: loadTips(),
    selectedId: null,
    panel: null,
    heat: false,
    fx: loadFx(),
    difficulty: loadDifficulty(),
    clauseId: null,
    deals: {},
    notice: null,
    pendingTile: null,
    savedAt: null,
    coarse: false,
    boot: () => {
      const coarse =
        typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
      set({ coarse });
    },
    start: (seed: number) => {
      acc = 0;
      unlockAudio();
      const sim = createGame(seed, get().difficulty);
      set({
        tips: loadTips(),
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
    reset: () => {
      acc = 0;
      clearSave();
      set({
        sim: null,
        phase: "title",
        rev: get().rev + 1,
        buildKind: null,
        selectedId: null,
        panel: null,
        heat: false,
        clauseId: null,
        deals: {},
        notice: null,
        pendingTile: null,
      });
    },
    quit: () => {
      const sim = get().sim;
      if (sim) saveSim(sim);
      acc = 0;
      set({
        sim: null,
        phase: "title",
        rev: get().rev + 1,
        buildKind: null,
        selectedId: null,
        panel: null,
        heat: false,
        notice: null,
        pendingTile: null,
      });
    },
    flushSave: () => {
      const sim = get().sim;
      if (sim && get().phase === "play") {
        saveSim(sim);
        set({ savedAt: Date.now() });
      }
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
      // The Settings overlay holds the clock, like a pause menu.
      if (get().panel === "settings") return;
      if (typeof document !== "undefined" && document.hidden) return;
      acc += Math.min(dt, 0.1) * sim.speed * 10;
      let steps = 0;
      const start = sim.minute;
      while (acc >= 1 && steps < 40) {
        acc -= 1;
        steps += 1;
        stepMinute(sim);
        if (sim.pendingEvent || sim.outcome) break;
      }
      if (sim.minute === start) return;
      // A frame can advance several minutes, so act on the boundaries it crossed rather than
      // on landing exactly on them (which fast speeds and slow frames can skip forever).
      const crossed = (every: number) => Math.floor(sim.minute / every) !== Math.floor(start / every);
      if (sim.outcome) store(PLAYED_KEY, "1");
      if (crossed(10) || sim.pendingEvent || sim.outcome) {
        // Autosave every couple of real seconds at most; hiding the page saves at once anyway.
        const now = Date.now();
        const due = sim.pendingEvent || sim.outcome || now - (get().savedAt ?? 0) > 2000;
        if (due) saveSim(sim);
        touchAudio(sim);
        set({ rev: get().rev + 1, savedAt: due ? now : get().savedAt });
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
    toggleTestMode: () =>
      apply((sim) => {
        sim.testMode = !sim.testMode;
        return { ok: true };
      }),
    scrubTo: (minute) => {
      const sim = get().sim;
      if (!sim || !sim.testMode || sim.speed !== 0) return;
      sim.minute = Math.max(0, Math.round(minute));
      saveSim(sim);
      set({ rev: get().rev + 1 });
    },
    toggleFx: () => get().setFx(FX_ORDER[(FX_ORDER.indexOf(get().fx) + 1) % FX_ORDER.length]!),
    setFx: (fx) => {
      store(FX_KEY, fx);
      set({ fx });
    },
    setTips: (tips) => {
      store(TIPS_KEY, tips ? "on" : "off");
      set({ tips, rev: get().rev + 1 });
    },
    dismissTip: (id) => {
      const sim = get().sim;
      if (!sim) return;
      sim.tipsSeen = [...(sim.tipsSeen ?? []), id];
      saveSim(sim);
      set({ rev: get().rev + 1 });
    },
    toggleDock: () => {
      const dockOpen = !get().dockOpen;
      store(DOCK_KEY, dockOpen ? "1" : "0");
      // Folding the cards away also puts down whatever was about to be built.
      set({ dockOpen, ...(dockOpen ? {} : { buildKind: null, pendingTile: null }), rev: get().rev + 1 });
    },
    setDifficulty: (difficulty) => {
      store(DIFFICULTY_KEY, difficulty);
      set({ difficulty });
    },
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
      if (sim.outcome) store(PLAYED_KEY, "1");
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

// Dev-only handle for inspecting and scrubbing the game from the browser console.
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as { __hearthlaw: typeof useGame }).__hearthlaw = useGame;
}
