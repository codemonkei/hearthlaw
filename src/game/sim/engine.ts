import {
  BASE_CAPS,
  BUILDINGS,
  CIRCLE_IDS,
  CLAUSES,
  DAY_MINUTES,
  DEPOT_BONUS,
  DEPOSIT_NAMES,
  EXTRACTION,
  MAP_RADIUS,
  warmthLabel,
  RESEARCH,
  VICTORY_MINUTE,
  dayIndex,
  outdoorBand,
  outdoorTemp,
} from "./content";
import { hexDist, hexRange } from "./hex";
import { clamp, rand, rollCount, seedRng } from "./rng";
import type {
  Deposit,
  Terrain,
  Building,
  BuildingKind,
  ChronicleAxis,
  CircleId,
  ClassName,
  ClauseId,
  Cohort,
  DealKind,
  EconomySnapshot,
  ResearchId,
  ResourceKey,
  Resources,
  SimState,
  StaffRow,
  Tile,
} from "./types";

const CLASSES: ClassName[] = ["labourers", "specialists", "dependents"];

export function emptyCohort(): Cohort {
  return { labourers: 0, specialists: 0, dependents: 0 };
}

export function cohortSum(c: Cohort): number {
  return c.labourers + c.specialists + c.dependents;
}

export function livingCount(sim: SimState): number {
  return cohortSum(sim.pop.healthy) + cohortSum(sim.pop.ill) + cohortSum(sim.pop.gravely);
}

export function hasClause(sim: SimState, id: ClauseId): boolean {
  return sim.clauses[id] != null;
}

export function pushLog(sim: SimState, text: string): void {
  sim.log.unshift({ minute: sim.minute, text });
  if (sim.log.length > 18) sim.log.length = 18;
}

export function markChronicle(sim: SimState, axis: ChronicleAxis, delta: number, text: string): void {
  sim.chronicle[axis] = clamp(sim.chronicle[axis] + delta, 0, 100);
  sim.chronicle.marks.unshift({ minute: sim.minute, text, axis, delta });
  if (sim.chronicle.marks.length > 24) sim.chronicle.marks.length = 24;
}

export function kilnBurn(pressure: number, radius: number): number {
  if (pressure <= 0) return 0;
  return 2 * pressure * (radius + 1);
}

export function heatLevel(sim: SimState): number {
  if (!sim.kiln.running || sim.kiln.pressure <= 0) return 0;
  return sim.kiln.pressure + (sim.kiln.surge ? 1 : 0);
}

/** Inside the Kiln's radius or beside a relay vent — warmed whenever the Kiln burns. */
export function inWarmth(sim: SimState, q: number, r: number): boolean {
  if (hexDist(q, r) <= sim.kiln.radius) return true;
  return sim.buildings.some((b) => b.kind === "vent" && hexDist(q, r, b.q, b.r) <= 1);
}

export function sourceAt(sim: SimState, q: number, r: number): number {
  const level = heatLevel(sim);
  if (level <= 0) return 0;
  return inWarmth(sim, q, r) ? level : 0;
}

export function buildingWarmth(sim: SimState, b: Building): number {
  const band = outdoorBand(outdoorTemp(sim.minute));
  const def = BUILDINGS[b.kind];
  const ins = def.insulation + (def.housing > 0 ? sim.insulationBonus : 0);
  const heater = b.heater && b.heaterFed ? 1 : 0;
  return band + sourceAt(sim, b.q, b.r) + ins + heater;
}

export function streetWarmth(sim: SimState): number {
  const band = outdoorBand(outdoorTemp(sim.minute));
  return band + sourceAt(sim, 1, 0) - 1;
}

export function storageCaps(sim: SimState): Resources {
  const depots = sim.buildings.filter((b) => b.kind === "depot").length;
  const caps = { ...BASE_CAPS };
  for (const key of Object.keys(caps) as ResourceKey[]) {
    caps[key] += depots * DEPOT_BONUS[key];
  }
  return caps;
}

function addResource(sim: SimState, key: ResourceKey, amount: number): number {
  if (amount <= 0) return 0;
  const cap = storageCaps(sim)[key];
  const next = Math.min(cap, sim.resources[key] + amount);
  const spilled = sim.resources[key] + amount - next;
  sim.resources[key] = next;
  return spilled;
}

function spend(sim: SimState, key: ResourceKey, amount: number): boolean {
  if (sim.resources[key] < amount) return false;
  sim.resources[key] -= amount;
  return true;
}

export function canAfford(sim: SimState, timber: number, iron: number): boolean {
  return sim.resources.timber >= timber && sim.resources.iron >= iron;
}

function workHour(sim: SimState, hour: number): boolean {
  if (hasClause(sim, "endless-watch")) return true;
  if (hasClause(sim, "long-watch")) return hour >= 6 && hour < 20;
  return hour >= 6 && hour < 16;
}

function completedHour(minute: number): number {
  const rem = (minute - 1) % DAY_MINUTES;
  return Math.floor(rem / 60);
}

export function evaluate(sim: SimState): EconomySnapshot {
  const living = livingCount(sim);
  const housing = sim.buildings.filter((b) => BUILDINGS[b.kind].housing > 0);
  const housingCap = housing.reduce((n, b) => n + BUILDINGS[b.kind].housing, 0);
  const sheltered = Math.min(living, housingCap);
  let labourPool =
    sim.pop.healthy.labourers +
    (hasClause(sim, "small-hands") ? Math.floor(sim.pop.healthy.dependents / 2) : 0);
  let specPool = sim.pop.healthy.specialists;
  const ordered = [...sim.buildings].sort(
    (a, b) => BUILDINGS[a.kind].priority - BUILDINGS[b.kind].priority || a.id - b.id,
  );
  const rows: StaffRow[] = [];
  for (const b of ordered) {
    const def = BUILDINGS[b.kind];
    let assigned = 0;
    if (def.staff > 0 && def.staffClass === "labourers") {
      assigned = Math.min(def.staff, labourPool);
      labourPool -= assigned;
    } else if (def.staff > 0 && def.staffClass === "specialists") {
      assigned = Math.min(def.staff, specPool);
      specPool -= assigned;
    }
    rows.push({
      id: b.id,
      kind: b.kind,
      assigned,
      need: def.staff,
      warmth: buildingWarmth(sim, b),
    });
  }
  const burn = kilnBurn(sim.kiln.pressure, sim.kiln.radius);
  return {
    rows,
    housingCap,
    living,
    sheltered,
    unsheltered: Math.max(0, living - housingCap),
    burn,
    canRunKiln: sim.kiln.pressure === 0 || sim.resources.fuel >= burn,
    labourFree: labourPool,
    specialistFree: specPool,
    caps: storageCaps(sim),
  };
}

function staffOf(eco: EconomySnapshot, id: number): StaffRow | undefined {
  return eco.rows.find((r) => r.id === id);
}

