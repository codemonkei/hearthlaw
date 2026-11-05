import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { keyDown } from "@/game/input/keys";
import { outdoorBand, outdoorTemp } from "@/game/sim/content";
import { buildingWarmth, sourceAt } from "@/game/sim/engine";
import { HEX_SIZE, hexToWorld } from "@/game/sim/hex";
import type { BuildingKind, Terrain, Tile } from "@/game/sim/types";

/** Tile tops from hexToWorld; the lowest hexes sit level with this plane. */
const GROUND_Y = -0.02;
/** Half the old slab thickness: structures are authored relative to the slab centre. */
const SLAB_HALF = 0.1;
/** How far each tile column reaches below the ground plane. */
const COLUMN_SINK = 0.3;
import { useGame } from "@/game/store";

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _shift = new THREE.Vector3();

/** How far from the Kiln the camera's focus may wander (the map is ~8 units across its radius). */
const PAN_LIMIT = 10;

/** Keep the focus on the ground and over the map; move the camera with it so the view doesn't jump. */
function clampTarget(c: OrbitControlsImpl) {
  const t = c.target;
  _shift.set(0, -t.y, 0);
  const r = Math.hypot(t.x, t.z);
  if (r > PAN_LIMIT) {
    const k = PAN_LIMIT / r;
    _shift.x = t.x * k - t.x;
    _shift.z = t.z * k - t.z;
  }
  if (_shift.lengthSq() === 0) return;
  t.add(_shift);
  c.object.position.add(_shift);
}

function heatHex(w: number): string {
  if (w <= -3) return "#3c2a62";
  if (w <= -2) return "#2f4d86";
  if (w <= -1) return "#3c6d86";
  if (w <= 0) return "#7d93a4";
  if (w <= 1) return "#c9844a";
  return "#f2a541";
}

function CameraRig() {
  const controls = useRef<OrbitControlsImpl>(null);
  const drive = useGame((s) => s.drive);
  useFrame((_, delta) => {
    const d = Math.min(delta, 0.1);
    drive(d);
    const c = controls.current;
    if (!c) return;
    clampTarget(c);
    const cam = c.object;
    _fwd.set(c.target.x - cam.position.x, 0, c.target.z - cam.position.z);
    if (_fwd.lengthSq() < 1e-5) return;
    _fwd.normalize();
    _right.crossVectors(_fwd, _up).normalize();
    let strafe = 0;
    let ahead = 0;
    if (keyDown("KeyA") || keyDown("ArrowLeft")) strafe -= 1;
    if (keyDown("KeyD") || keyDown("ArrowRight")) strafe += 1;
    if (keyDown("KeyW") || keyDown("ArrowUp")) ahead += 1;
    if (keyDown("KeyS") || keyDown("ArrowDown")) ahead -= 1;
    const speed = 12 * d * (keyDown("ShiftLeft") ? 2 : 1);
    if (strafe !== 0 || ahead !== 0) {
      const len = Math.hypot(strafe, ahead) || 1;
      const sx = (strafe / len) * speed;
      const sz = (ahead / len) * speed;
      c.target.addScaledVector(_right, sx);
      c.target.addScaledVector(_fwd, sz);
      cam.position.addScaledVector(_right, sx);
      cam.position.addScaledVector(_fwd, sz);
    }
    if (keyDown("KeyQ")) c.setAzimuthalAngle(c.getAzimuthalAngle() + d * 0.65);
    if (keyDown("KeyE")) c.setAzimuthalAngle(c.getAzimuthalAngle() - d * 0.65);
  });
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.12}
      maxPolarAngle={Math.PI / 2.4}
      screenSpacePanning={false}
      minPolarAngle={0.38}
      minDistance={8}
      maxDistance={34}
      target={[0, 0, 0]}
      mouseButtons={{
        LEFT: THREE.MOUSE.PAN,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.ROTATE,
      }}
      touches={{
        ONE: THREE.TOUCH.PAN,
        TWO: THREE.TOUCH.DOLLY_ROTATE,
      }}
    />
  );
}

function Snow() {
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const count = 420;
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 46;
      arr[i * 3 + 1] = Math.random() * 18 + 1;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 46;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    return g;
  }, []);
  useFrame((_, delta) => {
    const attr = ref.current?.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (!attr) return;
    const d = Math.min(delta, 0.1);
    for (let i = 0; i < attr.count; i++) {
      let y = attr.getY(i) - d * (1.1 + (i % 7) * 0.18);
      if (y < 0) y = 16 + (i % 5);
      attr.setY(i, y);
    }
    attr.needsUpdate = true;
  });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial color="#e8eef2" size={0.055} transparent opacity={0.75} sizeAttenuation />
    </points>
  );
}

