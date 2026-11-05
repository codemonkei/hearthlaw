/*
 * Playtest harness: plays full games with several strategies over many seeds, checks invariants
 * every hour, and prints outcome / balance stats. Run: npm run playtest [-- games [easy|medium|hard]]. Healthy balance: idle and chaos are exiled on every difficulty; on easy a casual player endures, on medium a careful one endures with a few Hush deaths, on hard a careful one endures about half the time; no invariant problems.
 */
import { BUILDINGS, CLAUSE_ORDER, DOCK_ORDER, RESEARCH_ORDER, outdoorBand, outdoorTemp, dayIndex } from "./content";
import * as E from "./engine";
import { currentTip } from "../ui/tips";
import type { BuildingKind, Difficulty, SimState, ResourceKey } from "./types";

const problems = new Map<string, { count: number; example: string }>();
function flag(kind: string, example: string) {
  const p = problems.get(kind);
  if (p) p.count++;
  else problems.set(kind, { count: 1, example });
}

function check(sim: SimState, tag: string) {
  const caps = E.storageCaps(sim);
  for (const k of Object.keys(sim.resources) as ResourceKey[]) {
    const v = sim.resources[k];
    if (!Number.isFinite(v)) flag(`resource ${k} not finite`, `${tag} ${k}=${v}`);
    if (v < 0) flag(`resource ${k} negative`, `${tag} ${k}=${v}`);
    if (v > caps[k]) flag(`resource ${k} over cap`, `${tag} ${k}=${v} cap ${caps[k]}`);
    if (!Number.isInteger(v)) flag(`resource ${k} fractional`, `${tag} ${k}=${v}`);
  }
  for (const bag of ["healthy", "ill", "gravely"] as const) {
    for (const c of ["labourers", "specialists", "dependents"] as const) {
      const v = sim.pop[bag][c];
      if (v < 0 || !Number.isInteger(v)) flag(`pop ${bag}.${c} invalid`, `${tag} ${v}`);
    }
  }
  if (sim.kiln.strain < 0 || sim.kiln.strain > 1000) flag("strain out of range", `${tag} ${sim.kiln.strain}`);
  for (const k of ["resolve", "grievance"] as const) {
    const v = sim.morale[k];
    if (v < 0 || v > 1000 || !Number.isFinite(v)) flag(`morale ${k} out of range`, `${tag} ${v}`);
  }
  for (const c of Object.values(sim.circles)) if (c.trust < 0 || c.trust > 100) flag("trust out of range", `${tag} ${c.trust}`);
  // Buildings and tiles agree.
  for (const b of sim.buildings) {
    const t = E.tileAt(sim, b.q, b.r);
    if (!t || t.buildingId !== b.id) flag("building/tile mismatch", `${tag} ${b.kind}#${b.id}`);
    if (b.q === 0 && b.r === 0) flag("building on kiln", tag);
  }
  for (const t of sim.tiles) {
    if (t.buildingId != null && !sim.buildings.some((b) => b.id === t.buildingId)) flag("tile points at missing building", `${tag} ${t.q},${t.r}`);
    if (t.depositLeft < 0) flag("deposit negative", tag);
  }
  if (sim.research.points < 0) flag("research points negative", `${tag} ${sim.research.points}`);
}

type Policy = (sim: SimState, rnd: () => number) => void;

const living = (sim: SimState) => E.livingCount(sim);
const count = (sim: SimState, k: BuildingKind) => sim.buildings.filter((b) => b.kind === k).length;
const free = (sim: SimState, pred: (t: SimState["tiles"][number]) => boolean) =>
  sim.tiles.filter((t) => t.buildingId == null && !(t.q === 0 && t.r === 0) && pred(t));
const ring = (t: { q: number; r: number }) => (Math.abs(t.q) + Math.abs(t.r) + Math.abs(t.q + t.r)) / 2;
function place(sim: SimState, kind: BuildingKind, pred: (t: SimState["tiles"][number]) => boolean, sortBy = ring) {
  const tiles = free(sim, pred).sort((a, b) => sortBy(a) - sortBy(b));
  for (const t of tiles) {
    const r = E.placeBuilding(sim, kind, t.q, t.r);
    if (r.ok) return true;
  }
  return false;
}
const deposit = (d: string) => (t: SimState["tiles"][number]) => E.liveDeposit(t) === d;
const plain = (maxRing: number) => (t: SimState["tiles"][number]) => E.liveDeposit(t) === "none" && ring(t) <= maxRing;

