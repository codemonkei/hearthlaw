import { Heater, heaterFlueLocal, type HeaterState } from "@/game/scene/Heater";
import { Barrel, C, Door, FLAT, FACING, GableRoof, Lantern, LogStack, SELECTED, ShutterWindow, SnowBlanket, StoneChimney, TILE_TOP, toTile } from "@/game/scene/parts";
import { SnowHeaps } from "@/game/scene/snow";

/*
 * The infirmary: a long, whitewashed timber-framed ward on a stone footing, the one pale
 * building in the cirque, with a row of warm windows down each side. A lantern over the porch
 * door, a stretcher sled waiting by it, a flag on a pole (white with a red band) so the sick can
 * find it in a storm, sheets drying on a line, a water barrel and a stone chimney.
 */

const HW = 0.3;
const HL = 0.5;
const FOOT = 0.07;
const WALL_TOP = FOOT + 0.36;
const RIDGE = WALL_TOP + 0.36;
const WASH = "#b9b2a4";
const FRAME = "#4a3526";

const CHIMNEY: [number, number, number] = [-0.12, RIDGE + 0.18, -(HL + 0.09)];
const HEATER_AT: [number, number, number] = [0.18, 0, HL + 0.08];

export function infirmaryFlue(): [number, number, number] {
  return toTile([CHIMNEY[0], CHIMNEY[1] + 0.06, CHIMNEY[2]]);
}

export function infirmaryHeaterFlue(): [number, number, number] {
  const p = heaterFlueLocal(HEATER_AT, 0);
  return toTile([p.x, p.y, p.z]);
}

/** Dark frame timbers on a wall face of the given width, facing +z: posts, a mid rail and braces. */
function Framing({ width, height, posts }: { width: number; height: number; posts: number }) {
  return (
    <>
      {Array.from({ length: posts }, (_, i) => (
        <mesh key={`p${i}`} position={[-width / 2 + (i / (posts - 1)) * width, height / 2, 0]}>
          <boxGeometry args={[0.03, height, 0.014]} />
          <meshStandardMaterial color={FRAME} roughness={1} {...FLAT} />
        </mesh>
      ))}
      {[0.012, height * 0.42, height - 0.012].map((y) => (
        <mesh key={`r${y}`} position={[0, y, 0]}>
          <boxGeometry args={[width, 0.024, 0.014]} />
          <meshStandardMaterial color={FRAME} roughness={1} {...FLAT} />
        </mesh>
      ))}
    </>
  );
}

