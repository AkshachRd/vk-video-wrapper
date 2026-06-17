import type { TagOptionCount, TypeFilter } from "@/lib/word-graph/types";
import { cn } from "@/lib/utils";

type GraphFilterRowProps = {
  tagOptions: TagOptionCount[];
  activeTags: string[];
  onToggleTag: (key: string) => void;
  typeFilter: TypeFilter;
  onTypeChange: (type: TypeFilter) => void;
  className?: string;
};

const TYPE_SEGMENTS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "всё" },
  { value: "word", label: "слова" },
  { value: "tag", label: "теги" },
];

export function GraphFilterRow({
  tagOptions,
  activeTags,
  onToggleTag,
  typeFilter,
  onTypeChange,
  className,
}: GraphFilterRowProps) {
  const active = new Set(activeTags);
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="shrink-0 font-mono text-[10px] tracking-[0.1em] text-ink-3 uppercase">показать</span>
      <div className="flex min-w-0 flex-1 flex-wrap gap-[7px]">
        {tagOptions.map((option) => {
          const on = active.has(option.key);
          return (
            <button
              key={option.key}
              type="button"
              aria-pressed={on}
              onClick={() => onToggleTag(option.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border-[1.5px] px-3 py-[5px] text-[12.5px] transition-colors",
                on ? "border-ink bg-ink text-paper" : "border-line-2 bg-paper text-ink hover:border-ink",
              )}
            >
              {option.display}
              <span className={cn("font-mono text-[10px]", on ? "text-paper/70" : "text-ink-3")}>
                {option.count}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex shrink-0 gap-0.5 rounded-full border border-line-2 bg-paper p-0.5">
        {TYPE_SEGMENTS.map((segment) => (
          <button
            key={segment.value}
            type="button"
            aria-pressed={typeFilter === segment.value}
            onClick={() => onTypeChange(segment.value)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              typeFilter === segment.value ? "bg-ink text-paper" : "text-ink-2 hover:text-ink",
            )}
          >
            {segment.label}
          </button>
        ))}
      </div>
    </div>
  );
}
