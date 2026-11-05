import type {
  Difficulty,
  BuildingKind,
  ChronicleAxis,
  CircleId,
  ClassName,
  ClauseId,
  Deposit,
  ResearchId,
  ResourceKey,
} from "./types";

export const DAY_MINUTES = 1440;
export const VICTORY_MINUTE = 7 * DAY_MINUTES;
export const MAP_RADIUS = 4;

export const CIRCLE_IDS: readonly CircleId[] = [
  "stokers",
  "pathfinders",
  "hearthkin",
  "ledger",
] as const;

export const CIRCLE_NAME: Record<CircleId, string> = {
  stokers: "Stokers",
  pathfinders: "Pathfinders",
  hearthkin: "Hearthkin",
  ledger: "Ledger House",
};

export const CIRCLE_BLURB: Record<CircleId, string> = {
  stokers: "The yards and the night shift. They want full bellies and short watches.",
  pathfinders: "Sledges and the outer ice. They want the valley opened, not closed.",
  hearthkin: "Families and the dead. They want the children kept and the names remembered.",
  ledger: "Stores and wages. They want the books to balance, even in a storm.",
};

export interface Cost {
  timber: number;
  iron: number;
}

export interface BuildingDef {
  kind: BuildingKind;
  name: string;
  blurb: string;
  cost: Cost;
  staff: number;
  staffClass: ClassName | null;
  housing: number;
  insulation: number;
  priority: number;
  category: "shelter" | "provision" | "yard" | "civic";
}

export const BUILDINGS: Record<BuildingKind, BuildingDef> = {
  tent: {
    kind: "tent",
    name: "Canvas Tent",
    blurb: "Ten people under oiled canvas. It keeps the wind off and nothing else.",
    cost: { timber: 10, iron: 0 },
    staff: 0,
    staffClass: null,
    housing: 10,
    insulation: 0,
    priority: 50,
    category: "shelter",
  },
  hut: {
    kind: "hut",
    name: "Timber Hut",
    blurb: "A steep roof and a real wall. One band warmer than canvas.",
    cost: { timber: 20, iron: 5 },
    staff: 0,
    staffClass: null,
    housing: 10,
    insulation: 1,
    priority: 50,
    category: "shelter",
  },
  longhouse: {
    kind: "longhouse",
    name: "Longhouse",
    blurb: "Shared timber hall. The warmest roof you can raise in the cirque.",
    cost: { timber: 30, iron: 10 },
    staff: 0,
    staffClass: null,
    housing: 10,
    insulation: 2,
    priority: 50,
    category: "shelter",
  },
  mess: {
    kind: "mess",
    name: "Mess Hall",
    blurb: "Turns raw provisions into meals. Empty pots are how cities end.",
    cost: { timber: 30, iron: 5 },
    staff: 5,
    staffClass: "labourers",
    housing: 0,
    insulation: 1,
    priority: 3,
    category: "provision",
  },
  trappers: {
    kind: "trappers",
    name: "Trappers' Hut",
    blurb: "Lichen, snares, and whatever the ice gives up. Best on a lichen patch.",
    cost: { timber: 25, iron: 0 },
    staff: 10,
    staffClass: "labourers",
    housing: 0,
    insulation: 0,
    priority: 6,
    category: "provision",
  },
  peat: {
    kind: "peat",
    name: "Peat Cutter",
    blurb: "Cuts fuel from a dark seam. The Kiln eats what this yard raises.",
    cost: { timber: 25, iron: 0 },
    staff: 10,
    staffClass: "labourers",
    housing: 0,
    insulation: 0,
    priority: 5,
    category: "yard",
  },
  wood: {
    kind: "wood",
    name: "Woodcutters' Lodge",
    blurb: "Timber for roofs and sledges. Best on a standing grove.",
    cost: { timber: 20, iron: 0 },
    staff: 10,
    staffClass: "labourers",
    housing: 0,
    insulation: 0,
    priority: 7,
    category: "yard",
  },
  salvage: {
    kind: "salvage",
    name: "Salvage Post",
    blurb: "Picks a scrap heap for iron, timber offcuts, and spilled fuel.",
    cost: { timber: 15, iron: 0 },
    staff: 5,
    staffClass: "labourers",
    housing: 0,
    insulation: 0,
    priority: 8,
    category: "yard",
  },
  ironworks: {
    kind: "ironworks",
    name: "Ironworks",
    blurb: "Specialists burn timber and fuel into iron. Slow, and it never stops being hungry.",
    cost: { timber: 40, iron: 0 },
    staff: 8,
    staffClass: "specialists",
    housing: 0,
    insulation: 0,
    priority: 9,
    category: "yard",
  },
  infirmary: {
    kind: "infirmary",
    name: "Infirmary",
    blurb: "Specialists pull people back from the gravely ill. Warmth does the rest.",
    cost: { timber: 30, iron: 0 },
    staff: 5,
    staffClass: "specialists",
    housing: 0,
    insulation: 1,
    priority: 1,
    category: "civic",
  },
  survey: {
    kind: "survey",
    name: "Survey Hall",
    blurb: "Archivists and fitters. Their notes become radius, lining, and heaters.",
    cost: { timber: 30, iron: 0 },
    staff: 5,
    staffClass: "specialists",
    housing: 0,
    insulation: 1,
    priority: 2,
    category: "civic",
  },
  depot: {
    kind: "depot",
    name: "Depot",
    blurb: "Raises the yards' stores so a good week is not spilled on the ice.",
    cost: { timber: 15, iron: 0 },
    staff: 0,
    staffClass: null,
    housing: 0,
    insulation: 0,
    priority: 40,
    category: "civic",
  },
  vent: {
    kind: "vent",
    name: "Relay Vent",
    blurb: "Carries the Kiln's heat one ring outward. Burns a little fuel of its own.",
    cost: { timber: 20, iron: 15 },
    staff: 0,
    staffClass: null,
    housing: 0,
    insulation: 0,
    priority: 20,
    category: "civic",
  },
};