/** Does nothing but answer events. */
const idle: Policy = () => {};

/** A sensible player; `careful` adds research, upgrades, heaters and full Hush pressure. */
const makeSteward = (careful: boolean): Policy => (sim) => {
  const day = dayIndex(sim.minute) + 1;
  const housing = () => sim.buildings.reduce((n, b) => n + BUILDINGS[b.kind].housing, 0);
  // Build only what can be staffed, in the order a player reading the staffing panel would.
  const staffable = (k: BuildingKind) => {
    const def = BUILDINGS[k];
    if (def.staff === 0) return true;
    const eco = E.evaluate(sim);
    return (def.staffClass === "specialists" ? eco.specialistFree : eco.labourFree) >= def.staff;
  };
  const build = (k: BuildingKind, n: number, where: (t: SimState["tiles"][number]) => boolean) => {
    if (count(sim, k) < n && staffable(k)) place(sim, k, where);
  };
  build("peat", 1, deposit("peat"));
  build("wood", 1, deposit("timber"));
  build("trappers", 1, deposit("lichen"));
  build("mess", 1, plain(2));
  while (housing() < living(sim) && place(sim, "tent", plain(sim.kiln.radius + 1))) {}
  build("peat", 2, deposit("peat"));
  build("infirmary", 1, plain(3));
  build("survey", 1, plain(3));
  build("peat", 3, deposit("peat"));
  if (sim.resources.meals < 250) build("trappers", 2, deposit("lichen"));
  build("salvage", 1, deposit("scrap"));
  // Watch the fuel line: a careful warden opens more seams before the Hush if stores sag.
  if (careful && day <= 5 && sim.resources.fuel < 400) build("peat", 5, deposit("peat"));
  if (!careful) {
    // A first-time player: builds the basics and tents, never upgrades, holds pressure 2 in the Hush.
    const want = dayIndex(sim.minute) >= 5 || outdoorBand(outdoorTemp(sim.minute)) <= -2 ? 2 : 1;
    if (sim.kiln.pressure !== want) E.setPressure(sim, want);
    return;
  }
  for (const id of RESEARCH_ORDER) E.buyResearch(sim, id);
  // Upgrade housing when materials allow, keeping a reserve.
  for (const b of sim.buildings) {
    if (b.kind === "tent" && sim.resources.timber >= 60 && sim.resources.iron >= 10) E.upgradeBuilding(sim, b.id);
    else if (b.kind === "hut" && sim.resources.timber >= 80 && sim.resources.iron >= 20 && day >= 3) E.upgradeBuilding(sim, b.id);
  }
  if (sim.research.unlocked.includes("heaters") && day >= 5) {
    for (const b of sim.buildings) if (!b.heater && (b.kind === "hut" || b.kind === "longhouse") && sim.resources.iron >= 8) E.toggleHeater(sim, b.id);
  }
  // Heat: pressure up for the Hush, radius 2 once housing spills past ring 1.
  const hush = day === 6 || day === 7;
  const night = outdoorBand(outdoorTemp(sim.minute)) <= -2;
  const want = hush ? (sim.resources.fuel > 300 ? 4 : 3) : night ? 2 : sim.resources.fuel > 250 ? 2 : 1;
  if (sim.kiln.pressure !== want) E.setPressure(sim, want as 0 | 1 | 2 | 3 | 4);
  const outer = sim.buildings.some((b) => BUILDINGS[b.kind].housing > 0 && ring(b) > sim.kiln.radius);
  if (outer && sim.kiln.radius < E.maxRadius(sim) && sim.resources.fuel > 300) E.setRadius(sim, (sim.kiln.radius + 1) as 1 | 2 | 3 | 4);
};

const steward = makeSteward(true);
const casual = makeSteward(false);

