# Credits

## 3D models

- **Ultimate Nature Pack** by [Quaternius](https://quaternius.com) — CC0 1.0 (public domain).
  The snow-and-cold subset (pines, rocks, dead trees, bushes, stumps, logs) is built into
  `public/models/nature.glb` by `npm run models:nature`, which reads the original zip from
  `assetpacks/` (not committed). Colours are replaced at runtime with Hearthlaw's palette.

- **Hexagon Kit** by [Kenney](https://kenney.nl) — CC0 1.0 (public domain). *Experimental tileset
  (toggle with K).* Tiles and buildings are built into `public/models/kenney-hex.glb` by
  `npm run models:kenney`, with the kit's own snow palette regraded to a harsher winter.

- **Holiday Kit**, **Fantasy Town Kit 2.0** and **Space Kit** by [Kenney](https://kenney.nl) — CC0 1.0.
  Modular parts every building is assembled from (log cabins, timber, stone, chimneys, pipes,
  the stalled convoy), built into `public/models/town.glb` by `npm run models:town` and graded
  to the same harsh winter palette. Blueprints live in `src/game/scene/Town.tsx`.

Everything else in the scene is drawn in code.
