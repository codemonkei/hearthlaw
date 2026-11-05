/*
 * The guided tips for a first watch. Each tip waits for the moment it matters — chosen by
 * playing whole games through the sim and noting where a new warden stumbles: a first night
 * with no extra pressure, timber hoarded while tents freeze, notes never spent, and a Hush met
 * at pressure 2 with hundreds of fuel unburned. One tip shows at a time, each once per game.
 */
import { BUILDINGS, dayIndex, outdoorBand, outdoorTemp } from "@/game/sim/content";
import { evaluate, livingCount } from "@/game/sim/engine";
import type { SimState } from "@/game/sim/types";

export interface Tip {
  id: string;
  title: string;
  text: string;
  /** True once the moment for this tip has come. Checked in list order; the first unseen match shows. */
  when: (sim: SimState) => boolean;
}

const hourOf = (sim: SimState) => Math.floor((sim.minute % 1440) / 60);
const day = (sim: SimState) => dayIndex(sim.minute) + 1;
const has = (sim: SimState, kind: keyof typeof BUILDINGS) => sim.buildings.some((b) => b.kind === kind);
const sick = (sim: SimState) =>
  sim.pop.ill.labourers + sim.pop.ill.specialists + sim.pop.ill.dependents +
  sim.pop.gravely.labourers + sim.pop.gravely.specialists + sim.pop.gravely.dependents;
const hush = (sim: SimState) => day(sim) === 6 || day(sim) === 7;

export const TIPS: Tip[] = [
  // Emergencies first: when these are true they matter more than any lesson.
  {
    id: "kiln-dark",
    title: "The Kiln has gone dark",
    text: "It ran out of fuel. Lower the pressure and put more Peat Cutters on peat seams. Without the Kiln, every roof is only wind.",
    when: (sim) => !sim.kiln.running && sim.kiln.pressure > 0,
  },
  {
    id: "reckoning",
    title: "An ultimatum",
    text: "The circles give you two days. Bring Grievance down and Resolve up — warmth, full bowls, and Charter clauses they want — or the city exiles you at dawn.",
    when: (sim) => sim.morale.reckoningUntil != null,
  },
  {
    id: "hunger",
    title: "The pots are nearly empty",
    text: "Trappers' Huts bring in raw catch, and the Mess Hall cooks it. Hungry people fall ill faster and anger quickly.",
    when: (sim) => sim.resources.meals < 60 && sim.minute > 8 * 60,
  },
  // The opening.
  {
    id: "welcome",
    title: "Keep everyone under a roof",
    text: "The amber ring is the Kiln's warmth. Canvas Tents inside it are the cheapest shelter. Pick a card below, then tap a glowing tile.",
    when: () => true,
  },
  {
    id: "supply",
    title: "Fuel, food and timber",
    text: "Nothing refills itself. A Peat Cutter on a peat seam feeds the Kiln, a Trappers' Hut on lichen brings raw food for the Mess Hall, and a Woodcutters' Lodge on a grove brings timber.",
    when: (sim) => !has(sim, "peat") || !has(sim, "wood") || !has(sim, "trappers"),
  },
  {
    id: "unsheltered",
    title: "People sleeping in the open",
    text: "There are more people than beds. Build more housing before nightfall — the street is far colder than any tent.",
    when: (sim) => evaluate(sim).unsheltered > 0 && sim.minute > 7 * 60,
  },
  {
    id: "crew",
    title: "Every workplace needs hands",
    text: "There are not enough workers for every building, so some stand idle. Tap a building to see its crew; fewer, fully staffed workplaces beat many empty ones.",
    // Before the Hush only: then empty posts mean the sick, not too many workplaces.
    when: (sim) => day(sim) < 6 && evaluate(sim).rows.some((r) => r.need > 0 && r.assigned < r.need),
  },
  {
    id: "night",
    title: "Night is coming",
    text: "Nights drop ten degrees. Raise the Kiln's pressure for the night and lower it by day to save fuel. The fuel cost per hour shows in the Kiln panel.",
    when: (sim) => hourOf(sim) >= 17 && day(sim) === 1,
  },
  {
    id: "heat",
    title: "See the warmth",
    text: "The eye button colours every tile by warmth. Blue tiles make people ill; keep homes in the amber.",
    when: (sim) => day(sim) === 1 && hourOf(sim) >= 20,
  },
  {
    id: "illness",
    title: "The cold makes people ill",
    text: "Cold homes make people ill, then gravely ill, then dead. An Infirmary's medics pull them back, and warmer homes let them recover on their own.",
    when: (sim) => sick(sim) > 0,
  },
  {
    id: "upgrade",
    title: "Tents only keep the wind off",
    text: "Tap a tent and raise it to a Timber Hut: one band warmer. Timber sitting in the store warms no one.",
    when: (sim) => has(sim, "tent") && sim.resources.timber >= 40 && sim.resources.iron >= 5 && sim.minute > 20 * 60,
  },
  {
    id: "survey",
    title: "Learn the Kiln's secrets",
    text: "A Survey Hall gathers notes. Spend them in the Survey book on heaters, insulation and a wider ring.",
    when: (sim) => day(sim) >= 2 && !has(sim, "survey"),
  },
  {
    id: "research",
    title: "Your notes are ready",
    text: "You have enough survey notes for research. Open the Survey (the book button). Hearth Heaters and Ash Lining are what carry a city through the Hush.",
    when: (sim) => has(sim, "survey") && sim.research.points >= 30 && sim.research.unlocked.length === 0,
  },
  {
    id: "charter",
    title: "Grievance and the Charter",
    text: "Cold, hunger and grief raise Grievance; above 90% the circles issue an ultimatum. The Charter (scroll button) lets you put laws to a vote — each eases one thing and costs another.",
    when: (sim) => sim.morale.grievance >= 350,
  },
  {
    id: "strain",
    title: "The surge strains the Kiln",
    text: "Surge buys one more band of heat, but strain climbs while it is open. At 100% the Kiln breaks; a second breaking ends the city. Close it before the bar fills.",
    when: (sim) => sim.kiln.strain > 0,
  },
  {
    id: "outer-ring",
    title: "Homes outside the warmth",
    text: "Some homes sit beyond the amber ring and get no heat from the Kiln. Widen the ring in the Kiln panel — it drinks more fuel — or move them in.",
    when: (sim) => {
      const ring = (q: number, r: number) => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
      return sim.buildings.some((b) => BUILDINGS[b.kind].housing > 0 && ring(b.q, b.r) > sim.kiln.radius);
    },
  },
  {
    id: "hush-prep",
    title: "The Hush is coming",
    text: "Two days of killing cold start at midnight on day 6. Upgrade homes, fit heaters, keep the Infirmary staffed, and save fuel: you will burn it at pressure 3 or 4.",
    when: (sim) => day(sim) >= 5 && !hush(sim),
  },
  {
    id: "hush",
    title: "Burn what you saved",
    text: "This is what the fuel was for. Run the Kiln at pressure 3 or 4 and watch fuel per hour in the Kiln panel. Dawn on day 8 ends the watch.",
    when: (sim) => hush(sim) && outdoorBand(outdoorTemp(sim.minute)) <= -6 && sim.kiln.pressure < 3 && livingCount(sim) > 0,
  },
];

/** The tip to show now, if any: the first whose moment has come and that this game has not shown. */
export function currentTip(sim: SimState): Tip | null {
  if (sim.outcome || sim.pendingEvent) return null;
  const seen = sim.tipsSeen ?? [];
  for (const tip of TIPS) if (!seen.includes(tip.id) && tip.when(sim)) return tip;
  return null;
}
