import * as THREE from "three";
import { Heater, heaterFlueLocal, type HeaterState } from "@/game/scene/Heater";
import { Battens, C, Crate, Door, FLAT, FACING, GableRoof, Pole, SELECTED, ShutterWindow, StoneChimney, TILE_TOP, paneFor, toTile } from "@/game/scene/parts";
import { SNOW_COLOR, SnowHeaps } from "@/game/scene/snow";

/*
 * The survey hall: where archivists and fitters work. A hall with a stone lower storey and a
 * battened timber upper, and beside it a stone lookout tower with an open gallery, a brass
 * telescope and an anemometer on the spire. Out front a theodolite on its tripod and crates
 * of rolled charts; a signal mast with a pennant at the back.
 */

const HX = -0.12;
const HZ = -0.06;
const HW = 0.3;
const HL = 0.34;
const FOOT = 0.05;
const STONE_H = 0.2;
const WALL_TOP = FOOT + 0.38;
const RIDGE = WALL_TOP + 0.36;

const T = { x: 0.32, z: 0.2, half: 0.12, shaft: 0.78, gallery: 1.0, spire: 1.24 };
const BRASS = "#b08a3e";

const CHIMNEY: [number, number, number] = [HX + 0.12, RIDGE + 0.18, HZ - (HL + 0.09)];
const HEATER_AT: [number, number, number] = [HX - 0.16, 0, HZ + HL + 0.08];

export function surveyFlue(): [number, number, number] {
  return toTile([CHIMNEY[0], CHIMNEY[1] + 0.06, CHIMNEY[2]]);
}

export function surveyHeaterFlue(): [number, number, number] {
  const p = heaterFlueLocal(HEATER_AT, 0);
  return toTile([p.x, p.y, p.z]);
}

