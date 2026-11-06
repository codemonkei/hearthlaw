/*
 * Spindrift: loose snow torn off the surface and driven along it in streams. Calm days have
 * none; it rises with the storm and races with every gust, skimming the snowfield's own height
 * so it pours down into the pit and over the hill. Presentation only.
 *
 * Drawn as instanced camera-facing quads with the soft round shape worked out in the shader,
 * not as textured points: iOS Safari renders textured point sprites near the ground as
 * rainbow-coloured speckles.
 */
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { SimState } from "@/game/sim/types";
import { makeHeightAt } from "@/game/scene/terrain";
import { weather } from "@/game/scene/Atmosphere";
import { TOUCH } from "@/game/fx";

const COUNT = TOUCH ? 700 : 1600;
const SPAN = 40;

const vertex = /* glsl */ `
uniform float uSize;
attribute vec3 aOffset;
varying vec2 vUv;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(aOffset, 1.0);
  // A little wider than tall: a streak torn along by the wind.
  mvPosition.xy += position.xy * vec2(uSize * 1.8, uSize);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const fragment = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
#include <fog_pars_fragment>
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = pow(clamp(1.0 - d, 0.0, 1.0), 1.5) * uOpacity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

export function Spindrift({ sim }: { sim: SimState }) {
  const heightAt = useMemo(() => makeHeightAt(sim), [sim]);
  const frame = useRef(0);
  const { geo, lift, speed, ground } = useMemo(() => {
    const pos = new Float32Array(COUNT * 3);
    const lift = new Float32Array(COUNT);
    const speed = new Float32Array(COUNT);
    const ground = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * SPAN;
      pos[i * 3 + 2] = (Math.random() - 0.5) * SPAN;
      // Most hug the surface; a few are thrown higher.
      lift[i] = 0.02 + Math.random() ** 2.5 * 0.55;
      speed[i] = 0.7 + Math.random() * 0.6;
    }
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute("position", quad.getAttribute("position"));
    geo.setAttribute("uv", quad.getAttribute("uv"));
    geo.setAttribute("aOffset", new THREE.InstancedBufferAttribute(pos, 3));
    geo.instanceCount = 0;
    return { geo, lift, speed, ground };
  }, []);
  // Fill in the surface height once the tiles are known.
  useEffect(() => {
    const pos = geo.getAttribute("aOffset") as THREE.InstancedBufferAttribute;
    for (let i = 0; i < COUNT; i++) ground[i] = heightAt(pos.getX(i), pos.getZ(i));
  }, [geo, ground, heightAt]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.merge([
          THREE.UniformsLib.fog,
          { uColor: { value: new THREE.Color("#eef3f8") }, uOpacity: { value: 0 }, uSize: { value: 0.055 } },
        ]),
        vertexShader: vertex,
        fragmentShader: fragment,
        transparent: true,
        depthWrite: false,
        fog: true,
      }),
    [],
  );
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  const night = useMemo(() => new THREE.Color("#7c8896"), []);
  const day = useMemo(() => new THREE.Color("#eef3f8"), []);

  useFrame(({ clock }, delta) => {
    const S = weather.storm;
    const G = weather.gust;
    const amount = THREE.MathUtils.smoothstep(S, 0.25, 1);
    const n = Math.round(COUNT * Math.min(1, amount * (0.7 + G * 0.6)));
    geo.instanceCount = n;
    mat.uniforms.uOpacity!.value = amount * (0.45 + G * 0.35);
    (mat.uniforms.uColor!.value as THREE.Color).copy(night).lerp(day, weather.daylight);
    if (n === 0) return;
    const d = Math.min(delta, 0.1);
    const t = clock.elapsedTime;
    const wind = 3 + S * 5 + G * 12;
    const slot = frame.current++ % 4;
    const pos = geo.getAttribute("aOffset") as THREE.InstancedBufferAttribute;
    for (let i = 0; i < n; i++) {
      let x = pos.getX(i) + d * wind * speed[i];
      let z = pos.getZ(i) + d * Math.sin(t * 0.7 + i) * 0.6;
      const wrapped = x > SPAN / 2;
      if (wrapped) {
        x -= SPAN;
        z = (Math.random() - 0.5) * SPAN;
      }
      // Re-read the ground for a quarter of the stream each frame, and always after a wrap.
      if (wrapped || i % 4 === slot) ground[i] = heightAt(x, z);
      const hop = Math.abs(Math.sin(t * 2.3 * speed[i] + i * 1.7)) * lift[i] * (0.5 + G);
      pos.setXYZ(i, x, ground[i] + 0.03 + hop, z);
    }
    pos.needsUpdate = true;
  });

  return <mesh geometry={geo} material={mat} frustumCulled={false} renderOrder={3} raycast={() => null} />;
}
