import { Heater, heaterFlueLocal, type HeaterState } from "@/game/scene/Heater";
import { Barrel, Battens, C, Crate, FLAT, FACING, GableRoof, Lantern, SELECTED, SnowBlanket, TILE_TOP, toTile } from "@/game/scene/parts";
import { SnowHeaps } from "@/game/scene/snow";

/*
 * The depot: a broad, windowless storehouse of dark battened boards under a big steep roof.
 * Wide braced double doors behind a plank loading deck, a loft door in the gable with a hoist
 * beam and a crate on the rope, and stores stacked all round: crates, sacks, barrels and a sled.
 */

const HW = 0.4;
const HL = 0.42;
const FOOT = 0.06;
const WALL_TOP = FOOT + 0.38;
const RIDGE = WALL_TOP + 0.38;
const BOARDS = "#5a4030";

const HEATER_AT: [number, number, number] = [0.29, 0, HL + 0.08];

export function depotHeaterFlue(): [number, number, number] {
  const p = heaterFlueLocal(HEATER_AT, 0);
  return toTile([p.x, p.y, p.z]);
}

/** A braced plank door leaf facing +z, standing on y = 0. */
function BracedLeaf({ x, width, height }: { x: number; width: number; height: number }) {
  const diag = Math.atan2(height - 0.06, width - 0.03);
  return (
    <group position={[x, 0, 0]}>
      <mesh position={[0, height / 2, 0]}>
        <boxGeometry args={[width, height, 0.02]} />
        <meshStandardMaterial color={C.door} roughness={1} {...FLAT} />
      </mesh>
      {[0.04, height - 0.04].map((y) => (
        <mesh key={y} position={[0, y, 0.013]}>
          <boxGeometry args={[width, 0.03, 0.008]} />
          <meshStandardMaterial color={C.plank} roughness={1} {...FLAT} />
        </mesh>
      ))}
      <mesh position={[0, height / 2, 0.013]} rotation={[0, 0, diag]}>
        <boxGeometry args={[Math.hypot(width - 0.03, height - 0.06), 0.026, 0.008]} />
        <meshStandardMaterial color={C.plank} roughness={1} {...FLAT} />
      </mesh>
    </group>
  );
}