export function SurveyHall({ warmth, selected, heater = "none" }: { warmth: number; selected: boolean; heater?: HeaterState }) {
  const upperH = WALL_TOP - FOOT - STONE_H;
  const plank = selected ? SELECTED : "#6b4b34";
  return (
    <group position={[0, TILE_TOP, 0]} rotation={[0, FACING, 0]}>
      {/* The hall: stone lower storey, battened timber upper, steep roof. */}
      <group position={[HX, 0, HZ]}>
        <mesh position={[0, FOOT / 2, 0]} receiveShadow>
          <boxGeometry args={[2 * HW + 0.08, FOOT, 2 * HL + 0.08]} />
          <meshStandardMaterial color={C.stoneDark} roughness={0.95} {...FLAT} />
        </mesh>
        <mesh position={[0, FOOT + STONE_H / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[2 * HW + 0.02, STONE_H, 2 * HL + 0.02]} />
          <meshStandardMaterial color={C.stone} roughness={0.95} {...FLAT} />
        </mesh>
        {[0.07, 0.14].map((y) => (
          <mesh key={y} position={[0, FOOT + y, 0]}>
            <boxGeometry args={[2 * HW + 0.024, 0.006, 2 * HL + 0.024]} />
            <meshStandardMaterial color={C.stoneDark} roughness={1} {...FLAT} />
          </mesh>
        ))}
        <mesh position={[0, FOOT + STONE_H + upperH / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[2 * HW, upperH, 2 * HL]} />
          <meshStandardMaterial color={plank} roughness={0.95} {...FLAT} />
        </mesh>
        {[-1, 1].map((end) => (
          <group key={`bz${end}`} position={[0, FOOT + STONE_H, end * (HL + 0.006)]} rotation={[0, end === 1 ? 0 : Math.PI, 0]}>
            <Battens width={2 * HW} height={upperH} />
          </group>
        ))}
        {[-1, 1].map((side) => (
          <group key={`bx${side}`} position={[side * (HW + 0.006), FOOT + STONE_H, 0]} rotation={[0, side * (Math.PI / 2), 0]}>
            <Battens width={2 * HL} height={upperH} />
          </group>
        ))}
        <GableRoof hw={HW} hl={HL} wallTop={WALL_TOP} ridge={RIDGE} eave={0.1} over={0.08} phase={5.1} />
        <Door position={[0.05, FOOT, HL + 0.014]} width={0.17} height={0.3} />
        <ShutterWindow position={[0.05, WALL_TOP + 0.12, HL + 0.012]} warmth={warmth} scale={0.8} />
        <ShutterWindow position={[-(HW + 0.016), FOOT + 0.27, -0.1]} rotationY={-Math.PI / 2} warmth={warmth} scale={0.8} />
        <ShutterWindow position={[-(HW + 0.016), FOOT + 0.27, 0.15]} rotationY={-Math.PI / 2} warmth={warmth} scale={0.8} />
      </group>
      <StoneChimney x={CHIMNEY[0]} z={CHIMNEY[2]} top={CHIMNEY[1]} width={0.17} />

      {/* Lookout tower: stone shaft, open gallery with a telescope, spire with an anemometer. */}
      <group position={[T.x, 0, T.z]}>
        {[0, 1, 2].map((i) => {
          const w = 2 * T.half + 0.02 - i * 0.015;
          const h = T.shaft / 3;
          return (
            <mesh key={i} position={[0, h * (i + 0.5), 0]} castShadow receiveShadow>
              <boxGeometry args={[w, h, w]} />
              <meshStandardMaterial color={selected ? SELECTED : i % 2 ? C.stone : C.stoneDark} roughness={0.95} {...FLAT} />
            </mesh>
          );
        })}
        <mesh position={[0, 0.48, T.half + 0.008]} material={paneFor(warmth)}>
          <planeGeometry args={[0.06, 0.1]} />
        </mesh>
        <mesh position={[0, T.shaft + 0.015, 0]} castShadow>
          <boxGeometry args={[2 * T.half + 0.1, 0.03, 2 * T.half + 0.1]} />
          <meshStandardMaterial color={C.plank} roughness={1} {...FLAT} />
        </mesh>
        {[-1, 1].flatMap((sx) =>
          [-1, 1].map((sz) => (
            <mesh key={`${sx}${sz}`} position={[sx * (T.half + 0.03), (T.shaft + T.gallery) / 2 + 0.015, sz * (T.half + 0.03)]} castShadow>
              <boxGeometry args={[0.025, T.gallery - T.shaft, 0.025]} />
              <meshStandardMaterial color={C.logDark} roughness={1} {...FLAT} />
            </mesh>
          )),
        )}
        {[0, 1, 2, 3].map((k) => (
          <group key={`r${k}`} rotation={[0, (k * Math.PI) / 2, 0]}>
            <mesh position={[0, T.shaft + 0.1, T.half + 0.03]}>
              <boxGeometry args={[2 * T.half + 0.06, 0.015, 0.015]} />
              <meshStandardMaterial color={C.logDark} roughness={1} {...FLAT} />
            </mesh>
          </group>
        ))}
        {/* Telescope on a short stand, pointing out over the cirque. */}
        <group position={[0.03, T.shaft + 0.03, 0.03]}>
          <mesh position={[0, 0.05, 0]}>
            <cylinderGeometry args={[0.006, 0.01, 0.1, 5]} />
            <meshStandardMaterial color={C.iron} {...FLAT} />
          </mesh>
          <mesh position={[0.04, 0.11, 0.04]} rotation={[Math.PI / 2 - 0.35, 0, -Math.PI / 4]}>
            <cylinderGeometry args={[0.014, 0.022, 0.17, 7]} />
            <meshStandardMaterial color={BRASS} metalness={0.7} roughness={0.35} {...FLAT} />
          </mesh>
        </group>
        {/* Spire with snow and an anemometer. */}
        <mesh position={[0, (T.gallery + T.spire) / 2, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
          <coneGeometry args={[(T.half + 0.08) * Math.SQRT2, T.spire - T.gallery, 4]} />
          <meshStandardMaterial color={C.roof} roughness={0.95} {...FLAT} />
        </mesh>
        <mesh position={[0, T.spire - (T.spire - T.gallery) * 0.3 + 0.012, 0]} rotation={[0, Math.PI / 4, 0]}>
          <coneGeometry args={[(T.half + 0.08) * Math.SQRT2 * 0.66, (T.spire - T.gallery) * 0.6, 4]} />
          <meshStandardMaterial color={SNOW_COLOR} roughness={0.9} {...FLAT} />
        </mesh>
        <mesh position={[0, T.spire + 0.08, 0]}>
          <cylinderGeometry args={[0.006, 0.006, 0.18, 5]} />
          <meshStandardMaterial color={C.iron} {...FLAT} />
        </mesh>
        {[0, 1, 2].map((k) => {
          const a = (k / 3) * Math.PI * 2;
          return (
            <group key={k} position={[0, T.spire + 0.16, 0]} rotation={[0, a, 0]}>
              <mesh position={[0.04, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.003, 0.003, 0.08, 4]} />
                <meshStandardMaterial color={C.iron} {...FLAT} />
              </mesh>
              <mesh position={[0.08, 0, 0.01]} rotation={[Math.PI / 2, 0, 0]}>
                <coneGeometry args={[0.014, 0.025, 6]} />
                <meshStandardMaterial color={BRASS} metalness={0.7} roughness={0.35} {...FLAT} />
              </mesh>
            </group>
          );
        })}
      </group>

      {/* Theodolite on its tripod out front. */}
      <group position={[-0.48, 0, 0.46]}>
        {[0, 2.1, 4.2].map((a) => (
          <Pole key={a} a={[Math.sin(a) * 0.07, 0, Math.cos(a) * 0.07]} b={[0, 0.2, 0]} r={0.006} color={C.logEnd} />
        ))}
        <mesh position={[0, 0.22, 0]}>
          <boxGeometry args={[0.04, 0.035, 0.04]} />
          <meshStandardMaterial color={BRASS} metalness={0.7} roughness={0.35} {...FLAT} />
        </mesh>
        <mesh position={[0, 0.25, 0]} rotation={[Math.PI / 2, 0, 0.5]}>
          <cylinderGeometry args={[0.008, 0.01, 0.07, 6]} />
          <meshStandardMaterial color={BRASS} metalness={0.7} roughness={0.35} {...FLAT} />
        </mesh>
      </group>

      {/* Crates of rolled charts. */}
      <Crate position={[-0.02, 0, 0.52]} rotationY={0.3} size={0.12} />
      <Crate position={[0.12, 0, 0.6]} rotationY={-0.2} size={0.1} snow />
      {[-0.03, 0, 0.03].map((d, i) => (
        <mesh key={d} position={[-0.02 + d, 0.13 + (i === 1 ? 0.02 : 0), 0.52 + d * 0.5]} rotation={[0, 0.3, Math.PI / 2]}>
          <cylinderGeometry args={[0.012, 0.012, 0.16, 6]} />
          <meshStandardMaterial color={i === 1 ? "#d8cdb4" : "#c9bc9e"} roughness={1} {...FLAT} />
        </mesh>
      ))}

      {/* Signal mast with a pennant at the back. */}
      <group position={[-0.6, 0, -0.44]}>
        <mesh position={[0, 0.5, 0]} castShadow>
          <cylinderGeometry args={[0.01, 0.014, 1.0, 6]} />
          <meshStandardMaterial color={C.logDark} roughness={1} {...FLAT} />
        </mesh>
        <mesh position={[0.08, 0.92, 0]} rotation={[0, -0.2, 0]}>
          <shapeGeometry args={[PENNANT]} />
          <meshStandardMaterial color="#c8642b" roughness={1} side={2} {...FLAT} />
        </mesh>
      </group>

      <Heater state={heater} position={HEATER_AT} rotationY={0} />

      <SnowHeaps
        at={[
          [HX - HW - 0.1, HZ + HL, 0.1],
          [0.55, -0.3, 0.1],
          [T.x + 0.2, T.z + 0.15, 0.08],
        ]}
      />
    </group>
  );
}

const PENNANT = (() => {
  const s = new THREE.Shape();
  s.moveTo(-0.08, 0.04);
  s.lineTo(0.12, 0);
  s.lineTo(-0.08, -0.04);
  s.closePath();
  return s;
})();