export function Infirmary({ warmth, selected, heater = "none" }: { warmth: number; selected: boolean; heater?: HeaterState }) {
  const wallH = WALL_TOP - FOOT;
  return (
    <group position={[0, TILE_TOP, 0]} rotation={[0, FACING, 0]}>
      <mesh position={[0, FOOT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[2 * HW + 0.1, FOOT, 2 * HL + 0.1]} />
        <meshStandardMaterial color={C.stoneDark} roughness={0.95} {...FLAT} />
      </mesh>
      <mesh position={[0, FOOT + wallH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[2 * HW, wallH, 2 * HL]} />
        <meshStandardMaterial color={selected ? SELECTED : WASH} roughness={0.95} {...FLAT} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={`fx${side}`} position={[side * (HW + 0.007), FOOT, 0]} rotation={[0, side * (Math.PI / 2), 0]}>
          <Framing width={2 * HL} height={wallH} posts={5} />
        </group>
      ))}
      {[-1, 1].map((end) => (
        <group key={`fz${end}`} position={[0, FOOT, end * (HL + 0.007)]} rotation={[0, end === 1 ? 0 : Math.PI, 0]}>
          <Framing width={2 * HW} height={wallH} posts={2} />
        </group>
      ))}

      <GableRoof hw={HW} hl={HL} wallTop={WALL_TOP} ridge={RIDGE} eave={0.1} over={0.09} phase={4.2} gableColor={WASH} />

      {/* Windows down both long walls, between the posts. */}
      {[-1, 1].flatMap((side) =>
        [-0.375, -0.125, 0.125, 0.375].map((z) => (
          <ShutterWindow key={`w${side}${z}`} position={[side * (HW + 0.014), FOOT + 0.23, z]} rotationY={side * (Math.PI / 2)} warmth={warmth} scale={0.75} />
        )),
      )}

      {/* Porch: door under a little roof, a lantern, a round window in the gable. */}
      <Door position={[-0.06, FOOT, HL + 0.016]} width={0.18} height={0.3} />
      <group position={[-0.06, FOOT + 0.36, HL + 0.07]} rotation={[0.35, 0, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.3, 0.02, 0.15]} />
          <meshStandardMaterial color={C.roof} roughness={0.95} {...FLAT} />
        </mesh>
        <SnowBlanket width={0.28} depth={0.12} phase={2.9} position={[0, 0.011, 0]} />
      </group>
      <Lantern position={[-0.19, FOOT + 0.33, HL + 0.02]} rotationY={-Math.PI / 2} />
      <mesh position={[0, WALL_TOP + 0.12, HL + 0.012]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.02, 10]} />
        <meshStandardMaterial color={FRAME} roughness={1} {...FLAT} />
      </mesh>
      <mesh position={[0, WALL_TOP + 0.12, HL + 0.024]}>
        <circleGeometry args={[0.035, 10]} />
        <meshStandardMaterial color="#f2b766" emissive="#ffb35a" emissiveIntensity={warmth >= 0 ? 1.2 : 0.4} {...FLAT} />
      </mesh>

      <StoneChimney x={CHIMNEY[0]} z={CHIMNEY[2]} top={CHIMNEY[1]} width={0.18} />

      {/* Flag pole: white with a red band, so it can be found in a storm. */}
      <group position={[0.46, 0, HL - 0.02]}>
        <mesh position={[0, 0.45, 0]} castShadow>
          <cylinderGeometry args={[0.01, 0.013, 0.9, 6]} />
          <meshStandardMaterial color={C.logDark} roughness={1} {...FLAT} />
        </mesh>
        <group position={[0.1, 0.8, 0]} rotation={[0, -0.25, 0]}>
          <mesh>
            <boxGeometry args={[0.18, 0.11, 0.004]} />
            <meshStandardMaterial color="#e7e3da" roughness={1} side={2} {...FLAT} />
          </mesh>
          <mesh>
            <boxGeometry args={[0.181, 0.032, 0.006]} />
            <meshStandardMaterial color="#9e2a22" roughness={1} side={2} {...FLAT} />
          </mesh>
        </group>
      </group>

      {/* Stretcher sled by the door. */}
      <group position={[-0.34, 0, HL + 0.2]} rotation={[0, 0.5, 0]}>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[0, 0.02, s * 0.06]}>
            <boxGeometry args={[0.36, 0.018, 0.014]} />
            <meshStandardMaterial color={C.logDark} roughness={1} {...FLAT} />
          </mesh>
        ))}
        <mesh position={[0, 0.04, 0]}>
          <boxGeometry args={[0.3, 0.012, 0.13]} />
          <meshStandardMaterial color={C.plank} roughness={1} {...FLAT} />
        </mesh>
        <mesh position={[-0.02, 0.07, 0]} rotation={[0, 0, Math.PI / 2]} scale={[1, 1, 0.8]}>
          <cylinderGeometry args={[0.04, 0.04, 0.22, 7]} />
          <meshStandardMaterial color="#7d6a52" roughness={1} {...FLAT} />
        </mesh>
      </group>

      {/* Sheets drying on a line down the left side. */}
      <group position={[-0.56, 0, -0.05]}>
        {[-0.32, 0.32].map((z) => (
          <mesh key={z} position={[0, 0.22, z]} castShadow>
            <cylinderGeometry args={[0.01, 0.012, 0.44, 5]} />
            <meshStandardMaterial color={C.logDark} roughness={1} {...FLAT} />
          </mesh>
        ))}
        <mesh position={[0, 0.42, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.003, 0.003, 0.64, 4]} />
          <meshStandardMaterial color="#8c7b62" {...FLAT} />
        </mesh>
        {[-0.17, 0.03, 0.2].map((z, i) => (
          <mesh key={z} position={[0, 0.42 - 0.08 - i * 0.01, z]} rotation={[0, 0.12 * (i - 1), 0]} castShadow>
            <boxGeometry args={[0.008, 0.16 + i * 0.02, 0.15]} />
            <meshStandardMaterial color="#ecebe5" roughness={1} {...FLAT} />
          </mesh>
        ))}
      </group>

      <Barrel position={[HW + 0.12, 0, -0.2]} />
      <LogStack position={[HW + 0.13, 0, 0.12]} rotationY={Math.PI / 2} length={0.2} base={3} r={0.025} ends />

      <Heater state={heater} position={HEATER_AT} rotationY={0} />

      <SnowHeaps
        at={[
          [HW + 0.1, -HL + 0.02, 0.11],
          [-HW - 0.1, HL - 0.02, 0.1],
          [0.1, -HL - 0.12, 0.1],
        ]}
      />
    </group>
  );
}
