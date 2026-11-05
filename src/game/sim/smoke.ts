import { BUILDINGS } from "./content";
import { createGame, placeBuilding, resolveEvent, setPressure, stepMinute, upgradeBuilding } from "./engine";
import { tileAt } from "./engine";
import type { BuildingKind, SimState } from "./types";

function findTile(sim: SimState, deposit: SimState["tiles"][number]["deposit"]) {
  return sim.tiles.find((t) => t.deposit === deposit && t.buildingId == null && !(t.q === 0 && t.r === 0));
}

function findEmptyNear(sim: SimState, maxDist: number) {
  return sim.tiles.find((t) => {
    if (t.buildingId != null || (t.q === 0 && t.r === 0)) return false;
    const dist = (Math.abs(t.q) + Math.abs(t.r) + Math.abs(t.q + t.r)) / 2;
    return dist <= maxDist && dist >= 1 && t.deposit === "none";
  });
}

function countKind(sim: SimState, kind: BuildingKind) {
  return sim.buildings.filter((b) => b.kind === kind).length;
}

function bot(sim: SimState) {
  const housing = sim.buildings.filter((b) => BUILDINGS[b.kind].housing > 0).length;
  const living =
    sim.pop.healthy.labourers +
    sim.pop.healthy.specialists +
    sim.pop.healthy.dependents +
    sim.pop.ill.labourers +
    sim.pop.ill.specialists +
    sim.pop.ill.dependents +
    sim.pop.gravely.labourers +
    sim.pop.gravely.specialists +
    sim.pop.gravely.dependents;
  const tryPlace = (kind: BuildingKind, tile: { q: number; r: number } | undefined) => {
    if (!tile) return;
    placeBuilding(sim, kind, tile.q, tile.r);
  };
  if (countKind(sim, "peat") < 3) tryPlace("peat", findTile(sim, "peat"));
  if (countKind(sim, "trappers") < 2) tryPlace("trappers", findTile(sim, "lichen"));
  if (countKind(sim, "mess") < 1 && countKind(sim, "peat") >= 1) tryPlace("mess", findEmptyNear(sim, 3));
  if (housing * 10 < living) tryPlace("tent", findEmptyNear(sim, 2));
  if (countKind(sim, "wood") < 1) tryPlace("wood", findTile(sim, "timber"));
  if (countKind(sim, "infirmary") < 1 && sim.resources.timber >= 40) tryPlace("infirmary", findEmptyNear(sim, 3));
  if (countKind(sim, "survey") < 1 && sim.resources.timber >= 50) tryPlace("survey", findEmptyNear(sim, 3));
  if (sim.resources.timber >= 80) {
    const tent = sim.buildings.find((b) => b.kind === "tent");
    if (tent) upgradeBuilding(sim, tent.id);
  }
  const day = Math.floor(sim.minute / 1440) + 1;
  if (day >= 6 && day <= 7) setPressure(sim, sim.resources.fuel > 200 ? 3 : 2);
  else if (sim.resources.fuel > 180) setPressure(sim, 2);
  else setPressure(sim, 1);
  if (sim.kiln.radius < 2 && day >= 2) {
    sim.kiln.radius = 2;
  }
  void tileAt;
}

const sim = createGame(192011);
resolveEvent(sim, "take");
let guard = 0;
while (!sim.outcome && guard < 20000) {
  if (sim.pendingEvent) resolveEvent(sim, sim.pendingEvent === "shaft-boy" ? "close" : sim.pendingEvent === "strangers" ? "quarantine" : sim.pendingEvent === "bread" ? "rations" : sim.pendingEvent === "burial" ? "ash" : sim.pendingEvent === "crisis" ? "bleed" : "ok");
  if (sim.minute % 60 === 0) bot(sim);
  const before = sim.minute;
  stepMinute(sim);
  if (sim.minute === before && !sim.outcome) break;
  guard++;
  if (sim.minute % 1440 === 0) {
    const living =
      sim.pop.healthy.labourers +
      sim.pop.healthy.specialists +
      sim.pop.healthy.dependents +
      sim.pop.ill.labourers +
      sim.pop.ill.specialists +
      sim.pop.ill.dependents +
      sim.pop.gravely.labourers +
      sim.pop.gravely.specialists +
      sim.pop.gravely.dependents;
    console.log(
      `day boundary minute ${sim.minute} fuel ${sim.resources.fuel} meals ${sim.resources.meals} living ${living} dead ${sim.pop.dead} resolve ${Math.round(sim.morale.resolve / 10)} grievance ${Math.round(sim.morale.grievance / 10)} buildings ${sim.buildings.length} event ${sim.pendingEvent}`,
    );
  }
}
console.log("OUTCOME", sim.outcome, "minute", sim.minute, "dead", sim.pop.dead, "fuel", sim.resources.fuel, "meals", sim.resources.meals);
console.log(sim.log.slice(0, 8).map((l) => l.text).join(" | "));
