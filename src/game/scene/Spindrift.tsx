/*
 * Spindrift: loose snow torn off the surface and driven along it in streams. Calm days have
 * none; it rises with the storm and races with every gust, skimming the snowfield's own height
 * so it pours down into the pit and over the hill. Presentation only.
 */
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { SimState } from "@/game/sim/types";
import { makeHeightAt } from "@/game/scene/terrain";
import { weather } from "@/game/scene/Atmosphere";

const COUNT = 1600;
const SPAN = 40;

export function Spindrift({ sim }: { sim: SimState }) {
  const heightAt = useMemo(() => makeHeightAt(sim), [sim]);
  const ref = useRef<THREE.Points>(null);
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
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setDrawRange(0, 0);
    return { geo, lift, speed, ground };
  }, []);
  // Fill in the surface height once the tiles are known.
  useEffect(() => {
    const pos = geo.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < COUNT; i++) ground[i] = heightAt(pos.getX(i), pos.getZ(i));
  }, [geo, ground, heightAt]);
  const mat = useMemo(() => {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.5, "rgba(255,255,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return new THREE.PointsMaterial({
      map: new THREE.CanvasTexture(canvas),
      color: "#eef3f8",
      size: 0.11,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      sizeAttenuation: true,
    });
  }, []);
  useEffect(
    () => () => {
      geo.dispose();
      mat.map?.dispose();
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
    geo.setDrawRange(0, n);
    mat.opacity = amount * (0.45 + G * 0.35);
    mat.color.copy(night).lerp(day, weather.daylight);
    if (n === 0) return;
    const d = Math.min(delta, 0.1);
    const t = clock.elapsedTime;
    const wind = 3 + S * 5 + G * 12;
    const slot = frame.current++ % 4;
    const pos = geo.getAttribute("position") as THREE.BufferAttribute;
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

  return <points ref={ref} geometry={geo} material={mat} frustumCulled={false} renderOrder={3} />;
}
