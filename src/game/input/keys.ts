const down = new Set<string>();

export function keyDown(code: string): boolean {
  return down.has(code);
}

export function clearKeys(): void {
  down.clear();
}

export function bindKeyState(): () => void {
  const onDown = (e: KeyboardEvent) => {
    down.add(e.code);
  };
  const onUp = (e: KeyboardEvent) => {
    down.delete(e.code);
  };
  const onBlur = () => down.clear();
  window.addEventListener("keydown", onDown);
  window.addEventListener("keyup", onUp);
  window.addEventListener("blur", onBlur);
  document.addEventListener("visibilitychange", onBlur);
  return () => {
    window.removeEventListener("keydown", onDown);
    window.removeEventListener("keyup", onUp);
    window.removeEventListener("blur", onBlur);
    document.removeEventListener("visibilitychange", onBlur);
    down.clear();
  };
}
