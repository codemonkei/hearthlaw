/** Visual quality only — never read by the sim. */
export type FxQuality = "low" | "medium" | "high";

export const FX_ORDER: FxQuality[] = ["low", "medium", "high"];

export const FX_LABEL: Record<FxQuality, string> = { low: "Low", medium: "Medium", high: "High" };

/** What each tier turns on. Read by the canvas, the lights and the post-processing. */
export const FX_SETTINGS: Record<
  FxQuality,
  { dpr: [number, number]; shadows: boolean; shadowSize: number; post: boolean; multisampling: number }
> = {
  low: { dpr: [1, 1], shadows: false, shadowSize: 512, post: false, multisampling: 0 },
  medium: { dpr: [1, 1.25], shadows: true, shadowSize: 1024, post: true, multisampling: 0 },
  high: { dpr: [1, 1.75], shadows: true, shadowSize: 2048, post: true, multisampling: 4 },
};

/** Phones and tablets: fewer particles, since every one is moved on the CPU each frame. */
export const TOUCH = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

/** The GPU's name, when the browser will say. */
function gpuName(): string {
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return "none";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return String(name ?? "").toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Guess a sensible tier from the device: software renderers and small phones start on low,
 * other touch devices, integrated graphics and modest machines on medium, the rest on high.
 */
export function detectFxQuality(): FxQuality {
  if (typeof window === "undefined") return "high";
  const gpu = gpuName();
  if (gpu === "none" || /swiftshader|llvmpipe|softpipe|software|basic render/.test(gpu)) return "low";
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const memory = nav.deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 8;
  if (coarse) return memory <= 3 || cores <= 4 ? "low" : "medium";
  if (memory <= 2 || cores <= 2) return "low";
  const integrated = /intel|uhd|iris|hd graphics|mali|adreno|powervr|vega \d+ graphics|radeon\(tm\) graphics/.test(gpu);
  if (integrated || memory <= 4 || cores <= 4) return "medium";
  return "high";
}