export function Depot({ selected, heater = "none" }: { selected: boolean; heater?: HeaterState }) {
  const wallH = WALL_TOP - FOOT;
  return (
    <group position={[0, TILE_TOP, 0]} rotation={[0, FACING, 0]}>
      <mesh position={[0, FOOT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[2 * HW + 0.1, FOOT, 2 * HL + 0.1]} />
        <meshStandardMaterial color={C.stoneDark} roughness={0.95} {...FLAT} />
      </mesh>
      <mesh position={[0, FOOT + wallH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[2 * HW, wallH, 2 * HL]} />
        <meshStandardMaterial color={selected ? SELECTED : BOARDS} roughness={0.95} {...FLAT} />
      </mesh>
      {[-1, 1].map((end) => (
        <group key={`bz${end}`} position={[0, FOOT, end * (HL + 0.006)]} rotation={[0, end === 1 ? 0 : Math.PI, 0]}>
          <Battens width={2 * HW} height={wallH} spacing={0.08} />
        </group>
      ))}
      {[-1, 1].map((side) => (
        <group key={`bx${side}`} position={[side * (HW + 0.006), FOOT, 0]} rotation={[0, side * (Math.PI / 2), 0]}>
          <Battens width={2 * HL} height={wallH} spacing={0.08} />
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

      <GableRoof hw={HW} hl={HL} wallTop={WALL_TOP} ridge={RIDGE} eave={0.12} over={0.14} phase={3.7} gableColor={BOARDS} />

      {/* Wide braced double doors. */}
      <group name="door" position={[-0.04, FOOT, HL + 0.016]}>
        <mesh position={[0, 0.17, -0.004]}>
          <boxGeometry args={[0.42, 0.36, 0.02]} />
          <meshStandardMaterial color={C.logDark} roughness={1} {...FLAT} />
        </mesh>
        <BracedLeaf x={-0.095} width={0.18} height={0.32} />
        <BracedLeaf x={0.095} width={0.18} height={0.32} />
      </group>

      {/* Loft door in the gable, hoist beam above it, a crate on the rope. */}
      <mesh position={[0, WALL_TOP + 0.12, HL + 0.012]}>
        <boxGeometry args={[0.15, 0.17, 0.02]} />
        <meshStandardMaterial color={C.door} roughness={1} {...FLAT} />
      </mesh>
      <mesh position={[0, RIDGE - 0.1, HL + 0.06]} castShadow>
        <boxGeometry args={[0.04, 0.04, 0.34]} />
        <meshStandardMaterial color={C.logDark} roughness={1} {...FLAT} />
      </mesh>
      <mesh position={[0, RIDGE - 0.13, HL + 0.2]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.022, 0.022, 0.02, 8]} />
        <meshStandardMaterial color={C.iron} {...FLAT} />
      </mesh>
      <mesh position={[0, (RIDGE - 0.15 + 0.62) / 2, HL + 0.2]}>
        <cylinderGeometry args={[0.003, 0.003, RIDGE - 0.15 - 0.62, 4]} />
        <meshStandardMaterial color="#8c7b62" {...FLAT} />
      </mesh>
      <Crate position={[0, 0.54, HL + 0.2]} size={0.09} rotationY={0.4} />

      {/* Plank loading deck. */}
      <group position={[-0.07, 0, HL + 0.15]}>
        <mesh position={[0, 0.035, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.46, 0.03, 0.2]} />
          <meshStandardMaterial color={C.plank} roughness={1} {...FLAT} />
        </mesh>
        {[-0.2, 0.2].map((x) => (
          <mesh key={x} position={[x, 0.012, 0.08]}>
            <boxGeometry args={[0.03, 0.024, 0.03]} />
            <meshStandardMaterial color={C.logDark} {...FLAT} />
          </mesh>
        ))}
        <SnowBlanket width={0.2} depth={0.16} phase={0.4} position={[-0.17, 0.05, 0]} />
      </group>
      <Lantern position={[-0.3, FOOT + 0.32, HL + 0.02]} rotationY={-Math.PI / 2} />

      {/* Stores stacked about the yard. */}
      <Crate position={[-0.58, 0, 0.3]} rotationY={0.2} size={0.14} />
      <Crate position={[-0.58, 0, 0.12]} rotationY={-0.1} size={0.13} />
      <Crate position={[-0.58, 0.14, 0.22]} rotationY={0.5} size={0.11} snow />
      <Crate position={[0.08, 0.05, HL + 0.2]} rotationY={0.3} size={0.1} snow />
      <Barrel position={[0.56, 0, 0.3]} />
      <Barrel position={[0.6, 0, 0.16]} color={C.plankDark} />
      <Barrel position={[0.56, 0, 0.02]} />
      {[
        [0.38, 0.62, 0],
        [0.47, 0.57, 0.7],
        [0.42, 0.6, 1.4],
      ].map(([x, z, r], i) => (
        <mesh key={i} position={[x!, 0.05 + (i === 2 ? 0.07 : 0), z!]} rotation={[0, r!, 0]} scale={[1, 0.75, 0.8]} castShadow>
          <icosahedronGeometry args={[0.065, 1]} />
          <meshStandardMaterial color="#8a7a5c" roughness={1} {...FLAT} />
        </mesh>
      ))}

      {/* A hand sled down the left side. */}
      <group position={[-0.6, 0, -0.2]}>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.06, 0.02, 0]}>
            <boxGeometry args={[0.015, 0.02, 0.36]} />
            <meshStandardMaterial color={C.logDark} roughness={1} {...FLAT} />
          </mesh>
        ))}
        <mesh position={[0, 0.04, 0]}>
          <boxGeometry args={[0.14, 0.012, 0.3]} />
          <meshStandardMaterial color={C.plank} roughness={1} {...FLAT} />
        </mesh>
        <Crate position={[0, 0.046, 0.05]} size={0.09} rotationY={0.1} />
      </group>

      <Heater state={heater} position={HEATER_AT} rotationY={0} />

      <SnowHeaps
        at={[
          [HW + 0.1, -HL + 0.05, 0.12],
          [-HW - 0.08, -HL + 0.1, 0.1],
          [0.1, -HL - 0.12, 0.12],
        ]}
      />
    </group>
  );
}
