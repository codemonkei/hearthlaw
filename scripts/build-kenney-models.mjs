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
import { gradePalette } from "./lib/winter-palette.mjs";

const require = createRequire(import.meta.url);
const AdmZip = require("adm-zip");

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
