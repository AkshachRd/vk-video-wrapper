import { X } from "lucide-react";

import type { CardData } from "@/lib/word-graph/types";
import { cn } from "@/lib/utils";

type GraphDetailCardProps = {
  card: CardData;
  onClose: () => void;
  onFocusNode: (id: string) => void;
  className?: string;
};

export function GraphDetailCard({ card, onClose, onFocusNode, className }: GraphDetailCardProps) {
  return (
    <div
      className={cn(
        "w-[274px] rounded-card border border-line bg-paper p-4 shadow-[0_12px_40px_rgba(12,12,12,0.12)] motion-safe:animate-popin",
        className,
      )}
    >
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute top-3 right-3 flex h-6 w-6 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-ink hover:text-paper"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      <div className="flex items-center gap-2 pr-7">
        <span className="text-[23px] leading-none font-semibold tracking-[-0.01em] text-ink">{card.node.label}</span>
        {card.kind === "word" && card.node.lang ? (
          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">{card.node.lang}</span>
        ) : null}
        <span
          className={cn(
            "ml-auto rounded-full px-2 py-0.5 font-mono text-[9.5px] tracking-[0.08em] uppercase",
            card.kind === "word" ? "bg-paper-2 text-ink-2" : "bg-ink text-paper",
          )}
        >
          {card.kind === "word" ? "слово" : "тег"}
        </span>
      </div>

      {card.kind === "word" ? (
        <>
          <div className="mt-2.5 text-sm leading-[1.5] text-ink-2">{card.node.meaning || "без значения"}</div>
          <div className="mt-3.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Теги · {card.tags.length}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {card.tags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => onFocusNode(tag.id)}
                className="rounded-full border-[1.5px] border-line-2 px-2.5 py-1 text-[12.5px] text-ink transition-colors hover:border-ink"
              >
                {tag.label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="mt-3.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Слова · {card.words.length}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {card.words.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => onFocusNode(w.id)}
                className="flex items-center gap-1 rounded-full bg-ink px-2.5 py-1 text-[12.5px] text-paper transition-opacity hover:opacity-85"
              >
                {w.label}
                <span className="font-mono text-[9px] text-paper/70">{w.lang}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