/** Builds anything it can afford anywhere, flips controls at random, answers events at random. */
const chaos: Policy = (sim, rnd) => {
  if (rnd() < 0.3) {
    const kind = DOCK_ORDER[Math.floor(rnd() * DOCK_ORDER.length)]!;
    const tiles = free(sim, () => true);
    const t = tiles[Math.floor(rnd() * tiles.length)];
    if (t) E.placeBuilding(sim, kind, t.q, t.r);
  }
  if (rnd() < 0.08 && sim.buildings.length) E.upgradeBuilding(sim, sim.buildings[Math.floor(rnd() * sim.buildings.length)]!.id);
  if (rnd() < 0.03 && sim.buildings.length) E.demolishBuilding(sim, sim.buildings[Math.floor(rnd() * sim.buildings.length)]!.id);
  if (rnd() < 0.05 && sim.buildings.length) E.toggleHeater(sim, sim.buildings[Math.floor(rnd() * sim.buildings.length)]!.id);
  if (rnd() < 0.1) E.setPressure(sim, Math.floor(rnd() * 5) as 0 | 1 | 2 | 3 | 4);
  if (rnd() < 0.05) E.setRadius(sim, (1 + Math.floor(rnd() * 4)) as 1 | 2 | 3 | 4);
  if (rnd() < 0.05) E.toggleSurge(sim);
  if (rnd() < 0.05) E.buyResearch(sim, RESEARCH_ORDER[Math.floor(rnd() * RESEARCH_ORDER.length)]!);
  if (rnd() < 0.04) {
    const id = CLAUSE_ORDER[Math.floor(rnd() * CLAUSE_ORDER.length)]!;
    const kinds = ["tribute-fuel", "tribute-meals", "promise", null] as const;
    const deals = Object.fromEntries((["stokers", "pathfinders", "hearthkin", "ledger"] as const).map((c) => [c, kinds[Math.floor(rnd() * 4)]]));
    if (rnd() < 0.5) E.callVote(sim, id, deals as never);
    else E.decreeClause(sim, id);
  }
  if (rnd() < 0.01) {
    const ids = Object.keys(sim.clauses);
    if (ids.length) E.repealClause(sim, ids[Math.floor(rnd() * ids.length)] as never);
  }
};

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Result {
  outcome: string;
  day: number;
  dead: number;
  living: number;
  minFuel: number;
  minMeals: number;
  hungerDays: number;
  maxStrain: number;
  minResolve: number;
  maxGrievance: number;
  events: string[];
  deathsByDay: number[];
}

function play(seed: number, policy: Policy, choose: "first" | "random" | "steward", rngSeed: number, difficulty: Difficulty): Result {
  const sim = E.createGame(seed, difficulty);
  const rnd = mulberry(rngSeed);
  const events: string[] = [];
  let minFuel = Infinity, minMeals = Infinity, maxStrain = 0, minResolve = 1000, maxGrievance = 0;
  const deathsByDay: number[] = [];
  let guard = 0;
  while (!sim.outcome && guard++ < 30000) {
    if (sim.pendingEvent) {
      const view = E.eventView(sim);
      events.push(`${sim.pendingEvent}@d${dayIndex(sim.minute) + 1}h${Math.floor((sim.minute % 1440) / 60)}`);
      const choices = view?.choices ?? [];
      let pick = choices[0]?.id ?? "ok";
      if (choose === "random" && choices.length) pick = choices[Math.floor(rnd() * choices.length)]!.id;
      if (choose === "steward") {
        const prefs: Record<string, string> = { "shaft-boy": "close", strangers: "quarantine", bread: "apology", burial: "ash", crisis: "bleed" };
        const want = prefs[sim.pendingEvent];
        if (want && choices.some((c) => c.id === want)) pick = want;
      }
      const before = sim.pendingEvent;
      E.resolveEvent(sim, pick);
      if (sim.pendingEvent === before && before !== "victory") flag("event did not clear", `${before} choice ${pick}`);
      if (sim.outcome) break;
      continue;
    }
    if (sim.minute % 60 === 0) policy(sim, rnd);
    const before = sim.minute;
    const deadBefore = sim.pop.dead;
    E.stepMinute(sim);
    if (sim.minute === before && !sim.outcome && !sim.pendingEvent) {
      flag("clock stuck", `minute ${before}`);
      break;
    }
    const d = dayIndex(sim.minute);
    deathsByDay[d] = (deathsByDay[d] ?? 0) + (sim.pop.dead - deadBefore);
    if (TRACE && rngSeed === 1 && sim.minute % 30 === 0) {
      // Tip timeline: the moment each guided tip would appear, read as if the player taps "Got it".
      const tip = currentTip(sim);
      if (tip) {
        console.log(`  TIP d${d + 1} ${String(Math.floor((sim.minute % 1440) / 60)).padStart(2, "0")}:${String(sim.minute % 60).padStart(2, "0")} ${tip.id}`);
        sim.tipsSeen = [...(sim.tipsSeen ?? []), tip.id];
      }
    }
    if (TRACE && rngSeed === 1 && sim.minute % 360 === 0) {
      const eco = E.evaluate(sim);
      const freePeat = sim.tiles.filter((t) => t.buildingId == null && E.liveDeposit(t) === "peat").length;
      console.log(`  d${d + 1}h${(sim.minute % 1440) / 60} ${outdoorTemp(sim.minute)}°C fuel ${sim.resources.fuel} timber ${sim.resources.timber} iron ${sim.resources.iron} burn ${eco.burn} p${sim.kiln.pressure}r${sim.kiln.radius} peat ${count(sim, "peat")} (free seams ${freePeat}) labour free ${eco.labourFree} housing ${eco.housingCap}/${eco.living} dead ${sim.pop.dead} grievance ${sim.morale.grievance} | ${eco.rows.filter((r) => r.need > 0).map((r) => `${r.kind}${r.assigned}/${r.need}`).join(" ")}`);
    }
    if (sim.minute % 60 === 0) {
      check(sim, `seed ${seed} d${d + 1}h${Math.floor((sim.minute % 1440) / 60)}`);
      minFuel = Math.min(minFuel, sim.resources.fuel);
      minMeals = Math.min(minMeals, sim.resources.meals);
      maxStrain = Math.max(maxStrain, sim.kiln.strain);
      minResolve = Math.min(minResolve, sim.morale.resolve);
      maxGrievance = Math.max(maxGrievance, sim.morale.grievance);
    }
  }
  return {
    outcome: sim.outcome ?? "none",
    day: dayIndex(sim.minute) + 1,
    dead: sim.pop.dead,
    living: E.livingCount(sim),
    minFuel,
    minMeals,
    hungerDays: sim.pop.hungerDays,
    maxStrain,
    minResolve,
    maxGrievance,
    events,
    deathsByDay: Array.from({ length: 8 }, (_, i) => deathsByDay[i] ?? 0),
  };
}

