/** A row of mutually exclusive choices, used on the title screen and in Settings. */
export function Segmented<T extends string>({
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
          className={`min-h-9 flex-1 rounded-lg px-2 text-sm sm:min-h-10 sm:px-3 ${value === o ? "bg-ember text-ink" : "text-mist"}`}
          onClick={() => onChange(o)}
        >
          {name(o)}
        </button>
      ))}
    </div>
  );
}
