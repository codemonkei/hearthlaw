import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  BookOpen,
  Eye,
  FastForward,
  Flame,
  Hammer,
  Leaf,
  Pause,
  Play,
  RotateCcw,
  ScrollText,
  Snowflake,
  Sparkles,
  TreePine,
  Users,
  Utensils,
  Volume2,
  Wrench,
  VolumeX,
  X,
} from "lucide-react";
import {
  BUILDINGS,
  CIRCLE_BLURB,
  CIRCLE_IDS,
  CIRCLE_NAME,
  CLAUSE_ORDER,
  CLAUSES,
  DOCK_ORDER,
  RESEARCH,
  RESEARCH_ORDER,
  dayBaseTemp,
  dayIndex,
  formatClock,
  outdoorTemp,
  warmthLabel,
} from "@/game/sim/content";
import {
  assessPlacement,
  buildingWarmth,
  placementHint,
  clauseGate,
  endingLine,
  evaluate,
  eventView,
  forecastVote,
  hasClause,
  kilnBurn,
  livingCount,
  maxRadius,
  streetWarmth,
  weakestAxis,
} from "@/game/sim/engine";
import type { BuildingKind, CircleId, ClauseId, DealKind } from "@/game/sim/types";
import { useGame } from "@/game/store";
import { TestModePanel } from "@/game/ui/TestMode";

export function PlayChrome() {
  const rev = useGame((s) => s.rev);
  const notice = useGame((s) => s.notice);
  const sim = useGame.getState().sim;
  void rev;
  if (!sim) return null;
  const over = Boolean(sim.outcome && !sim.pendingEvent);
  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 flex flex-col"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <KilnCard />
        <div className="relative min-w-0 flex-1">
          {notice && <Notice text={notice} />}
          <SideButtons />
          {useGame.getState().panel === "charter" && <CharterBook />}
          {useGame.getState().panel === "survey" && <SurveyBook />}
          {useGame.getState().panel === "chronicle" && <ChronicleBook />}
          {useGame.getState().panel === "help" && <HelpBook />}
          <InspectCard />
        </div>
      </div>
      <Dock />
      <BottomBar />
      <TestModePanel />
      {sim.pendingEvent && <EventCard />}
      {over && <EndCard />}
    </div>
  );
}

function TopBar() {
  const sim = useGame.getState().sim!;
  const temp = outdoorTemp(sim.minute);
  const hush = dayIndex(sim.minute) === 5 || dayIndex(sim.minute) === 6;
  const items: { icon: ReactNode; label: string; value: number }[] = [
    { icon: <Flame className="size-4 text-ember" />, label: "Fuel", value: sim.resources.fuel },
    { icon: <TreePine className="size-4 text-mist" />, label: "Timber", value: sim.resources.timber },
    { icon: <Hammer className="size-4 text-mist" />, label: "Iron", value: sim.resources.iron },
    { icon: <Leaf className="size-4 text-mist" />, label: "Raw", value: sim.resources.raw },
    { icon: <Utensils className="size-4 text-ember" />, label: "Meals", value: sim.resources.meals },
  ];
  return (
    <header data-topbar className="pointer-events-none flex flex-wrap items-stretch justify-center gap-2 px-2 pt-2 sm:px-3 lg:absolute lg:inset-x-0 lg:top-0 lg:z-10 lg:px-64 [&>*]:pointer-events-auto">
      <div className="hl-panel flex items-center gap-3 px-3 py-2">
        <div>
          <div className="hl-display text-lg leading-none">Hearthlaw</div>
          <div className="text-xs text-mist">{formatClock(sim.minute)}</div>
        </div>
        <div className={`text-right ${temp <= -50 ? "text-mist" : "text-snow"}`}>
          <div className="hl-display text-2xl leading-none">{temp}°</div>
          <div className="text-xs text-ember">{hush ? "The Hush" : "Cirque"}</div>
        </div>
      </div>
      <div className="hl-panel flex min-w-0 max-w-full items-center gap-2 overflow-x-auto px-3 py-2 max-md:order-first">
        {items.map((item) => (
          <div key={item.label} className="flex min-w-14 flex-col items-center px-1">
            {item.icon}
            <span className="hl-display text-base leading-tight">{item.value}</span>
            <span className="text-[0.65rem] tracking-wide text-mist uppercase">{item.label}</span>
          </div>
        ))}
      </div>
      <Forecast />
    </header>
  );
}

