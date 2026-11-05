import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { Embers, Smoke } from "@/game/scene/Atmosphere";
import { useKilnLab, type KilnFeature } from "@/game/scene/kilnLab";

/*
 * The Kiln: a buried pre-collapse thermal engine that still breathes.
 * A riveted iron drum half-sunk in a stone foundation, fire showing through barred grates,
 * a banded smokestack, and copper heat pipes running down into the ice. (Base look: kiln-v1.)
 *
 * Candidate features are switched in the Kiln Lab (see kilnLab.ts):
 *   presence  — taller and broader, on a higher plinth
 *   age       — rust streaks, riveted patches, soot, frost climbing the drum
 *   mechanism — a second stack, a valve ring, a ladder to a catwalk, a steam vent
 *   life      — peat, a cart, tools, braziers, two workers
 *   feedback  — pipes glow at high pressure, frost melts with heat, strain cracks the drum
 *
 * Local units: y = 0 is the slab centre of the Kiln's tile (the tile top is y = 0.1).
 */

const TILE_TOP = 0.1;
const FLAT = { flatShading: true } as const;

const STONE = "#596068";
const IRON = "#2b3239";
const IRON_LIGHT = "#3c454e";
const COPPER = "#9a5430";
const COPPER_OLD = "#6e4a33";
const RUST = "#6f341b";
const SOOT = "#15171a";
const SNOW = "#dde5ec";
const FROST = "#e2ecf3";
const ICE = "#c7dce8";
const TIMBER = "#4a3327";
const PEAT = "#2e2620";
const COAT = "#3a3230";

const DRUM_R = 0.95;
const PLINTH_H = 0.32;
const PLINTH_TOP = TILE_TOP + PLINTH_H;
const DRUM_BOTTOM = PLINTH_TOP;
const DRUM_TOP = DRUM_BOTTOM + 0.98;
const GRATE_Y = DRUM_BOTTOM + 0.42;
const BASE_STACK_TOP = 3.35;

/** Presence: the body grows up more than out, so it still clears the neighbouring tiles. */
const PRESENCE_BODY: [number, number, number] = [1.12, 1.3, 1.12];
const PRESENCE_PLINTH: [number, number, number] = [1.08, 1.45, 1.08];

/** Where the heat pipes leave the drum, and where the grates sit between them. */
const PIPE_ANGLES = [0, 1, 2, 3].map((i) => (i / 4) * Math.PI * 2);
const GRATE_ANGLES = PIPE_ANGLES.map((a) => a + Math.PI / 4);
const FRONT = Math.PI / 4;

const at = (a: number, r: number, y: number): [number, number, number] => [Math.sin(a) * r, y, Math.cos(a) * r];

/** Height of the smokestack mouth for the active features: smoke and embers start here. */
export function kilnStackTop(features: Record<KilnFeature, boolean>): number {
  if (!features.presence) return BASE_STACK_TOP;
  const plinthTop = TILE_TOP + PLINTH_H * PRESENCE_PLINTH[1];
  return plinthTop + (BASE_STACK_TOP - PLINTH_TOP) * PRESENCE_BODY[1];
}

function lathe(points: [number, number][], segments: number) {
  return new THREE.LatheGeometry(
    points.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
  );
}

/** A copper heat pipe: out of the drum, over an elbow, and down into the plinth. */
function pipeGeometry(radius = 0.075) {
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(DRUM_R - 0.05, GRATE_Y + 0.3, 0),
    new THREE.Vector3(DRUM_R + 0.16, GRATE_Y + 0.3, 0),
    new THREE.Vector3(DRUM_R + 0.25, GRATE_Y + 0.12, 0),
    new THREE.Vector3(DRUM_R + 0.26, TILE_TOP + 0.2, 0),
  ]);
  return new THREE.TubeGeometry(path, 16, radius, 7, false);
}

