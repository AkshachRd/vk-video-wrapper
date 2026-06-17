import { Search, X } from "lucide-react";

type GraphSearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  onEnter?: () => void;
  className?: string;
};

export function GraphSearchField({ value, onChange, onClear, onEnter, className }: GraphSearchFieldProps) {
  return (
    <div
      className={
        "flex h-[54px] items-center gap-3 rounded-full border-[1.5px] border-line-2 bg-paper px-5 [transition:border-color_0.2s_var(--ease-soft),box-shadow_0.2s_var(--ease-soft)] focus-within:border-ink focus-within:shadow-[0_0_0_4px_rgba(12,12,12,0.05)] " +
        (className ?? "")
      }
    >
      <Search className="h-5 w-5 shrink-0 text-ink-2" aria-hidden="true" />
      <input
        aria-label="Поиск по словам и тегам"
        placeholder="искать слово или тег…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            onChange("");
            onClear?.();
          }
          if (e.key === "Enter") onEnter?.();
        }}
        className="min-w-0 flex-1 border-0 bg-transparent text-base text-ink outline-none placeholder:text-ink-3"
      />
      <span className="hidden shrink-0 font-mono text-[10px] tracking-[0.1em] text-ink-3 uppercase sm:inline">
        слова + теги
      </span>
      {value.length > 0 ? (
        <button
          type="button"
          aria-label="Очистить"
          onClick={() => {
            onChange("");
            onClear?.();
          }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-paper-2 text-ink-2 transition-colors hover:bg-ink hover:text-paper"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
