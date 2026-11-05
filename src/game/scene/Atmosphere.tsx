import { useFrame } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import { Bloom, BrightnessContrast, EffectComposer, HueSaturation, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { FxQuality } from "@/game/fx";

/*
 * Mood: cold moonlight on snow, warm firelight from the Kiln and the windows.
 * Everything here is presentation only; nothing reads or writes the sim.
 */

export const SKY = "#141c25";
export const FOG = "#1b2632";

export function SceneLighting({ quality }: { quality: FxQuality }) {
  const shadowSize = quality === "high" ? 2048 : 1024;
  return (
    <>
      <color attach="background" args={[SKY]} />
      <fogExp2 attach="fog" args={[FOG, 0.022]} />
      <hemisphereLight args={["#9cb2cc", "#2f3a48", 0.6]} />
      <directionalLight
        position={[-14, 20, 10]}
        intensity={1.3}
        color="#b9cce6"
        castShadow
        shadow-mapSize-width={shadowSize}
        shadow-mapSize-height={shadowSize}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-near={2}
        shadow-camera-far={50}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
      />
      {/* Image-based light baked from a few soft panels: no HDRI download. */}
      <Environment resolution={64} frames={1}>
        <Lightformer form="rect" intensity={0.9} color="#6d88a8" position={[0, 8, 0]} rotation-x={Math.PI / 2} scale={[20, 20, 1]} />
        <Lightformer form="rect" intensity={0.35} color="#9fb3c8" position={[-10, 3, 6]} scale={[10, 4, 1]} />
        <Lightformer form="ring" intensity={0.5} color="#f2a541" position={[0, 1.5, 0]} scale={2} />
      </Environment>
    </>
  );
}

/*
 * No ambient occlusion yet: the N8AO pass bundled with @react-three/postprocessing 2.x
 * uses a render-target API that three r187 removed, and throws every frame.
 */
export function PostFx({ quality }: { quality: FxQuality }) {
  if (quality === "low") return null;
  return (
    <EffectComposer multisampling={4}>
      <Bloom mipmapBlur intensity={0.85} luminanceThreshold={1.05} luminanceSmoothing={0.25} radius={0.7} />
      <HueSaturation saturation={-0.06} />
      <BrightnessContrast contrast={0.08} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette offset={0.32} darkness={0.55} />
    </EffectComposer>
  );
}

let softTexture: THREE.CanvasTexture | null = null;

/** A round, soft-edged puff shared by mist planes. */
function getSoftTexture(): THREE.CanvasTexture {
  if (softTexture) return softTexture;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  softTexture = new THREE.CanvasTexture(canvas);
  return softTexture;
}

/** Low banks of mist drifting around the cirque, outside the tiles. */
export function GroundMist() {
  const group = useRef<THREE.Group>(null);
  const banks = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2 + (i % 3) * 0.3;
        const r = 12 + (i % 4) * 2.5;
        return { a, r, y: 0.35 + (i % 3) * 0.25, size: 9 + (i % 5) * 2, speed: 0.012 + (i % 4) * 0.004 };
      }),
    [],
  );
  const tex = useMemo(getSoftTexture, []);
  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    const t = clock.elapsedTime;
    g.children.forEach((child, i) => {
      const b = banks[i]!;
      const a = b.a + t * b.speed;
      child.position.set(Math.cos(a) * b.r, b.y, Math.sin(a) * b.r);
    });
  });
  return (
    <group ref={group}>
      {banks.map((b, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, b.a]} renderOrder={2}>
          <planeGeometry args={[b.size, b.size * 0.6]} />
          <meshBasicMaterial map={tex} color="#c9d6e2" transparent opacity={0.16} depthWrite={false} fog />
        </mesh>
      ))}
    </group>
  );
}