export const DEPOSIT_NAMES: Record<Exclude<Deposit, "none">, string> = {
  peat: "Peat seam",
  timber: "Standing grove",
  scrap: "Scrap heap",
  lichen: "Lichen patch",
};

/**
 * Yards that draw from a deposit: what they raise per work hour at full crew,
 * on their deposit and off it. `off: 0` means the yard cannot stand anywhere else.
 */
export interface ExtractionDef {
  deposit: Exclude<Deposit, "none">;
  yieldOn: string;
  on: number;
  off: number;
  resource: ResourceKey;
}

export const EXTRACTION: Partial<Record<BuildingKind, ExtractionDef>> = {
  peat: { deposit: "peat", resource: "fuel", on: 8, off: 2, yieldOn: "+8 fuel/h" },
  wood: { deposit: "timber", resource: "timber", on: 8, off: 2, yieldOn: "+8 timber/h" },
  trappers: { deposit: "lichen", resource: "raw", on: 4, off: 1, yieldOn: "+4 raw/h" },
  salvage: { deposit: "scrap", resource: "iron", on: 2, off: 0, yieldOn: "+2 iron, +3 timber, +3 fuel/h" },
};

export const DOCK_ORDER: BuildingKind[] = [
  "tent",
  "mess",
  "trappers",
  "peat",
  "wood",
  "salvage",
  "ironworks",
  "infirmary",
  "survey",
  "depot",
  "vent",
];

export type Stance = "for" | "against" | "undecided";

export interface ClauseDef {
  id: ClauseId;
  name: string;
  book: "Survival";
  summary: string;
  effect: string;
  excludes?: ClauseId;
  requires?: ClauseId;
  stance: Record<CircleId, Stance>;
  axis: ChronicleAxis;
  delta: number;
}