function killFrom(sim: SimState, n: number): number {
  let left = n;
  const order: { bag: Cohort }[] = [
    { bag: sim.pop.gravely },
    { bag: sim.pop.ill },
    { bag: sim.pop.healthy },
  ];
  const classOrder: ClassName[] = ["dependents", "labourers", "specialists"];
  let died = 0;
  for (const bag of order) {
    for (const cls of classOrder) {
      if (left <= 0) break;
      const take = Math.min(left, bag.bag[cls]);
      bag.bag[cls] -= take;
      left -= take;
      died += take;
    }
  }
  sim.pop.dead += died;
  sim.stats.deaths += died;
  return died;
}

function shiftCohort(
  from: Cohort,
  to: Cohort | null,
  cls: ClassName,
  n: number,
): number {
  const take = Math.min(n, from[cls]);
  from[cls] -= take;
  if (to) to[cls] += take;
  return take;
}

/** Derived from the seed without drawing from the rng, so the sim sequence is unchanged. */
export function terrainForSeed(seed: number): Terrain {
  return (seed >>> 0) % 2 === 0 ? "pit" : "hill";
}

export function createGame(seed: number): SimState {
  const sim: SimState = {
    seed,
    terrain: terrainForSeed(seed),
    rng: seedRng(seed),
    minute: 6 * 60,
    speed: 1,
    resources: { fuel: 460, timber: 240, iron: 46, raw: 70, meals: 320 },
    pop: {
      healthy: { labourers: 46, specialists: 16, dependents: 18 },
      ill: emptyCohort(),
      gravely: emptyCohort(),
      dead: 0,
      hungerDays: 0,
    },
    kiln: {
      pressure: 1,
      radius: 1,
      surge: false,
      strain: 0,
      crisisCount: 0,
      crisisLatched: false,
      running: true,
    },
    morale: { resolve: 640, grievance: 260, reckoningUntil: null },
    circles: {
      stokers: { trust: 58, seats: 18 },
      pathfinders: { trust: 52, seats: 14 },
      hearthkin: { trust: 64, seats: 16 },
      ledger: { trust: 50, seats: 12 },
    },
    clauses: {},
    research: { points: 0, unlocked: [] },
    insulationBonus: 0,
    strainRise: 50,
    tiles: [],
    buildings: [],
    nextBuildingId: 1,
    log: [],
    chronicle: { lives: 58, liberty: 62, kinship: 64, truth: 60, marks: [] },
    pendingEvent: null,
    eventFlags: {},
    promises: [],
    peatOfflineUntil: 0,
    outcome: null,
    stats: { signed: 0, deaths: 0, mealsServed: 0 },
    muted: false,
  };
  sim.tiles = makeTiles(sim);
  pushLog(sim, "The convoy is inside the cirque. The Kiln still breathes.");
  sim.pendingEvent = "arrival";
  return sim;
}

function makeTiles(sim: SimState): Tile[] {
  const coords = hexRange(MAP_RADIUS);
  const tiles: Tile[] = coords.map((c) => ({
    q: c.q,
    r: c.r,
    deposit: "none" as const,
    depositLeft: 0,
    buildingId: null,
  }));
  const open = tiles.filter((t) => !(t.q === 0 && t.r === 0));
  for (let i = open.length - 1; i > 0; i--) {
    const j = Math.floor(rand(sim) * (i + 1));
    const a = open[i]!;
    const b = open[j]!;
    open[i] = b;
    open[j] = a;
  }
  const take = (pred: (t: Tile) => boolean, n: number, kind: Tile["deposit"], amount: number) => {
    let left = n;
    for (const t of open) {
      if (left <= 0) break;
      if (t.deposit !== "none") continue;
      if (!pred(t)) continue;
      t.deposit = kind;
      t.depositLeft = amount;
      left--;
    }
  };
  take((t) => hexDist(t.q, t.r) >= 2, 7, "peat", 900);
  take((t) => hexDist(t.q, t.r) >= 2, 6, "timber", 700);
  take((t) => hexDist(t.q, t.r) >= 2, 4, "scrap", 320);
  take((t) => hexDist(t.q, t.r) >= 2, 4, "lichen", 640);
  return tiles;
}

/** A tile's deposit, or "none" once it has been worked out. */
export function liveDeposit(tile: Tile): Deposit {
  return tile.deposit !== "none" && tile.depositLeft > 0 ? tile.deposit : "none";
}

export type TileFit = "best" | "ok" | "poor" | "blocked";

export interface PlacementFit {
  fit: TileFit;
  /** One short line: the yield, the warmth, or why not. */
  note: string;
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0";
}

/** Warmth a building of this kind would have on this tile right now. */
export function warmthIfBuilt(sim: SimState, kind: BuildingKind, q: number, r: number): number {
  const def = BUILDINGS[kind];
  const ins = def.insulation + (def.housing > 0 ? sim.insulationBonus : 0);
  return outdoorBand(outdoorTemp(sim.minute)) + sourceAt(sim, q, r) + ins;
}

/** How well a building would sit on a tile. Pure: the scene and the dock both read it. */
export function assessPlacement(sim: SimState, kind: BuildingKind, q: number, r: number): PlacementFit {
  const tile = tileAt(sim, q, r);
  if (!tile) return { fit: "blocked", note: "Beyond the cirque." };
  if (q === 0 && r === 0) return { fit: "blocked", note: "The Kiln stands here." };
  if (tile.buildingId != null) return { fit: "blocked", note: "Something already stands here." };
  const deposit = liveDeposit(tile);
  const covers = deposit === "none" ? "" : `Covers a ${DEPOSIT_NAMES[deposit].toLowerCase()}`;

  const ex = EXTRACTION[kind];
  if (ex) {
    const want = DEPOSIT_NAMES[ex.deposit].toLowerCase();
    if (deposit === ex.deposit) return { fit: "best", note: `${ex.yieldOn} · ${tile.depositLeft} left` };
    if (ex.off === 0) return { fit: "blocked", note: `Only stands on a ${want}.` };
    return { fit: "poor", note: `+${ex.off} ${ex.resource}/h · no ${want}${covers ? ` · ${covers.toLowerCase()}` : ""}` };
  }

  if (kind === "vent") {
    let fresh = 0;
    for (const t of sim.tiles) {
      if (hexDist(t.q, t.r, q, r) <= 1 && !inWarmth(sim, t.q, t.r)) fresh++;
    }
    const note = fresh > 0 ? `Warms ${fresh} more tile${fresh === 1 ? "" : "s"}` : "Warms nothing new";
    if (covers) return { fit: "poor", note: `${note} · ${covers.toLowerCase()}` };
    return { fit: fresh >= 3 ? "best" : fresh > 0 ? "ok" : "poor", note };
  }

  if (BUILDINGS[kind].housing > 0) {
    const w = warmthIfBuilt(sim, kind, q, r);
    const inside = `${warmthLabel(w)} inside (${signed(w)})`;
    if (covers) return { fit: "poor", note: `${inside} · ${covers.toLowerCase()}` };
    if (!inWarmth(sim, q, r)) return { fit: "poor", note: `${inside} · outside the warmth` };
    return { fit: "best", note: inside };
  }

  if (covers) return { fit: "poor", note: `${covers} other yards could use` };
  return { fit: "ok", note: "Clear ground" };
}