/** Sparks rising from the Kiln's crown. Bright enough to bloom. */
export function Embers({ origin, strength }: { origin: [number, number, number]; strength: number }) {
  const ref = useRef<THREE.Points>(null);
  const count = 70;
  const seeds = useMemo(
    () => Array.from({ length: count }, (_, i) => ({ phase: (i * 0.618) % 1, sway: 0.4 + ((i * 0.37) % 1) * 0.6, a: i * 2.4 })),
    [],
  );
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    return g;
  }, []);
  const mat = useMemo(
    () =>
      new THREE.PointsMaterial({
        color: new THREE.Color("#ffb15c").multiplyScalar(4),
        size: 0.07,
        sizeAttenuation: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );
  useEffect(() => () => {
    geo.dispose();
    mat.dispose();
  }, [geo, mat]);
  useFrame(({ clock }) => {
    const pts = ref.current;
    if (!pts) return;
    mat.opacity = Math.min(1, strength);
    pts.visible = strength > 0.05;
    const t = clock.elapsedTime;
    const attr = geo.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < count; i++) {
      const s = seeds[i]!;
      const age = (t * 0.22 * (0.7 + s.sway) + s.phase) % 1;
      const rad = 0.15 + age * 0.9 * s.sway;
      attr.setXYZ(
        i,
        origin[0] + Math.cos(s.a + t * 0.8) * rad + age * 0.6,
        origin[1] + age * 4.2,
        origin[2] + Math.sin(s.a + t * 0.8) * rad,
      );
    }
    attr.needsUpdate = true;
  });
  return <points ref={ref} geometry={geo} material={mat} frustumCulled={false} />;
}

const PUFFS = 9;

const smokeVertex = /* glsl */ `
attribute float aAlpha;
varying float vAlpha;
varying vec2 vUv;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vAlpha = aAlpha;
  vec4 center = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float s = length(instanceMatrix[0].xyz);
  vec4 mvPosition = center + vec4(position.xy * s, 0.0, 0.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const smokeFragment = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
varying vec2 vUv;
#include <fog_pars_fragment>
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.15, d) * vAlpha;
  gl_FragColor = vec4(uColor, a);
  #include <fog_fragment>
}
`;

export interface SmokeEmitter {
  pos: [number, number, number];
  /** 0..1 — thickness of the plume. */
  strength: number;
}

/** Camera-facing puffs that rise, drift downwind, swell and fade. One draw call for every chimney. */
export function Smoke({ emitters }: { emitters: SmokeEmitter[] }) {
  const count = Math.max(1, emitters.length * PUFFS);
  const mesh = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1);
    g.setAttribute("aAlpha", new THREE.InstancedBufferAttribute(new Float32Array(count), 1));
    return g;
  }, [count]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uColor: { value: new THREE.Color("#8d97a3") } }]),
        vertexShader: smokeVertex,
        fragmentShader: smokeFragment,
        transparent: true,
        depthWrite: false,
        fog: true,
      }),
    [],
  );
  useEffect(() => () => geo.dispose(), [geo]);
  useEffect(() => () => mat.dispose(), [mat]);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const p = useMemo(() => new THREE.Vector3(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const sc = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ clock }) => {
    const im = mesh.current;
    if (!im) return;
    const t = clock.elapsedTime;
    const alpha = geo.getAttribute("aAlpha") as THREE.InstancedBufferAttribute;
    emitters.forEach((e, ei) => {
      for (let k = 0; k < PUFFS; k++) {
        const i = ei * PUFFS + k;
        const age = (t * 0.16 + k / PUFFS + ei * 0.137) % 1;
        const wobble = Math.sin(t * 0.9 + i) * 0.08;
        p.set(e.pos[0] + age * 0.9 + wobble, e.pos[1] + age * 2.2, e.pos[2] + age * 0.25);
        const size = (0.18 + age * 0.85) * (0.6 + e.strength * 0.6);
        sc.set(size, size, size);
        m.compose(p, q, sc);
        im.setMatrixAt(i, m);
        alpha.setX(i, Math.sin(Math.PI * age) * 0.38 * e.strength);
      }
    });
    im.instanceMatrix.needsUpdate = true;
    alpha.needsUpdate = true;
  });
  if (emitters.length === 0) return null;
  return <instancedMesh key={count} ref={mesh} args={[geo, mat, count]} frustumCulled={false} renderOrder={3} />;
}
