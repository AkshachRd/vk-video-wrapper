import type { TagOption } from "@/lib/saved-words/tags";
import { cn } from "@/lib/utils";

type TagFilterBarProps = {
  options: TagOption[];
  selectedKeys: string[];
  onToggle: (key: string) => void;
  onReset: () => void;
};

export function TagFilterBar({ options, selectedKeys, onToggle, onReset }: TagFilterBarProps) {
  if (options.length === 0) return null;

  const selected = new Set(selectedKeys);

  return (
    <div
      role="group"
      aria-label="Фильтр по тегам"
      className="flex flex-wrap items-center gap-1.5 px-[18px] pb-3"
    >
      {options.map((option) => {
        const isOn = selected.has(option.key);
        return (
          <button
            key={option.key}
            type="button"
            aria-pressed={isOn}
            onClick={() => onToggle(option.key)}
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[11px] transition-colors",
              isOn ? "bg-ink text-paper" : "border border-line text-ink-2 hover:border-ink",
            )}
          >
            {option.display}
          </button>
        );
      })}

      {selectedKeys.length > 0 ? (
        <button
          type="button"
          onClick={onReset}
          className="px-1.5 text-[11px] text-ink-3 hover:text-ink"
        >
          Сбросить
        </button>
      ) : null}
    </div>
  );
}
