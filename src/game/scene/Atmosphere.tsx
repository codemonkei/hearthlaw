import { useFrame } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import { Bloom, BrightnessContrast, EffectComposer, HueSaturation, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { FX_SETTINGS, TOUCH, type FxQuality } from "@/game/fx";
import { syncWeather } from "@/game/audio";
import { useGame } from "@/game/store";

/*
 * Mood: low winter sun by day, moonlight by night, warm firelight from the Kiln and
 * the windows, and the wind rising into a whiteout as the cold deepens.
 * Everything here is presentation only: it reads the sim clock, never writes the sim.
 */

/**
 * Shared, smoothed sky state. SceneLighting writes it once per frame; particles,
 * windows and post-processing read it. 0..1 each.
 */
export const weather = {
  /** 1 at full day, 0 at full night. */
  daylight: 0,
  /** Warm tint around sunrise and sunset. */
  twilight: 0,
  /** 0 calm … 1 whiteout. Follows the outdoor temperature. */
  storm: 0,
  /** 0 … 1: the wind's gusts on top of the storm. Only blows when there is a storm to gust. */
  gust: 0,
};

/**
 * Gust shape over time: mostly lulls, with sharp peaks every several seconds. Three slow
 * sines that rarely line up, clipped and sharpened.
 */
function gustAt(t: number): number {
  const raw = Math.sin(t * 0.37) + Math.sin(t * 0.91 + 1.3) * 0.6 + Math.sin(t * 0.13 + 2) * 0.8;
  return Math.max(0, raw / 2.4) ** 1.6;
}

/** Three window states shared by every building, so night can brighten them all at once. */
export const WINDOW_MATERIALS = {
  warm: new THREE.MeshStandardMaterial({ color: "#2a1a10", emissive: "#ffb15c", emissiveIntensity: 3 }),
  mild: new THREE.MeshStandardMaterial({ color: "#2a1a10", emissive: "#ffb15c", emissiveIntensity: 1.4 }),
  cold: new THREE.MeshStandardMaterial({ color: "#2a1a10", emissive: "#ffb15c", emissiveIntensity: 0.4 }),
};
const WINDOW_BASE = { warm: 3, mild: 1.4, cold: 0.4 };

/** Winter days are short: sunrise 07:00, sunset 17:00. */
const SUNRISE = 7;
const SUNSET = 17;

/** Height of the sun on a -1..1 scale: positive by day, negative through the 14-hour night. */
function sunHeight(hour: number): number {
  if (hour >= SUNRISE && hour <= SUNSET) return Math.sin((Math.PI * (hour - SUNRISE)) / (SUNSET - SUNRISE));
  const intoNight = (hour - SUNSET + 24) % 24;
  return -Math.sin((Math.PI * intoNight) / (24 - (SUNSET - SUNRISE)));
}

/** Storm strength for an outdoor temperature: calm at -25 °C, whiteout from -55 °C. */
export function stormFor(tempC: number): number {
  return THREE.MathUtils.clamp((-tempC - 25) / 30, 0, 1);
}

const C = (hex: string) => new THREE.Color(hex);
const PAL = {
  skyNight: C("#121a24"),
  skyDay: C("#9db4ca"),
  skyDusk: C("#c48c70"),
  stormNight: C("#3a4652"),
  stormDay: C("#c5ced6"),
  hemiSkyNight: C("#3c4d66"),
  hemiSkyDay: C("#d3e2f0"),
  hemiGroundNight: C("#252d38"),
  hemiGroundDay: C("#66727f"),
  sun: C("#fff0d8"),
  sunLow: C("#ffad6b"),
  moon: C("#a9c1e6"),
};
const _c = new THREE.Color();
const _c2 = new THREE.Color();
const _dir = new THREE.Vector3();
const _moonDir = new THREE.Vector3();

/** Direction toward a body that rises in the east, peaks at `maxElev`, sets in the west. */
function arc(out: THREE.Vector3, t: number, maxElev: number, height: number) {
  const az = -1.7 + t * 3.4 + 0.6;
  const elev = Math.max(-0.2, height) * maxElev;
  return out.set(Math.cos(elev) * Math.sin(az), Math.sin(elev), Math.cos(elev) * Math.cos(az)).normalize();
}

function SunMoon({ sun, moon }: { sun: RefObject<THREE.Mesh>; moon: RefObject<THREE.Mesh> }) {
  return (
    <>
      <mesh ref={sun} renderOrder={-1}>
        <sphereGeometry args={[2.2, 16, 12]} />
        <meshBasicMaterial color={new THREE.Color("#fff3d6").multiplyScalar(3)} fog={false} toneMapped={false} transparent />
      </mesh>
      <mesh ref={moon} renderOrder={-1}>
        <sphereGeometry args={[1.5, 16, 12]} />
        <meshBasicMaterial color={new THREE.Color("#dfe8f5").multiplyScalar(1.6)} fog={false} toneMapped={false} transparent />
      </mesh>
    </>
  );
}

function Stars() {
  const mat = useMemo(
    () => new THREE.PointsMaterial({ color: "#dfe8ff", size: 0.35, sizeAttenuation: true, transparent: true, fog: false, depthWrite: false }),
    [],
  );
  const geo = useMemo(() => {
    const n = 900;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      // Upper hemisphere only, far out.
      const u = Math.random() * Math.PI * 2;
      const v = Math.acos(Math.random() * 0.92);
      const r = 75;
      arr[i * 3] = r * Math.sin(v) * Math.cos(u);
      arr[i * 3 + 1] = r * Math.cos(v);
      arr[i * 3 + 2] = r * Math.sin(v) * Math.sin(u);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    return g;
  }, []);
  useFrame(() => {
    mat.opacity = (1 - weather.daylight) * (1 - weather.storm) * 0.9;
  });
  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={-2} />;
}

/**
 * The sky clock. Reads the sim minute and outdoor temperature each frame and moves
 * the sun, moon, light colours, fog and storm toward them, smoothly.
 */
export function SceneLighting({
  quality,
  clock,
}: {
  quality: FxQuality;
  /** Fractional hour (0–24) and outdoor °C, read every frame. */
  clock: () => { hour: number; tempC: number } | null;
}) {
  const { shadowSize, shadows } = FX_SETTINGS[quality];
  const key = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const sun = useRef<THREE.Mesh>(null);
  const moon = useRef<THREE.Mesh>(null);
  const background = useMemo(() => new THREE.Color(PAL.skyNight), []);
  const fog = useMemo(() => new THREE.FogExp2(PAL.skyNight.getHex(), 0.022), []);
  const first = useRef(true);

  const soundAt = useRef(0);
  useFrame(({ scene, clock: frameClock }, delta) => {
    const now = clock();
    if (!now) return;
    const dt = first.current ? 100 : Math.min(delta, 0.1);
    first.current = false;
    const h = sunHeight(now.hour);
    const day = THREE.MathUtils.smoothstep(h, -0.15, 0.3);
    const twilight = THREE.MathUtils.clamp(1 - Math.abs(h - 0.05) / 0.3, 0, 1);
    weather.daylight = THREE.MathUtils.damp(weather.daylight, day, 2, dt);
    weather.twilight = THREE.MathUtils.damp(weather.twilight, twilight, 2, dt);
    // The wind takes its time to rise and to fall.
    weather.storm = THREE.MathUtils.damp(weather.storm, stormFor(now.tempC), 0.35, dt);
    // Gusts ride on the storm: fast to rise, slower to fall.
    const gustTarget = weather.storm * gustAt(frameClock.elapsedTime);
    weather.gust = THREE.MathUtils.damp(weather.gust, gustTarget, gustTarget > weather.gust ? 3 : 1.2, dt);
    const { daylight: D, twilight: T, storm: S, gust: G } = weather;

    // The wind's voice follows the weather a few times a second.
    soundAt.current -= Math.min(delta, 0.1);
    if (soundAt.current <= 0) {
      soundAt.current = 0.2;
      syncWeather(S, G, Boolean(useGame.getState().sim?.muted));
    }

    // Sun across the short day, moon across the long night.
    const dayT = THREE.MathUtils.clamp((now.hour - SUNRISE) / (SUNSET - SUNRISE), 0, 1);
    const nightT = ((now.hour - SUNSET + 24) % 24) / (24 - (SUNSET - SUNRISE));
    arc(_dir, dayT, 0.55, h);
    arc(_moonDir, nightT, 0.8, -h);
    const sunI = 1.7 * THREE.MathUtils.smoothstep(h, -0.05, 0.25);
    const moonI = 1.1 * THREE.MathUtils.smoothstep(-h, 0.0, 0.3);
    const calm = 1 - 0.75 * S;

    const k = key.current;
    if (k) {
      const w = sunI + moonI || 1;
      k.position.copy(_dir).multiplyScalar(sunI / w).addScaledVector(_moonDir, moonI / w).normalize().multiplyScalar(30);
      _c.copy(PAL.sun).lerp(PAL.sunLow, T);
      _c2.copy(PAL.moon);
      k.color.copy(_c).multiplyScalar(sunI / w).add(_c2.multiplyScalar(moonI / w));
      k.intensity = (sunI + moonI) * calm;
    }
    if (hemi.current) {
      hemi.current.color.copy(PAL.hemiSkyNight).lerp(PAL.hemiSkyDay, D).lerp(_c.copy(PAL.stormDay), S * 0.4);
      hemi.current.groundColor.copy(PAL.hemiGroundNight).lerp(PAL.hemiGroundDay, D);
      hemi.current.intensity = 0.65 + D * 0.3 + S * 0.15;
    }

    // Sky and fog: night blue, a warm band at dawn and dusk, then grey-white as the storm closes in.
    background.copy(PAL.skyNight).lerp(PAL.skyDay, D).lerp(PAL.skyDusk, T * 0.45);
    _c2.copy(PAL.stormNight).lerp(PAL.stormDay, D);
    background.lerp(_c2, S * 0.85);
    scene.background = background;
    fog.color.copy(background);
    // Each gust closes the whiteout in a little further.
    fog.density = 0.02 + S * 0.022 + G * 0.016;
    scene.fog = fog;
    scene.environmentIntensity = (0.45 + D * 0.75) * (1 - 0.35 * S);

    if (sun.current) {
      sun.current.position.copy(_dir).multiplyScalar(70);
      (sun.current.material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.smoothstep(h, -0.05, 0.05) * (1 - S);
    }
    if (moon.current) {
      moon.current.position.copy(_moonDir).multiplyScalar(70);
      (moon.current.material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.smoothstep(-h, -0.05, 0.05) * (1 - S);
    }

    // Lit windows matter most in the dark.
    const glow = 0.45 + (1 - D) * 0.85;
    WINDOW_MATERIALS.warm.emissiveIntensity = WINDOW_BASE.warm * glow;
    WINDOW_MATERIALS.mild.emissiveIntensity = WINDOW_BASE.mild * glow;
    WINDOW_MATERIALS.cold.emissiveIntensity = WINDOW_BASE.cold * glow;
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={["#9cb2cc", "#2f3a48", 0.6]} />
      <directionalLight
        ref={key}
        castShadow={shadows}
        key={shadowSize}
        shadow-mapSize-width={shadowSize}
        shadow-mapSize-height={shadowSize}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-near={2}
        shadow-camera-far={60}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
      />
      {/* Image-based light baked from a few soft panels: no HDRI download. Scaled by time of day. */}
      <Environment resolution={64} frames={1}>
        <Lightformer form="rect" intensity={0.9} color="#6d88a8" position={[0, 8, 0]} rotation-x={Math.PI / 2} scale={[20, 20, 1]} />
        <Lightformer form="rect" intensity={0.35} color="#9fb3c8" position={[-10, 3, 6]} scale={[10, 4, 1]} />
        <Lightformer form="ring" intensity={0.5} color="#f2a541" position={[0, 1.5, 0]} scale={2} />
      </Environment>
      <Stars />
      <SunMoon sun={sun} moon={moon} />
    </>
  );
}

/*
 * No ambient occlusion yet: the N8AO pass bundled with @react-three/postprocessing 2.x
 * uses a render-target API that three r187 removed, and throws every frame.
 */
export function PostFx({ quality }: { quality: FxQuality }) {
  const bloom = useRef<{ luminanceMaterial: { threshold: number } } | null>(null);
  useFrame(() => {
    // Sunlit snow is bright; raise the bar by day so only fire and the sun bloom.
    if (bloom.current) bloom.current.luminanceMaterial.threshold = 1.05 + weather.daylight * 0.9 + weather.storm * 0.2;
  });
  const { post, multisampling } = FX_SETTINGS[quality];
  if (!post) return null;
  return (
    <EffectComposer multisampling={multisampling} key={quality}>
      <Bloom
        ref={bloom as never}
        mipmapBlur
        intensity={0.85}
        luminanceThreshold={1.05}
        luminanceSmoothing={0.25}
        radius={0.7}
      />
      <HueSaturation saturation={-0.06} />
      <BrightnessContrast contrast={0.08} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette offset={0.32} darkness={0.55} />
    </EffectComposer>
  );
}

/** Falling snow that thickens and turns sideways as the storm rises. */
export function Snowfall() {
  const MAX = TOUCH ? 1500 : 3200;
  const BASE = TOUCH ? 300 : 450;
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const arr = new Float32Array(MAX * 3);
    for (let i = 0; i < MAX; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 46;
      arr[i * 3 + 1] = Math.random() * 18 + 1;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 46;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    g.setDrawRange(0, BASE);
    return g;
  }, []);
  const mat = useMemo(
    () =>
      new THREE.PointsMaterial({
        color: "#e8eef2",
        map: getSoftTexture(),
        size: 0.08,
        transparent: true,
        opacity: 0.8,
        sizeAttenuation: true,
        depthWrite: false,
      }),
    [],
  );
  const flakeNight = useMemo(() => new THREE.Color("#6f7b89"), []);
  const flakeDay = useMemo(() => new THREE.Color("#eef3f7"), []);
  useFrame((_, delta) => {
    const pts = ref.current;
    if (!pts) return;
    const d = Math.min(delta, 0.1);
    const S = weather.storm;
    const count = Math.round(BASE + S * (MAX - BASE));
    geo.setDrawRange(0, count);
    mat.size = 0.08 + S * 0.03;
    mat.opacity = 0.8 + S * 0.15;
    mat.color.copy(flakeNight).lerp(flakeDay, weather.daylight);
    const fall = 1 + S * 1.6;
    const wind = 0.9 + S * 11 + weather.gust * 9;
    const attr = geo.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < count; i++) {
      let y = attr.getY(i) - d * (1.1 + (i % 7) * 0.18) * fall;
      if (y < 0) y = 16 + (i % 5);
      let x = attr.getX(i) + d * wind * (0.8 + (i % 5) * 0.1);
      if (x > 23) x -= 46;
      let z = attr.getZ(i) + d * S * Math.sin(i * 0.7 + y) * 1.5;
      if (z > 23) z -= 46;
      else if (z < -23) z += 46;
      attr.setXYZ(i, x, y, z);
    }
    attr.needsUpdate = true;
  });
  return <points ref={ref} geometry={geo} material={mat} frustumCulled={false} />;
}

let softTexture: THREE.DataTexture | null = null;

/**
 * A round, soft-edged puff shared by mist planes and falling snow. Computed pixel by pixel
 * rather than drawn on a canvas: Safari's fingerprinting protection sprinkles random colour
 * noise into canvas pixels handed to WebGL, which showed as rainbow speckles in the mist.
 */
function getSoftTexture(): THREE.DataTexture {
  if (softTexture) return softTexture;
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2);
      // The same falloff as before: 1 at the centre, 0.45 at 45 %, 0 at the rim.
      const a = d < 0.45 ? 1 - (d / 0.45) * 0.55 : Math.max(0, 0.45 * (1 - (d - 0.45) / 0.55));
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(a * 255);
    }
  }
  softTexture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  softTexture.magFilter = THREE.LinearFilter;
  softTexture.minFilter = THREE.LinearMipmapLinearFilter;
  softTexture.generateMipmaps = true;
  softTexture.needsUpdate = true;
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
  const drift = useRef(0);
  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    drift.current += Math.min(delta, 0.1) * (1 + weather.storm * 6 + weather.gust * 8);
    const t = drift.current;
    g.children.forEach((child, i) => {
      const b = banks[i]!;
      const a = b.a + t * b.speed;
      child.position.set(Math.cos(a) * b.r, b.y + weather.storm * 0.6, Math.sin(a) * b.r);
      const m = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
      m.opacity = 0.16 + weather.storm * 0.3 + weather.gust * 0.15;
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
/** The most embers any fire can throw; `amount` picks how many of them are alive. */
const MAX_EMBERS = 300;

export function Embers({
  origin,
  strength,
  amount = 70,
}: {
  origin: [number, number, number];
  strength: number;
  /** How many embers are in the air (0…300). A hotter fire throws more, higher and wider. */
  amount?: number;
}) {
  const ref = useRef<THREE.Points>(null);
  const count = MAX_EMBERS;
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
    const alive = Math.max(0, Math.min(count, Math.round(amount)));
    pts.visible = strength > 0.05 && alive > 0;
    geo.setDrawRange(0, alive);
    // More embers also means a livelier fire: they climb higher and spread wider.
    const vigour = alive / 120;
    const t = clock.elapsedTime;
    const attr = geo.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < alive; i++) {
      const s = seeds[i]!;
      const age = (t * 0.22 * (0.7 + s.sway) + s.phase) % 1;
      const rad = 0.15 + age * (0.75 + vigour * 0.35) * s.sway;
      attr.setXYZ(
        i,
        origin[0] + Math.cos(s.a + t * 0.8) * rad + age * (0.6 + weather.storm * 3),
        origin[1] + age * (3.6 + vigour * 1.2),
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
export function Smoke({
  emitters,
  color = "#8d97a3",
  rise = 1,
}: {
  emitters: SmokeEmitter[];
  /** Puff colour: light grey chimney smoke by default; darker for soot. */
  color?: string;
  /** How fast puffs climb and cycle, relative to chimney smoke. */
  rise?: number;
}) {
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
  useEffect(() => {
    (mat.uniforms.uColor!.value as THREE.Color).set(color);
  }, [mat, color]);
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
        const age = (t * 0.16 * rise + k / PUFFS + ei * 0.137) % 1;
        const wobble = Math.sin(t * 0.9 + i) * 0.08;
        // The storm flattens the plume and drags it downwind.
        const gust = 0.9 + weather.storm * 4;
        p.set(e.pos[0] + age * gust + wobble, e.pos[1] + age * (2.2 - weather.storm * 1.4), e.pos[2] + age * 0.25);
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