/** A short dock line: where this building belongs and how many such tiles are free. */
export function placementHint(sim: SimState, kind: BuildingKind): string {
  const best = sim.tiles.filter((t) => assessPlacement(sim, kind, t.q, t.r).fit === "best").length;
  const ex = EXTRACTION[kind];
  if (ex) {
    const name = DEPOSIT_NAMES[ex.deposit].toLowerCase();
    return `${ex.off === 0 ? "Only on" : "Best on"} ${name} · ${best} free`;
  }
  if (kind === "vent") return `Best at the warmth's edge · ${best} spots`;
  if (BUILDINGS[kind].housing > 0) return `Best inside the warmth · ${best} free`;
  return "Any clear ground";
}

/** Hover line for a tile with nothing being placed. */
export function describeTile(sim: SimState, q: number, r: number): { title: string; detail: string } | null {
  const tile = tileAt(sim, q, r);
  if (!tile) return null;
  if (q === 0 && r === 0) return { title: "The Kiln", detail: `Radius ${sim.kiln.radius} · pressure ${sim.kiln.pressure}` };
  const b = tile.buildingId != null ? sim.buildings.find((x) => x.id === tile.buildingId) : undefined;
  if (b) {
    const w = buildingWarmth(sim, b);
    return { title: BUILDINGS[b.kind].name, detail: `${warmthLabel(w)} (${signed(w)})` };
  }
  const deposit = liveDeposit(tile);
  const w = outdoorBand(outdoorTemp(sim.minute)) + sourceAt(sim, q, r);
  const title = deposit === "none" ? (tile.deposit === "none" ? "Open snow" : "Worked-out ground") : DEPOSIT_NAMES[deposit];
  const left = deposit === "none" ? "" : ` · ${tile.depositLeft} left`;
  return { title, detail: `${warmthLabel(w)} (${signed(w)})${left}` };
}

export function tileAt(sim: SimState, q: number, r: number): Tile | undefined {
  return sim.tiles.find((t) => t.q === q && t.r === r);
}

export function placeBuilding(
  sim: SimState,
  kind: BuildingKind,
  q: number,
  r: number,
): { ok: boolean; reason?: string } {
  if (sim.outcome) return { ok: false, reason: "The watch is over." };
  const tile = tileAt(sim, q, r);
  const fit = assessPlacement(sim, kind, q, r);
  if (!tile || fit.fit === "blocked") return { ok: false, reason: fit.note };
  const def = BUILDINGS[kind];
  if (!canAfford(sim, def.cost.timber, def.cost.iron)) {
    return { ok: false, reason: "Not enough timber or iron." };
  }
  sim.resources.timber -= def.cost.timber;
  sim.resources.iron -= def.cost.iron;
  const building: Building = {
    id: sim.nextBuildingId++,
    kind,
    q,
    r,
    heater: false,
    heaterFed: false,
  };
  sim.buildings.push(building);
  tile.buildingId = building.id;
  pushLog(sim, `${def.name} raised.`);
  return { ok: true };
}

export function upgradeBuilding(sim: SimState, id: number): { ok: boolean; reason?: string } {
  const b = sim.buildings.find((x) => x.id === id);
  if (!b) return { ok: false, reason: "Missing." };
  const next: Partial<Record<BuildingKind, BuildingKind>> = { tent: "hut", hut: "longhouse" };
  const to = next[b.kind];
  if (!to) return { ok: false, reason: "This cannot be raised further." };
  const def = BUILDINGS[to];
  if (!canAfford(sim, def.cost.timber, def.cost.iron)) {
    return { ok: false, reason: "Not enough timber or iron." };
  }
  sim.resources.timber -= def.cost.timber;
  sim.resources.iron -= def.cost.iron;
  b.kind = to;
  pushLog(sim, `Raised to a ${def.name}.`);
  return { ok: true };
}

export function demolishBuilding(sim: SimState, id: number): { ok: boolean; reason?: string } {
  const idx = sim.buildings.findIndex((b) => b.id === id);
  if (idx < 0) return { ok: false, reason: "Missing." };
  const b = sim.buildings[idx]!;
  const def = BUILDINGS[b.kind];
  sim.buildings.splice(idx, 1);
  const tile = tileAt(sim, b.q, b.r);
  if (tile) tile.buildingId = null;
  addResource(sim, "timber", Math.floor(def.cost.timber / 2));
  addResource(sim, "iron", Math.floor(def.cost.iron / 2));
  pushLog(sim, `${def.name} taken down. Half the materials came back.`);
  return { ok: true };
}

export function setPressure(sim: SimState, pressure: 0 | 1 | 2 | 3 | 4): void {
  sim.kiln.pressure = pressure;
  if (pressure === 0) sim.kiln.surge = false;
  pushLog(sim, pressure === 0 ? "The Kiln is banked." : `Kiln pressure set to ${pressure}.`);
}

export function setRadius(sim: SimState, radius: 1 | 2 | 3 | 4): { ok: boolean; reason?: string } {
  const max = maxRadius(sim);
  if (radius > max) return { ok: false, reason: "The mouth is not wide enough yet." };
  sim.kiln.radius = radius;
  pushLog(sim, `Heat radius set to ${radius}.`);
  return { ok: true };
}

export function maxRadius(sim: SimState): 1 | 2 | 3 | 4 {
  const extra = sim.research.unlocked.includes("wider-mouth") ? 1 : 0;
  return Math.min(4, 2 + extra) as 1 | 2 | 3 | 4;
}

export function toggleSurge(sim: SimState): { ok: boolean; reason?: string } {
  if (sim.kiln.pressure <= 0) return { ok: false, reason: "The Kiln is banked." };
  if (!sim.kiln.surge && sim.kiln.crisisCount >= 1 && sim.kiln.strain >= 700) {
    return { ok: false, reason: "A second breaking will split the Kiln. Let the strain fall." };
  }
  sim.kiln.surge = !sim.kiln.surge;
  pushLog(sim, sim.kiln.surge ? "Surge opened. The vessel strains." : "Surge closed.");
  return { ok: true };
}

export function toggleHeater(sim: SimState, id: number): { ok: boolean; reason?: string } {
  const b = sim.buildings.find((x) => x.id === id);
  if (!b) return { ok: false, reason: "Missing." };
  if (BUILDINGS[b.kind].housing > 0 && b.kind === "tent") {
    return { ok: false, reason: "Canvas will not hold a heater. Raise a hut first." };
  }
  if (!sim.research.unlocked.includes("heaters")) {
    return { ok: false, reason: "The Survey Hall has not fitted heaters yet." };
  }
  if (!b.heater && sim.resources.iron < 4) return { ok: false, reason: "Fitting a heater takes 4 iron." };
  if (!b.heater) sim.resources.iron -= 4;
  b.heater = !b.heater;
  pushLog(sim, b.heater ? "Heater fitted." : "Heater shut and left in place.");
  return { ok: true };
}

