import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

/*
 * Drag an overlay panel by its handle. The position is remembered in this browser per `id`,
 * kept inside the panel's container, and a double-click on the handle returns the panel to
 * its default place (wherever its classes put it).
 */

type Pos = { x: number; y: number };

const key = (id: string) => `hearthlaw.panel.${id}`;

function load(id: string): Pos | null {
  try {
    const raw = window.localStorage.getItem(key(id));
    if (!raw) return null;
    const p = JSON.parse(raw) as Pos;
    return Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null;
  } catch {
    return null;
  }
}

function save(id: string, pos: Pos | null) {
  try {
    if (pos) window.localStorage.setItem(key(id), JSON.stringify(pos));
    else window.localStorage.removeItem(key(id));
  } catch {
    /* storage blocked — the position lasts this session */
  }
}

/** Keep at least the handle on screen: the panel may not leave its container. */
function clamp(pos: Pos, el: HTMLElement): Pos {
  const parent = el.offsetParent as HTMLElement | null;
  const pw = parent?.clientWidth ?? window.innerWidth;
  const ph = parent?.clientHeight ?? window.innerHeight;
  return {
    x: Math.min(Math.max(0, pos.x), Math.max(0, pw - el.offsetWidth)),
    y: Math.min(Math.max(0, pos.y), Math.max(0, ph - 40)),
  };
}

export function useDraggable<T extends HTMLElement>(id: string) {
  const ref = useRef<T>(null);
  const [pos, setPos] = useState<Pos | null>(() => (typeof window === "undefined" ? null : load(id)));
  const drag = useRef<{ dx: number; dy: number; pointer: number } | null>(null);

  // Re-clamp a remembered position if the window got smaller since.
  useEffect(() => {
    const fix = () => {
      if (ref.current && pos) {
        const c = clamp(pos, ref.current);
        if (c.x !== pos.x || c.y !== pos.y) setPos(c);
      }
    };
    fix();
    window.addEventListener("resize", fix);
    return () => window.removeEventListener("resize", fix);
  }, [pos]);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button, input, label")) return;
    const el = ref.current;
    if (!el) return;
    const parent = (el.offsetParent as HTMLElement | null)?.getBoundingClientRect() ?? { left: 0, top: 0 };
    const box = el.getBoundingClientRect();
    drag.current = { dx: e.clientX - (box.left - parent.left), dy: e.clientY - (box.top - parent.top), pointer: e.pointerId };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }, []);

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || !el || d.pointer !== e.pointerId) return;
    setPos(clamp({ x: e.clientX - d.dx, y: e.clientY - d.dy }, el));
  }, []);

  const end = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!drag.current || drag.current.pointer !== e.pointerId) return;
      drag.current = null;
      setPos((p) => {
        save(id, p);
        return p;
      });
    },
    [id],
  );

  const onDoubleClick = useCallback(() => {
    save(id, null);
    setPos(null);
  }, [id]);

  const style: CSSProperties | undefined = pos ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" } : undefined;
  const handleProps = {
    onPointerDown,
    onPointerMove,
    onPointerUp: end,
    onPointerCancel: end,
    onDoubleClick,
    style: { cursor: "move", touchAction: "none" } as CSSProperties,
    title: "Drag to move · double-click to reset",
  };
  return { ref, style, handleProps };
}