/** A jagged crack: a few short emissive segments in a zigzag, flat against the drum. */
const CRACKS: { a: number; y: number; segs: [number, number, number][] }[] = [
  { a: 0.35, y: GRATE_Y + 0.28, segs: [[0, 0, 0.6], [0.06, -0.09, -0.4], [0.02, -0.19, 0.5]] },
  { a: 2.05, y: GRATE_Y + 0.05, segs: [[0, 0, -0.5], [-0.05, -0.1, 0.4], [0.01, -0.2, -0.3], [-0.04, -0.3, 0.6]] },
  { a: 3.55, y: GRATE_Y + 0.35, segs: [[0, 0, 0.3], [0.05, -0.08, -0.6], [0.0, -0.18, 0.4]] },
  { a: 5.2, y: GRATE_Y + 0.15, segs: [[0, 0, -0.4], [0.04, -0.1, 0.5], [-0.02, -0.2, -0.5]] },
];

export function Kiln(props: { strain: number; pressure: number; surge: boolean; running: boolean }) {
  const features = useKilnLab((s) => s.features);
  const preview = useKilnLab((s) => s.preview);
  // The lab can preview states without touching the sim.
  const { strain, pressure, surge, running } = preview.on
    ? { strain: preview.strain, pressure: preview.pressure, surge: preview.surge, running: preview.pressure > 0 }
    : props;
  const { presence, age, mechanism, life, feedback } = features;

  const light = useRef<THREE.PointLight>(null);
  const iceGroup = useRef<THREE.Group>(null);
  const flames = useRef<THREE.Mesh[]>([]);
  const mats = useMemo(
    () => ({
      grate: new THREE.MeshStandardMaterial({ color: "#2a0d05", emissive: "#ff7a2a", emissiveIntensity: 2, ...FLAT }),
      mouth: new THREE.MeshStandardMaterial({ color: "#2a0d05", emissive: "#ffb15c", emissiveIntensity: 3, side: THREE.DoubleSide }),
      iron: new THREE.MeshStandardMaterial({ color: IRON, metalness: 0.5, roughness: 0.55, emissive: "#ff3a12", emissiveIntensity: 0, ...FLAT }),
      copper: new THREE.MeshStandardMaterial({ color: COPPER, metalness: 0.6, roughness: 0.38, emissive: "#ff6a20", emissiveIntensity: 0, ...FLAT }),
      /** Heat pipes: copper when cool; when hot they glow with the same fire as the grates. */
      pipe: new THREE.MeshStandardMaterial({ color: COPPER, metalness: 0.6, roughness: 0.38, emissive: "#ff7a2a", emissiveIntensity: 0, ...FLAT }),
      snowLip: new THREE.MeshStandardMaterial({ color: SNOW, roughness: 0.9, ...FLAT }),
      frost: new THREE.MeshStandardMaterial({ color: FROST, roughness: 0.7, transparent: true, opacity: 0.85, ...FLAT }),
      crack: new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff5a1f").multiplyScalar(3), toneMapped: false, transparent: true }),
      brazier: new THREE.MeshStandardMaterial({ color: "#2a0d05", emissive: "#ff8a30", emissiveIntensity: 3, ...FLAT }),
    }),
    [],
  );
  const geo = useMemo(
    () => ({
      shoulder: lathe(
        [
          [DRUM_R - 0.02, 0],
          [DRUM_R - 0.06, 0.18],
          [0.8, 0.38],
          [0.6, 0.55],
          [0.42, 0.66],
        ],
        14,
      ),
      flare: lathe(
        [
          [0.24, 0],
          [0.27, 0.08],
          [0.36, 0.2],
          [0.38, 0.24],
          [0.3, 0.24],
          [0.24, 0.12],
        ],
        12,
      ),
      smallFlare: lathe(
        [
          [0.11, 0],
          [0.13, 0.05],
          [0.18, 0.12],
          [0.14, 0.12],
          [0.11, 0.06],
        ],
        10,
      ),
      pipe: pipeGeometry(),
    }),
    [],
  );
  const whiteHot = useMemo(() => new THREE.Color("#ffd8a8"), []);
  const fire = useMemo(() => new THREE.Color("#ff7a2a"), []);
  const snowColor = useMemo(() => new THREE.Color(SNOW), []);
  const wetStone = useMemo(() => new THREE.Color("#6a7178"), []);
  const ember = useMemo(() => new THREE.Color("#2a0d05"), []);
  const pipeCopper = useMemo(() => new THREE.Color(COPPER), []);

  mats.copper.color.set(age ? COPPER_OLD : COPPER);
  pipeCopper.set(age ? COPPER_OLD : COPPER);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const s = Math.min(1, strain / 1000);
    // Fire breathes faster as strain rises.
    const breath = Math.sin(t * (1.6 + s * 6)) * 0.5 + 0.5;
    const flicker = Math.sin(t * 13.1) * 0.06 + Math.sin(t * 7.3) * 0.05;
    const heat = running ? 1.2 + pressure * 0.6 + (surge ? 1.4 : 0) : 0.08;
    mats.grate.emissiveIntensity = heat * (0.85 + breath * 0.2 + flicker);
    mats.grate.emissive.copy(fire).lerp(whiteHot, surge ? 0.6 : 0);
    mats.mouth.emissiveIntensity = running ? heat * 0.7 : 0.1;
    // Strain: the iron itself glows, pulsing as the vessel labours.
    mats.iron.emissiveIntensity = s * s * (0.25 + breath * 0.55);
    if (light.current) light.current.intensity = running ? heat * (4 + breath * 0.8) * (presence ? 1.2 : 1) : 0.4;

    // Feedback: hot pipes, frost that retreats from the heat, cracks under strain.
    // 0 at pressure 2, about half at pressure 4, full when surged at high pressure.
    const glow = feedback ? THREE.MathUtils.clamp((heat - 2.3) / 2.7, 0, 1) : 0;
    const pulse = 0.85 + breath * 0.15;
    mats.copper.emissiveIntensity = glow * 0.9 * pulse;
    // The pipes take on the grates' own fire: same colour, same breathing and flicker,
    // fading in with the heat while the copper darkens to an ember underneath.
    mats.pipe.emissive.copy(mats.grate.emissive);
    mats.pipe.emissiveIntensity = mats.grate.emissiveIntensity * glow;
    mats.pipe.color.copy(pipeCopper).lerp(ember, glow);
    mats.pipe.metalness = 0.6 * (1 - glow);
    const frostLeft = feedback ? THREE.MathUtils.clamp(1 - (heat - 1.2) / 3.2, 0.12, 1) : 1;
    mats.snowLip.color.copy(wetStone).lerp(snowColor, frostLeft);
    mats.frost.opacity = 0.85 * frostLeft;
    if (iceGroup.current) iceGroup.current.scale.setScalar(0.45 + 0.55 * frostLeft);
    const crackOn = feedback && s > 0.3;
    mats.crack.opacity = crackOn ? Math.min(1, (s - 0.3) * 2.2) * (0.6 + breath * 0.4) : 0;

    for (const f of flames.current) {
      if (!f) continue;
      const k = 1 + Math.sin(t * 9 + f.id) * 0.12 + Math.sin(t * 15.3 + f.id * 2) * 0.08;
      f.scale.set(1, k, 1);
    }
    mats.brazier.emissiveIntensity = 2.6 + flicker * 6;
  });

  const plinthScale: [number, number, number] = presence ? PRESENCE_PLINTH : [1, 1, 1];
  const plinthTop = TILE_TOP + PLINTH_H * plinthScale[1];
  const bodyScale: [number, number, number] = presence ? PRESENCE_BODY : [1, 1, 1];
  const stackTop = kilnStackTop(features);
  // Everything that grows with presence is drawn in base units around the plinth top.
  const body = (y: number) => y - PLINTH_TOP;

  return (
    <group>
      {/* Foundation: octagonal stone plinth, buttresses, a snow lip, ice at the foot. */}
      <group scale={plinthScale} position={[0, TILE_TOP * (1 - plinthScale[1]), 0]}>
        <mesh position={[0, TILE_TOP + PLINTH_H / 2, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[1.38, 1.5, PLINTH_H, 8]} />
          <meshStandardMaterial color={STONE} roughness={0.95} {...FLAT} />
        </mesh>
        <mesh position={[0, PLINTH_TOP + 0.01, 0]} material={mats.snowLip} receiveShadow>
          <cylinderGeometry args={[1.36, 1.38, 0.035 / plinthScale[1], 8]} />
        </mesh>
      </group>
      <group ref={iceGroup}>
        {[0.3, 1.2, 2.1, 2.9, 3.8, 4.7, 5.6].map((a, i) => (
          <mesh key={`ice-${i}`} position={at(a, (1.48 + (i % 3) * 0.07) * plinthScale[0], TILE_TOP + 0.05)} rotation={[i * 0.7, a, i * 0.3]} scale={[1, 0.6, 1]} castShadow>
            <icosahedronGeometry args={[0.13 + (i % 3) * 0.05, 0]} />
            <meshStandardMaterial color={ICE} roughness={0.35} {...FLAT} />
          </mesh>
        ))}
      </group>

      <group position={[0, plinthTop, 0]} scale={bodyScale}>
        {PIPE_ANGLES.map((a, i) => (
          <mesh key={`buttress-${i}`} position={at(a, 1.18, body(TILE_TOP + 0.38))} rotation={[0, a, 0]} castShadow>
            <boxGeometry args={[0.3, 0.22, 0.34]} />
            <meshStandardMaterial color={STONE} roughness={0.95} {...FLAT} />
          </mesh>
        ))}

        {/* The drum: riveted iron, ribbed, banded. */}
        <mesh position={[0, body((DRUM_BOTTOM + DRUM_TOP) / 2), 0]} material={mats.iron} castShadow receiveShadow>
          <cylinderGeometry args={[DRUM_R - 0.03, DRUM_R, DRUM_TOP - DRUM_BOTTOM, 16]} />
        </mesh>
        {/* Ribs everywhere except where the grates are cut into the drum. */}
        {Array.from({ length: 16 }, (_, i) => i)
          .filter((i) => i % 4 !== 2)
          .map((i) => (i / 16) * Math.PI * 2)
          .map((a, i) => (
            <mesh key={`rib-${i}`} position={at(a, DRUM_R, body((DRUM_BOTTOM + DRUM_TOP) / 2))} rotation={[0, a, 0]} castShadow>
              <boxGeometry args={[0.06, DRUM_TOP - DRUM_BOTTOM, 0.06]} />
              <meshStandardMaterial color={IRON_LIGHT} metalness={0.5} roughness={0.5} {...FLAT} />
            </mesh>
          ))}
        {[DRUM_BOTTOM + 0.05, DRUM_TOP - 0.05].map((y) => (
          <mesh key={`band-${y}`} position={[0, body(y), 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[DRUM_R + 0.02, 0.045, 6, 24]} />
            <meshStandardMaterial color={IRON_LIGHT} metalness={0.55} roughness={0.45} {...FLAT} />
          </mesh>
        ))}

        {/* Fire grates: where you see the Kiln breathe. */}
        {GRATE_ANGLES.map((a, i) => (
          <group key={`grate-${i}`} position={at(a, DRUM_R + 0.01, body(GRATE_Y))} rotation={[0, a, 0]}>
            <mesh position={[0, 0, 0.01]}>
              <boxGeometry args={[0.46, 0.34, 0.05]} />
              <meshStandardMaterial color={IRON_LIGHT} metalness={0.5} roughness={0.5} {...FLAT} />
            </mesh>
            <mesh position={[0, 0, 0.04]} material={mats.grate}>
              <planeGeometry args={[0.36, 0.24]} />
            </mesh>
            {[-0.12, -0.04, 0.04, 0.12].map((x) => (
              <mesh key={x} position={[x, 0, 0.06]}>
                <boxGeometry args={[0.025, 0.26, 0.025]} />
                <meshStandardMaterial color="#161a1e" {...FLAT} />
              </mesh>
            ))}
          </group>
        ))}

        {/* Shoulder: the iron dome with a copper pressure collar. */}
        <mesh geometry={geo.shoulder} position={[0, body(DRUM_TOP), 0]} material={mats.iron} castShadow />
        <mesh position={[0, body(DRUM_TOP + 0.02), 0]} rotation={[Math.PI / 2, 0, 0]} material={mats.copper} castShadow>
          <torusGeometry args={[DRUM_R - 0.01, 0.065, 6, 24]} />
        </mesh>

        {/* The stack: banded, flared, glowing at the mouth. */}
        <mesh position={[0, body((DRUM_TOP + 0.55 + BASE_STACK_TOP - 0.24) / 2), 0]} castShadow>
          <cylinderGeometry args={[0.24, 0.32, BASE_STACK_TOP - 0.24 - (DRUM_TOP + 0.55), 10]} />
          <meshStandardMaterial color={IRON} metalness={0.5} roughness={0.5} {...FLAT} />
        </mesh>
        {[DRUM_TOP + 0.85, DRUM_TOP + 1.25, DRUM_TOP + 1.6].map((y, i) => (
          <mesh key={`stackband-${y}`} position={[0, body(y), 0]} rotation={[Math.PI / 2, 0, 0]} material={mats.copper}>
            <torusGeometry args={[0.31 - i * 0.025, 0.03, 6, 16]} />
          </mesh>
        ))}
        <mesh geometry={geo.flare} position={[0, body(BASE_STACK_TOP - 0.24), 0]} material={mats.copper} castShadow />
        <mesh position={[0, body(BASE_STACK_TOP - 0.14), 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.mouth}>
          <circleGeometry args={[0.24, 12]} />
        </mesh>

        {/* Heat pipes: out of the drum and down into the plinth. */}
        {PIPE_ANGLES.map((a, i) => (
          <group key={`pipe-${i}`} position={[0, body(0), 0]} rotation={[0, a + Math.PI / 2, 0]}>
            <mesh geometry={geo.pipe} material={mats.pipe} castShadow />
            <mesh position={[DRUM_R + 0.04, GRATE_Y + 0.3, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.12, 0.12, 0.06, 8]} />
              <meshStandardMaterial color={IRON_LIGHT} metalness={0.5} roughness={0.5} {...FLAT} />
            </mesh>
          </group>
        ))}

        {/* Front: a pressure gauge and a valve wheel, facing the camera's side. */}
        <group rotation={[0, FRONT, 0]}>
          <mesh position={[0, body(DRUM_TOP - 0.18), DRUM_R + 0.04]} rotation={[Math.PI / 2, 0, 0]} material={mats.copper}>
            <cylinderGeometry args={[0.13, 0.13, 0.05, 12]} />
          </mesh>
          <mesh position={[0, body(DRUM_TOP - 0.18), DRUM_R + 0.07]}>
            <circleGeometry args={[0.1, 12]} />
            <meshStandardMaterial color="#e9e2cf" roughness={0.6} />
          </mesh>
          <mesh position={[0.03, body(DRUM_TOP - 0.16), DRUM_R + 0.075]} rotation={[0, 0, -0.9 + Math.min(1, strain / 1000) * 1.8]}>
            <boxGeometry args={[0.012, 0.09, 0.01]} />
            <meshStandardMaterial color="#8a1c10" />
          </mesh>
        </group>
        <group rotation={[0, FRONT + 0.55, 0]}>
          <mesh position={[0, body(GRATE_Y - 0.02), DRUM_R + 0.1]}>
            <torusGeometry args={[0.13, 0.022, 6, 14]} />
            <meshStandardMaterial color="#7e2a1a" metalness={0.5} roughness={0.4} {...FLAT} />
          </mesh>
          <mesh position={[0, body(GRATE_Y - 0.02), DRUM_R + 0.05]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.1, 6]} />
            <meshStandardMaterial color={IRON_LIGHT} {...FLAT} />
          </mesh>
        </group>

        {/* ---- Age: rust, patches, soot, frost climbing the drum. ---- */}
        {age && (
          <group>
            {[0.55, 1.0, 1.75, 2.4, 3.05, 3.7, 4.35, 5.05, 5.75].map((a, i) => (
              <mesh key={`rust-${i}`} position={at(a, DRUM_R + 0.004, body(DRUM_TOP - 0.22 - (i % 3) * 0.12))} rotation={[0, a, 0]}>
                <boxGeometry args={[0.05 + (i % 2) * 0.03, 0.32 + (i % 4) * 0.08, 0.012]} />
                <meshStandardMaterial color={RUST} roughness={0.95} {...FLAT} />
              </mesh>
            ))}
            {[
              [0.75, DRUM_BOTTOM + 0.7],
              [2.6, DRUM_BOTTOM + 0.22],
              [4.0, DRUM_BOTTOM + 0.62],
              [5.45, DRUM_BOTTOM + 0.3],
            ].map(([a, y], i) => (
              <group key={`patch-${i}`} position={at(a!, DRUM_R + 0.01, body(y!))} rotation={[0, a!, 0]}>
                <mesh>
                  <boxGeometry args={[0.2, 0.17, 0.02]} />
                  <meshStandardMaterial color="#363d44" metalness={0.4} roughness={0.7} {...FLAT} />
                </mesh>
                {[
                  [-0.08, 0.065],
                  [0.08, 0.065],
                  [-0.08, -0.065],
                  [0.08, -0.065],
                ].map(([x, yy], k) => (
                  <mesh key={k} position={[x!, yy!, 0.014]}>
                    <sphereGeometry args={[0.012, 5, 4]} />
                    <meshStandardMaterial color="#596069" {...FLAT} />
                  </mesh>
                ))}
              </group>
            ))}
            <mesh position={[0, body(DRUM_TOP + 0.5), 0]}>
              <cylinderGeometry args={[0.47, 0.62, 0.16, 14, 1, true]} />
              <meshStandardMaterial color={SOOT} roughness={1} side={THREE.DoubleSide} {...FLAT} />
            </mesh>
            <mesh position={[0, body(BASE_STACK_TOP - 0.42), 0]}>
              <cylinderGeometry args={[0.255, 0.27, 0.3, 10, 1, true]} />
              <meshStandardMaterial color={SOOT} roughness={1} {...FLAT} />
            </mesh>
            <mesh position={[0, body(DRUM_BOTTOM + 0.1), 0]} material={mats.frost}>
              <cylinderGeometry args={[DRUM_R + 0.035, DRUM_R + 0.05, 0.2, 16, 1, true]} />
            </mesh>
          </group>
        )}

        {/* ---- Feedback: cracks of light under strain. ---- */}
        {feedback &&
          CRACKS.map((c, i) => (
            <group key={`crack-${i}`} position={at(c.a, DRUM_R + 0.012, body(c.y))} rotation={[0, c.a, 0]}>
              {c.segs.map(([x, y, rz], k) => (
                <mesh key={k} position={[x, y, 0]} rotation={[0, 0, rz]} material={mats.crack}>
                  <planeGeometry args={[0.018, 0.12]} />
                </mesh>
              ))}
            </group>
          ))}

        {/* ---- Mechanism: second stack, valve ring, ladder and catwalk, steam vent. ---- */}
        {mechanism && (
          <group>
            <group position={at(FRONT + Math.PI * 0.85, 0.5, 0)}>
              <mesh position={[0, body(DRUM_TOP + 1.0), 0]} castShadow>
                <cylinderGeometry args={[0.11, 0.14, 1.4, 8]} />
                <meshStandardMaterial color={IRON} metalness={0.5} roughness={0.5} {...FLAT} />
              </mesh>
              <mesh geometry={geo.smallFlare} position={[0, body(DRUM_TOP + 1.7), 0]} material={mats.copper} />
              <mesh position={[0, body(DRUM_TOP + 1.2), 0]} rotation={[Math.PI / 2, 0, 0]} material={mats.copper}>
                <torusGeometry args={[0.13, 0.022, 6, 12]} />
              </mesh>
            </group>
            <mesh position={[0, body(GRATE_Y + 0.42), 0]} rotation={[Math.PI / 2, 0, 0]} material={mats.copper} castShadow>
              <torusGeometry args={[DRUM_R + 0.12, 0.04, 6, 32]} />
            </mesh>
            {[0.6, 2.2, 3.9, 5.5].map((a) => (
              <group key={`valve-${a}`} position={at(a, DRUM_R + 0.12, body(GRATE_Y + 0.42))} rotation={[0, a, 0]}>
                <mesh position={[0, 0.07, 0]}>
                  <cylinderGeometry args={[0.025, 0.025, 0.1, 6]} />
                  <meshStandardMaterial color={IRON_LIGHT} {...FLAT} />
                </mesh>
                <mesh position={[0, 0.13, 0]} rotation={[Math.PI / 2, 0, 0]}>
                  <torusGeometry args={[0.055, 0.012, 5, 10]} />
                  <meshStandardMaterial color="#7e2a1a" {...FLAT} />
                </mesh>
              </group>
            ))}
            {/* Ladder up the drum to a railed catwalk round the shoulder. */}
            <group rotation={[0, FRONT - 1.0, 0]}>
              {[-0.1, 0.1].map((x) => (
                <mesh key={x} position={[x, body((DRUM_BOTTOM + DRUM_TOP + 0.08) / 2), DRUM_R + 0.1]}>
                  <boxGeometry args={[0.025, DRUM_TOP + 0.08 - DRUM_BOTTOM, 0.025]} />
                  <meshStandardMaterial color={IRON_LIGHT} {...FLAT} />
                </mesh>
              ))}
              {Array.from({ length: 7 }, (_, k) => DRUM_BOTTOM + 0.1 + k * 0.14).map((y) => (
                <mesh key={y} position={[0, body(y), DRUM_R + 0.1]}>
                  <boxGeometry args={[0.2, 0.015, 0.015]} />
                  <meshStandardMaterial color={IRON_LIGHT} {...FLAT} />
                </mesh>
              ))}
            </group>
            <mesh position={[0, body(DRUM_TOP + 0.06), 0]} rotation={[Math.PI / 2, 0, 0]}>
              <ringGeometry args={[DRUM_R + 0.02, DRUM_R + 0.2, 32]} />
              <meshStandardMaterial color="#30363c" side={THREE.DoubleSide} {...FLAT} />
            </mesh>
            <mesh position={[0, body(DRUM_TOP + 0.3), 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[DRUM_R + 0.19, 0.012, 4, 40]} />
              <meshStandardMaterial color={IRON_LIGHT} {...FLAT} />
            </mesh>
            {Array.from({ length: 12 }, (_, k) => (k / 12) * Math.PI * 2).map((a) => (
              <mesh key={`post-${a}`} position={at(a, DRUM_R + 0.19, body(DRUM_TOP + 0.18))}>
                <boxGeometry args={[0.015, 0.24, 0.015]} />
                <meshStandardMaterial color={IRON_LIGHT} {...FLAT} />
              </mesh>
            ))}
            {/* Steam vent on the shoulder: hisses when the Kiln is surged. */}
            <group position={at(FRONT - 0.9, 0.7, body(DRUM_TOP + 0.3))}>
              <mesh rotation={[0, 0, 0.5]}>
                <cylinderGeometry args={[0.05, 0.06, 0.28, 6]} />
                <meshStandardMaterial color={IRON_LIGHT} {...FLAT} />
              </mesh>
            </group>
          </group>
        )}
      </group>

      {mechanism && surge && running && (
        <Smoke emitters={[{ pos: at(FRONT - 0.9, 0.7 * bodyScale[0], plinthTop + (DRUM_TOP + 0.45 - PLINTH_TOP) * bodyScale[1]), strength: 1 }]} />
      )}

      {/* ---- Life: peat, a cart, tools, braziers, and two workers tending the fire. ---- */}
      {life && (
        <group>
          <group position={at(FRONT + 1.15, 1.2 * plinthScale[0], plinthTop)} rotation={[0, FRONT + 1.15, 0]}>
            {[
              [-0.1, 0.045, 0],
              [0.1, 0.045, 0],
              [0, 0.045, 0.14],
              [0, 0.135, 0.05],
              [-0.08, 0.135, -0.05],
              [0.05, 0.225, 0.0],
            ].map(([x, y, z], i) => (
              <mesh key={i} position={[x!, y!, z!]} rotation={[0, i * 0.5, 0]} castShadow>
                <boxGeometry args={[0.16, 0.08, 0.1]} />
                <meshStandardMaterial color={PEAT} roughness={1} {...FLAT} />
              </mesh>
            ))}
          </group>
          <group position={at(FRONT + 2.0, 1.18 * plinthScale[0], plinthTop)} rotation={[0, FRONT + 2.0 + Math.PI / 2, 0]}>
            <mesh position={[0, 0.13, 0]} castShadow>
              <boxGeometry args={[0.3, 0.12, 0.2]} />
              <meshStandardMaterial color={TIMBER} roughness={0.95} {...FLAT} />
            </mesh>
            {[-0.11, 0.11].map((z) => (
              <mesh key={z} position={[0, 0.07, z]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.07, 0.07, 0.03, 8]} />
                <meshStandardMaterial color="#2b2420" {...FLAT} />
              </mesh>
            ))}
            <mesh position={[0, 0.21, 0]}>
              <boxGeometry args={[0.24, 0.06, 0.14]} />
              <meshStandardMaterial color={PEAT} roughness={1} {...FLAT} />
            </mesh>
          </group>
          <group position={at(FRONT - 0.95, 1.22 * plinthScale[0], plinthTop)} rotation={[0, FRONT - 0.95, 0]}>
            <mesh position={[-0.06, 0.2, -0.04]} rotation={[0.28, 0, 0.05]}>
              <cylinderGeometry args={[0.012, 0.012, 0.42, 5]} />
              <meshStandardMaterial color={TIMBER} {...FLAT} />
            </mesh>
            <mesh position={[-0.06, 0.02, 0.02]} rotation={[0.28, 0, 0]}>
              <boxGeometry args={[0.08, 0.1, 0.012]} />
              <meshStandardMaterial color={IRON_LIGHT} {...FLAT} />
            </mesh>
            <mesh position={[0.08, 0.2, -0.04]} rotation={[0.3, 0, -0.06]}>
              <cylinderGeometry args={[0.012, 0.012, 0.4, 5]} />
              <meshStandardMaterial color={TIMBER} {...FLAT} />
            </mesh>
            <mesh position={[0.08, 0.39, 0.0]} rotation={[0, 0, Math.PI / 2]}>
              <coneGeometry args={[0.02, 0.2, 4]} />
              <meshStandardMaterial color={IRON_LIGHT} {...FLAT} />
            </mesh>
          </group>
          {[FRONT - 0.42, FRONT + 0.42].map((a, i) => (
            <group key={`brazier-${i}`} position={at(a, 1.3 * plinthScale[0], plinthTop)}>
              {[0, 2.1, 4.2].map((la) => (
                <mesh key={la} position={[Math.sin(la) * 0.06, 0.1, Math.cos(la) * 0.06]} rotation={[Math.cos(la) * 0.25, 0, -Math.sin(la) * 0.25]}>
                  <cylinderGeometry args={[0.01, 0.01, 0.22, 4]} />
                  <meshStandardMaterial color="#1f2326" {...FLAT} />
                </mesh>
              ))}
              <mesh position={[0, 0.22, 0]}>
                <cylinderGeometry args={[0.1, 0.06, 0.07, 8]} />
                <meshStandardMaterial color="#2a2f34" metalness={0.4} {...FLAT} />
              </mesh>
              <mesh
                ref={(m) => {
                  if (m) flames.current[i] = m;
                }}
                position={[0, 0.3, 0]}
                material={mats.brazier}
              >
                <coneGeometry args={[0.07, 0.16, 6]} />
              </mesh>
            </group>
          ))}
          {[
            { a: FRONT + 1.55, r: 1.3, face: FRONT + 1.55 + Math.PI * 0.9 },
            { a: FRONT - 0.15, r: 1.34, face: FRONT + Math.PI + 0.2 },
          ].map((w, i) => (
            <group key={`worker-${i}`} position={at(w.a, w.r * plinthScale[0], plinthTop)} rotation={[0, w.face, 0]}>
              <mesh position={[0, 0.13, 0]} castShadow>
                <cylinderGeometry args={[0.045, 0.065, 0.24, 6]} />
                <meshStandardMaterial color={COAT} roughness={1} {...FLAT} />
              </mesh>
              <mesh position={[0, 0.29, 0]} castShadow>
                <sphereGeometry args={[0.045, 6, 5]} />
                <meshStandardMaterial color="#5a4a40" roughness={1} {...FLAT} />
              </mesh>
              <mesh position={[0, 0.315, 0]}>
                <coneGeometry args={[0.05, 0.05, 6]} />
                <meshStandardMaterial color="#2a2422" {...FLAT} />
              </mesh>
            </group>
          ))}
        </group>
      )}

      <pointLight ref={light} position={[0, plinthTop + (GRATE_Y + 0.2 - PLINTH_TOP) * bodyScale[1], 0]} color="#ff9a3c" distance={presence ? 21 : 18} decay={2} />
      <Embers origin={[0, stackTop, 0]} strength={running ? 0.45 + pressure * 0.18 + (surge ? 0.3 : 0) : 0} />
    </group>
  );
}
