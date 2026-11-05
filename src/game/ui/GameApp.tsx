import { useEffect, useState, type ReactNode } from "react";
import { CityCanvas } from "@/game/scene/CityCanvas";
import { bindKeyState, clearKeys } from "@/game/input/keys";
import { hasSave } from "@/game/sim/save";
import { unlockAudio } from "@/game/audio";
import { useGame } from "@/game/store";
import { PlayChrome } from "@/game/ui/chrome";
import { KilnLab } from "@/game/ui/KilnLab";
import { buildShowcase, isShowcase } from "@/game/showcase";
import { Flame, ScrollText, Landmark } from "lucide-react";
import { DIFFICULTY } from "@/game/sim/content";
import { FX_LABEL, FX_ORDER } from "@/game/fx";
import type { Difficulty } from "@/game/sim/types";

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
    if (isShowcase()) {
      useGame.setState({ sim: buildShowcase(), phase: "play", rev: useGame.getState().rev + 1 });
    }
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
          <KilnLab />
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
        <Settings />
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
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

const DIFFICULTY_ORDER: Difficulty[] = ["easy", "medium", "hard"];

function Segmented<T extends string>({
  label,
  value,
  options,
  name,
  onChange,
}: {
  label: string;
  value: T;
  options: T[];
  name: (v: T) => string;
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-xl border border-line bg-panel p-1">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === o}
          className={`min-h-10 flex-1 rounded-lg px-3 text-sm ${value === o ? "bg-ember text-ink" : "text-mist"}`}
          onClick={() => onChange(o)}
        >
          {name(o)}
        </button>
      ))}
    </div>
  );
}

/** New-game difficulty and the graphics tier (first set from the device, changeable any time). */
function Settings() {
  const difficulty = useGame((s) => s.difficulty);
  const setDifficulty = useGame((s) => s.setDifficulty);
  const fx = useGame((s) => s.fx);
  const setFx = useGame((s) => s.setFx);
  const tips = useGame((s) => s.tips);
  const setTips = useGame((s) => s.setTips);
  return (
    <div className="mt-8 grid max-w-xl gap-4 sm:grid-cols-2">
      <div>
        <p className="hl-kicker mb-2">Difficulty</p>
        <Segmented label="Difficulty" value={difficulty} options={DIFFICULTY_ORDER} name={(d) => DIFFICULTY[d].label} onChange={setDifficulty} />
        <p className="mt-2 text-xs leading-snug text-mist">{DIFFICULTY[difficulty].blurb}</p>
      </div>
      <div>
        <p className="hl-kicker mb-2">Graphics</p>
        <Segmented label="Graphics" value={fx} options={FX_ORDER} name={(q) => FX_LABEL[q]} onChange={setFx} />
        <p className="mt-2 text-xs leading-snug text-mist">Set from this device on first run. G switches it in play.</p>
      </div>
      <div className="sm:col-span-2">
        <p className="hl-kicker mb-2">Tips</p>
        <Segmented label="Tips" value={tips ? "on" : "off"} options={["on", "off"]} name={(v) => (v === "on" ? "Guide me" : "No tips")} onChange={(v) => setTips(v === "on")} />
        <p className="mt-2 text-xs leading-snug text-mist">On for a first watch, off once you have played one. The bulb button switches them in play.</p>
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
