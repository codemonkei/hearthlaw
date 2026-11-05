/** Visual quality only — never read by the sim. */
export type FxQuality = "high" | "low";

/** Guess a sensible default: phones and small machines start on "low". */
export function detectFxQuality(): FxQuality {
  if (typeof window === "undefined") return "high";
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const lowMemory = nav.deviceMemory != null && nav.deviceMemory <= 4;
  const fewCores = (navigator.hardwareConcurrency ?? 8) <= 4;
  return coarse || lowMemory || fewCores ? "low" : "high";
}