function Forecast() {
  const sim = useGame.getState().sim!;
  const today = dayIndex(sim.minute);
  return (
    <div className="hl-panel hidden items-center gap-1 px-3 py-2 md:flex">
      {Array.from({ length: 8 }).map((_, i) => {
        const t = dayBaseTemp(i);
        const active = i === today;
        const hush = i === 5 || i === 6;
        return (
          <div key={i} className="flex w-8 flex-col items-center">
            <span className={`text-[0.65rem] ${hush ? "text-mist" : "text-snow"}`}>{t}°</span>
            <span
              className={`mt-1 h-6 w-1.5 rounded-full ${active ? "bg-ember" : hush ? "bg-line" : "bg-panel-2"}`}
              style={{ height: `${18 + Math.min(28, Math.abs(t) / 3)}px` }}
            />
            <span className="mt-1 text-[0.65rem] text-mist">{i + 1}</span>
          </div>
        );
      })}
    </div>
  );
}

function KilnCard() {
  const sim = useGame.getState().sim!;
  const doPressure = useGame((s) => s.doPressure);
  const doRadius = useGame((s) => s.doRadius);
  const doSurge = useGame((s) => s.doSurge);
  const burn = kilnBurn(sim.kiln.pressure, sim.kiln.radius);
  const cap = maxRadius(sim);
  return (
    <section className="pointer-events-auto m-2 hidden w-56 flex-col gap-3 self-start hl-panel p-3 lg:flex">
      <div>
        <p className="hl-kicker">The Kiln</p>
        <p className="mt-1 text-xs leading-relaxed text-mist">
          {sim.kiln.running && sim.kiln.pressure > 0
            ? `Drawing ${burn} fuel an hour.`
            : "Dark. The ring is only wind."}
        </p>
      </div>
      <div>
        <div className="mb-1 text-xs text-mist">Pressure</div>
        <div className="grid grid-cols-5 gap-1">
          {([0, 1, 2, 3, 4] as const).map((n) => (
            <button
              key={n}
              type="button"
              className={`min-h-11 rounded-lg text-sm ${sim.kiln.pressure === n ? "bg-ember text-ink" : "bg-panel-2 text-snow"}`}
              onClick={() => doPressure(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-1 text-xs text-mist">Radius</div>
        <div className="grid grid-cols-4 gap-1">
          {([1, 2, 3, 4] as const).map((n) => (
            <button
              key={n}
              type="button"
              disabled={n > cap}
              className={`min-h-11 rounded-lg text-sm disabled:opacity-30 ${sim.kiln.radius === n ? "bg-copper text-snow" : "bg-panel-2 text-snow"}`}
              onClick={() => doRadius(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <button
        type="button"
        className={`min-h-11 rounded-lg text-sm ${sim.kiln.surge ? "bg-blood text-snow" : "bg-panel-2 text-snow"}`}
        onClick={() => doSurge()}
      >
        {sim.kiln.surge ? "Surge open" : "Open surge"}
      </button>
      <div>
        <div className="mb-1 flex justify-between text-xs text-mist">
          <span>Strain</span>
          <span>{Math.round(sim.kiln.strain / 10)}%</span>
        </div>
        <div className="bar-track">
          <div className="bar-fill bg-blood" style={{ width: `${sim.kiln.strain / 10}%` }} />
        </div>
        {sim.kiln.crisisCount > 0 && (
          <p className="mt-2 text-xs text-ember">A second breaking will split the Kiln.</p>
        )}
      </div>
    </section>
  );
}

function SideButtons() {
  const setPanel = useGame((s) => s.setPanel);
  const toggleHeat = useGame((s) => s.toggleHeat);
  const toggleMute = useGame((s) => s.toggleMute);
  const heat = useGame((s) => s.heat);
  const fx = useGame((s) => s.fx);
  const toggleFx = useGame((s) => s.toggleFx);
  const reset = useGame((s) => s.reset);
  const toggleTestMode = useGame((s) => s.toggleTestMode);
  const [confirmReset, setConfirmReset] = useState(false);
  const sim = useGame.getState().sim!;
  const Btn = ({
    label,
    onClick,
    children,
    active,
  }: {
    label: string;
    onClick: () => void;
    children: ReactNode;
    active?: boolean;
  }) => (
    <button
      type="button"
      aria-label={label}
      className={`flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-line ${active ? "bg-ember text-ink" : "bg-panel text-snow"}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
  return (
    <div className="pointer-events-auto absolute top-2 right-2 flex flex-col gap-2">
      <Btn label="Charter" onClick={() => setPanel("charter")}>
        <ScrollText className="size-5" />
      </Btn>
      <Btn label="Survey" onClick={() => setPanel("survey")}>
        <BookOpen className="size-5" />
      </Btn>
      <Btn label="Chronicle" onClick={() => setPanel("chronicle")}>
        <Users className="size-5" />
      </Btn>
      <Btn label="Heat overlay" onClick={toggleHeat} active={heat}>
        <Eye className="size-5" />
      </Btn>
      <Btn label={fx === "high" ? "Graphics: high (G)" : "Graphics: low (G)"} onClick={toggleFx} active={fx === "high"}>
        <Sparkles className="size-5" />
      </Btn>
      <Btn label="How the cold works" onClick={() => setPanel("help")}>
        <Snowflake className="size-5" />
      </Btn>
      <Btn label={sim.muted ? "Unmute" : "Mute"} onClick={toggleMute}>
        {sim.muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
      </Btn>
      <Btn label={sim.testMode ? "Test mode: on" : "Test mode"} onClick={toggleTestMode} active={Boolean(sim.testMode)}>
        <Wrench className="size-5" />
      </Btn>
      <div className="relative mt-2">
        <Btn label="Reset the game" onClick={() => setConfirmReset((v) => !v)} active={confirmReset}>
          <RotateCcw className="size-5" />
        </Btn>
        {confirmReset && (
          <div className="absolute top-0 right-full mr-2 w-60 hl-panel p-3 text-left">
            <p className="hl-display text-base leading-tight">Abandon this city?</p>
            <p className="mt-1 text-xs leading-relaxed text-mist">The save is deleted and you return to the title. This cannot be undone.</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="min-h-10 flex-1 rounded-lg bg-blood px-3 text-sm text-snow"
                onClick={() => {
                  setConfirmReset(false);
                  reset();
                }}
              >
                Reset
              </button>
              <button type="button" className="min-h-10 flex-1 rounded-lg bg-panel-2 px-3 text-sm" onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Dock() {
  const sim = useGame.getState().sim!;
  const buildKind = useGame((s) => s.buildKind);
  const chooseBuild = useGame((s) => s.chooseBuild);
  const pending = useGame((s) => s.pendingTile);
  const confirmTile = useGame((s) => s.confirmTile);
  const setPendingTile = useGame((s) => s.setPendingTile);
  const panel = useGame((s) => s.panel);
  if (panel) return null;
  return (
    <div className="pointer-events-auto px-2">
      {pending && buildKind && (() => {
        const fit = assessPlacement(sim, buildKind, pending.q, pending.r);
        const blocked = fit.fit === "blocked";
        return (
        <div className="mb-2 flex items-center justify-between gap-2 hl-panel px-3 py-2">
          <span className="text-sm">
            Place {BUILDINGS[buildKind].name} here?
            <span className={`block text-xs ${blocked ? "text-blood" : fit.fit === "best" ? "text-ember" : "text-mist"}`}>
              {fit.note}
            </span>
          </span>
          <span className="flex gap-2">
            <button
              type="button"
              disabled={blocked}
              className="min-h-11 rounded-lg bg-ember px-3 text-ink disabled:opacity-40"
              onClick={confirmTile}
            >
              Place
            </button>
            <button type="button" className="min-h-11 rounded-lg bg-panel-2 px-3" onClick={() => setPendingTile(null)}>
              Cancel
            </button>
          </span>
        </div>
        );
      })()}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {DOCK_ORDER.map((kind) => (
          <DockButton key={kind} kind={kind} active={buildKind === kind} timber={sim.resources.timber} iron={sim.resources.iron} onClick={() => chooseBuild(kind)} />
        ))}
      </div>
      <div className="mb-1 flex gap-1 overflow-x-auto lg:hidden">
        <MobileKiln />
      </div>
    </div>
  );
}

function DockButton({
  kind,
  active,
  timber,
  iron,
  onClick,
}: {
  kind: BuildingKind;
  active: boolean;
  timber: number;
  iron: number;
  onClick: () => void;
}) {
  const def = BUILDINGS[kind];
  const hint = placementHint(useGame.getState().sim!, kind);
  const free = Boolean(useGame.getState().sim?.testMode);
  const afford = free || (timber >= def.cost.timber && iron >= def.cost.iron);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-16 min-w-28 shrink-0 rounded-xl border px-3 py-2 text-left ${active ? "border-ember bg-panel-2" : "border-line bg-panel"} ${afford ? "" : "opacity-60"}`}
    >
      <div className="hl-display text-sm leading-tight">{def.name}</div>
      <div className="mt-1 text-xs text-mist">
        {free ? "free (test mode)" : `${def.cost.timber} timber${def.cost.iron ? ` · ${def.cost.iron} iron` : ""}`}
      </div>
      <div className={`mt-0.5 text-[0.65rem] leading-tight ${active ? "text-ember" : "text-mist/80"}`}>{hint}</div>
    </button>
  );
}

function MobileKiln() {
  const sim = useGame.getState().sim!;
  const doPressure = useGame((s) => s.doPressure);
  const doRadius = useGame((s) => s.doRadius);
  const doSurge = useGame((s) => s.doSurge);
  const cap = maxRadius(sim);
  return (
    <div className="flex items-center gap-1 hl-panel p-1">
      {([1, 2, 3, 4] as const).map((n) => (
        <button
          key={n}
          type="button"
          disabled={n > cap}
          className={`min-h-11 min-w-10 rounded-lg text-sm disabled:opacity-30 ${sim.kiln.radius === n ? "bg-copper text-snow" : "text-snow"}`}
          onClick={() => doRadius(n)}
        >
          R{n}
        </button>
      ))}
      {([0, 1, 2, 3, 4] as const).map((n) => (
        <button
          key={`p${n}`}
          type="button"
          className={`min-h-11 min-w-10 rounded-lg text-sm ${sim.kiln.pressure === n ? "bg-ember text-ink" : "text-snow"}`}
          onClick={() => doPressure(n)}
        >
          {n}
        </button>
      ))}
      <button
        type="button"
        className={`min-h-11 rounded-lg px-3 text-sm ${sim.kiln.surge ? "bg-blood" : "bg-panel-2"}`}
        onClick={() => doSurge()}
      >
        Surge
      </button>
    </div>
  );
}

function BottomBar() {
  const sim = useGame.getState().sim!;
  const setSpeed = useGame((s) => s.setSpeed);
  const pop = livingCount(sim);
  const ill = sim.pop.ill.labourers + sim.pop.ill.specialists + sim.pop.ill.dependents;
  const grav = sim.pop.gravely.labourers + sim.pop.gravely.specialists + sim.pop.gravely.dependents;
  const reck = sim.morale.reckoningUntil;
  return (
    <footer className="pointer-events-auto mx-2 mb-2 hl-panel px-3 py-2">
      <div className="flex flex-wrap items-center gap-3">
        <Meter label="Resolve" value={sim.morale.resolve / 10} tone="bg-ember" />
        <Meter label="Grievance" value={sim.morale.grievance / 10} tone="bg-blood" />
        <div className="text-xs text-mist">
          <div>{pop} living</div>
          <div>
            {ill} ill · {grav} gravely · {sim.pop.dead} dead
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <TimeButton label="Pause" active={sim.speed === 0} onClick={() => setSpeed(0)}>
            <Pause className="size-4" />
          </TimeButton>
          <TimeButton label="1×" active={sim.speed === 1} onClick={() => setSpeed(1)}>
            <Play className="size-4" />
          </TimeButton>
          <TimeButton label="2×" active={sim.speed === 2} onClick={() => setSpeed(2)}>
            <span className="text-xs">2×</span>
          </TimeButton>
          <TimeButton label="4×" active={sim.speed === 4} onClick={() => setSpeed(4)}>
            <FastForward className="size-4" />
          </TimeButton>
        </div>
      </div>
      {reck != null && (
        <p className="mt-2 text-xs text-ember">
          Ultimatum. Lift resolve above 20 and grievance under 75 before the clock runs out.
        </p>
      )}
      <div className="mt-2 hidden gap-3 text-xs text-mist sm:flex">
        {CIRCLE_IDS.map((id) => (
          <span key={id}>
            {CIRCLE_NAME[id]} {sim.circles[id].trust}
          </span>
        ))}
        <span className="ml-auto">Hold until dawn of day 8</span>
      </div>
    </footer>
  );
}

function Meter({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="min-w-32 flex-1">
      <div className="mb-1 flex justify-between text-xs">
        <span>{label}</span>
        <span>{Math.round(value)}</span>
      </div>
      <div className="bar-track">
        <div className={`bar-fill ${tone}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

function TimeButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`flex min-h-11 min-w-11 items-center justify-center rounded-lg ${active ? "bg-ember text-ink" : "bg-panel-2 text-snow"}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/**
 * On large screens the top bar floats over the play area. An overlay that would sit
 * under its cards drops just below them; one with clear space beside them stays at the top.
 * Returns the `top` in px to apply, or undefined to keep the element's own.
 */
function useClearOfTopBar(ref: RefObject<HTMLElement | null>): number | undefined {
  const [top, setTop] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const el = ref.current;
    const bar = document.querySelector<HTMLElement>("[data-topbar]");
    if (!el || !bar) return;
    const check = () => {
      // Below lg the bar takes its own row, so overlays already start beneath it.
      if (!window.matchMedia("(min-width: 1024px)").matches) return setTop(undefined);
      const box = el.getBoundingClientRect();
      const cards = [...bar.children].map((c) => c.getBoundingClientRect()).filter((c) => c.width > 0);
      const gap = 8;
      const hits = cards.filter((c) => c.right + gap > box.left && c.left - gap < box.right);
      if (hits.length === 0) return setTop(undefined);
      const parentTop = (el.offsetParent as HTMLElement | null)?.getBoundingClientRect().top ?? 0;
      setTop(Math.max(...hits.map((c) => c.bottom)) + gap - parentTop);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(bar);
    ro.observe(document.body);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return top;
}

function Notice({ text }: { text: string }) {
  const dismiss = useGame((s) => s.dismissNotice);
  const ref = useRef<HTMLButtonElement>(null);
  const top = useClearOfTopBar(ref);
  return (
    <button
      ref={ref}
      type="button"
      className="pointer-events-auto absolute top-2 left-1/2 z-20 max-w-sm -translate-x-1/2 hl-panel px-3 py-2 text-left text-sm"
      style={{ top }}
      onClick={dismiss}
    >
      {text}
    </button>
  );
}

function Sheet({
  title,
  kicker,
  wide = false,
  children,
}: {
  title: string;
  kicker: string;
  /** Two-column books need room for their detail column. */
  wide?: boolean;
  children: ReactNode;
}) {
  const setPanel = useGame((s) => s.setPanel);
  const ref = useRef<HTMLElement>(null);
  const top = useClearOfTopBar(ref);
  return (
    <section
      ref={ref}
      className={`pointer-events-auto absolute inset-x-2 top-2 bottom-24 z-20 overflow-y-auto hl-panel p-4 md:inset-y-2 md:right-16 md:left-auto ${wide ? "md:w-[44rem] md:max-w-[calc(100%-4.5rem)]" : "md:w-96"}`}
      style={{ top }}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="hl-kicker">{kicker}</p>
          <h2 className="hl-display text-2xl">{title}</h2>
        </div>
        <button type="button" aria-label="Close" className="min-h-11 min-w-11 rounded-lg bg-panel-2" onClick={() => setPanel(null)}>
          <X className="mx-auto size-4" />
        </button>
      </div>
      {children}
    </section>
  );
}

function CharterBook() {
  const sim = useGame.getState().sim!;
  const clauseId = useGame((s) => s.clauseId) ?? "thin-broth";
  const focus = useGame((s) => s.focusClause);
  const deals = useGame((s) => s.deals);
  const setDeal = useGame((s) => s.setDeal);
  const doVote = useGame((s) => s.doVote);
  const doDecree = useGame((s) => s.doDecree);
  const doRepeal = useGame((s) => s.doRepeal);
  const def = CLAUSES[clauseId];
  const tally = forecastVote(sim, clauseId, deals);
  const gate = clauseGate(sim, clauseId);
  const signed = hasClause(sim, clauseId);
  return (
    <Sheet title="The Charter" kicker="Book I · Survival" wide>
      <div className="grid gap-4 md:grid-cols-[11rem_1fr]">
        <div className="flex gap-1 overflow-x-auto md:flex-col">
          {CLAUSE_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              className={`min-h-11 shrink-0 rounded-lg px-2 text-left text-sm ${id === clauseId ? "bg-ember text-ink" : "bg-panel-2 text-snow"}`}
              onClick={() => focus(id)}
            >
              {CLAUSES[id].name}
              {hasClause(sim, id) ? " · in" : ""}
            </button>
          ))}
        </div>
        <div>
          <h3 className="hl-display text-2xl leading-tight">{def.name}</h3>
          <p className="mt-1 text-sm leading-relaxed text-mist">{def.summary}</p>
          <p className="mt-2 text-sm leading-relaxed text-snow">{def.effect}</p>
          <p className="mt-2 text-xs text-ember">
            Chronicle · {def.axis} {def.delta > 0 ? `+${def.delta}` : def.delta}
          </p>
          <div className="mt-4 space-y-2">
            {tally.rows.map((row) => (
              <CircleRow key={row.circle} circle={row.circle} votes={row.votes} seats={row.seats} stance={row.stance} deal={deals[row.circle] ?? null} onDeal={(d) => setDeal(row.circle, d)} />
            ))}
          </div>
          <p className="mt-3 text-sm">
            Forecast {tally.yes} of {tally.need} seats. {tally.yes >= tally.need ? "It would pass." : "It would fail."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {signed ? (
              <button type="button" className="min-h-11 rounded-lg bg-panel-2 px-3 text-sm" onClick={() => doRepeal(clauseId)}>
                Repeal
              </button>
            ) : (
              <>
                <button type="button" disabled={Boolean(gate)} className="min-h-11 rounded-lg bg-ember px-3 text-sm text-ink disabled:opacity-40" onClick={doVote}>
                  Call the vote
                </button>
                <button type="button" disabled={Boolean(gate)} className="min-h-11 rounded-lg bg-blood px-3 text-sm disabled:opacity-40" onClick={doDecree}>
                  Decree it
                </button>
              </>
            )}
          </div>
          {gate && !signed && <p className="mt-2 text-xs text-mist">{gate}</p>}
          <p className="mt-3 text-xs leading-relaxed text-mist">
            A tribute or a promise sways one step toward yes. Tributes are spent even if the vote fails.
            A decree always writes the clause, and every circle feels it.
          </p>
        </div>
      </div>
    </Sheet>
  );
}

function CircleRow({
  circle,
  votes,
  seats,
  stance,
  deal,
  onDeal,
}: {
  circle: CircleId;
  votes: number;
  seats: number;
  stance: string;
  deal: DealKind | null;
  onDeal: (d: DealKind | null) => void;
}) {
  return (
    <div className="rounded-lg bg-panel-2 px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="hl-display text-base">{CIRCLE_NAME[circle]}</span>
        <span className="shrink-0 whitespace-nowrap text-xs">
          <span className={stance === "for" ? "text-ember" : stance === "against" ? "text-blood" : "text-mist"}>{stance}</span>
          <span className="text-mist"> · {votes}/{seats} seats</span>
        </span>
      </div>
      <p className="mt-0.5 text-xs leading-relaxed text-mist">{CIRCLE_BLURB[circle]}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <DealChip label="40 fuel" active={deal === "tribute-fuel"} onClick={() => onDeal("tribute-fuel")} />
        <DealChip label="30 meals" active={deal === "tribute-meals"} onClick={() => onDeal("tribute-meals")} />
        <DealChip label="Promise" active={deal === "promise"} onClick={() => onDeal("promise")} />
      </div>
    </div>
  );
}

function DealChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`min-h-9 rounded-md px-2 text-xs ${active ? "bg-ember text-ink" : "bg-ink text-snow"}`} onClick={onClick}>
      {label}
    </button>
  );
}

function SurveyBook() {
  const sim = useGame.getState().sim!;
  const doResearch = useGame((s) => s.doResearch);
  const hall = sim.buildings.some((b) => b.kind === "survey");
  return (
    <Sheet title="Survey Hall" kicker={`${sim.research.points} notes`}>
      {!hall && <p className="mb-3 text-sm text-mist">Raise a Survey Hall and staff it with specialists. Notes gather during the work hours.</p>}
      <div className="space-y-3">
        {RESEARCH_ORDER.map((id) => {
          const def = RESEARCH[id];
          const owned = sim.research.unlocked.includes(id);
          return (
            <div key={id} className="rounded-lg bg-panel-2 p-3">
              <div className="flex items-baseline justify-between">
                <h3 className="hl-display text-lg">{def.name}</h3>
                <span className="text-xs text-mist">{def.points} notes</span>
              </div>
              <p className="mt-1 text-sm text-mist">{def.blurb}</p>
              <button
                type="button"
                disabled={owned}
                className="mt-2 min-h-11 rounded-lg bg-ember px-3 text-sm text-ink disabled:opacity-40"
                onClick={() => doResearch(id)}
              >
                {owned ? "In the books" : "Inscribe the method"}
              </button>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}

function ChronicleBook() {
  const sim = useGame.getState().sim!;
  const axes = ["lives", "liberty", "kinship", "truth"] as const;
  return (
    <Sheet title="Chronicle" kicker={sim.outcome === "endured" ? endingLine(sim) : "What the city will be asked"}>
      <div className="grid grid-cols-2 gap-2">
        {axes.map((id) => (
          <div key={id} className={`rounded-lg p-3 ${weakestAxis(sim) === id ? "bg-panel-2" : "bg-ink"}`}>
            <div className="text-xs tracking-wide text-mist uppercase">{id}</div>
            <div className="hl-display text-3xl">{sim.chronicle[id]}</div>
          </div>
        ))}
      </div>
      <ul className="mt-4 space-y-2">
        {sim.chronicle.marks.length === 0 && <li className="text-sm text-mist">Nothing is written yet.</li>}
        {sim.chronicle.marks.map((m, i) => (
          <li key={i} className="text-sm">
            <span className="text-mist">{formatClock(m.minute)} · </span>
            {m.text}
          </li>
        ))}
      </ul>
      <ul className="mt-4 space-y-1">
        {sim.log.map((line, i) => (
          <li key={i} className="text-xs text-mist">
            {formatClock(line.minute)} — {line.text}
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

function HelpBook() {
  return (
    <Sheet title="How the cold works" kicker="A short charter">
      <div className="space-y-3 text-sm leading-relaxed text-mist">
        <p>Warmth is a whole number. Outdoor band, plus the strongest heat touching the tile, plus walls, plus a heater. Sources do not stack. A relay vent carries the Kiln’s level one tile outward and burns 2 fuel an hour.</p>
        <p>Pressure is how hot. Radius is how far, and it multiplies the Kiln’s thirst. Surge adds a band instantly and strains the vessel. The second time strain breaks the Kiln, the city ends.</p>
        <p>People in canvas are one band warmer than people left in the wind. Huts and longhouses are warmer still. Illness follows the band. An infirmary, staffed by specialists, pulls them back.</p>
        <p>Hands go first to the infirmary, then the survey, then the mess, then the yards. Build only what you can staff. Eat at dawn: one meal each. The Hush is days 6 and 7. Win by reaching dawn of day 8.</p>
        <p>Peat seams show dark cut trenches. Groves have pines. Scrap is a rusty heap. Lichen is green moss. The amber outline is how far the Kiln’s warmth reaches, and the eye button paints every tile by warmth. The sparkle button (G) switches between full and light graphics.</p>
      </div>
    </Sheet>
  );
}

function InspectCard() {
  const sim = useGame.getState().sim!;
  const id = useGame((s) => s.selectedId);
  const panel = useGame((s) => s.panel);
  const select = useGame((s) => s.select);
  const doUpgrade = useGame((s) => s.doUpgrade);
  const doDemolish = useGame((s) => s.doDemolish);
  const doHeater = useGame((s) => s.doHeater);
  if (!id || panel) return null;
  const b = sim.buildings.find((x) => x.id === id);
  if (!b) return null;
  const def = BUILDINGS[b.kind];
  const eco = evaluate(sim);
  const row = eco.rows.find((r) => r.id === b.id);
  const w = buildingWarmth(sim, b);
  const next = b.kind === "tent" ? "hut" : b.kind === "hut" ? "longhouse" : null;
  return (
    <aside className="pointer-events-auto absolute bottom-2 left-2 z-20 w-72 max-w-[calc(100%-1rem)] hl-panel p-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="hl-kicker">{warmthLabel(w)}</p>
          <h3 className="hl-display text-xl">{def.name}</h3>
        </div>
        <button type="button" aria-label="Close inspect" className="min-h-11 min-w-11" onClick={() => select(null)}>
          <X className="size-4" />
        </button>
      </div>
      <p className="mt-1 text-xs text-mist">{def.blurb}</p>
      <p className="mt-2 text-sm">
        Warmth {w}. {row && row.need > 0 ? `${row.assigned}/${row.need} staffed.` : "No crew."}
      </p>
      {eco.unsheltered > 0 && def.housing > 0 && (
        <p className="text-xs text-mist">{eco.unsheltered} still sleep in the wind (band {streetWarmth(sim)}).</p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {next && (
          <button type="button" className="min-h-11 rounded-lg bg-ember px-3 text-sm text-ink" onClick={() => doUpgrade(b.id)}>
            Raise to {BUILDINGS[next].name}
          </button>
        )}
        <button type="button" className="min-h-11 rounded-lg bg-panel-2 px-3 text-sm" onClick={() => doHeater(b.id)}>
          {b.heater ? "Heater on" : "Fit heater"}
        </button>
        <button type="button" className="min-h-11 rounded-lg bg-panel-2 px-3 text-sm" onClick={() => doDemolish(b.id)}>
          Take down
        </button>
      </div>
    </aside>
  );
}

function EventCard() {
  const sim = useGame.getState().sim!;
  const view = eventView(sim);
  const doResolve = useGame((s) => s.doResolve);
  if (!view) return null;
  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex items-end justify-center bg-ink/50 p-3 sm:items-center">
      <article className="w-full max-w-lg hl-panel p-5">
        <p className="hl-kicker">A choice with a name</p>
        <h2 className="hl-display mt-1 text-3xl">{view.title}</h2>
        <p className="mt-3 text-sm leading-relaxed text-mist">{view.body}</p>
        <div className="mt-4 flex flex-col gap-2">
          {view.choices.map((c) => (
            <button
              key={c.id}
              type="button"
              className="min-h-12 rounded-xl border border-line bg-panel-2 px-3 py-2 text-left"
              onClick={() => doResolve(c.id)}
            >
              <div className="text-sm text-snow">{c.label}</div>
              <div className="text-xs text-mist">{c.detail}</div>
            </button>
          ))}
        </div>
      </article>
    </div>
  );
}

function EndCard() {
  const sim = useGame.getState().sim!;
  const start = useGame((s) => s.start);
  const title =
    sim.outcome === "endured"
      ? "The city held"
      : sim.outcome === "exile"
        ? "Exile"
        : sim.outcome === "kiln"
          ? "The Kiln is split"
          : "No one left";
  const axes = ["lives", "liberty", "kinship", "truth"] as const;
  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-ink/80 p-4">
      <article className="w-full max-w-lg hl-panel p-6">
        <p className="hl-kicker">Chronicle</p>
        <h2 className="hl-display text-4xl">{title}</h2>
        <p className="mt-3 text-sm leading-relaxed text-mist">{endingLine(sim)}</p>
        <div className="mt-4 grid grid-cols-4 gap-2">
          {axes.map((id) => (
            <div key={id} className="rounded-lg bg-panel-2 p-2 text-center">
              <div className="text-[0.65rem] tracking-wide text-mist uppercase">{id}</div>
              <div className="hl-display text-2xl">{sim.chronicle[id]}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-mist">
          {sim.stats.deaths} dead · {sim.stats.signed} clauses · seed {sim.seed}
        </p>
        <button
          type="button"
          className="mt-4 min-h-12 w-full rounded-xl bg-ember text-ink"
          onClick={() => start((Math.random() * 0xffffffff) >>> 0)}
        >
          Write another charter
        </button>
      </article>
    </div>
  );
}