export const CLAUSES: Record<ClauseId, ClauseDef> = {
  "thin-broth": {
    id: "thin-broth",
    name: "Thin Broth",
    book: "Survival",
    summary: "Stretch every pot. Three meals from one measure of raw provisions.",
    effect: "Cooking yields ×1.5. Grievance rises while the pots stay thin.",
    excludes: "bulked-bread",
    stance: { stokers: "against", pathfinders: "undecided", hearthkin: "against", ledger: "for" },
    axis: "lives",
    delta: -4,
  },
  "bulked-bread": {
    id: "bulked-bread",
    name: "Bulked Bread",
    book: "Survival",
    summary: "Sawdust and lichen flour. More meals, and some of them make people sick.",
    effect: "Cooking yields about +33%. Each dawn, a few diners fall ill.",
    excludes: "thin-broth",
    stance: { stokers: "against", pathfinders: "undecided", hearthkin: "against", ledger: "for" },
    axis: "lives",
    delta: -6,
  },
  "long-watch": {
    id: "long-watch",
    name: "Long Watch",
    book: "Survival",
    summary: "Fourteen-hour shifts, from dawn until the late bell.",
    effect: "Yards work 14 hours. Grievance climbs with the extra watch.",
    stance: { stokers: "against", pathfinders: "for", hearthkin: "against", ledger: "for" },
    axis: "liberty",
    delta: -4,
  },
  "endless-watch": {
    id: "endless-watch",
    name: "Endless Watch",
    book: "Survival",
    summary: "The yards do not close. People sleep in their coats, if they sleep.",
    effect: "Yards work all day and night. Injuries and grievance rise sharply.",
    requires: "long-watch",
    stance: { stokers: "against", pathfinders: "undecided", hearthkin: "against", ledger: "for" },
    axis: "liberty",
    delta: -10,
  },
  "small-hands": {
    id: "small-hands",
    name: "Small Hands",
    book: "Survival",
    summary: "Dependents take safe work in the yards. The Chronicle will remember.",
    effect: "Half of healthy dependents count as labourers. A heavy Kinship mark.",
    excludes: "childrens-hall",
    stance: { stokers: "for", pathfinders: "for", hearthkin: "against", ledger: "for" },
    axis: "kinship",
    delta: -18,
  },
  "childrens-hall": {
    id: "childrens-hall",
    name: "Children's Hall",
    book: "Survival",
    summary: "A warm room and lessons. Dependents do not work.",
    effect: "Dependents stay out of the yards. Resolve rises a little each hour.",
    excludes: "small-hands",
    stance: { stokers: "against", pathfinders: "undecided", hearthkin: "for", ledger: "against" },
    axis: "kinship",
    delta: 10,
  },
  "ash-field": {
    id: "ash-field",
    name: "Ash Field",
    book: "Survival",
    summary: "A marked field for the dead, and an hour to say the names.",
    effect: "Funerals soften the blow of each death to Resolve.",
    excludes: "cold-storage",
    stance: { stokers: "undecided", pathfinders: "undecided", hearthkin: "for", ledger: "against" },
    axis: "kinship",
    delta: 8,
  },
  "cold-storage": {
    id: "cold-storage",
    name: "Cold Storage of the Dead",
    book: "Survival",
    summary: "The ice keeps bodies. The lichen yards use what the living can spare to say aloud.",
    effect: "Each death returns a little raw provision. Kinship and Truth fall.",
    excludes: "ash-field",
    stance: { stokers: "undecided", pathfinders: "for", hearthkin: "against", ledger: "for" },
    axis: "truth",
    delta: -14,
  },
  triage: {
    id: "triage",
    name: "Triage",
    book: "Survival",
    summary: "The infirmary treats those it can save. The gravely ill are let go.",
    effect: "Ill are cured faster. Gravely ill die sooner. A Lives mark.",
    excludes: "every-life",
    stance: { stokers: "undecided", pathfinders: "for", hearthkin: "against", ledger: "for" },
    axis: "lives",
    delta: -12,
  },
  "every-life": {
    id: "every-life",
    name: "Every Life",
    book: "Survival",
    summary: "No one is written off. The sick draw extra meals.",
    effect: "Infirmary cures more, including the gravely ill. Sick people eat half again.",
    excludes: "triage",
    stance: { stokers: "for", pathfinders: "against", hearthkin: "for", ledger: "against" },
    axis: "lives",
    delta: 10,
  },
  "still-house": {
    id: "still-house",
    name: "Still House",
    book: "Survival",
    summary: "A small room, a bitter drink, a song. It spends fuel and meals.",
    effect: "Grievance falls each hour while the still can be fed.",
    stance: { stokers: "for", pathfinders: "undecided", hearthkin: "for", ledger: "against" },
    axis: "liberty",
    delta: 2,
  },
};

export const CLAUSE_ORDER: ClauseId[] = [
  "thin-broth",
  "bulked-bread",
  "long-watch",
  "endless-watch",
  "small-hands",
  "childrens-hall",
  "ash-field",
  "cold-storage",
  "triage",
  "every-life",
  "still-house",
];

export interface ResearchDef {
  id: ResearchId;
  name: string;
  blurb: string;
  points: number;
  cost: Cost;
}

