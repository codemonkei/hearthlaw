// Builds public/models/kenney-hex.glb from Kenney's "Hexagon Kit" (CC0).
//
//   npm run models:kenney [-- path/to/kenney_hexagon-kit.zip]
//
// Takes the tiles and buildings that fit a frozen cirque, merges them into one GLB with
// one named root node per model, and replaces the kit's shared palette with a graded
// "harsh winter" version of Kenney's own snow palette (variation A): muted rust instead
// of bright red roofs, frozen earth instead of orange tile sides, grey ice, colder whites.

import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, mergeDocuments, meshopt, prune } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";

const require = createRequire(import.meta.url);
const AdmZip = require("adm-zip");
const { PNG } = require("pngjs");

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..");
const OUT = path.join(ROOT, "public", "models", "kenney-hex.glb");

const MODELS = [
  // Tiles
  "grass",
  "grass-forest",
  "grass-hill",
  "dirt",
  "dirt-lumber",
  "stone",
  "stone-rocks",
  "stone-hill",
  // Buildings (each sits on its own tile)
  "building-cabin",
  "building-house",
  "building-village",
  "building-market",
  "building-mine",
  "building-smelter",
  "building-tower",
  "building-farm",
  "building-mill",
];

function findZip() {
  const arg = process.argv[2];
  if (arg) return path.resolve(arg);
  const dir = path.join(ROOT, "assetpacks");
  const hit = readdirSync(dir).find((f) => /kenney_hexagon-kit/i.test(f) && f.endsWith(".zip"));
  if (!hit) throw new Error(`No kenney_hexagon-kit zip in ${dir}. Pass its path as an argument.`);
  return path.join(dir, hit);
}

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
function harsh(r, g, b) {
  let [h, s, l] = rgbToHsl(r / 255, g / 255, b / 255);
  const warm = h < 50 || h > 320;
  if (s < 0.12 && l > 0.75) {
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

function gradePalette(pngBuffer) {
  const png = PNG.sync.read(pngBuffer);
  for (let i = 0; i < png.data.length; i += 4) {
    const [r, g, b] = harsh(png.data[i], png.data[i + 1], png.data[i + 2]);
    png.data[i] = r;
    png.data[i + 1] = g;
    png.data[i + 2] = b;
  }
  return PNG.sync.write(png);
}

async function main() {
  const zipPath = findZip();
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();
  const work = mkdtempSync(path.join(tmpdir(), "hearthlaw-kenney-"));
  mkdirSync(path.join(work, "Textures"));

  const entry = (suffix) => {
    const e = entries.find((x) => x.entryName.endsWith(suffix));
    if (!e) throw new Error(`Missing ${suffix} in ${path.basename(zipPath)}`);
    return e;
  };
  for (const name of MODELS) writeFileSync(path.join(work, `${name}.glb`), entry(`GLB format/${name}.glb`).getData());
  writeFileSync(path.join(work, "Textures", "colormap.png"), entry("GLB format/Textures/colormap.png").getData());
  const palette = gradePalette(entry("Models/Textures/variation-a.png").getData());
  writeFileSync(path.join(work, "harsh-palette.png"), palette);

  await MeshoptEncoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });

  const doc = new Document();
  doc.createBuffer();
  const scene = doc.createScene("kenney");
  doc.getRoot().setDefaultScene(scene);

  for (const name of MODELS) {
    const src = await io.read(path.join(work, `${name}.glb`));
    const srcScene = src.getRoot().getDefaultScene() ?? src.getRoot().listScenes()[0];
    const merged = mergeDocuments(doc, src).get(srcScene);
    const holder = doc.createNode(name);
    for (const child of merged.listChildren()) {
      merged.removeChild(child);
      holder.addChild(child);
    }
    scene.addChild(holder);
    merged.dispose();
  }

  const [keep, ...extra] = doc.getRoot().listBuffers();
  for (const b of extra) {
    for (const acc of doc.getRoot().listAccessors()) if (acc.getBuffer() === b) acc.setBuffer(keep);
    b.dispose();
  }
  await doc.transform(dedup(), prune());

  // Every model shares the one palette texture: swap in the graded winter version.
  for (const tex of doc.getRoot().listTextures()) {
    tex.setImage(new Uint8Array(palette)).setMimeType("image/png").setURI("harsh-palette.png");
  }
  await doc.transform(dedup(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));

  mkdirSync(path.dirname(OUT), { recursive: true });
  await io.write(OUT, doc);
  const previewPath = path.join(work, "harsh-palette.png");
  console.log(`Wrote ${path.relative(ROOT, OUT)} — ${MODELS.length} models, ${(statSync(OUT).size / 1024).toFixed(0)} KB`);
  console.log(`Textures: ${doc.getRoot().listTextures().length}; palette preview: ${previewPath}`);
  if (!process.env.KEEP_WORK) rmSync(work, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
