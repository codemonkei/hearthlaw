// Builds public/models/town.glb: the modular parts Hearthlaw's buildings are assembled from,
// taken from four Kenney kits (all CC0) and graded to the same harsh winter palette.
//
//   npm run models:town
//
// Root nodes are named "<kit>_<part>", e.g. "holiday_cabin-wall" or "space_chimney_detailed"
// (three's GLTFLoader strips "/" from node names, so no slash).
// Textured kits have their palette image graded; the space kit's flat material colours are
// graded the same way.

import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, mergeDocuments, meshopt, prune } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import { gradeFactor, gradePalette } from "./lib/winter-palette.mjs";

const require = createRequire(import.meta.url);
const AdmZip = require("adm-zip");

/** Town parts: green and teal roofs become timber brown; snow is added live by a shader. */
const GRADE = { greenToBrown: true };

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..");
const OUT = path.join(ROOT, "public", "models", "town.glb");

const KITS = [
  {
    id: "holiday",
    zip: /kenney_holiday-kit/i,
    dir: "GLB format",
    parts: [
      "cabin-wall", "cabin-wall-low", "cabin-wall-roof-center", "cabin-corner-logs", "cabin-doorway",
      "cabin-window-a", "cabin-window-large", "cabin-roof-point", "cabin-roof-top", "floor-wood-snow",
      "floor-stone", "snow-pile", "snow-bunker", "sled", "sled-long", "lantern", "bench",
      "train-locomotive", "train-tender", "train-wagon", "train-wagon-logs", "train-wagon-flat",
      "trainset-rail-straight", "rocks-medium",
    ],
  },
  {
    id: "fantasy",
    zip: /kenney_fantasy-town-kit/i,
    dir: "GLB format",
    parts: [
      "wall", "wall-wood", "wall-wood-door", "wall-wood-window-small", "wall-wood-broken", "wall-block",
      "roof-gable", "roof-flat", "roof-high-point", "chimney", "chimney-top", "pillar-wood", "planks",
      "poles-horizontal", "cart", "cart-high", "stall", "stall-red", "banner-red", "overhang", "fence-broken",
    ],
  },
  {
    id: "space",
    zip: /kenney_space-kit/i,
    dir: "GLTF format",
    // Each space-kit model sits at an arbitrary offset in its file; recentre on the origin.
    recentre: true,
    parts: [
      "chimney_detailed", "machine_barrelLarge", "machine_generatorLarge", "barrels", "barrel",
      "pipe_straight", "pipe_end", "pipe_supportHigh", "pipe_ring", "supports_high",
    ],
  },
];

function findZip(re) {
  const dir = path.join(ROOT, "assetpacks");
  const hit = readdirSync(dir).find((f) => re.test(f) && f.endsWith(".zip"));
  if (!hit) throw new Error(`No zip matching ${re} in ${dir}.`);
  return path.join(dir, hit);
}

async function main() {
  await MeshoptEncoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
  const work = mkdtempSync(path.join(tmpdir(), "hearthlaw-town-"));

  const doc = new Document();
  doc.createBuffer();
  const scene = doc.createScene("town");
  doc.getRoot().setDefaultScene(scene);
  const gradedImages = new WeakSet();

  for (const kit of KITS) {
    const zip = new AdmZip(findZip(kit.zip));
    const entries = zip.getEntries();
    const kitDir = path.join(work, kit.id);
    mkdirSync(path.join(kitDir, "Textures"), { recursive: true });
    const tex = entries.find((e) => e.entryName.includes(`${kit.dir}/Textures/colormap.png`));
    if (tex) writeFileSync(path.join(kitDir, "Textures", "colormap.png"), tex.getData());

    for (const part of kit.parts) {
      const e = entries.find((x) => x.entryName.endsWith(`${kit.dir}/${part}.glb`));
      if (!e) throw new Error(`Missing ${kit.id}/${part}`);
      const file = path.join(kitDir, `${part}.glb`);
      writeFileSync(file, e.getData());
      const src = await io.read(file);

      // Grade colours in the source document before merging.
      for (const t of src.getRoot().listTextures()) {
        if (gradedImages.has(t)) continue;
        t.setImage(new Uint8Array(gradePalette(Buffer.from(t.getImage()), GRADE))).setMimeType("image/png");
        gradedImages.add(t);
      }
      for (const m of src.getRoot().listMaterials()) {
        if (!m.getBaseColorTexture()) m.setBaseColorFactor(gradeFactor(m.getBaseColorFactor(), GRADE));
        m.setMetallicFactor(0);
      }

      const srcScene = src.getRoot().getDefaultScene() ?? src.getRoot().listScenes()[0];
      const merged = mergeDocuments(doc, src).get(srcScene);
      const holder = doc.createNode(`${kit.id}_${part}`);
      for (const child of merged.listChildren()) {
        merged.removeChild(child);
        if (kit.recentre) child.setTranslation([0, 0, 0]);
        holder.addChild(child);
      }
      scene.addChild(holder);
      merged.dispose();
    }
  }

  const [keep, ...extra] = doc.getRoot().listBuffers();
  for (const b of extra) {
    for (const acc of doc.getRoot().listAccessors()) if (acc.getBuffer() === b) acc.setBuffer(keep);
    b.dispose();
  }
  await doc.transform(dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));

  mkdirSync(path.dirname(OUT), { recursive: true });
  await io.write(OUT, doc);
  const count = KITS.reduce((n, k) => n + k.parts.length, 0);
  console.log(`Wrote ${path.relative(ROOT, OUT)} — ${count} parts, ${(statSync(OUT).size / 1024).toFixed(0)} KB, ${doc.getRoot().listTextures().length} textures, ${doc.getRoot().listMaterials().length} materials`);
  rmSync(work, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