export function buyResearch(sim: SimState, id: ResearchId): { ok: boolean; reason?: string } {
  if (sim.research.unlocked.includes(id)) return { ok: false, reason: "Already in the books." };
  if (!sim.buildings.some((b) => b.kind === "survey")) {
    return { ok: false, reason: "Raise a Survey Hall first." };
  }
  const def = RESEARCH[id];
  if (sim.research.points < def.points) return { ok: false, reason: "Not enough survey notes." };
  if (!canAfford(sim, def.cost.timber, def.cost.iron)) {
    return { ok: false, reason: "Not enough materials." };
  }
  sim.research.points -= def.points;
  sim.resources.timber -= def.cost.timber;
  sim.resources.iron -= def.cost.iron;
  sim.research.unlocked.push(id);
  if (id === "ash-lining") sim.insulationBonus = 1;
  if (id === "dampers") sim.strainRise = 30;
  if (id === "wider-mouth") {
    pushLog(sim, "Wider Mouth is cut. Radius can open one ring further.");
  } else {
    pushLog(sim, `${def.name} enters the city's practice.`);
  }
  return { ok: true };
}

export interface TallyRow {
  circle: CircleId;
  stance: "for" | "against" | "undecided";
  seats: number;
  votes: number;
}

export function forecastVote(
  sim: SimState,
  id: ClauseId,
  deals: Partial<Record<CircleId, DealKind | null>>,
): { yes: number; need: number; rows: TallyRow[] } {
  const def = CLAUSES[id];
  const rows: TallyRow[] = [];
  let yes = 0;
  for (const circle of CIRCLE_IDS) {
    let stance = def.stance[circle];
    if (deals[circle] && stance !== "for") {
      stance = stance === "against" ? "undecided" : "for";
    }
    const { seats, trust } = sim.circles[circle];
    let votes = 0;
    if (stance === "for") votes = seats;
    else if (stance === "undecided") votes = Math.round(seats * (trust / 100) * 0.5);
    else votes = Math.round(seats * Math.max(0, trust - 72) / 140);
    yes += votes;
    rows.push({ circle, stance, seats, votes });
  }
  return { yes, need: 31, rows };
}

function enact(sim: SimState, id: ClauseId): void {
  const def = CLAUSES[id];
  if (def.excludes) delete sim.clauses[def.excludes];
  sim.clauses[id] = { at: sim.minute };
  sim.stats.signed += 1;
  markChronicle(sim, def.axis, def.delta, def.name);
  pushLog(sim, `Inscribed: ${def.name}.`);
}

export function repealClause(sim: SimState, id: ClauseId): { ok: boolean; reason?: string } {
  if (!hasClause(sim, id)) return { ok: false, reason: "It is not in the Charter." };
  delete sim.clauses[id];
  for (const c of CIRCLE_IDS) {
    sim.circles[c].trust = clamp(sim.circles[c].trust - 5, 0, 100);
  }
  sim.morale.grievance = clamp(sim.morale.grievance + 40, 0, 1000);
  markChronicle(sim, "truth", -4, `Repealed ${CLAUSES[id].name}`);
  pushLog(sim, `${CLAUSES[id].name} is struck from the Charter. Trust thins.`);
  return { ok: true };
}

export function decreeClause(sim: SimState, id: ClauseId): { ok: boolean; reason?: string } {
  const gate = clauseGate(sim, id);
  if (gate) return { ok: false, reason: gate };
  enact(sim, id);
  for (const c of CIRCLE_IDS) sim.circles[c].trust = clamp(sim.circles[c].trust - 6, 0, 100);
  sim.morale.grievance = clamp(sim.morale.grievance + 80, 0, 1000);
  markChronicle(sim, "liberty", -6, `Decreed ${CLAUSES[id].name}`);
  pushLog(sim, "You wrote it without a vote. The circles feel the pen.");
  return { ok: true };
}

export function clauseGate(sim: SimState, id: ClauseId): string | null {
  if (hasClause(sim, id)) return "Already inscribed.";
  const def = CLAUSES[id];
  if (def.requires && !hasClause(sim, def.requires)) {
    return `Requires ${CLAUSES[def.requires].name} first.`;
  }
  return null;
}

export function callVote(
  sim: SimState,
  id: ClauseId,
  deals: Partial<Record<CircleId, DealKind | null>>,
): { ok: boolean; reason?: string; passed?: boolean } {
  const gate = clauseGate(sim, id);
  if (gate) return { ok: false, reason: gate };
  for (const circle of CIRCLE_IDS) {
    const deal = deals[circle];
    if (deal === "tribute-fuel" && sim.resources.fuel < 40) {
      return { ok: false, reason: "Not enough fuel for that tribute." };
    }
    if (deal === "tribute-meals" && sim.resources.meals < 30) {
      return { ok: false, reason: "Not enough meals for that tribute." };
    }
  }
  for (const circle of CIRCLE_IDS) {
    const deal = deals[circle];
    if (deal === "tribute-fuel") {
      sim.resources.fuel -= 40;
      sim.circles[circle].trust = clamp(sim.circles[circle].trust + 4, 0, 100);
    } else if (deal === "tribute-meals") {
      sim.resources.meals -= 30;
      sim.circles[circle].trust = clamp(sim.circles[circle].trust + 4, 0, 100);
    } else if (deal === "promise") {
      sim.promises.push({
        circle,
        due: sim.minute + 2 * DAY_MINUTES,
        grievanceAt: sim.morale.grievance,
        text: `Promised the ${circle} the city would be calmer in two days.`,
      });
      sim.circles[circle].trust = clamp(sim.circles[circle].trust + 3, 0, 100);
    }
  }
  const tally = forecastVote(sim, id, deals);
  if (tally.yes >= tally.need) {
    enact(sim, id);
    for (const row of tally.rows) {
      if (row.stance === "for") {
        sim.circles[row.circle].trust = clamp(sim.circles[row.circle].trust + 2, 0, 100);
      }
    }
    pushLog(sim, `The vote carries ${tally.yes}–${60 - tally.yes}.`);
    return { ok: true, passed: true };
  }
  sim.morale.grievance = clamp(sim.morale.grievance + 30, 0, 1000);
  pushLog(sim, `The vote fails ${tally.yes}–${60 - tally.yes}. The clause stays unwritten.`);
  return { ok: true, passed: false };
}

function weightedBands(sim: SimState): { ill: number; worsen: number; die: number; warmSlots: number } {
  const living = Math.max(1, livingCount(sim));
  const buckets: { slots: number; w: number }[] = [];
  const housing = sim.buildings
    .filter((b) => BUILDINGS[b.kind].housing > 0)
    .map((b) => ({ slots: BUILDINGS[b.kind].housing, w: buildingWarmth(sim, b) }))
    .sort((a, b) => b.w - a.w);
  let left = living;
  for (const h of housing) {
    const n = Math.min(left, h.slots);
    if (n > 0) buckets.push({ slots: n, w: h.w });
    left -= n;
  }
  if (left > 0) buckets.push({ slots: left, w: streetWarmth(sim) });
  let ill = 0;
  let worsen = 0;
  let die = 0;
  let warmSlots = 0;
  for (const bucket of buckets) {
    const share = bucket.slots / living;
    const rates = bandRates(bucket.w);
    ill += rates.ill * share;
    worsen += rates.worsen * share;
    die += rates.die * share;
    if (bucket.w >= 1) warmSlots += bucket.slots;
  }
  return { ill, worsen, die, warmSlots };
}

