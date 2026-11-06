/*
 * The Hush on the glass: as the storm rises, frost creeps in from the screen's edges and each
 * gust drives a brief white-out across the whole view. Reads the scene's weather every frame and
 * writes styles directly, so it never re-renders React. Pointer events pass through.
 */
import { useEffect, useRef } from "react";
import { weather } from "@/game/scene/Atmosphere";

/**
 * Fine crystalline frost, white with soft alpha, tiled across the frost layer. Drawn on a canvas
 * rather than with an SVG noise filter: iOS Safari skips the filter's colour matrix and shows
 * the raw, rainbow-coloured turbulence instead.
 */
let noiseUrl: string | null = null;
function frostNoise(): string {
  if (noiseUrl) return noiseUrl;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return (noiseUrl = "none");
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  ctx.lineCap = "round";
  // Tiny crystals: short white needles at random angles, a few larger and brighter.
  for (let i = 0; i < 2600; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const big = rand() < 0.08;
    const len = big ? 2 + rand() * 4 : 0.6 + rand() * 1.6;
    const a = rand() * Math.PI;
    ctx.strokeStyle = `rgba(255,255,255,${(big ? 0.55 : 0.25) + rand() * 0.35})`;
    ctx.lineWidth = big ? 1 : 0.8;
    ctx.beginPath();
    // Draw each needle on every side of the tile it touches, so the tiling has no seams.
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        ctx.moveTo(x + dx - Math.cos(a) * len, y + dy - Math.sin(a) * len);
        ctx.lineTo(x + dx + Math.cos(a) * len, y + dy + Math.sin(a) * len);
      }
    }
    ctx.stroke();
  }
  noiseUrl = `url(${canvas.toDataURL("image/png")})`;
  return noiseUrl;
}

const smooth = (x: number, a: number, b: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function StormFrost() {
  const frost = useRef<HTMLDivElement>(null);
  const haze = useRef<HTMLDivElement>(null);
  const whiteout = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const S = weather.storm;
      const G = weather.gust;
      const deep = smooth(S, 0.45, 1);
      // Frost spreads further in as the storm deepens; gusts push it a little more.
      const reach = 78 - deep * 18 - G * 8;
      if (frost.current) {
        frost.current.style.opacity = String(deep * (0.35 + G * 0.3));
        const mask = `radial-gradient(ellipse at center, transparent ${reach}%, black ${reach + 26}%)`;
        frost.current.style.maskImage = mask;
        frost.current.style.webkitMaskImage = mask;
      }
      if (haze.current) haze.current.style.opacity = String(deep * (0.22 + G * 0.3));
      if (whiteout.current) whiteout.current.style.opacity = String(S * G * 0.14);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
      <div
        ref={haze}
        className="absolute inset-0"
        style={{
          opacity: 0,
          background:
            "radial-gradient(ellipse at center, transparent 50%, rgba(214,226,238,0.35) 80%, rgba(232,240,248,0.7) 100%)",
        }}
      />
      <div ref={frost} className="absolute inset-0" style={{ opacity: 0, backgroundImage: frostNoise(), backgroundSize: "256px 256px" }} />
      <div ref={whiteout} className="absolute inset-0" style={{ opacity: 0, background: "rgba(230,238,246,1)" }} />
    </div>
  );
}
