import { MAP_RADIUS } from "./content";
import type { Terrain } from "./types";

export const HEX_SIZE = 1.18;

export function hexDist(q1: number, r1: number, q2 = 0, r2 = 0): number {
  const dq = q1 - q2;
  const dr = r1 - r2;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function hexRange(radius: number): { q: number; r: number }[] {
  const out: { q: number; r: number }[] = [];
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) out.push({ q, r });
  }
  return out;
}

function bowl(dist: number): number {
  return (dist / 9.2) ** 2 * 1.35;
}

function planar(q: number, r: number): [number, number] {
  return [HEX_SIZE * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r), HEX_SIZE * (3 / 2) * r];
}

/** Height of the outermost hex (the ring's corners) above the centre in a pit. */
const RIM_HEIGHT = Math.max(...hexRange(MAP_RADIUS).map(({ q, r }) => bowl(Math.hypot(...planar(q, r)))));

/**
 * Pointy-top axial → world. Y is the top of the tile above the ground (0).
 * Pit: centre is level with the ground and the rim rises. Hill: the rim's
 * lowest hexes are level with the ground and the centre is the summit.
 */
export function hexToWorld(q: number, r: number, terrain: Terrain = "pit"): [number, number, number] {
  const [x, z] = planar(q, r);
  const b = bowl(Math.hypot(x, z));
  const y = terrain === "pit" ? b : RIM_HEIGHT - b;
  return [x, y, z];
}

export function worldToAxial(x: number, z: number): { q: number; r: number } {
  const qf = ((Math.sqrt(3) / 3) * x - (1 / 3) * z) / HEX_SIZE;
  const rf = ((2 / 3) * z) / HEX_SIZE;
  return axialRound(qf, rf);
}

function axialRound(qf: number, rf: number): { q: number; r: number } {
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);
  const qd = Math.abs(q - qf);
  const rd = Math.abs(r - rf);
  const sd = Math.abs(s - sf);
  if (qd > rd && qd > sd) q = -r - s;
  else if (rd > sd) r = -q - s;
  return { q, r };
}