function bandRates(w: number): { ill: number; worsen: number; die: number } {
  if (w <= -4) return { ill: 0.09, worsen: 0.06, die: 0.035 };
  if (w <= -3) return { ill: 0.045, worsen: 0.025, die: 0.01 };
  if (w <= -2) return { ill: 0.02, worsen: 0.01, die: 0.003 };
  if (w <= -1) return { ill: 0.008, worsen: 0.003, die: 0 };
  if (w <= 0) return { ill: 0.0025, worsen: 0.0008, die: 0 };
  return { ill: 0, worsen: 0, die: 0 };
}

function applyHealth(sim: SimState, medics: number): number {
  const rates = weightedBands(sim);
  const draw = () => rand(sim);
  let deaths = 0;
  for (const cls of CLASSES) {
    const illN = rollCount(sim.pop.healthy[cls], rates.ill, draw);
    shiftCohort(sim.pop.healthy, sim.pop.ill, cls, illN);
    const worseN = rollCount(sim.pop.ill[cls], rates.worsen + (hasClause(sim, "triage") ? 0.02 : 0), draw);
    shiftCohort(sim.pop.ill, sim.pop.gravely, cls, worseN);
    const dieP = rates.die + (hasClause(sim, "triage") ? 0.04 : 0);
    const dieN = rollCount(sim.pop.gravely[cls], dieP, draw);
    const gone = shiftCohort(sim.pop.gravely, null, cls, dieN);
    sim.pop.dead += gone;
    sim.stats.deaths += gone;
    deaths += gone;
  }
  if (hasClause(sim, "endless-watch")) {
    const injured = rollCount(sim.pop.healthy.labourers, 0.01, draw);
    shiftCohort(sim.pop.healthy, sim.pop.ill, "labourers", injured);
  }
  const warmShare = rates.warmSlots / Math.max(1, livingCount(sim));
  for (const cls of CLASSES) {
    const natural = rollCount(sim.pop.ill[cls], 0.05 * Math.min(1, warmShare * 1.4), draw);
    shiftCohort(sim.pop.ill, sim.pop.healthy, cls, natural);
  }
  let cures = medics * (hasClause(sim, "every-life") ? 2 : 1) * (hasClause(sim, "triage") ? 2 : 1);
  const cureOrder: ClassName[] = ["labourers", "specialists", "dependents"];
  for (const cls of cureOrder) {
    if (cures <= 0) break;
    if (hasClause(sim, "every-life")) {
      const n = shiftCohort(sim.pop.gravely, sim.pop.healthy, cls, cures);
      cures -= n;
    } else {
      const n = shiftCohort(sim.pop.gravely, sim.pop.ill, cls, cures);
      cures -= n;
    }
  }
  for (const cls of cureOrder) {
    if (cures <= 0) break;
    const n = shiftCohort(sim.pop.ill, sim.pop.healthy, cls, cures);
    cures -= n;
  }
  return deaths;
}

function runProduction(sim: SimState, eco: EconomySnapshot, hour: number): void {
  if (!workHour(sim, hour)) return;
  const peatClosed = sim.minute < sim.peatOfflineUntil;
  for (const b of sim.buildings) {
    const row = staffOf(eco, b.id);
    if (!row || row.need === 0 || row.assigned <= 0) continue;
    const ratio = row.assigned / row.need;
    const tile = tileAt(sim, b.q, b.r);
    const scale = (base: number) => Math.max(0, Math.round(base * ratio));
    if (b.kind === "peat" && !peatClosed) {
      const ex = EXTRACTION.peat!;
      const onSeam = tile?.deposit === "peat" && (tile.depositLeft ?? 0) > 0;
      const gain = scale(onSeam ? ex.on : ex.off);
      if (onSeam && tile) tile.depositLeft = Math.max(0, tile.depositLeft - gain);
      const spill = addResource(sim, "fuel", gain);
      if (spill > 0) noteSpill(sim, "fuel");
    } else if (b.kind === "wood") {
      const ex = EXTRACTION.wood!;
      const on = tile?.deposit === "timber" && tile.depositLeft > 0;
      const gain = scale(on ? ex.on : ex.off);
      if (on && tile) tile.depositLeft = Math.max(0, tile.depositLeft - gain);
      addResource(sim, "timber", gain);
    } else if (b.kind === "trappers") {
      const ex = EXTRACTION.trappers!;
      const on = tile?.deposit === "lichen" && tile.depositLeft > 0;
      const gain = scale(on ? ex.on : ex.off);
      if (on && tile) tile.depositLeft = Math.max(0, tile.depositLeft - gain);
      addResource(sim, "raw", gain);
    } else if (b.kind === "salvage") {
      if (tile?.deposit === "scrap" && tile.depositLeft > 0) {
        const bite = scale(8);
        tile.depositLeft = Math.max(0, tile.depositLeft - bite);
        addResource(sim, "iron", scale(2));
        addResource(sim, "timber", scale(3));
        addResource(sim, "fuel", scale(3));
      }
    } else if (b.kind === "ironworks") {
      const batches = scale(1);
      for (let i = 0; i < batches; i++) {
        if (sim.resources.timber >= 2 && sim.resources.fuel >= 1) {
          sim.resources.timber -= 2;
          sim.resources.fuel -= 1;
          addResource(sim, "iron", 1);
        }
      }
    } else if (b.kind === "mess") {
      const want = scale(8);
      const used = Math.min(want, sim.resources.raw);
      if (used > 0) {
        sim.resources.raw -= used;
        let meals = used * 2;
        if (hasClause(sim, "thin-broth")) meals = used * 3;
        else if (hasClause(sim, "bulked-bread")) meals = used * 2 + Math.floor(used / 3);
        addResource(sim, "meals", meals);
      }
    } else if (b.kind === "survey") {
      sim.research.points += scale(8);
    }
  }
}

function noteSpill(sim: SimState, key: string): void {
  const id = `spill-${key}-${dayIndex(sim.minute)}`;
  if (sim.eventFlags[id]) return;
  sim.eventFlags[id] = true;
  pushLog(sim, "The yards are full. Something is spilling onto the ice.");
}

function feedDawn(sim: SimState): void {
  let mouths = livingCount(sim);
  if (hasClause(sim, "every-life")) {
    mouths += Math.ceil(cohortSum(sim.pop.ill) * 0.5 + cohortSum(sim.pop.gravely) * 0.5);
  }
  if (mouths <= 0) return;
  if (sim.resources.meals >= mouths) {
    sim.resources.meals -= mouths;
    sim.stats.mealsServed += mouths;
    sim.pop.hungerDays = 0;
    if (hasClause(sim, "bulked-bread")) {
      const sick = rollCount(sim.pop.healthy.labourers, 0.05, () => rand(sim));
      shiftCohort(sim.pop.healthy, sim.pop.ill, "labourers", sick);
      const sickD = rollCount(sim.pop.healthy.dependents, 0.05, () => rand(sim));
      shiftCohort(sim.pop.healthy, sim.pop.ill, "dependents", sickD);
    }
    return;
  }
  const missed = mouths - sim.resources.meals;
  sim.stats.mealsServed += sim.resources.meals;
  sim.resources.meals = 0;
  sim.pop.hungerDays += 1;
  sim.morale.grievance = clamp(sim.morale.grievance + Math.round(missed * 0.6), 0, 1000);
  sim.morale.resolve = clamp(sim.morale.resolve - Math.round(missed * 0.3), 0, 1000);
  pushLog(sim, `Dawn rations fall short by ${missed}.`);
  if (sim.pop.hungerDays >= 2) {
    const die = Math.max(1, Math.round(missed * 0.03));
    const dead = killFrom(sim, die);
    if (dead > 0) pushLog(sim, `${dead} die with empty bowls.`);
  }
}

