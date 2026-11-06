/*
 * The Hush on the glass: as the storm rises, frost creeps in from the screen's edges and each
 * gust drives a brief white-out across the whole view. Reads the scene's weather every frame and
 * writes styles directly, so it never re-renders React. Pointer events pass through.
 */
import { useEffect, useRef } from "react";
import { weather } from "@/game/scene/Atmosphere";

// Fine crystalline noise, white with soft alpha, tiled across the frost layer.
const NOISE = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='260' height='260'>" +
    "<filter id='f'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' seed='7'/>" +
    "<feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1.6 -0.62'/></filter>" +
    "<rect width='100%' height='100%' filter='url(#f)'/></svg>",
)}")`;

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
      <div ref={frost} className="absolute inset-0" style={{ opacity: 0, backgroundImage: NOISE, backgroundSize: "260px 260px" }} />
      <div ref={whiteout} className="absolute inset-0" style={{ opacity: 0, background: "rgba(230,238,246,1)" }} />
    </div>
  );
}