export const RESEARCH: Record<ResearchId, ResearchDef> = {
  "wider-mouth": {
    id: "wider-mouth",
    name: "Wider Mouth",
    blurb: "Open the Kiln's radius by one ring. Heat reaches further, and drinks deeper.",
    points: 36,
    cost: { timber: 20, iron: 0 },
  },
  "ash-lining": {
    id: "ash-lining",
    name: "Ash Lining",
    blurb: "Pack ash into every housing wall. All shelters gain one band of insulation.",
    points: 48,
    cost: { timber: 30, iron: 0 },
  },
  dampers: {
    id: "dampers",
    name: "Surge Dampers",
    blurb: "The Kiln's overpressure strains more slowly. The breaking still comes.",
    points: 42,
    cost: { timber: 10, iron: 15 },
  },
  heaters: {
    id: "heaters",
    name: "Hearth Heaters",
    blurb: "Workshops and halls can fit a heater. Each one burns fuel for one warmer band.",
    points: 30,
    cost: { timber: 0, iron: 10 },
  },
};

export const RESEARCH_ORDER: ResearchId[] = ["heaters", "wider-mouth", "ash-lining", "dampers"];

export const WARMTH_LABELS: { max: number; label: string }[] = [
  { max: -4, label: "Lethal" },
  { max: -3, label: "Freezing" },
  { max: -2, label: "Bitter" },
  { max: -1, label: "Cold" },
  { max: 0, label: "Chilly" },
  { max: 1, label: "Livable" },
  { max: 2, label: "Comfortable" },
];

export function warmthLabel(w: number): string {
  for (const row of WARMTH_LABELS) if (w <= row.max) return row.label;
  return "Warm";
}

export function dayIndex(minute: number): number {
  return Math.floor(minute / DAY_MINUTES);
}

/** Daytime baseline °C. The Hush is days 6 and 7 (indices 5 and 6). */
export function dayBaseTemp(index0: number): number {
  if (index0 === 5 || index0 === 6) return -60;
  if (index0 >= 7) return -34;
  return -20 - index0 * 2;
}

export function clockOf(minute: number): { day: number; hour: number; min: number } {
  const day = dayIndex(minute) + 1;
  const rem = ((minute % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  return { day, hour: Math.floor(rem / 60), min: rem % 60 };
}

export function formatClock(minute: number): string {
  const c = clockOf(minute);
  const hh = String(c.hour).padStart(2, "0");
  const mm = String(c.min).padStart(2, "0");
  return `Day ${c.day} · ${hh}:${mm}`;
}

/** Hush nights fall further than ordinary ones. */
export function nightDrop(index0: number): number {
  return index0 === 5 || index0 === 6 ? -15 : -10;
}

export function outdoorTemp(minute: number): number {
  const c = clockOf(minute);
  const night = c.hour >= 20 || c.hour < 6;
  return dayBaseTemp(dayIndex(minute)) + (night ? nightDrop(dayIndex(minute)) : 0);
}

export function outdoorBand(tempC: number): number {
  return Math.floor(tempC / 10) + 2;
}

export const BASE_CAPS: Record<ResourceKey, number> = {
  fuel: 1600,
  timber: 900,
  iron: 400,
  raw: 500,
  meals: 1200,
};

export const DEPOT_BONUS: Record<ResourceKey, number> = {
  fuel: 800,
  timber: 500,
  iron: 250,
  raw: 300,
  meals: 600,
};

export interface DifficultyDef {
  label: string;
  blurb: string;
  /** Scales the convoy's opening fuel, timber and meals. */
  stores: number;
  /** Scales how fast the cold makes people ill, worse, and dead. */
  cold: number;
  /** Chance per hour that a medic on shift cures someone. */
  cure: number;
  /** Scales the Kiln's fuel draw. */
  burn: number;
  /** Scales hourly grievance from cold, hunger and grief. */
  grievance: number;
}

/** Medium is the tuned game; easy and hard bend the same rules rather than adding new ones. */
export const DIFFICULTY: Record<Difficulty, DifficultyDef> = {
  easy: { label: "Easy", blurb: "Fuller stores, a gentler cold, quicker healers.", stores: 1.25, cold: 0.6, cure: 0.45, burn: 0.85, grievance: 0.5 },
  medium: { label: "Medium", blurb: "The watch as written.", stores: 1, cold: 1, cure: 0.3, burn: 1, grievance: 1 },
  hard: { label: "Hard", blurb: "Thin stores, a cold that bites deep, a hungry Kiln.", stores: 0.9, cold: 1.25, cure: 0.25, burn: 1, grievance: 1.15 },
};

export function difficultyOf(sim: { difficulty?: Difficulty }): DifficultyDef {
  return DIFFICULTY[sim.difficulty ?? "medium"];
}
