// Shared "harsh winter" grade for Kenney kits: muted rust instead of bright reds,
// frozen earth instead of orange, grey ice for blues, colder and dimmer whites.

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { PNG } = require("pngjs");

function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

/** Grade one palette pixel toward a cold, worn, low-saturation winter. */
export function harsh(r, g, b, opts = {}) {
  let [h, s, l] = rgbToHsl(r / 255, g / 255, b / 255);
  const warm = h < 50 || h > 320;
  if (opts.greenToBrown && h >= 75 && h < 178 && s > 0.2) {
    // Green and teal roofs, doors and shutters: weathered timber brown.
    h = 24;
    s = 0.34;
    l = 0.18 + l * 0.32;
  } else if (s < 0.12 && l > 0.75) {
    // Snow and frost: cold, a little dimmer so sunlit ground does not glare.
    h = 212;
    s = 0.1;
    l = l * 0.93;
  } else if (h >= 170 && h < 250) {
    // Water and bright blues: grey ice.
    h = 205;
    s = s * 0.35;
    l = Math.min(l, 0.72) * 0.95;
  } else if (h >= 250 && h <= 320) {
    // Purples and lavenders: slate.
    h = 222;
    s = s * 0.3;
    l = l * 0.8;
  } else if (warm && l < 0.45) {
    // Dark browns: soot-stained timber.
    s = s * 0.45;
    l = l * 0.75;
  } else if (warm) {
    // Red roofs, orange tile sides, peach: rust, frozen earth, weathered boards.
    h = h < 50 ? Math.max(12, h * 0.8) : h;
    s = s * 0.32;
    l = l * 0.52;
  } else {
    // Yellows, greens, greys: muted and cooled.
    s = s * 0.35;
    l = l * 0.85;
  }
  const [rr, gg, bb] = hslToRgb(h, Math.max(0, Math.min(1, s)), Math.max(0, Math.min(1, l)));
  return [Math.round(rr * 255), Math.round(gg * 255), Math.round(bb * 255)];
}

export function gradePalette(pngBuffer, opts = {}) {
  const png = PNG.sync.read(pngBuffer);
  for (let i = 0; i < png.data.length; i += 4) {
    const [r, g, b] = harsh(png.data[i], png.data[i + 1], png.data[i + 2], opts);
    png.data[i] = r;
    png.data[i + 1] = g;
    png.data[i + 2] = b;
  }
  return PNG.sync.write(png);
}

/** Grade a glTF baseColorFactor (linear RGBA) the same way. */
export function gradeFactor([r, g, b, a], opts = {}) {
  const toS = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  const toL = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const [rr, gg, bb] = harsh(toS(r) * 255, toS(g) * 255, toS(b) * 255, opts);
  return [toL(rr / 255), toL(gg / 255), toL(bb / 255), a];
}
