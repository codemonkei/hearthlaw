import { Heater, heaterFlueLocal, type HeaterState } from "@/game/scene/Heater";
import { Barrel, C, Door, Embers, FLAT, FACING, GableRoof, SELECTED, ShutterWindow, SnowBlanket, StoneChimney, TILE_TOP, toTile } from "@/game/scene/parts";
import { SnowHeaps } from "@/game/scene/snow";

/*
 * The mess hall: a broad board-and-batten kitchen hall on a stone footing under a steep roof.
 * A big stone hearth chimney at the back and a kitchen stovepipe through the roof both smoke;
 * double doors under a little snow-laden canopy with a pot sign above, a stew cauldron on a
 * tripod over a fire, a trestle table with benches, and barrels and sacks of provisions.
 */

const HW = 0.42;
const HL = 0.48;
const FOOT = 0.07;
const WALL_TOP = FOOT + 0.36;
const RIDGE = WALL_TOP + 0.42;
const BOARDS = "#6b4b34";

const CHIMNEY: [number, number, number] = [0.16, RIDGE + 0.22, -(HL + 0.1)];
const STOVEPIPE: [number, number, number] = [0.22, RIDGE + 0.14, -0.16];
const CAULDRON: [number, number, number] = [-0.6, 0, 0.36];
const HEATER_AT: [number, number, number] = [0.27, 0, HL + 0.08];

/** Hearth chimney, kitchen stovepipe and the cauldron fire, relative to the tile's slab centre. */
export function messFlues(): { at: [number, number, number]; strength: number }[] {
  return [
    { at: toTile([CHIMNEY[0], CHIMNEY[1] + 0.06, CHIMNEY[2]]), strength: 1 },
    { at: toTile([STOVEPIPE[0], STOVEPIPE[1] + 0.06, STOVEPIPE[2]]), strength: 0.6 },
    { at: toTile([CAULDRON[0], 0.24, CAULDRON[2]]), strength: 0.3 },
  ];
}

export function messHeaterFlue(): [number, number, number] {
  const p = heaterFlueLocal(HEATER_AT, 0);
  return toTile([p.x, p.y, p.z]);
}

/** Vertical battens along a wall of the given width, facing +z. */
function Battens({ width, height }: { width: number; height: number }) {
  const n = Math.round(width / 0.09);
  return (
    <>
      {Array.from({ length: n + 1 }, (_, i) => (
        <mesh key={i} position={[-width / 2 + (i / n) * width, height / 2, 0]}>
          <boxGeometry args={[0.018, height, 0.012]} />
          <meshStandardMaterial color={C.plankDark} roughness={1} {...FLAT} />
        </mesh>
      ))}
    </>
  );
}

