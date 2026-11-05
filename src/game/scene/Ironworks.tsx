import { Heater, heaterFlueLocal, type HeaterState } from "@/game/scene/Heater";
import { C, FLAT, FACING, HOT, Pole, SELECTED, SnowBlanket, TILE_TOP, toTile } from "@/game/scene/parts";
import { SNOW_COLOR, SnowHeaps } from "@/game/scene/snow";

/*
 * The ironworks: a squat stone blast furnace bound in iron, its tap hole glowing, with a tall
 * iron stack that never stops smoking. Beside it an open casting shed under a tin roof with an
 * anvil and a quench barrel; fresh bars glowing in the sand bed out front, leather bellows, a
 * charcoal heap, an ore pile, a slag heap and a crosswise stack of finished iron.
 */

const FURNACE = { x: -0.2, z: -0.12, base: 0.46, top: 0.3, height: 0.72 };
const STACK_TOP = 1.35;
const SHED = { x: 0.34, z: -0.02, hw: 0.2, hd: 0.24, front: 0.42, back: 0.34 };
const HEATER_AT: [number, number, number] = [SHED.x + 0.04, 0, SHED.z - SHED.hd + 0.1];

export function ironworksFlue(): [number, number, number] {
  return toTile([FURNACE.x, STACK_TOP + 0.06, FURNACE.z]);
}

export function ironworksHeaterFlue(): [number, number, number] {
  const p = heaterFlueLocal(HEATER_AT, 0);
  return toTile([p.x, p.y, p.z]);
}

