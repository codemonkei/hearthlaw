import { FlaskConical, GripVertical, X } from "lucide-react";
import { KILN_FEATURES, useKilnLab } from "@/game/scene/kilnLab";
import { useGame } from "@/game/store";
import { useDraggable } from "@/game/ui/useDraggable";

/**
 * Test-mode panel for choosing the Kiln's look: switch candidate features on and off,
 * and preview pressure, surge and strain without touching the game. Only shown in test mode;
 * drag it by its title bar.
 */
export function KilnLab() {
  const { features, preview, open, toggle, setPreview, setOpen } = useKilnLab();
  useGame((s) => s.rev);
  const testMode = Boolean(useGame.getState().sim?.testMode);
  const { ref, style, handleProps } = useDraggable<HTMLElement>("kilnlab");
  if (!testMode) return null;
  if (!open) {
    return (
      <div
        ref={ref as React.RefObject<HTMLDivElement>}
        className="pointer-events-auto absolute top-[210px] left-2 z-20 flex min-h-10 items-center rounded-xl border border-line bg-panel text-sm text-snow"
        style={style}
      >
        <span {...handleProps} className="flex h-10 items-center pl-2 text-mist" aria-hidden>
          <GripVertical className="size-4" />
        </span>
        <button type="button" aria-label="Open Kiln Lab" className="flex min-h-10 items-center gap-2 pr-3 pl-1" onClick={() => setOpen(true)}>
          <FlaskConical className="size-4 text-ember" /> Kiln Lab
        </button>
      </div>
    );
  }
  return (
    <section ref={ref} className="pointer-events-auto absolute top-[210px] left-2 z-20 w-56 hl-panel p-3 text-sm" style={style}>
      <div {...handleProps} className="-mx-1 mb-2 flex items-center justify-between rounded-md px-1 select-none">
        <p className="hl-kicker flex items-center gap-1">
          <GripVertical className="size-3.5 text-mist" /> Kiln Lab
        </p>
        <button type="button" aria-label="Close Kiln Lab" className="rounded-md p-1 text-mist hover:text-snow" onClick={() => setOpen(false)}>
          <X className="size-4" />
        </button>
      </div>
      <div className="space-y-1.5">
        {KILN_FEATURES.map((f) => (
          <label key={f.id} className="flex cursor-pointer items-start gap-2">
            <input type="checkbox" className="mt-1 accent-[var(--color-ember)]" checked={features[f.id]} onChange={() => toggle(f.id)} />
            <span>
              <span className="block leading-tight text-snow">{f.label}</span>
              <span className="block text-xs leading-tight text-mist">{f.hint}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="mt-3 border-t border-line pt-2">
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" className="accent-[var(--color-ember)]" checked={preview.on} onChange={() => setPreview({ on: !preview.on })} />
          <span className="text-snow">Preview state</span>
        </label>
        <p className="mt-0.5 text-xs text-mist">Changes the Kiln's look only, not your game.</p>
        <fieldset disabled={!preview.on} className="mt-2 space-y-2 disabled:opacity-40">
          <div>
            <div className="mb-1 text-xs text-mist">Pressure</div>
            <div className="grid grid-cols-5 gap-1">
              {[0, 1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`min-h-8 rounded-md text-xs ${preview.pressure === n ? "bg-ember text-ink" : "bg-panel-2 text-snow"}`}
                  onClick={() => setPreview({ pressure: n })}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <input type="checkbox" className="accent-[var(--color-ember)]" checked={preview.surge} onChange={() => setPreview({ surge: !preview.surge })} />
            Surge
          </label>
          <div>
            <div className="mb-1 flex justify-between text-xs text-mist">
              <span>Strain</span>
              <span>{Math.round(preview.strain / 10)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1000}
              step={10}
              value={preview.strain}
              className="w-full accent-[var(--color-ember)]"
              onChange={(e) => setPreview({ strain: Number(e.target.value) })}
            />
          </div>
        </fieldset>
      </div>
    </section>
  );
}