export function MessHall({ warmth, selected, heater = "none" }: { warmth: number; selected: boolean; heater?: HeaterState }) {
  const wall = selected ? SELECTED : BOARDS;
  const wallH = WALL_TOP - FOOT;
  return (
    <group position={[0, TILE_TOP, 0]} rotation={[0, FACING, 0]}>
      {/* Stone footing and board walls with battens and corner posts. */}
      <mesh position={[0, FOOT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[2 * HW + 0.1, FOOT, 2 * HL + 0.1]} />
        <meshStandardMaterial color={C.stoneDark} roughness={0.95} {...FLAT} />
      </mesh>
      <mesh position={[0, FOOT + wallH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[2 * HW, wallH, 2 * HL]} />
        <meshStandardMaterial color={wall} roughness={0.95} {...FLAT} />
      </mesh>
      {[-1, 1].map((end) => (
        <group key={`bz${end}`} position={[0, FOOT, end * (HL + 0.006)]} rotation={[0, end === 1 ? 0 : Math.PI, 0]}>
          <Battens width={2 * HW} height={wallH} />
        </group>
      ))}
      {[-1, 1].map((side) => (
        <group key={`bx${side}`} position={[side * (HW + 0.006), FOOT, 0]} rotation={[0, side * (Math.PI / 2), 0]}>
          <Battens width={2 * HL} height={wallH} />
        </group>
      ))}
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`post${sx}${sz}`} position={[sx * HW, FOOT + wallH / 2, sz * HL]} castShadow>
            <boxGeometry args={[0.055, wallH + 0.02, 0.055]} />
            <meshStandardMaterial color={C.logDark} roughness={1} {...FLAT} />
          </mesh>
        )),
      )}
      {/* A beam band under the eaves. */}
      {[-1, 1].map((side) => (
        <mesh key={`beam${side}`} position={[side * (HW + 0.015), WALL_TOP - 0.025, 0]}>
          <boxGeometry args={[0.03, 0.04, 2 * HL + 0.06]} />
          <meshStandardMaterial color={C.logDark} roughness={1} {...FLAT} />
        </mesh>
      ))}

      <GableRoof hw={HW} hl={HL} wallTop={WALL_TOP} ridge={RIDGE} eave={0.12} over={0.1} phase={2.1} gableColor={C.plank} />

      {/* Front: double doors under a canopy, a window, and a pot sign on the gable. */}
      <group position={[-0.04, FOOT, HL + 0.012]}>
        <Door position={[-0.066, 0, 0]} width={0.13} height={0.3} />
        <Door position={[0.066, 0, 0]} width={0.13} height={0.3} />
      </group>
      <group position={[-0.04, FOOT + 0.37, HL + 0.07]} rotation={[0.35, 0, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.36, 0.022, 0.15]} />
          <meshStandardMaterial color={C.roof} roughness={0.95} {...FLAT} />
        </mesh>
        <SnowBlanket width={0.34} depth={0.12} phase={0.7} position={[0, 0.012, 0]} />
      </group>
      {[-1, 1].map((s) => (
        <mesh key={`cpost${s}`} position={[-0.04 + s * 0.16, FOOT + 0.17, HL + 0.12]} castShadow>
          <boxGeometry args={[0.03, 0.34, 0.03]} />
          <meshStandardMaterial color={C.logDark} roughness={1} {...FLAT} />
        </mesh>
      ))}
      <ShutterWindow position={[-0.31, FOOT + 0.2, HL + 0.012]} warmth={warmth} scale={0.9} />
      <group position={[0, WALL_TOP + 0.13, HL + 0.02]}>
        <mesh>
          <boxGeometry args={[0.24, 0.1, 0.018]} />
          <meshStandardMaterial color={C.logEnd} roughness={1} {...FLAT} />
        </mesh>
        <mesh position={[0, -0.005, 0.02]}>
          <cylinderGeometry args={[0.03, 0.024, 0.04, 8]} />
          <meshStandardMaterial color={C.iron} metalness={0.4} roughness={0.6} {...FLAT} />
        </mesh>
        <mesh position={[0, 0.02, 0.02]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.03, 0.004, 4, 10, Math.PI]} />
          <meshStandardMaterial color={C.iron} {...FLAT} />
        </mesh>
      </group>

      {/* Windows down both long walls. */}
      {[-1, 1].flatMap((side) =>
        [-0.2, 0.18].map((z) => (
          <ShutterWindow key={`w${side}${z}`} position={[side * (HW + 0.012), FOOT + 0.2, z]} rotationY={side * (Math.PI / 2)} warmth={warmth} scale={0.9} />
        )),
      )}

      {/* Hearth chimney at the back, kitchen stovepipe through the roof. */}
      <StoneChimney x={CHIMNEY[0]} z={CHIMNEY[2]} top={CHIMNEY[1]} width={0.24} />
      <group position={[STOVEPIPE[0], 0, STOVEPIPE[2]]}>
        <mesh position={[0, (0.55 + STOVEPIPE[1]) / 2, 0]} castShadow>
          <cylinderGeometry args={[0.03, 0.03, STOVEPIPE[1] - 0.55, 7]} />
          <meshStandardMaterial color={C.iron} metalness={0.5} roughness={0.5} {...FLAT} />
        </mesh>
        <mesh position={[0, STOVEPIPE[1] + 0.03, 0]}>
          <coneGeometry args={[0.06, 0.05, 7]} />
          <meshStandardMaterial color={C.iron} metalness={0.5} roughness={0.5} {...FLAT} />
        </mesh>
      </group>

      {/* Stew cauldron on a tripod over a fire. */}
      <group position={CAULDRON}>
        {[0, 2.1, 4.2].map((a) => (
          <mesh key={a} position={[Math.sin(a) * 0.08, 0.16, Math.cos(a) * 0.08]} rotation={[Math.cos(a) * -0.45, 0, Math.sin(a) * 0.45]} castShadow>
            <cylinderGeometry args={[0.009, 0.009, 0.36, 5]} />
            <meshStandardMaterial color={C.logDark} roughness={1} {...FLAT} />
          </mesh>
        ))}
        <mesh position={[0, 0.25, 0]}>
          <cylinderGeometry args={[0.003, 0.003, 0.08, 4]} />
          <meshStandardMaterial color={C.iron} {...FLAT} />
        </mesh>
        <mesh position={[0, 0.17, 0]} castShadow>
          <cylinderGeometry args={[0.07, 0.055, 0.08, 9]} />
          <meshStandardMaterial color="#1d2124" metalness={0.5} roughness={0.5} {...FLAT} />
        </mesh>
        <mesh position={[0, 0.205, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.062, 9]} />
          <meshStandardMaterial color="#8a6a3e" roughness={0.6} {...FLAT} />
        </mesh>
        <Embers position={[0, 0, 0]} size={1.3} />
        <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.08, 0.13, 8]} />
          <meshStandardMaterial color={C.stoneDark} roughness={1} {...FLAT} />
        </mesh>
      </group>

      {/* Trestle table with benches along the left wall. */}
      <group position={[-0.66, 0, -0.14]}>
        <mesh position={[0, 0.15, 0]} castShadow>
          <boxGeometry args={[0.16, 0.022, 0.44]} />
          <meshStandardMaterial color={C.plank} roughness={1} {...FLAT} />
        </mesh>
        <SnowBlanket width={0.44} depth={0.15} phase={2.2} position={[0, 0.16, 0]} rotationY={Math.PI / 2} />
        {[-0.18, 0.18].map((z) => (
          <mesh key={z} position={[0, 0.07, z]}>
            <boxGeometry args={[0.12, 0.14, 0.02]} />
            <meshStandardMaterial color={C.logDark} roughness={1} {...FLAT} />
          </mesh>
        ))}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.13, 0.08, 0]} castShadow>
            <boxGeometry args={[0.05, 0.02, 0.42]} />
            <meshStandardMaterial color={C.plank} roughness={1} {...FLAT} />
          </mesh>
        ))}
      </group>

      {/* Provisions: barrels and sacks by the right wall. */}
      <Barrel position={[0.6, 0, 0.2]} />
      <Barrel position={[0.62, 0, 0.06]} color={C.plankDark} />
      {[
        [0.56, -0.1, 0],
        [0.64, -0.17, 0.6],
        [0.6, -0.14, 1.2],
      ].map(([x, z, r], i) => (
        <mesh key={i} position={[x!, 0.05 + (i === 2 ? 0.07 : 0), z!]} rotation={[0, r!, 0]} scale={[1, 0.75, 0.8]} castShadow>
          <icosahedronGeometry args={[0.065, 1]} />
          <meshStandardMaterial color="#8a7a5c" roughness={1} {...FLAT} />
        </mesh>
      ))}

      <Heater state={heater} position={HEATER_AT} rotationY={0} />

      <SnowHeaps
        at={[
          [HW + 0.1, -HL + 0.05, 0.12],
          [-HW - 0.08, HL - 0.05, 0.1],
          [0.42, HL + 0.15, 0.09],
          [-0.3, -HL - 0.12, 0.12],
        ]}
      />
    </group>
  );
}
