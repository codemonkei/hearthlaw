import { Heater, heaterFlueLocal, type HeaterState } from "@/game/scene/Heater";
import { C, Door, FLAT, FACING, GableRoof, LogStack, LogWalls, SELECTED, ShutterWindow, SnowBlanket, StoneChimney, TILE_TOP, toTile } from "@/game/scene/parts";
import { SnowHeaps } from "@/game/scene/snow";

/*
 * The woodcutters' lodge: a log cabin with an open lean-to woodshed stacked with split logs,
 * set at the edge of the grove it fells. A pile of long felled trunks, a sawhorse with a log and
 * a bow saw, an axe left in a stump, a log sled, and a stone chimney that smokes.
 */

const CX = -0.15; // the cabin sits left of centre to make room for the woodshed
const CZ = -0.06;
const HW = 0.27;
const HL = 0.32;
const FOOT = 0.06;
const COURSES = 5;
const COURSE = 0.085;
const WALL_TOP = FOOT + COURSES * COURSE + 0.02;
const RIDGE = WALL_TOP + 0.38;

const CHIMNEY: [number, number, number] = [CX - 0.1, RIDGE + 0.18, CZ - (HL + 0.09)];
const HEATER_AT: [number, number, number] = [CX - 0.14, 0, CZ + HL + 0.11];

/** Spots behind the lodge (building-local x, z) where the grove's pines still stand. */
export const LODGE_GROVE: [number, number][] = [
  [-0.62, -0.56],
  [0.66, -0.48],
];

export function woodFlue(): [number, number, number] {
  return toTile([CHIMNEY[0], CHIMNEY[1] + 0.06, CHIMNEY[2]]);
}

export function woodHeaterFlue(): [number, number, number] {
  const p = heaterFlueLocal(HEATER_AT, 0);
  return toTile([p.x, p.y, p.z]);
}

