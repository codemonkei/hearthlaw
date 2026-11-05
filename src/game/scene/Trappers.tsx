import { Heater, heaterFlueLocal, type HeaterState } from "@/game/scene/Heater";
import { C, Door, FLAT, FACING, GableRoof, LogWalls, SELECTED, ShutterWindow, StoneChimney, TILE_TOP, toTile } from "@/game/scene/parts";
import { SNOW_COLOR, SnowHeaps } from "@/game/scene/snow";

/*
 * The trappers' hut: a small, low log hut with a steep roof and antlers over the door, set
 * among the lichen it gathers. Hides stretched on stick frames, pelts drying on a line,
 * baskets heaped with lichen, a pair of snowshoes against the wall and a small chimney.
 */

const HW = 0.25;
const HL = 0.28;
const FOOT = 0.05;
const COURSES = 4;
const COURSE = 0.08;
const WALL_TOP = FOOT + COURSES * COURSE + 0.02;
const RIDGE = WALL_TOP + 0.34;

const CHIMNEY: [number, number, number] = [-0.1, RIDGE + 0.16, -(HL + 0.08)];
const HEATER_AT: [number, number, number] = [0.15, 0, HL + 0.11];

const HIDE = "#a07a52";
const HIDE_DARK = "#7d5a3a";
const LICHEN = ["#7f9a6a", "#94a77a", "#6c8458"];

export function trappersFlue(): [number, number, number] {
  return toTile([CHIMNEY[0], CHIMNEY[1] + 0.06, CHIMNEY[2]]);
}

export function trappersHeaterFlue(): [number, number, number] {
  const p = heaterFlueLocal(HEATER_AT, 0);
  return toTile([p.x, p.y, p.z]);
}

/** A hide lashed inside a square stick frame, leaning back on a prop. */
function HideFrame({ position, rotationY, size = 0.3, color = HIDE }: { position: [number, number, number]; rotationY: number; size?: number; color?: string }) {
  const h = size / 2;
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <group position={[0, h + 0.02, 0]} rotation={[-0.25, 0, 0]}>
        {[-1, 1].map((s) => (
          <mesh key={`v${s}`} position={[s * h, 0, 0]} castShadow>
            <cylinderGeometry args={[0.01, 0.01, size + 0.06, 5]} />
            <meshStandardMaterial color={C.logDark} roughness={1} {...FLAT} />
          </mesh>
        ))}
        {[-1, 1].map((s) => (
          <mesh key={`h${s}`} position={[0, s * h, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.01, 0.01, size + 0.06, 5]} />
            <meshStandardMaterial color={C.logDark} roughness={1} {...FLAT} />
          </mesh>
        ))}
        <mesh position={[0, 0, 0.004]} rotation={[0, 0, 0.4]} scale={[1, 1.15, 1]} castShadow>
          <circleGeometry args={[h * 0.82, 7]} />
          <meshStandardMaterial color={color} roughness={1} side={2} {...FLAT} />
        </mesh>
      </group>
      <mesh position={[0, h * 0.7, -h * 0.75]} rotation={[0.6, 0, 0]}>
        <cylinderGeometry args={[0.008, 0.008, size * 1.05, 5]} />
        <meshStandardMaterial color={C.logDark} roughness={1} {...FLAT} />
      </mesh>
    </group>
  );
}

function LichenBasket({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.045, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.045, 0.09, 8]} />
        <meshStandardMaterial color="#7a6342" roughness={1} {...FLAT} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[Math.sin(i * 2.1) * 0.025, 0.095, Math.cos(i * 2.1) * 0.025]} scale={[1, 0.6, 1]}>
          <icosahedronGeometry args={[0.035, 0]} />
          <meshStandardMaterial color={LICHEN[i]} roughness={1} {...FLAT} />
        </mesh>
      ))}
    </group>
  );
}