function applyMorale(sim: SimState, deaths: number, coldPeople: number): void {
  let resolve = sim.morale.resolve;
  let grievance = sim.morale.grievance;
  if (coldPeople > 0) {
    grievance += Math.min(40, 4 + Math.round(coldPeople / 8));
    resolve -= 4;
  } else if (sim.pop.hungerDays === 0) {
    resolve += 2;
    grievance -= 3;
  }
  if (deaths > 0) {
    const softened = hasClause(sim, "ash-field") ? 18 : 30;
    resolve -= deaths * softened;
    grievance += deaths * 16;
    if (hasClause(sim, "cold-storage")) {
      addResource(sim, "raw", deaths * 2);
    }
  }
  if (hasClause(sim, "thin-broth")) grievance += 3;
  if (hasClause(sim, "long-watch")) grievance += 2;
  if (hasClause(sim, "endless-watch")) grievance += 5;
  if (hasClause(sim, "childrens-hall")) resolve += 2;
  if (hasClause(sim, "still-house")) {
    if (sim.resources.fuel >= 1 && sim.resources.meals >= 1) {
      sim.resources.fuel -= 1;
      sim.resources.meals -= 1;
      grievance -= 8;
    }
  }
  sim.morale.resolve = clamp(resolve, 0, 1000);
  sim.morale.grievance = clamp(grievance, 0, 1000);
}

function checkReckoning(sim: SimState): void {
  const failing = sim.morale.resolve < 100 || sim.morale.grievance > 900;
  if (failing && sim.morale.reckoningUntil == null) {
    sim.morale.reckoningUntil = sim.minute + 48 * 60;
    if (!sim.pendingEvent) sim.pendingEvent = "reckoning";
    pushLog(sim, "The circles deliver an ultimatum. Two days.");
    return;
  }
  if (
    sim.morale.reckoningUntil != null &&
    sim.morale.resolve >= 200 &&
    sim.morale.grievance <= 750
  ) {
    sim.morale.reckoningUntil = null;
    pushLog(sim, "The ultimatum is withdrawn. The city steadies.");
    markChronicle(sim, "kinship", 4, "The ultimatum passed.");
    return;
  }
  if (sim.morale.reckoningUntil != null && sim.minute >= sim.morale.reckoningUntil) {
    sim.outcome = "exile";
    pushLog(sim, "They walk you to the ice. The Charter keeps your name and nothing else.");
  }
}

function checkPromises(sim: SimState): void {
  const keep: typeof sim.promises = [];
  for (const p of sim.promises) {
    if (sim.minute < p.due) {
      keep.push(p);
      continue;
    }
    if (sim.morale.grievance <= p.grievanceAt + 40) {
      sim.circles[p.circle].trust = clamp(sim.circles[p.circle].trust + 6, 0, 100);
      pushLog(sim, `Promise kept with the ${p.circle}.`);
    } else {
      sim.circles[p.circle].trust = clamp(sim.circles[p.circle].trust - 14, 0, 100);
      sim.morale.grievance = clamp(sim.morale.grievance + 40, 0, 1000);
      pushLog(sim, `Promise broken with the ${p.circle}.`);
      markChronicle(sim, "truth", -4, "A promise broke.");
    }
  }
  sim.promises = keep;
}

function payHeat(sim: SimState): void {
  const burn = kilnBurn(sim.kiln.pressure, sim.kiln.radius);
  if (sim.kiln.pressure > 0 && sim.resources.fuel >= burn) {
    sim.resources.fuel -= burn;
    sim.kiln.running = true;
  } else if (sim.kiln.pressure > 0) {
    sim.kiln.running = false;
    sim.kiln.surge = false;
    pushLog(sim, "The Kiln starves and goes dark.");
  } else {
    sim.kiln.running = false;
  }
  if (sim.kiln.running) {
    for (const b of sim.buildings) {
      if (b.kind !== "vent") continue;
      if (sim.resources.fuel >= 2) sim.resources.fuel -= 2;
      else {
        pushLog(sim, "A relay vent gutters. Not enough fuel.");
        break;
      }
    }
  }
  for (const b of sim.buildings) {
    b.heaterFed = false;
    if (!b.heater || !sim.kiln.running) continue;
    if (sim.resources.fuel >= 1) {
      sim.resources.fuel -= 1;
      b.heaterFed = true;
    }
  }
  if (sim.kiln.surge && sim.kiln.running) {
    sim.kiln.strain = Math.min(1000, sim.kiln.strain + sim.strainRise);
  } else {
    sim.kiln.strain = Math.max(0, sim.kiln.strain - 25);
  }
  if (sim.kiln.strain < 1000) sim.kiln.crisisLatched = false;
  if (sim.kiln.strain >= 1000 && !sim.kiln.crisisLatched && !sim.pendingEvent) {
    sim.kiln.crisisLatched = true;
    sim.kiln.surge = false;
    sim.kiln.strain = 1000;
    sim.pendingEvent = sim.kiln.crisisCount >= 1 ? "crisis-final" : "crisis";
  }
}

function maybeEvents(sim: SimState): void {
  if (sim.pendingEvent || sim.outcome) return;
  const c = clockHour(sim.minute);
  const flag = (id: string, when: boolean) => {
    if (!when || sim.eventFlags[id]) return;
    sim.eventFlags[id] = true;
    sim.pendingEvent = id;
  };
  flag("shaft-boy", c.day === 2 && c.hour === 9);
  flag("strangers", c.day === 3 && c.hour === 11);
  flag("bread", c.day === 4 && c.hour === 8);
  flag("burial", c.day === 4 && c.hour === 18 && sim.pendingEvent == null);
  flag("hush-warn", c.day === 5 && c.hour === 16);
  flag("hush", dayIndex(sim.minute) === 5 && c.hour === 0);
}

function clockHour(minute: number): { day: number; hour: number } {
  return { day: dayIndex(minute) + 1, hour: Math.floor((minute % DAY_MINUTES) / 60) };
}

function runHour(sim: SimState): void {
  const hour = completedHour(sim.minute);
  payHeat(sim);
  const eco = evaluate(sim);
  runProduction(sim, eco, hour);
  const infirmary = sim.buildings.find((b) => b.kind === "infirmary");
  const medics = infirmary ? (staffOf(eco, infirmary.id)?.assigned ?? 0) : 0;
  const deaths = applyHealth(sim, medics);
  const cold = streetWarmth(sim) <= -2 ? eco.unsheltered : 0;
  const housedCold = sim.buildings
    .filter((b) => BUILDINGS[b.kind].housing > 0 && buildingWarmth(sim, b) <= -2)
    .reduce((n, b) => n + BUILDINGS[b.kind].housing, 0);
  applyMorale(sim, deaths, cold + Math.min(eco.sheltered, housedCold));
  if (deaths > 0) pushLog(sim, `${deaths} die of the cold.`);
  checkPromises(sim);
  checkReckoning(sim);
  if (livingCount(sim) <= 0 && !sim.outcome) {
    sim.outcome = "empty";
    pushLog(sim, "No one is left to feed the fire.");
  }
}

