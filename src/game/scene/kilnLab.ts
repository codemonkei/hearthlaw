import { create } from "zustand";

/*
 * Kiln Lab: switch the Kiln's candidate features on and off, and preview its states
 * (pressure, surge, strain) without touching the simulation. Presentation only.
 * Choices are remembered in this browser.
 */

export type KilnFeature = "presence" | "age" | "mechanism" | "life" | "feedback";

export const KILN_FEATURES: { id: KilnFeature; label: string; hint: string }[] = [
  { id: "presence", label: "Presence", hint: "Taller, broader, a higher plinth" },
  { id: "age", label: "Age", hint: "Rust, patches, soot, frost on the drum" },
  { id: "mechanism", label: "Mechanism", hint: "Second stack, valve ring, ladder, catwalk, steam vent" },
  { id: "life", label: "Life", hint: "Peat, cart, tools, braziers, workers" },
  { id: "feedback", label: "Feedback", hint: "Pipes glow, frost melts, strain cracks" },
];

export interface KilnPreview {
  on: boolean;
  pressure: number;
  surge: boolean;
  /** 0..1000, like the sim. */
  strain: number;
}

interface KilnLabState {
  features: Record<KilnFeature, boolean>;
  preview: KilnPreview;
  open: boolean;
  toggle: (f: KilnFeature) => void;
  setPreview: (p: Partial<KilnPreview>) => void;
  setOpen: (open: boolean) => void;
}

const KEY = "hearthlaw.kilnlab";

function load(): Pick<KilnLabState, "features" | "preview" | "open"> {
  const fallback = {
    features: { presence: true, age: true, mechanism: true, life: true, feedback: true },
    preview: { on: false, pressure: 2, surge: false, strain: 0 },
    open: true,
  };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return fallback;
    const saved = JSON.parse(raw) as Partial<typeof fallback>;
    return {
      features: { ...fallback.features, ...saved.features },
      preview: { ...fallback.preview, ...saved.preview },
      open: saved.open ?? true,
    };
  } catch {
    return fallback;
  }
}

function persist(s: Pick<KilnLabState, "features" | "preview" | "open">) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ features: s.features, preview: s.preview, open: s.open }));
  } catch {
    /* storage blocked — the lab still works this session */
  }
}

export const useKilnLab = create<KilnLabState>((set, get) => ({
  ...load(),
  toggle: (f) => {
    set({ features: { ...get().features, [f]: !get().features[f] } });
    persist(get());
  },
  setPreview: (p) => {
    set({ preview: { ...get().preview, ...p } });
    persist(get());
  },
  setOpen: (open) => {
    set({ open });
    persist(get());
  },
}));
