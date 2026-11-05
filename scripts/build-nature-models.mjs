// Builds public/models/nature.glb from Quaternius' "Ultimate Nature Pack" (CC0).
//
//   npm run models:nature [-- path/to/pack.zip]
//
// Only the snow-and-cold subset is taken. Each model becomes one named root node
// in a single GLB (one request), materials are deduplicated across models, and
// geometry is meshopt-compressed. The zip itself stays out of git (assetpacks/).

import { createRequire } from "node:module";
import { mkdtempSync, readdirSync, rmSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, mergeDocuments, meshopt, prune, weld } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";

const require = createRequire(import.meta.url);
const AdmZip = require("adm-zip");
const obj2gltf = require("obj2gltf");

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..");
const OUT = path.join(ROOT, "public", "models", "nature.glb");

/** The cold subset: what a glacier cirque would actually hold. */
const MODELS = [
  ...[1, 2, 3, 4, 5].map((i) => `PineTree_Snow_${i}`),
  ...[1, 2, 3, 4, 5, 6, 7].map((i) => `Rock_Snow_${i}`),
  ...[1, 2, 3, 4, 5, 6, 7].map((i) => `Rock_Moss_${i}`),
  ...[1, 2, 3].map((i) => `BirchTree_Dead_Snow_${i}`),
  ...[1, 2, 3].map((i) => `CommonTree_Dead_Snow_${i}`),
  "Bush_Snow_1",
  "Bush_Snow_2",
  "TreeStump_Snow",
  "WoodLog_Snow",
];

function findZip() {
  const arg = process.argv[2];
  if (arg) return path.resolve(arg);
  const dir = path.join(ROOT, "assetpacks");
  const hit = readdirSync(dir).find((f) => /ultimate nature pack/i.test(f) && f.endsWith(".zip"));
  if (!hit) throw new Error(`No "Ultimate Nature Pack" zip in ${dir}. Pass its path as an argument.`);
  return path.join(dir, hit);
}

async function main() {
  const zipPath = findZip();
  const zip = new AdmZip(zipPath);
  const work = mkdtempSync(path.join(tmpdir(), "hearthlaw-nature-"));
  const entries = zip.getEntries();

  // Pull just the OBJ + MTL pairs we want into a scratch folder.
  for (const name of MODELS) {
    for (const ext of [".obj", ".mtl"]) {
      const e = entries.find((x) => x.entryName.includes("/OBJ/") && x.entryName.endsWith(`/${name}${ext}`));
      if (!e) throw new Error(`Missing ${name}${ext} in ${path.basename(zipPath)}`);
      writeFileSync(path.join(work, `${name}${ext}`), e.getData());
    }
  }

  await MeshoptEncoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.encoder": MeshoptEncoder });

  const doc = new Document();
  doc.createBuffer();
  const scene = doc.createScene("nature");
  doc.getRoot().setDefaultScene(scene);

  for (const name of MODELS) {
    const glb = await obj2gltf(path.join(work, `${name}.obj`), { binary: true });
    const src = await io.readBinary(new Uint8Array(glb));
    const srcScene = src.getRoot().getDefaultScene() ?? src.getRoot().listScenes()[0];
    const map = mergeDocuments(doc, src);
    const merged = map.get(srcScene);
    const holder = doc.createNode(name);
    for (const child of merged.listChildren()) {
      merged.removeChild(child);
      holder.addChild(child);
    }
    scene.addChild(holder);
    merged.dispose();
  }

  // One buffer, shared materials, welded and compressed geometry.
  const [keep, ...extra] = doc.getRoot().listBuffers();
  for (const b of extra) {
    for (const acc of doc.getRoot().listAccessors()) if (acc.getBuffer() === b) acc.setBuffer(keep);
    b.dispose();
  }
  await doc.transform(weld(), dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));

  mkdirSync(path.dirname(OUT), { recursive: true });
  await io.write(OUT, doc);
  rmSync(work, { recursive: true, force: true });

  const mats = doc.getRoot().listMaterials().map((m) => m.getName());
  console.log(`Wrote ${path.relative(ROOT, OUT)} — ${MODELS.length} models, ${(statSync(OUT).size / 1024).toFixed(0)} KB`);
  console.log(`Materials: ${mats.join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
