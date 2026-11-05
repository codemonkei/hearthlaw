/** sfc32 seeded PRNG. State is four uint32s stored on the sim. */

export function seedRng(seed: number): [number, number, number, number] {
  let a = seed >>> 0;
  const next = () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    return a;
  };
  return [next(), next(), next(), next()];
}

export function nextRand(state: [number, number, number, number]): {
  value: number;
  state: [number, number, number, number];
} {
  let a = state[0] >>> 0;
  let b = state[1] >>> 0;
  let c = state[2] >>> 0;
  let d = state[3] >>> 0;
  const t = (a + b) | 0;
  a = (b ^ (b >>> 9)) >>> 0;
  b = ((c + (c << 3)) | 0) >>> 0;
  c = (((c << 21) | (c >>> 11)) >>> 0) >>> 0;
  d = ((d + 1) | 0) >>> 0;
  const t2 = ((t + d) | 0) >>> 0;
  c = ((c + t2) | 0) >>> 0;
  return { value: t2 / 4294967296, state: [a, b, c, d] };
}

export function rand(sim: { rng: [number, number, number, number] }): number {
  const out = nextRand(sim.rng);
  sim.rng = out.state;
  return out.value;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Whole events plus a fractional coin-flip. Deterministic given rng. */
export function rollCount(n: number, p: number, draw: () => number): number {
  if (n <= 0 || p <= 0) return 0;
  const expected = n * p;
  const whole = Math.floor(expected);
  const frac = expected - whole;
  return whole + (draw() < frac ? 1 : 0);
}
