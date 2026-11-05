import { Pause, X } from "lucide-react";
import { DAY_MINUTES, formatClock, outdoorTemp } from "@/game/sim/content";
import { useGame } from "@/game/store";

/** The last minute the scrubber reaches: the end of day 8. */
const LAST_MINUTE = 8 * DAY_MINUTES - 1;

const JUMPS: { label: string; hour: number }[] = [
  { label: "Dawn", hour: 7 },
  { label: "Noon", hour: 12 },
  { label: "Dusk", hour: 17 },
  { label: "Night", hour: 23 },
];

/**
 * Test mode panel: everything is free while it is on, and the clock can be scrubbed while
 * paused. Scrubbing moves the time of day, temperature and weather; it does not simulate
 * the skipped hours.
 */
export function TestModePanel() {
  useGame((s) => s.rev);
  const sim = useGame.getState().sim;
  const scrubTo = useGame((s) => s.scrubTo);
  const togglePause = useGame((s) => s.togglePause);
  const toggleTestMode = useGame((s) => s.toggleTestMode);
  if (!sim?.testMode) return null;
  const paused = sim.speed === 0;
  const day = Math.floor(sim.minute / DAY_MINUTES);
  const jump = (d: number, hour: number) => scrubTo(Math.min(LAST_MINUTE, Math.max(0, d * DAY_MINUTES + hour * 60)));

  return (
    <section className="pointer-events-auto absolute right-16 bottom-[180px] z-20 w-72 hl-panel p-3 text-sm">
      <div className="mb-1 flex items-center justify-between">
        <p className="hl-kicker">Test mode</p>
        <button type="button" aria-label="Turn test mode off" className="rounded-md p-1 text-mist hover:text-snow" onClick={toggleTestMode}>
          <X className="size-4" />
        </button>
      </div>
      <p className="text-xs leading-relaxed text-mist">
        Building, upgrades, heaters and research are free. Heaters burn no fuel.
      </p>

      <div className="mt-3 border-t border-line pt-2">
        <div className="flex items-baseline justify-between">
          <span className="hl-display text-base text-snow">{formatClock(sim.minute)}</span>
          <span className="text-xs text-mist">{outdoorTemp(sim.minute)}°C</span>
        </div>
        {!paused && (
          <button
            type="button"
            className="mt-2 flex min-h-9 w-full items-center justify-center gap-2 rounded-lg bg-panel-2 text-xs text-snow"
            onClick={togglePause}
          >
            <Pause className="size-3.5" /> Pause to scrub time
          </button>
        )}
        <fieldset disabled={!paused} className="mt-2 space-y-2 disabled:opacity-40">
          <input
            type="range"
            aria-label="Scrub time"
            min={0}
            max={LAST_MINUTE}
            step={10}
            value={Math.min(sim.minute, LAST_MINUTE)}
            className="w-full accent-[var(--color-ember)]"
            onChange={(e) => scrubTo(Number(e.target.value))}
          />
          <div className="grid grid-cols-4 gap-1">
            {JUMPS.map((j) => (
              <button key={j.label} type="button" className="min-h-8 rounded-md bg-panel-2 text-xs text-snow" onClick={() => jump(day, j.hour)}>
                {j.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-1">
            <button type="button" className="min-h-8 rounded-md bg-panel-2 text-xs text-snow" onClick={() => scrubTo(Math.max(0, sim.minute - DAY_MINUTES))}>
              − Day
            </button>
            <button type="button" className="min-h-8 rounded-md bg-panel-2 text-xs text-snow" onClick={() => scrubTo(Math.min(LAST_MINUTE, sim.minute + DAY_MINUTES))}>
              + Day
            </button>
            <button type="button" className="min-h-8 rounded-md bg-panel-2 text-xs text-snow" onClick={() => jump(5, 12)}>
              The Hush
            </button>
          </div>
        </fieldset>
        <p className="mt-2 text-[0.65rem] leading-snug text-mist">Scrubbing moves the clock and weather only; skipped hours are not simulated.</p>
      </div>
    </section>
  );
}
