# Hearthlaw

Keep the fire. Write the law. Live with both.

Hearthlaw is an original survival city-builder. A convoy of rail workers, miners, and archivists has stalled in a glacier cirque where a buried pre-collapse thermal engine — **the Kiln** — still breathes. You are the Warden of the Charter. Warmth is a fuel dial. The law is a book the people can refuse.

This repository is the **First Watch** prototype: the opening of the scenario *The Kindling*. It is not a finished 1.0.

## Play the slice

Hold until **dawn of day 8**. Days 6 and 7 are the Hush, a killing cold.

- Place **peat cutters** on the dark seams or the Kiln starves.
- Keep people under roofs inside the heat. Canvas is one band warmer than the wind. Huts and longhouses are warmer still.
- The mess turns raw provisions into meals. Mouths are counted at dawn.
- Specialists go to the infirmary and the Survey Hall before the ironworks.
- The Charter is voted by four circles (60 seats, 31 to pass). A decree always passes, and liberty pays for it.
- Surge adds heat instantly. Strain breaks the Kiln. A second breaking ends the city.

### Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Pan | Drag, or WASD / arrows | One-finger drag |
| Zoom | Scroll | Pinch |
| Turn | Right-drag, or Q / E | Two-finger twist |
| Place | Select a building, click a tile | Select, tap a tile, confirm |
| Pause / speeds | Space, or the time buttons | Time buttons |
| Heat overlay | O, or the eye | The eye |

Saves live in this browser (`hearthlaw.save.v1`).

## What is already in the sim

Deterministic minute-by-minute simulation (seeded sfc32), integer resources, cohort population (labourers, specialists, dependents × healthy / ill / gravely), heat as outdoor band + strongest source + insulation + heater, Kiln pressure / radius / surge / strain, Book I clauses, a four-circle vote, four survey methods, named dilemmas, and a Chronicle of Lives, Liberty, Kinship, and Truth.

The scene is Three.js (React Three Fiber) on WebGL, with a WebGPU path planned once the WebGL slice is the reference. The simulation is pure TypeScript under `src/game/sim` and does not import the renderer.

## Layout

```
src/game/sim     engine, content, save schema
src/game/scene   cirque, Kiln, hex ring
src/game/ui      charter, HUD, dilemmas
```

## Names that are ours

The Kiln, the Pall, the Hush, the Charter, the Warden, the circles (Stokers, Pathfinders, Hearthkin, Ledger House), Heartstones when they arrive. Genre ideas — a heat radius, morale, branching laws — are not anyone's property. The expression here is written from scratch.

## Not in this slice yet

Conviction paths, the Reaches, Steam Walkers, scenarios 2–5, Endless, a worker thread, and fixed-point Q16.16 math. Those are the road out of First Watch, not a promise of a date.
