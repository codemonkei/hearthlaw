import { useEffect, useState, type ReactNode } from "react";
import { CityCanvas } from "@/game/scene/CityCanvas";
import { bindKeyState, clearKeys } from "@/game/input/keys";
import { hasSave } from "@/game/sim/save";
import { unlockAudio } from "@/game/audio";
import { useGame } from "@/game/store";
import { PlayChrome } from "@/game/ui/chrome";
import { Flame, ScrollText, Landmark } from "lucide-react";

export function GameApp() {
  const phase = useGame((s) => s.phase);
  const boot = useGame((s) => s.boot);
  const start = useGame((s) => s.start);
  const resume = useGame((s) => s.resume);
  const togglePause = useGame((s) => s.togglePause);
  const setSpeed = useGame((s) => s.setSpeed);
  const toggleHeat = useGame((s) => s.toggleHeat);
  const toggleFx = useGame((s) => s.toggleFx);
  const setPanel = useGame((s) => s.setPanel);
  const [saved, setSaved] = useState(false);

  // Re-check on every return to the title: a reset deletes the save.
  useEffect(() => {
    if (phase === "title") setSaved(hasSave());
  }, [phase]);

  useEffect(() => {
    boot();
    setSaved(hasSave());
    const unbind = bindKeyState();
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const play = useGame.getState().phase === "play";
      if (!play) return;
      if (e.code === "Space") {
        e.preventDefault();
        togglePause();
      } else if (e.code === "Digit1") setSpeed(1);
      else if (e.code === "Digit2") setSpeed(2);
      else if (e.code === "Digit3") setSpeed(4);
      else if (e.code === "KeyO") toggleHeat();
      else if (e.code === "KeyG") toggleFx();
      else if (e.code === "Escape") setPanel(null);
      else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      unbind();
      window.removeEventListener("keydown", onKey);
      clearKeys();
    };
  }, [boot, setPanel, setSpeed, toggleFx, toggleHeat, togglePause]);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-ink text-snow">
      {phase === "play" ? (
        <>
          <CityCanvas />
          <PlayChrome />
        </>
      ) : (
        <Title
          saved={saved}
          onStart={(seed) => {
            unlockAudio();
            start(seed);
          }}
          onResume={() => {
            unlockAudio();
            resume();
          }}
        />
      )}
    </main>
  );
}

function Title({
  saved,
  onStart,
  onResume,
}: {
  saved: boolean;
  onStart: (seed: number) => void;
  onResume: () => void;
}) {
  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 78%, color-mix(in srgb, var(--color-ember) 55%, transparent), transparent 42%), radial-gradient(ellipse at 50% 120%, var(--color-copper), transparent 46%), linear-gradient(180deg, #10151b 0%, var(--color-ink) 48%, #1b140f 100%)",
        }}
      />
      <div className="relative z-10 mx-auto flex h-full w-full max-w-3xl flex-col justify-end px-5 pb-10 sm:justify-center sm:pb-0">
        <p className="hl-kicker">First Watch · The Kindling</p>
        <h1 className="hl-display mt-3 text-6xl leading-none text-snow sm:text-8xl">Hearthlaw</h1>
        <p className="mt-4 max-w-xl text-lg leading-snug text-mist sm:text-xl">
          Keep the fire. Write the law. Live with both.
        </p>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-mist">
          A buried engine called the Kiln still breathes in a glacier cirque. You are Warden of the
          Charter. House the convoy, feed the fire, and hold through the Hush — a two-day killing
          cold that arrives on day 6.
        </p>
        <div className="mt-6 grid max-w-xl grid-cols-3 gap-3 text-sm">
          <Pill icon={<Flame className="size-4 text-ember" />} title="Warmth" text="One heat, spent in fuel." />
          <Pill icon={<ScrollText className="size-4 text-ember" />} title="Charter" text="Clauses the circles can refuse." />
          <Pill icon={<Landmark className="size-4 text-ember" />} title="Chronicle" text="Lives, liberty, kinship, truth." />
        </div>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            className="min-h-12 rounded-xl bg-ember px-5 text-base font-medium text-ink"
            onClick={() => onStart((Math.random() * 0xffffffff) >>> 0)}
          >
            Take the Charter
          </button>
          <button
            type="button"
            className="min-h-12 rounded-xl border border-line px-5 text-base text-snow"
            onClick={() => onStart(192011)}
          >
            The first valley
          </button>
          {saved && (
            <button
              type="button"
              className="min-h-12 rounded-xl border border-line px-5 text-base text-mist"
              onClick={onResume}
            >
              Continue
            </button>
          )}
        </div>
        <p className="mt-6 max-w-xl text-xs leading-relaxed text-mist">
          Drag to pan, scroll or pinch to zoom, right-drag or Q/E to turn. WASD shifts the view.
          Space pauses. The letter O shows heat. Build on dark peat seams first, and keep tents
          inside the amber ring.
        </p>
      </div>
    </div>
  );
}

function Pill({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="hl-panel px-3 py-3">
      <div className="flex items-center gap-2">
        {icon}
        <span className="hl-display text-sm text-snow">{title}</span>
      </div>
      <p className="mt-1 text-xs leading-snug text-mist">{text}</p>
    </div>
  );
}