export function Ironworks({ selected, heater = "none" }: { selected: boolean; heater?: HeaterState }) {
  const courses = 5;
  const h = FURNACE.height / courses;
  const tilt = Math.atan((SHED.front - SHED.back) / (2 * SHED.hd));
  const timber = selected ? SELECTED : C.logDark;
  return (
    <group position={[0, TILE_TOP, 0]} rotation={[0, FACING, 0]}>
      {/* The blast furnace: tapering stone courses bound with iron, a glowing tap hole. */}
      <group position={[FURNACE.x, 0, FURNACE.z]}>
        {Array.from({ length: courses }, (_, i) => {
          const w = FURNACE.base - ((FURNACE.base - FURNACE.top) * i) / (courses - 1);
          return (
            <mesh key={i} position={[0, h * (i + 0.5), 0]} rotation={[0, i * 0.03, 0]} castShadow receiveShadow>
              <boxGeometry args={[w, h, w]} />
              <meshStandardMaterial color={selected ? SELECTED : i % 2 ? C.stone : C.stoneDark} roughness={0.95} {...FLAT} />
            </mesh>
          );
        })}
        {[0.16, 0.44].map((y, i) => {
          const w = FURNACE.base - (FURNACE.base - FURNACE.top) * (y / FURNACE.height) + 0.02;
          return (
            <mesh key={i} position={[0, y, 0]}>
              <boxGeometry args={[w, 0.025, w]} />
              <meshStandardMaterial color={C.iron} metalness={0.5} roughness={0.5} {...FLAT} />
            </mesh>
          );
        })}
        {/* Arch and glowing tap hole at the front. */}
        <mesh position={[0, 0.14, FURNACE.base / 2 + 0.005]}>
          <boxGeometry args={[0.17, 0.2, 0.02]} />
          <meshStandardMaterial color="#2a2d31" roughness={1} {...FLAT} />
        </mesh>
        <mesh position={[0, 0.12, FURNACE.base / 2 + 0.017]} material={HOT}>
          <boxGeometry args={[0.09, 0.1, 0.01]} />
        </mesh>
        {/* A glowing runner from the tap hole down to the sand bed. */}
        <mesh position={[0, 0.012, FURNACE.base / 2 + 0.12]} material={HOT}>
          <boxGeometry args={[0.03, 0.012, 0.22]} />
        </mesh>
        {/* Charging mouth on top and the iron stack. */}
        <mesh position={[0, FURNACE.height + 0.04, 0]}>
          <cylinderGeometry args={[0.13, 0.15, 0.08, 8]} />
          <meshStandardMaterial color={C.iron} metalness={0.5} roughness={0.5} {...FLAT} />
        </mesh>
        <mesh position={[0, (FURNACE.height + STACK_TOP) / 2 + 0.04, 0]} castShadow>
          <cylinderGeometry args={[0.07, 0.085, STACK_TOP - FURNACE.height - 0.08, 8]} />
          <meshStandardMaterial color="#25292d" metalness={0.5} roughness={0.55} {...FLAT} />
        </mesh>
        {[0.95, 1.15].map((y) => (
          <mesh key={y} position={[0, y, 0]}>
            <cylinderGeometry args={[0.088, 0.088, 0.02, 8]} />
            <meshStandardMaterial color={C.rust} metalness={0.4} roughness={0.6} {...FLAT} />
          </mesh>
        ))}
        <mesh position={[0, STACK_TOP + 0.01, 0]}>
          <cylinderGeometry args={[0.09, 0.075, 0.03, 8]} />
          <meshStandardMaterial color={C.iron} {...FLAT} />
        </mesh>
        {/* Snow lying on the furnace shoulders, melted near the hot stack. */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.15, FURNACE.height + 0.01, -0.12]} scale={[1, 0.35, 1.3]}>
            <icosahedronGeometry args={[0.05, 0]} />
            <meshStandardMaterial color={SNOW_COLOR} roughness={0.9} {...FLAT} />
          </mesh>
        ))}
        {/* Ladder up the back. */}
        {[-0.06, 0.06].map((x) => (
          <Pole key={x} a={[x, 0, -FURNACE.base / 2 - 0.12]} b={[x, FURNACE.height + 0.04, -FURNACE.top / 2 - 0.02]} r={0.008} color={C.logEnd} />
        ))}
        {/* Bellows against the left side. */}
        <group position={[-FURNACE.base / 2 - 0.1, 0.1, 0.02]} rotation={[0, 0, 0.15]}>
          <mesh scale={[1, 0.5, 1]} castShadow>
            <cylinderGeometry args={[0.07, 0.07, 0.12, 3]} />
            <meshStandardMaterial color="#5a3c28" roughness={1} {...FLAT} />
          </mesh>
          <mesh position={[0.1, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.012, 0.016, 0.1, 6]} />
            <meshStandardMaterial color={C.iron} {...FLAT} />
          </mesh>
          <mesh position={[-0.12, 0.02, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.008, 0.008, 0.12, 5]} />
            <meshStandardMaterial color={C.logEnd} {...FLAT} />
          </mesh>
        </group>
      </group>

      {/* Sand bed with fresh bars cooling in it. */}
      <group position={[FURNACE.x, 0, FURNACE.z + FURNACE.base / 2 + 0.33]}>
        <mesh position={[0, 0.01, 0]} receiveShadow>
          <boxGeometry args={[0.36, 0.02, 0.2]} />
          <meshStandardMaterial color="#6a5a48" roughness={1} {...FLAT} />
        </mesh>
        {[-0.1, 0, 0.1].map((x) => (
          <mesh key={x} position={[x, 0.024, 0]} material={HOT}>
            <boxGeometry args={[0.05, 0.012, 0.14]} />
          </mesh>
        ))}
      </group>

      {/* Open casting shed with a tin roof, an anvil and a quench barrel. */}
      <group position={[SHED.x, 0, SHED.z]}>
        {[-1, 1].flatMap((sx) =>
          [-1, 1].map((sz) => {
            const hgt = sz === 1 ? SHED.front : SHED.back;
            return (
              <mesh key={`${sx}${sz}`} position={[sx * (SHED.hw - 0.02), hgt / 2, sz * (SHED.hd - 0.02)]} castShadow>
                <boxGeometry args={[0.035, hgt, 0.035]} />
                <meshStandardMaterial color={timber} roughness={1} {...FLAT} />
              </mesh>
            );
          }),
        )}
        <mesh position={[0, SHED.back / 2, -SHED.hd + 0.01]} castShadow>
          <boxGeometry args={[2 * SHED.hw, SHED.back, 0.02]} />
          <meshStandardMaterial color={C.plank} roughness={1} {...FLAT} />
        </mesh>
        <group position={[0, (SHED.front + SHED.back) / 2 + 0.015, 0]} rotation={[-tilt, 0, 0]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[2 * SHED.hw + 0.08, 0.02, 2 * SHED.hd + 0.1]} />
            <meshStandardMaterial color="#59595a" metalness={0.45} roughness={0.6} {...FLAT} />
          </mesh>
          <SnowBlanket width={2 * SHED.hw + 0.08} depth={2 * SHED.hd + 0.1} phase={1.7} position={[0, 0.011, 0]} rotationY={Math.PI} />
        </group>
        {/* Anvil on a block. */}
        <group position={[0.02, 0, 0.06]}>
          <mesh position={[0, 0.05, 0]} castShadow>
            <cylinderGeometry args={[0.045, 0.05, 0.1, 7]} />
            <meshStandardMaterial color={C.log} roughness={1} {...FLAT} />
          </mesh>
          <mesh position={[0, 0.12, 0]} castShadow>
            <boxGeometry args={[0.1, 0.04, 0.05]} />
            <meshStandardMaterial color="#2a2e32" metalness={0.6} roughness={0.4} {...FLAT} />
          </mesh>
          <mesh position={[0.065, 0.13, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <coneGeometry args={[0.02, 0.05, 4]} />
            <meshStandardMaterial color="#2a2e32" metalness={0.6} roughness={0.4} {...FLAT} />
          </mesh>
          <mesh position={[-0.02, 0.145, 0.012]} material={HOT}>
            <boxGeometry args={[0.05, 0.01, 0.012]} />
          </mesh>
        </group>
        {/* Quench barrel. */}
        <mesh position={[-0.11, 0.06, 0.12]} castShadow>
          <cylinderGeometry args={[0.05, 0.05, 0.12, 8]} />
          <meshStandardMaterial color={C.plankDark} roughness={1} {...FLAT} />
        </mesh>
        <mesh position={[-0.11, 0.121, 0.12]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.045, 8]} />
          <meshStandardMaterial color="#2c3a44" metalness={0.3} roughness={0.2} {...FLAT} />
        </mesh>
      </group>

      {/* Charcoal heap and ore pile at the back. */}
      <mesh position={[-0.58, 0.05, -0.32]} scale={[1.2, 0.5, 1]} castShadow>
        <icosahedronGeometry args={[0.16, 0]} />
        <meshStandardMaterial color="#1b1c1e" roughness={1} {...FLAT} />
      </mesh>
      <mesh position={[0.1, 0.04, -0.58]} scale={[1.3, 0.45, 1]} castShadow>
        <icosahedronGeometry args={[0.14, 0]} />
        <meshStandardMaterial color="#7a4a34" roughness={1} {...FLAT} />
      </mesh>
      <mesh position={[0.1, 0.085, -0.58]} scale={[1.3, 0.3, 1]}>
        <icosahedronGeometry args={[0.08, 0]} />
        <meshStandardMaterial color={SNOW_COLOR} roughness={0.9} {...FLAT} />
      </mesh>

      {/* Slag heap: dark glassy lumps. */}
      {[
        [-0.6, 0.3, 0.07],
        [-0.52, 0.4, 0.05],
        [-0.66, 0.42, 0.045],
      ].map(([x, z, r], i) => (
        <mesh key={i} position={[x!, r! * 0.6, z!]} rotation={[i, i * 2, 0]} castShadow>
          <dodecahedronGeometry args={[r!, 0]} />
          <meshStandardMaterial color="#26302e" metalness={0.3} roughness={0.25} {...FLAT} />
        </mesh>
      ))}

      {/* Finished iron stacked crosswise. */}
      <group position={[0.4, 0, 0.46]} rotation={[0, 0.3, 0]}>
        {[0, 1, 2, 3].map((k) =>
          [-1, 0, 1].map((i) => (
            <mesh key={`${k}${i}`} position={[k % 2 ? i * 0.045 : 0, 0.012 + k * 0.024, k % 2 ? 0 : i * 0.045]} rotation={[0, k % 2 ? Math.PI / 2 : 0, 0]} castShadow>
              <boxGeometry args={[0.16, 0.022, 0.03]} />
              <meshStandardMaterial color={k % 2 ? "#5b5f63" : "#4a4e52"} metalness={0.55} roughness={0.45} {...FLAT} />
            </mesh>
          )),
        )}
      </group>

      <Heater state={heater} position={HEATER_AT} rotationY={0} />

      <SnowHeaps
        at={[
          [0.62, -0.35, 0.1],
          [-0.3, 0.6, 0.09],
          [-0.55, -0.6, 0.1],
        ]}
      />
    </group>
  );
}