export function stepMinute(sim: SimState): void {
  if (sim.outcome || sim.pendingEvent) return;
  sim.minute += 1;
  if (sim.minute >= VICTORY_MINUTE && !sim.outcome) {
    sim.outcome = "endured";
    pushLog(sim, "Dawn of the eighth day. The Hush is behind you.");
    sim.pendingEvent = "victory";
    return;
  }
  const tod = clockHour(sim.minute);
  if (tod.hour === 6 && sim.minute % 60 === 0 && sim.minute > 400) {
    feedDawn(sim);
  }
  if (sim.minute % 60 === 0) {
    runHour(sim);
    if (!sim.outcome && !sim.pendingEvent) maybeEvents(sim);
  }
}

export function resolveEvent(sim: SimState, choice: string): void {
  const id = sim.pendingEvent;
  sim.pendingEvent = null;
  if (!id) return;
  if (id === "arrival") {
    pushLog(sim, "You take the watch. Keep the ring warm, the pots full, the Charter honest.");
    return;
  }
  if (id === "reckoning") return;
  if (id === "victory") return;
  if (id === "shaft-boy") {
    if (choice === "punish") {
      sim.morale.grievance = clamp(sim.morale.grievance - 30, 0, 1000);
      sim.circles.stokers.trust = clamp(sim.circles.stokers.trust - 10, 0, 100);
      markChronicle(sim, "liberty", -6, "The foreman was punished for Ivo.");
      pushLog(sim, "The foreman is stripped of the night key. The Stokers go quiet.");
    } else if (choice === "close") {
      sim.peatOfflineUntil = sim.minute + DAY_MINUTES;
      markChronicle(sim, "lives", 4, "The pit closed for Ivo.");
      pushLog(sim, "The peat yard closes for a day. Ivo is walked home.");
    } else {
      shiftCohort(sim.pop.healthy, sim.pop.ill, "labourers", 2);
      sim.morale.grievance = clamp(sim.morale.grievance + 50, 0, 1000);
      markChronicle(sim, "kinship", -8, "Ivo was sent back down.");
      pushLog(sim, "You send Ivo back to the seam. Two cutters take ill before dusk.");
    }
    return;
  }
  if (id === "strangers") {
    if (choice === "admit") {
      sim.pop.healthy.labourers += 16;
      sim.pop.healthy.specialists += 4;
      sim.pop.healthy.dependents += 6;
      sim.pop.ill.labourers += 4;
      sim.circles.pathfinders.trust = clamp(sim.circles.pathfinders.trust + 8, 0, 100);
      sim.circles.hearthkin.trust = clamp(sim.circles.hearthkin.trust + 4, 0, 100);
      markChronicle(sim, "kinship", 8, "Sera's thirty were taken in.");
      pushLog(sim, "Thirty come inside the ring. Four are already fevered.");
    } else if (choice === "quarantine") {
      sim.resources.timber = Math.max(0, sim.resources.timber - 25);
      sim.pop.healthy.labourers += 14;
      sim.pop.healthy.specialists += 4;
      sim.pop.healthy.dependents += 6;
      sim.pop.ill.labourers += 1;
      markChronicle(sim, "lives", 4, "The strangers waited in a quarantine camp.");
      pushLog(sim, "A canvas camp on the lip of the cirque. Most walk in clean.");
    } else {
      sim.circles.pathfinders.trust = clamp(sim.circles.pathfinders.trust - 12, 0, 100);
      sim.morale.resolve = clamp(sim.morale.resolve - 40, 0, 1000);
      markChronicle(sim, "kinship", -12, "Sera's convoy was turned away.");
      pushLog(sim, "You turn Sera back onto the ice. The Pathfinders do not forgive it quickly.");
    }
    return;
  }
  if (id === "bread") {
    if (choice === "cell") {
      sim.morale.grievance = clamp(sim.morale.grievance - 20, 0, 1000);
      markChronicle(sim, "liberty", -8, "Anja was locked up for bread.");
      pushLog(sim, "Anja spends the night in a store-lock. The thefts stop. The songs do not.");
    } else if (choice === "apology") {
      sim.morale.resolve = clamp(sim.morale.resolve + 30, 0, 1000);
      sim.circles.ledger.trust = clamp(sim.circles.ledger.trust - 6, 0, 100);
      markChronicle(sim, "truth", 4, "Anja's theft was told in public.");
      pushLog(sim, "Anja names the hunger in front of the mess. Bowls are quieter after.");
    } else {
      sim.resources.meals = Math.max(0, sim.resources.meals - 20);
      sim.circles.hearthkin.trust = clamp(sim.circles.hearthkin.trust + 8, 0, 100);
      sim.morale.grievance = clamp(sim.morale.grievance - 30, 0, 1000);
      markChronicle(sim, "kinship", 4, "Extra rations went to Anja's household.");
      pushLog(sim, "Twenty meals walk to Anja's household. The Ledger House writes it down.");
    }
    return;
  }
  if (id === "burial") {
    if (choice === "ash") {
      if (!hasClause(sim, "ash-field")) enact(sim, "ash-field");
      else pushLog(sim, "The Ash Field is already in the Charter. Elder Ruut is satisfied.");
      sim.circles.hearthkin.trust = clamp(sim.circles.hearthkin.trust + 8, 0, 100);
    } else if (choice === "promise") {
      sim.promises.push({
        circle: "hearthkin",
        due: sim.minute + 2 * DAY_MINUTES,
        grievanceAt: sim.morale.grievance - 80,
        text: "Promised Elder Ruut a burial ground.",
      });
      sim.circles.hearthkin.trust = clamp(sim.circles.hearthkin.trust + 4, 0, 100);
      pushLog(sim, "You promise Elder Ruut an Ash Field within two days.");
    } else {
      sim.circles.hearthkin.trust = clamp(sim.circles.hearthkin.trust - 14, 0, 100);
      sim.morale.grievance = clamp(sim.morale.grievance + 40, 0, 1000);
      markChronicle(sim, "kinship", -6, "The Hearthkin were refused a burial ground.");
      pushLog(sim, "Ruut leaves the yard without an answer.");
    }
    return;
  }
  if (id === "hush-warn") {
    pushLog(sim, "The archivists pin the Hush to the board. Two days. Sixty below, and worse at night.");
    return;
  }
  if (id === "hush") {
    pushLog(sim, "The Hush arrives. Sound thins. Breath turns to powder.");
    return;
  }
  if (id === "crisis") {
    sim.kiln.surge = false;
    sim.kiln.crisisCount += 1;
    if (choice === "crew") {
      const dead = killFrom(sim, 8);
      sim.kiln.strain = 350;
      sim.kiln.crisisLatched = false;
      markChronicle(sim, "lives", -12, "A crew went into the vent shaft.");
      markChronicle(sim, "kinship", -8, "The shaft crew did not all return.");
      pushLog(sim, `${dead} go into the shaft. The strain breaks. Not all of them come up.`);
    } else {
      sim.kiln.strain = 520;
      sim.kiln.crisisLatched = false;
      sim.kiln.pressure = 1;
      sim.resources.fuel = Math.max(0, sim.resources.fuel - 60);
      markChronicle(sim, "truth", -6, "The Kiln was bled into the cirque.");
      sim.morale.grievance = clamp(sim.morale.grievance + 40, 0, 1000);
      pushLog(sim, "You bleed the vessel. Black melt runs into the snow. Pressure falls to one.");
    }
    return;
  }
  if (id === "crisis-final") {
    sim.outcome = "kiln";
    markChronicle(sim, "lives", -20, "The Kiln split.");
    pushLog(sim, "The second breaking opens the Kiln. The cirque fills with steam, then silence.");
  }
}