export function TrappersHut({ warmth, selected, heater = "none" }: { warmth: number; selected: boolean; heater?: HeaterState }) {
  return (
    <group position={[0, TILE_TOP, 0]} rotation={[0, FACING, 0]}>
      <LogWalls hw={HW} hl={HL} foot={FOOT} courses={COURSES} course={COURSE} r={0.038} color={selected ? SELECTED : C.log} />
      <GableRoof hw={HW} hl={HL} wallTop={WALL_TOP} ridge={RIDGE} eave={0.09} over={0.07} phase={0.6} snow={0.55} />
      <Door position={[-0.06, FOOT, HL + 0.05]} width={0.16} height={0.3} />
      <ShutterWindow position={[HW + 0.05, FOOT + 0.2, 0]} rotationY={Math.PI / 2} warmth={warmth} scale={0.75} />

      {/* Antlers over the door. */}
      <group position={[-0.06, WALL_TOP + 0.06, HL + 0.04]}>
        <mesh>
          <boxGeometry args={[0.05, 0.04, 0.03]} />
          <meshStandardMaterial color="#d9cfbf" roughness={1} {...FLAT} />
        </mesh>
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 0.02, 0.01, 0.01]} rotation={[0, 0, s * -0.9]}>
            <mesh position={[0, 0.06, 0]}>
              <cylinderGeometry args={[0.006, 0.009, 0.12, 4]} />
              <meshStandardMaterial color="#cbbfa8" roughness={1} {...FLAT} />
            </mesh>
            <mesh position={[s * 0.02, 0.07, 0]} rotation={[0, 0, s * 0.9]}>
              <cylinderGeometry args={[0.004, 0.006, 0.06, 4]} />
              <meshStandardMaterial color="#cbbfa8" roughness={1} {...FLAT} />
            </mesh>
            <mesh position={[0, 0.12, 0]} rotation={[0, 0, s * 0.7]}>
              <cylinderGeometry args={[0.003, 0.005, 0.05, 4]} />
              <meshStandardMaterial color="#cbbfa8" roughness={1} {...FLAT} />
            </mesh>
          </group>
        ))}
      </group>

      <StoneChimney x={CHIMNEY[0]} z={CHIMNEY[2]} top={CHIMNEY[1]} width={0.16} />

      {/* Hides stretched on frames to the right of the hut. */}
      <HideFrame position={[0.5, 0, 0.22]} rotationY={0.35} size={0.3} />
      <HideFrame position={[0.56, 0, -0.16]} rotationY={0.9} size={0.24} color={HIDE_DARK} />

      {/* Pelts drying on a line to the left. */}
      <group position={[-0.5, 0, 0]}>
        {[-0.3, 0.3].map((z) => (
          <mesh key={z} position={[0, 0.2, z]} castShadow>
            <cylinderGeometry args={[0.012, 0.014, 0.4, 5]} />
            <meshStandardMaterial color={C.logDark} roughness={1} {...FLAT} />
          </mesh>
        ))}
        <mesh position={[0, 0.37, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.003, 0.003, 0.6, 4]} />
          <meshStandardMaterial color="#8c7b62" {...FLAT} />
        </mesh>
        {[
          [-0.17, "#8a6a4a", 0.16],
          [-0.03, "#e3e1da", 0.12],
          [0.11, "#5e4a38", 0.15],
          [0.22, "#b8a48a", 0.11],
        ].map(([z, color, len]) => (
          <mesh key={z as number} position={[0, 0.37 - (len as number) / 2, z as number]} rotation={[0, 0.2, 0]} castShadow>
            <boxGeometry args={[0.012, len as number, 0.07]} />
            <meshStandardMaterial color={color as string} roughness={1} {...FLAT} />
          </mesh>
        ))}
      </group>

      {/* Lichen baskets by the door and lichen growing around the yard. */}
      <LichenBasket position={[-0.3, 0, HL + 0.14]} />
      <LichenBasket position={[-0.2, 0, HL + 0.24]} />
      {[
        [0.35, 0.55, 0.08],
        [-0.55, 0.45, 0.1],
        [0.1, -0.6, 0.11],
        [-0.45, -0.5, 0.08],
        [0.6, 0.05, 0.07],
      ].map(([x, z, r], i) => (
        <mesh key={i} position={[x!, r! * 0.2, z!]} scale={[1, 0.45, 1]} castShadow>
          <icosahedronGeometry args={[r!, 0]} />
          <meshStandardMaterial color={LICHEN[i % 3]} roughness={1} {...FLAT} />
        </mesh>
      ))}

      {/* Snowshoes leaning against the left wall. */}
      {[0, 1].map((i) => (
        <mesh key={i} position={[-HW - 0.07, 0.13, -0.08 + i * 0.09]} rotation={[0, Math.PI / 2, -0.25]} scale={[0.6, 1, 1]}>
          <torusGeometry args={[0.07, 0.008, 4, 10]} />
          <meshStandardMaterial color={C.logEnd} roughness={1} {...FLAT} />
        </mesh>
      ))}

      <Heater state={heater} position={HEATER_AT} rotationY={0} />

      <SnowHeaps
        at={[
          [HW + 0.1, -HL + 0.02, 0.1],
          [-HW - 0.08, HL, 0.08],
          [0.05, -HL - 0.12, 0.1],
        ]}
      />
    </group>
  );
}