function Kiln({
  strain,
  pressure,
  running,
  terrain,
}: {
  strain: number;
  pressure: number;
  running: boolean;
  terrain: Terrain;
}) {
  const light = useRef<THREE.PointLight>(null);
  const core = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const pulse = running ? 1.4 + pressure * 0.55 + Math.sin(t * (2 + strain / 400)) * 0.25 : 0.15;
    if (light.current) light.current.intensity = pulse * 3.2;
    if (core.current) {
      const mat = core.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = pulse;
    }
  });
  const y = hexToWorld(0, 0, terrain)[1] - SLAB_HALF;
  return (
    <group position={[0, y, 0]}>
      <mesh position={[0, 0.35, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.15, 1.35, 0.7, 8]} />
        <meshStandardMaterial color="#2a3138" metalness={0.45} roughness={0.55} />
      </mesh>
      <mesh position={[0, 1.15, 0]} castShadow>
        <cylinderGeometry args={[0.72, 0.95, 1.05, 10]} />
        <meshStandardMaterial color="#3b4a5c" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh ref={core} position={[0, 1.15, 0]}>
        <cylinderGeometry args={[0.38, 0.38, 0.7, 10]} />
        <meshStandardMaterial color="#f2a541" emissive="#c8642b" emissiveIntensity={1.2} />
      </mesh>
      <mesh position={[0, 2.05, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.48, 0.85, 8]} />
        <meshStandardMaterial color="#c8642b" metalness={0.65} roughness={0.28} />
      </mesh>
      <mesh position={[0, 2.55, 0]}>
        <sphereGeometry args={[0.16, 10, 8]} />
        <meshStandardMaterial color="#f2a541" emissive="#f2a541" emissiveIntensity={1.4} />
      </mesh>
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.95, 0.85, Math.sin(a) * 0.95]} rotation={[0, -a, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.07, 0.09, 0.7, 6]} />
            <meshStandardMaterial color="#8d4b28" metalness={0.7} roughness={0.3} />
          </mesh>
        );
      })}
      <pointLight ref={light} position={[0, 2.2, 0]} color="#f2a541" distance={16} decay={2} />
    </group>
  );
}

function Structure({ kind, warmth, selected }: { kind: BuildingKind; warmth: number; selected: boolean }) {
  const roof = warmth >= 1 ? "#f2a541" : "#e8eef2";
  const timber = "#6b4632";
  const stone = "#3b4a5c";
  if (kind === "tent") {
    return (
      <mesh position={[0, 0.38, 0]} castShadow>
        <coneGeometry args={[0.55, 0.75, 6]} />
        <meshStandardMaterial color={selected ? "#c8642b" : "#cbb892"} roughness={0.85} />
      </mesh>
    );
  }
  if (kind === "hut" || kind === "longhouse") {
    const wide = kind === "longhouse" ? 1.15 : 0.72;
    return (
      <group>
        <mesh position={[0, 0.32, 0]} castShadow>
          <boxGeometry args={[wide, 0.48, 0.62]} />
          <meshStandardMaterial color={timber} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.68, 0]} rotation={[0, 0, 0]} castShadow>
          <coneGeometry args={[kind === "longhouse" ? 0.78 : 0.52, 0.42, 4]} />
          <meshStandardMaterial color={roof} roughness={0.7} />
        </mesh>
        <mesh position={[wide * 0.25, 0.78, 0]}>
          <boxGeometry args={[0.08, 0.28, 0.08]} />
          <meshStandardMaterial color={stone} />
        </mesh>
      </group>
    );
  }
  if (kind === "vent") {
    return (
      <group>
        <mesh position={[0, 0.45, 0]} castShadow>
          <cylinderGeometry args={[0.16, 0.22, 0.9, 8]} />
          <meshStandardMaterial color="#c8642b" metalness={0.6} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.95, 0]}>
          <sphereGeometry args={[0.12, 8, 8]} />
          <meshStandardMaterial color="#f2a541" emissive="#f2a541" emissiveIntensity={0.8} />
        </mesh>
      </group>
    );
  }
  const tall = kind === "survey" || kind === "infirmary";
  return (
    <group>
      <mesh position={[0, 0.36, 0]} castShadow>
        <boxGeometry args={[0.85, 0.55, 0.7]} />
        <meshStandardMaterial color={kind === "peat" ? "#3a342c" : kind === "mess" ? "#8a5a3c" : stone} roughness={0.75} />
      </mesh>
      <mesh position={[0.22, tall ? 0.95 : 0.75, 0]} castShadow>
        <boxGeometry args={[0.12, tall ? 0.7 : 0.4, 0.12]} />
        <meshStandardMaterial color="#2c3338" />
      </mesh>
      {kind === "wood" && (
        <mesh position={[-0.35, 0.55, 0.2]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.08, 0.08, 0.55, 6]} />
          <meshStandardMaterial color="#6b4632" />
        </mesh>
      )}
    </group>
  );
}

function DepositMark({ deposit }: { deposit: Tile["deposit"] }) {
  if (deposit === "none") return null;
  const color = deposit === "peat" ? "#2a241e" : deposit === "timber" ? "#6b4632" : deposit === "scrap" ? "#8d6a48" : "#6d7a52";
  return (
    <mesh position={[0.28, 0.12, 0.18]} castShadow>
      <boxGeometry args={deposit === "timber" ? [0.28, 0.1, 0.12] : [0.22, 0.12, 0.18]} />
      <meshStandardMaterial color={color} roughness={0.9} />
    </mesh>
  );
}