const games = Number(process.argv[2] ?? 40);
const TRACE = process.argv[4] != null;
const traceOnly = process.argv[4];
const arg3 = process.argv[3];
const difficulties: Difficulty[] = arg3 === "easy" || arg3 === "medium" || arg3 === "hard" ? [arg3] : ["easy", "medium", "hard"];
const runs: [string, Policy, "first" | "random" | "steward"][] = [
  ["idle/first", idle, "first"],
  ["casual", casual, "steward"],
  ["steward", steward, "steward"],
  ["steward/random-events", steward, "random"],
  ["chaos", chaos, "random"],
];
const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
};
for (const difficulty of difficulties) for (const [label, policy, choose] of runs) {
  if (traceOnly && label !== traceOnly) continue;
  const name = `${difficulty} · ${label}`;
  const results: Result[] = [];
  for (let i = 0; i < games; i++) results.push(play(1000 + i * 7919, policy, choose, i + 1, difficulty));
  const outcomes: Record<string, number> = {};
  for (const r of results) outcomes[r.outcome] = (outcomes[r.outcome] ?? 0) + 1;
  const deaths = results.map((r) => r.dead);
  const byDay = Array.from({ length: 8 }, (_, d) => Math.round(results.reduce((n, r) => n + r.deathsByDay[d]!, 0) / results.length * 10) / 10);
  console.log(`\n== ${name} (${games} games)`);
  console.log(" outcomes", outcomes);
  console.log(" deaths median", pct(deaths, 0.5), "p10", pct(deaths, 0.1), "p90", pct(deaths, 0.9), "| avg deaths by day", byDay.join(" "));
  console.log(" min fuel median", pct(results.map((r) => r.minFuel), 0.5), "| min meals median", pct(results.map((r) => r.minMeals), 0.5));
  console.log(" min resolve median", pct(results.map((r) => r.minResolve), 0.5), "| max grievance median", pct(results.map((r) => r.maxGrievance), 0.5), "| max strain median", pct(results.map((r) => r.maxStrain), 0.5));
  const lost = results.filter((r) => r.outcome !== "endured");
  if (lost.length) console.log(" losses:", lost.slice(0, 6).map((r) => `${r.outcome}@d${r.day}(dead ${r.dead})`).join(", "));
  const evCount: Record<string, number> = {};
  for (const r of results) for (const e of r.events) { const k = e.split("@")[0]!; evCount[k] = (evCount[k] ?? 0) + 1; }
  console.log(" events seen", evCount);
}
console.log("\n== invariant problems");
if (!problems.size) console.log(" none");
for (const [k, v] of problems) console.log(` ${k}: ${v.count}× e.g. ${v.example}`);