export function WoodLodge({ warmth, selected, heater = "none" }: { warmth: number; selected: boolean; heater?: HeaterState }) {
  const shedX0 = CX + HW + 0.04;
  const shedX1 = 0.52;
  const shedW = shedX1 - shedX0;
  const shedD = 0.5;
  const shedHi = WALL_TOP - 0.02;
  const shedLo = 0.3;
  const shedTilt = Math.atan((shedHi - shedLo) / shedW);
  return (
    <group position={[0, TILE_TOP, 0]} rotation={[0, FACING, 0]}>
      <group position={[CX, 0, CZ]}>
        <LogWalls hw={HW} hl={HL} foot={FOOT} courses={COURSES} course={COURSE} color={selected ? SELECTED : C.log} />
        <GableRoof hw={HW} hl={HL} wallTop={WALL_TOP} ridge={RIDGE} eave={0.1} over={0.08} phase={3.1} />
        <Door position={[0.08, FOOT, HL + 0.05]} width={0.18} height={0.34} />
        <ShutterWindow position={[-(HW + 0.05), FOOT + 0.24, 0.02]} rotationY={-Math.PI / 2} warmth={warmth} scale={0.85} />
        {/* Crossed axes over the door. */}
        {[-1, 1].map((s) => (
          <group key={s} position={[0.08, WALL_TOP + 0.1, HL + 0.03]} rotation={[0, 0, s * 0.7]}>
            <mesh>
              <boxGeometry args={[0.012, 0.18, 0.012]} />
              <meshStandardMaterial color={C.logEnd} roughness={1} {...FLAT} />
            </mesh>
            <mesh position={[s * 0.015, 0.08, 0]}>
              <boxGeometry args={[0.04, 0.03, 0.008]} />
              <meshStandardMaterial color={C.iron} metalness={0.5} roughness={0.5} {...FLAT} />
            </mesh>
          </group>
        ))}
      </group>
      <StoneChimney x={CHIMNEY[0]} z={CHIMNEY[2]} top={CHIMNEY[1]} width={0.18} />

      {/* Open lean-to woodshed against the cabin's right wall, stacked with split logs. */}
      <group position={[0, 0, CZ - 0.02]}>
        {[-1, 1].map((sz) => (
          <mesh key={sz} position={[shedX1 - 0.02, shedLo / 2, (sz * shedD) / 2]} castShadow>
            <boxGeometry args={[0.035, shedLo, 0.035]} />
            <meshStandardMaterial color={C.logDark} roughness={1} {...FLAT} />
          </mesh>
        ))}
        <group position={[(shedX0 + shedX1) / 2, (shedHi + shedLo) / 2 + 0.02, 0]} rotation={[0, 0, -shedTilt]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[Math.hypot(shedW, shedHi - shedLo) + 0.08, 0.025, shedD + 0.1]} />
            <meshStandardMaterial color={C.roof} roughness={0.95} {...FLAT} />
          </mesh>
          <SnowBlanket width={shedD + 0.1} depth={Math.hypot(shedW, shedHi - shedLo) + 0.08} phase={2.6} position={[0, 0.012, 0]} rotationY={Math.PI / 2} />
        </group>
        {[0, 1].map((i) => (
          <LogStack key={i} position={[shedX0 + 0.09 + i * 0.17, 0, 0]} rotationY={Math.PI / 2} length={0.42} base={3} r={0.026} ends />
        ))}
      </group>

      {/* Felled trunks waiting to be cut. */}
      <LogStack position={[0.32, 0, 0.5]} rotationY={-0.35} length={0.5} base={3} r={0.045} ends />

      {/* Sawhorse with a log and a bow saw. */}
      <group position={[-0.5, 0, 0.42]} rotation={[0, 0.5, 0]}>
        {[-0.08, 0.08].map((x) =>
          [-1, 1].map((s) => (
            <mesh key={`${x}${s}`} position={[x, 0.07, s * 0.03]} rotation={[s * 0.45, 0, 0]}>
              <boxGeometry args={[0.018, 0.16, 0.018]} />
              <meshStandardMaterial color={C.logDark} roughness={1} {...FLAT} />
            </mesh>
          )),
        )}
        <mesh position={[0, 0.17, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.035, 0.035, 0.3, 6]} />
          <meshStandardMaterial color={C.log} roughness={1} {...FLAT} />
        </mesh>
        <group position={[0.03, 0.24, 0.0]}>
          <mesh rotation={[0, 0, 0]}>
            <torusGeometry args={[0.06, 0.006, 4, 10, Math.PI]} />
            <meshStandardMaterial color={C.logEnd} roughness={1} {...FLAT} />
          </mesh>
          <mesh position={[0, -0.004, 0]}>
            <boxGeometry args={[0.13, 0.008, 0.003]} />
            <meshStandardMaterial color="#9aa3aa" metalness={0.6} roughness={0.4} {...FLAT} />
          </mesh>
        </group>
      </group>

      {/* An axe left in a stump. */}
      <group position={[-0.08, 0, 0.56]}>
        <mesh position={[0, 0.055, 0]} castShadow>
          <cylinderGeometry args={[0.065, 0.075, 0.11, 8]} />
          <meshStandardMaterial color={C.log} roughness={1} {...FLAT} />
        </mesh>
        <mesh position={[0, 0.111, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 0.004, 8]} />
          <meshStandardMaterial color={C.logEnd} roughness={1} {...FLAT} />
        </mesh>
        <mesh position={[0.03, 0.19, 0]} rotation={[0, 0, -0.45]}>
          <cylinderGeometry args={[0.008, 0.008, 0.18, 5]} />
          <meshStandardMaterial color={C.logEnd} {...FLAT} />
        </mesh>
        <mesh position={[-0.005, 0.12, 0]} rotation={[0, 0, -0.45]}>
          <boxGeometry args={[0.05, 0.03, 0.012]} />
          <meshStandardMaterial color={C.iron} metalness={0.5} roughness={0.5} {...FLAT} />
        </mesh>
      </group>

      {/* A log sled down the left side. */}
      <group position={[-0.64, 0, -0.06]}>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.06, 0.02, 0]}>
            <boxGeometry args={[0.015, 0.02, 0.4]} />
            <meshStandardMaterial color={C.logDark} roughness={1} {...FLAT} />
          </mesh>
        ))}
        <mesh position={[0, 0.04, 0]}>
          <boxGeometry args={[0.14, 0.012, 0.34]} />
          <meshStandardMaterial color={C.plank} roughness={1} {...FLAT} />
        </mesh>
        <LogStack position={[0, 0.045, 0]} rotationY={Math.PI / 2} length={0.32} base={3} r={0.024} ends />
      </group>

      <Heater state={heater} position={HEATER_AT} rotationY={0} />

      <SnowHeaps
        at={[
          [CX - HW - 0.1, CZ + HL, 0.1],
          [0.55, 0.3, 0.09],
          [-0.35, -0.55, 0.11],
        ]}
      />
    </group>
  );
}