function City() {
  const rev = useGame((s) => s.rev);
  const heat = useGame((s) => s.heat);
  const buildKind = useGame((s) => s.buildKind);
  const selectedId = useGame((s) => s.selectedId);
  const tryPlace = useGame((s) => s.tryPlace);
  const select = useGame((s) => s.select);
  const sim = useGame.getState().sim;
  const [hover, setHover] = useState<string | null>(null);
  const hexGeo = useMemo(() => new THREE.CylinderGeometry(HEX_SIZE * 0.94, HEX_SIZE * 0.96, 1, 6), []);

  if (!sim) return null;
  void rev;

  const temp = outdoorTemp(sim.minute);
  const band = outdoorBand(temp);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, GROUND_Y, 0]} receiveShadow>
        <circleGeometry args={[90, 64]} />
        <meshStandardMaterial color="#9eacb8" roughness={1} />
      </mesh>
      {Array.from({ length: 14 }).map((_, i) => {
        const a = (i / 14) * Math.PI * 2;
        const rad = 16 + (i % 3) * 0.8;
        return (
          <mesh key={i} position={[Math.cos(a) * rad, 0.75, Math.sin(a) * rad]} castShadow>
            <coneGeometry args={[1.4 + (i % 4) * 0.35, 3.2 + (i % 5), 5]} />
            <meshStandardMaterial color={i % 2 ? "#c5d0da" : "#8ea0b0"} roughness={0.95} />
          </mesh>
        );
      })}
      {sim.tiles.map((tile) => {
        const [x, top, z] = hexToWorld(tile.q, tile.r, sim.terrain);
        // Group origin stays at the old slab centre so structure offsets are unchanged.
        const y = top - SLAB_HALF;
        // Solid column from the tile top down past the ground, so nothing floats.
        const column = top - GROUND_Y + COLUMN_SINK;
        const key = `${tile.q}:${tile.r}`;
        const isKiln = tile.q === 0 && tile.r === 0;
        const src = sourceAt(sim, tile.q, tile.r);
        const w = band + src;
        const building = sim.buildings.find((b) => b.id === tile.buildingId) ?? null;
        let color = "#d5dee6";
        if (tile.deposit === "peat") color = "#5c5348";
        else if (tile.deposit === "timber") color = "#c9d4cf";
        else if (tile.deposit === "scrap") color = "#b7aa9c";
        else if (tile.deposit === "lichen") color = "#c5d0c4";
        if (heat && !isKiln) color = heatHex(building ? buildingWarmth(sim, building) : w);
        if (hover === key) color = "#f2a541";
        return (
          <group key={key} position={[x, y, z]}>
            <mesh
              geometry={hexGeo}
              position={[0, SLAB_HALF - column / 2, 0]}
              scale={[1, column, 1]}
              rotation={[0, Math.PI / 6, 0]}
              receiveShadow
              onPointerOver={(e) => {
                e.stopPropagation();
                setHover(key);
              }}
              onPointerOut={() => setHover((h) => (h === key ? null : h))}
              onClick={(e) => {
                e.stopPropagation();
                if (isKiln) {
                  select(null);
                  return;
                }
                if (buildKind && !building) {
                  tryPlace(tile.q, tile.r);
                  return;
                }
                select(building ? building.id : null);
              }}
            >
              <meshStandardMaterial color={color} roughness={0.92} metalness={0.02} />
            </mesh>
            {!building && <DepositMark deposit={tile.deposit} />}
            {building && (
              <Structure kind={building.kind} warmth={buildingWarmth(sim, building)} selected={building.id === selectedId} />
            )}
            {buildKind && hover === key && !building && !isKiln && (
              <mesh position={[0, 0.45, 0]}>
                <boxGeometry args={[0.7, 0.5, 0.6]} />
                <meshStandardMaterial color="#f2a541" transparent opacity={0.35} />
              </mesh>
            )}
          </group>
        );
      })}
      <Kiln
        strain={sim.kiln.strain}
        pressure={sim.kiln.pressure}
        running={sim.kiln.running && sim.kiln.pressure > 0}
        terrain={sim.terrain}
      />
    </group>
  );
}

export function CityCanvas() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return <div className="absolute inset-0 bg-ink" />;
  return (
    <Canvas
      className="absolute inset-0 touch-none"
      shadows
      dpr={[1, 1.6]}
      camera={{ position: [14, 16, 14], fov: 38, near: 0.1, far: 120 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onPointerMissed={() => useGame.getState().select(null)}
    >
      <color attach="background" args={["#1a242e"]} />
      <fog attach="fog" args={["#1a242e", 22, 52]} />
      <hemisphereLight args={["#9fb3c8", "#3b4a5c", 0.55]} />
      <ambientLight intensity={0.28} />
      <directionalLight
        position={[12, 22, 8]}
        intensity={1.25}
        color="#e7eef5"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={2}
        shadow-camera-far={50}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
      />
      <City />
      <Snow />
      <CameraRig />
    </Canvas>
  );
}
