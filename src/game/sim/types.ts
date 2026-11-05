export type ClassName = "labourers" | "specialists" | "dependents";

export interface Cohort {
  labourers: number;
  specialists: number;
  dependents: number;
}

export interface Population {
  healthy: Cohort;
  ill: Cohort;
  gravely: Cohort;
  dead: number;
  hungerDays: number;
}

export type ResourceKey = "fuel" | "timber" | "iron" | "raw" | "meals";

export type Resources = Record<ResourceKey, number>;

export type BuildingKind =
  | "tent"
  | "hut"
  | "longhouse"
  | "mess"
  | "trappers"
  | "peat"
  | "wood"
  | "salvage"
  | "ironworks"
  | "infirmary"
  | "survey"
  | "depot"
  | "vent";

export type Deposit = "none" | "peat" | "timber" | "scrap" | "lichen";

export interface Tile {
  q: number;
  r: number;
  deposit: Deposit;
  depositLeft: number;
  buildingId: number | null;
}

export interface Building {
  id: number;
  kind: BuildingKind;
  q: number;
  r: number;
  heater: boolean;
  /** Set each hour: this heater actually burned fuel. */
  heaterFed: boolean;
}

export type CircleId = "stokers" | "pathfinders" | "hearthkin" | "ledger";

export interface CircleState {
  trust: number;
  seats: number;
}

export type ClauseId =
  | "thin-broth"
  | "bulked-bread"
  | "long-watch"
  | "endless-watch"
  | "small-hands"
  | "childrens-hall"
  | "ash-field"
  | "cold-storage"
  | "triage"
  | "every-life"
  | "still-house";

export type ResearchId = "wider-mouth" | "ash-lining" | "dampers" | "heaters";

export type ChronicleAxis = "lives" | "liberty" | "kinship" | "truth";

export interface ChronicleMark {
  minute: number;
  text: string;
  axis: ChronicleAxis;
  delta: number;
}

export interface LogLine {
  minute: number;
  text: string;
}

export interface PromiseMark {
  circle: CircleId;
  due: number;
  grievanceAt: number;
  text: string;
  /** A promise to inscribe a clause is kept by inscribing it, not by the city's mood. */
  clause?: ClauseId;
}

export type DealKind = "tribute-fuel" | "tribute-meals" | "promise";

export type Terrain = "pit" | "hill";

export type Difficulty = "easy" | "medium" | "hard";

export interface SimState {
  seed: number;
  /** Pit: the city sinks toward the Kiln. Hill: it climbs to it. */
  terrain: Terrain;
  /** Set at the start; old saves without it play as medium. */
  difficulty?: Difficulty;
  /** Test mode: building, upgrades, heaters and research cost nothing. Off in normal play. */
  testMode?: boolean;
  rng: [number, number, number, number];
  minute: number;
  speed: 0 | 1 | 2 | 4;
  resources: Resources;
  pop: Population;
  kiln: {
    pressure: 0 | 1 | 2 | 3 | 4;
    radius: 1 | 2 | 3 | 4;
    surge: boolean;
    strain: number;
    crisisCount: number;
    crisisLatched: boolean;
    running: boolean;
  };
  morale: {
    resolve: number;
    grievance: number;
    /** Minute the ultimatum ends, or null. */
    reckoningUntil: number | null;
  };
  circles: Record<CircleId, CircleState>;
  clauses: Partial<Record<ClauseId, { at: number }>>;
  research: { points: number; unlocked: ResearchId[] };
  insulationBonus: number;
  strainRise: number;
  tiles: Tile[];
  buildings: Building[];
  nextBuildingId: number;
  log: LogLine[];
  chronicle: Record<ChronicleAxis, number> & { marks: ChronicleMark[] };
  pendingEvent: string | null;
  eventFlags: Record<string, boolean>;
  promises: PromiseMark[];
  peatOfflineUntil: number;
  outcome: null | "exile" | "kiln" | "empty" | "endured";
  stats: { signed: number; deaths: number; mealsServed: number };
  muted: boolean;
}

export interface StaffRow {
  id: number;
  kind: BuildingKind;
  assigned: number;
  need: number;
  warmth: number;
}

export interface EconomySnapshot {
  rows: StaffRow[];
  housingCap: number;
  living: number;
  sheltered: number;
  unsheltered: number;
  burn: number;
  canRunKiln: boolean;
  labourFree: number;
  specialistFree: number;
  caps: Resources;
}
