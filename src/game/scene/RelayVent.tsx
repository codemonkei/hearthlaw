import * as THREE from "three";
import { C, FLAT, FACING, HOT, SELECTED, TILE_TOP, toTile } from "@/game/scene/parts";

/*
 * The relay vent: the Kiln's heat carried one ring outward. A copper duct comes up out of the
 * ground into an octagonal stone plinth; above it an iron column ringed with radiator fins and
 * capped with a copper cowl. When the Kiln burns, the fins glow dull red, the grille under the
 * cowl glows hot and it breathes smoke; the snow around it has melted to dark wet ground.
 */

const COLUMN_TOP = 0.82;
const COPPER = "#a8643a";
const COPPER_DARK = "#7a4a2e";

const FIN_WARM = new THREE.MeshStandardMaterial({ color: "#3a2a24", emissive: "#ff4a14", emissiveIntensity: 0.9, metalness: 0.4, roughness: 0.5, ...FLAT });
const FIN_COLD = new THREE.MeshStandardMaterial({ color: "#3a3f45", metalness: 0.5, roughness: 0.5, ...FLAT });
const GRILLE_COLD = new THREE.MeshStandardMaterial({ color: "#15181b", roughness: 1, ...FLAT });

export function ventFlue(): [number, number, number] {
  return toTile([0, COLUMN_TOP + 0.2, 0]);
}

export function RelayVent({ active, selected }: { active: boolean; selected: boolean }) {
  const fin = active ? FIN_WARM : FIN_COLD;
  return (
    <group position={[0, TILE_TOP, 0]} rotation={[0, FACING, 0]}>
      {/* Thawed ground around the vent. */}
      <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[active ? 0.55 : 0.36, 14]} />
        <meshStandardMaterial color="#5d666e" roughness={0.35} metalness={0.1} {...FLAT} />
      </mesh>

      {/* Copper duct coming up out of the ground from the Kiln's side. */}
      <mesh position={[0, 0.035, -0.45]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.045, 0.045, 0.6, 8]} />
        <meshStandardMaterial color={COPPER_DARK} metalness={0.5} roughness={0.5} {...FLAT} />
      </mesh>
      {[-0.65, -0.42, -0.22].map((z) => (
        <mesh key={z} position={[0, 0.035, z]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.056, 0.056, 0.02, 8]} />
          <meshStandardMaterial color={C.iron} metalness={0.5} roughness={0.5} {...FLAT} />
        </mesh>
      ))}

      {/* Octagonal stone plinth. */}
      <mesh position={[0, 0.06, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.2, 0.24, 0.12, 8]} />
        <meshStandardMaterial color={C.stone} roughness={0.95} {...FLAT} />
      </mesh>
      <mesh position={[0, 0.125, 0]}>
        <cylinderGeometry args={[0.17, 0.2, 0.02, 8]} />
        <meshStandardMaterial color={C.stoneDark} roughness={0.95} {...FLAT} />
      </mesh>

      {/* Iron column with rivet bands and radiator fins. */}
      <mesh position={[0, (0.13 + COLUMN_TOP) / 2, 0]} castShadow>
        <cylinderGeometry args={[0.075, 0.09, COLUMN_TOP - 0.13, 8]} />
        <meshStandardMaterial color={selected ? SELECTED : "#33383d"} metalness={0.5} roughness={0.5} {...FLAT} />
      </mesh>
      {[0.18, COLUMN_TOP - 0.03].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <cylinderGeometry args={[0.095, 0.095, 0.03, 8]} />
          <meshStandardMaterial color={COPPER} metalness={0.55} roughness={0.45} {...FLAT} />
        </mesh>
      ))}
      {[0.3, 0.37, 0.44, 0.51, 0.58].map((y) => (
        <mesh key={y} position={[0, y, 0]} material={fin} castShadow>
          <cylinderGeometry args={[0.16, 0.16, 0.018, 10]} />
        </mesh>
      ))}

      {/* Cowl on legs over a grille that glows when the Kiln burns. */}
      <mesh position={[0, COLUMN_TOP + 0.04, 0]} material={active ? HOT : GRILLE_COLD}>
        <cylinderGeometry args={[0.07, 0.07, 0.06, 8, 1, true]} />
      </mesh>
      {[0, 1, 2, 3].map((k) => (
        <mesh key={k} position={[Math.cos((k * Math.PI) / 2) * 0.08, COLUMN_TOP + 0.04, Math.sin((k * Math.PI) / 2) * 0.08]}>
          <boxGeometry args={[0.015, 0.07, 0.015]} />
          <meshStandardMaterial color={C.iron} {...FLAT} />
        </mesh>
      ))}
      <mesh position={[0, COLUMN_TOP + 0.11, 0]} castShadow>
        <coneGeometry args={[0.15, 0.1, 8]} />
        <meshStandardMaterial color={COPPER} metalness={0.55} roughness={0.45} {...FLAT} />
      </mesh>
      <mesh position={[0, COLUMN_TOP + 0.175, 0]}>
        <sphereGeometry args={[0.018, 6, 4]} />
        <meshStandardMaterial color={COPPER_DARK} metalness={0.55} roughness={0.45} {...FLAT} />
      </mesh>

      {/* Valve wheel and pressure gauge on the front. */}
      <group position={[0, 0.24, 0.1]}>
        <mesh position={[0, 0, 0.02]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.012, 0.012, 0.05, 5]} />
          <meshStandardMaterial color={C.iron} {...FLAT} />
        </mesh>
        <mesh position={[0, 0, 0.05]}>
          <torusGeometry args={[0.045, 0.007, 4, 10]} />
          <meshStandardMaterial color="#9e2a22" metalness={0.3} roughness={0.6} {...FLAT} />
        </mesh>
        {[0, 1].map((k) => (
          <mesh key={k} position={[0, 0, 0.05]} rotation={[0, 0, (k * Math.PI) / 2]}>
            <boxGeometry args={[0.09, 0.006, 0.006]} />
            <meshStandardMaterial color="#9e2a22" {...FLAT} />
          </mesh>
        ))}
      </group>
      <group position={[0.1, 0.66, 0.04]} rotation={[0, Math.PI / 3, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 0.02, 10]} />
          <meshStandardMaterial color={COPPER} metalness={0.55} roughness={0.45} {...FLAT} />
        </mesh>
        <mesh position={[0, 0, 0.011]}>
          <circleGeometry args={[0.024, 10]} />
          <meshStandardMaterial color="#e8e2d2" roughness={0.8} {...FLAT} />
        </mesh>
        <mesh position={[0.005, 0.006, 0.013]} rotation={[0, 0, active ? -0.6 : 1.2]}>
          <boxGeometry args={[0.003, 0.02, 0.002]} />
          <meshStandardMaterial color="#1a1a1a" {...FLAT} />
        </mesh>
      </group>
    </group>
  );
}