export interface EventView {
  title: string;
  body: string;
  choices: { id: string; label: string; detail: string }[];
}

export function eventView(sim: SimState): EventView | null {
  switch (sim.pendingEvent) {
    case "arrival":
      return {
        title: "The cirque holds",
        body: "Rail workers, miners, and archivists stand in the snow around a buried engine they are already calling the Kiln. You are the Warden of the Charter — not because you were ready, but because someone had to write the rules while the fire still lived. The Hush, a killing cold, is forecast for the sixth day. Hold until dawn of the eighth.",
        choices: [
          {
            id: "take",
            label: "Take the watch",
            detail: "Pressure is already at one. Put peat cutters on the dark seams and tents inside the amber ring.",
          },
        ],
      };
    case "shaft-boy":
      return {
        title: "The boy in the shaft",
        body: "Ivo, twelve, hid in a peat shaft to be near his mother on shift. The foreman hauled him up by the coat and wants him sent back down so the others don't copy it.",
        choices: [
          { id: "punish", label: "Punish the foreman", detail: "Grievance eases. The Stokers lose trust. Liberty is marked." },
          { id: "close", label: "Close the yard for a day", detail: "No peat from that yard until tomorrow. Ivo goes home." },
          { id: "ignore", label: "Send him back down", detail: "The seam keeps working. People sicken, and Kinship falls." },
        ],
      };
    case "strangers":
      return {
        title: "Strangers at the glacier mouth",
        body: "Sera brings thirty off a stalled rail spur. Four are fevered. The Pathfinders want the gate open. The stores do not.",
        choices: [
          { id: "admit", label: "Admit all", detail: "+30 people, four of them ill. Kinship rises. Mouths to feed." },
          { id: "quarantine", label: "A camp on the lip", detail: "Spend 25 timber. Most arrive healthy after a day in canvas." },
          { id: "turn", label: "Turn them away", detail: "The Pathfinders will not forget. Kinship falls." },
        ],
      };
    case "bread":
      return {
        title: "The bread thief",
        body: "Anja took a loaf for her sister's children. Half the mess saw her. The Ledger House wants a lock on her. Her neighbours want the opposite of a speech.",
        choices: [
          { id: "cell", label: "A night in the store-lock", detail: "Thefts stop. Liberty is marked. Grievance dips." },
          { id: "apology", label: "A public apology", detail: "Resolve rises. The Ledger House is annoyed. Truth is marked well." },
          { id: "rations", label: "Extra rations for her house", detail: "−20 meals. The Hearthkin warm to you." },
        ],
      };
    case "burial":
      return {
        title: "Elder Ruut asks for a field",
        body: "The Hearthkin want an Ash Field — a marked place and an hour for names — before the Hush makes funerals impossible.",
        choices: [
          { id: "ash", label: "Inscribe the Ash Field", detail: "The clause is written now, vote or not. Kinship rises." },
          { id: "promise", label: "Promise it within two days", detail: "Trust holds if the city is calmer when the promise comes due." },
          { id: "refuse", label: "Not while the yards are thin", detail: "Hearthkin trust falls." },
        ],
      };
    case "hush-warn":
      return {
        title: "The archivists' board",
        body: "They pin a strip of paper where everyone can see it. Day 6 and day 7: sixty below, and ten worse after dark. Stock fuel. Raise huts. Do not meet the Hush in canvas if you can help it.",
        choices: [{ id: "seen", label: "I have seen it", detail: "The forecast is already on the board." }],
      };
    case "hush":
      return {
        title: "The Hush",
        body: "Wind drops. The Kiln's rumble is the only loud thing left. For two days the cirque will try to put the fire out from the outside.",
        choices: [{ id: "hold", label: "Hold the ring", detail: "Pressure, insulation, and full pots." }],
      };
    case "crisis":
      return {
        title: "Kiln crisis",
        body: "Strain sits at the red line. The vessel ticks. You can bleed it into the snow, or send a crew into the vent shaft. A second breaking, later, will split the Kiln for good.",
        choices: [
          {
            id: "bleed",
            label: "Bleed the vessel",
            detail: "Strain falls. Lose 60 fuel. Pressure drops to 1. The melt is poisoned and Truth is marked.",
          },
          {
            id: "crew",
            label: "Send a shaft crew",
            detail: "Eight people may die. Strain falls harder. Lives and Kinship are marked.",
          },
        ],
      };
    case "crisis-final":
      return {
        title: "The vessel splits",
        body: "You were warned. The Kiln takes the second breaking personally. There is no third setting on this dial.",
        choices: [{ id: "watch", label: "Stand and watch", detail: "The city ends with the fire." }],
      };
    case "reckoning":
      return {
        title: "Ultimatum",
        body: "Resolve is failing, or grievance has nowhere left to rise. You have two days to bring resolve back above a fifth and grievance under three quarters — or they will walk you onto the ice.",
        choices: [{ id: "heard", label: "I hear them", detail: "Warmth, food, and a repealed cruelty will move the bars." }],
      };
    case "victory":
      return {
        title: "The fire held",
        body: endingLine(sim),
        choices: [{ id: "read", label: "Read the Chronicle", detail: "Four measures. No hidden switch." }],
      };
    default:
      return null;
  }
}

export function endingLine(sim: SimState): string {
  const axes: { id: ChronicleAxis; line: string }[] = [
    { id: "lives", line: "The fire held. Count the beds that are empty." },
    { id: "liberty", line: "The fire held. Ask who was allowed to refuse." },
    { id: "kinship", line: "The fire held. Ask who was left outside the story." },
    { id: "truth", line: "The fire held. Remember what it was fed." },
  ];
  let worst = axes[0]!;
  for (const a of axes) {
    if (sim.chronicle[a.id] < sim.chronicle[worst.id]) worst = a;
  }
  return worst.line;
}

export function weakestAxis(sim: SimState): ChronicleAxis {
  const ids: ChronicleAxis[] = ["lives", "liberty", "kinship", "truth"];
  return ids.reduce((w, id) => (sim.chronicle[id] < sim.chronicle[w] ? id : w));
}
