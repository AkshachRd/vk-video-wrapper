import { ChevronLeft } from "lucide-react";

import { useReducedMotion } from "@/lib/player/use-reduced-motion";
import type { SavedWord } from "@/lib/saved-words/types";
import { useWordGraph } from "@/lib/word-graph/use-word-graph";
import { GraphCanvas } from "./graph-canvas";
import { GraphDetailCard } from "./graph-detail-card";
import { GraphFilterRow } from "./graph-filter-row";
import { GraphSearchField } from "./graph-search-field";

type MobileWordGraphScreenProps = {
  words: SavedWord[];
  onBack: () => void;
};

export function MobileWordGraphScreen({ words, onBack }: MobileWordGraphScreenProps) {
  const reduceMotion = useReducedMotion();
  const graph = useWordGraph(words, reduceMotion);
  const isEmpty = words.length === 0;

  return (
    <div className="fixed inset-0 flex flex-col bg-paper px-4 pt-3 pb-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Назад"
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-line-2 text-ink active:bg-ink active:text-paper"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <span className="text-lg font-semibold tracking-[-0.01em] text-ink">Граф слов</span>
        <span className="ml-auto font-mono text-[11px] text-ink-3">
          {graph.counts.words} слов · {graph.counts.tags} тегов
        </span>
      </div>

      {isEmpty ? (
        <div className="mt-3 flex flex-1 items-center justify-center rounded-card border border-line text-center text-sm text-ink-3">
          Сохранённых слов пока нет
        </div>
      ) : (
        <>
          <GraphSearchField className="mt-3" value={graph.search} onChange={graph.setSearch} onEnter={graph.focusFirstMatch} />
          <div className="mt-2.5 -mx-4 overflow-x-auto px-4">
            <GraphFilterRow
              className="min-w-max"
              tagOptions={graph.tagOptions}
              activeTags={graph.filterTags}
              onToggleTag={graph.toggleTagFilter}
              typeFilter={graph.typeFilter}
              onTypeChange={graph.setTypeFilter}
            />
          </div>
          <GraphCanvas
            className="mt-3"
            canvasRef={graph.canvasRef}
            containerRef={graph.containerRef}
            onZoomIn={graph.zoomIn}
            onZoomOut={graph.zoomOut}
            onReset={graph.reset}
            noResultQuery={graph.noResultQuery}
            isTouch
            card={
              graph.card ? (
                <GraphDetailCard card={graph.card} onClose={graph.closeCard} onFocusNode={graph.focusAndSelect} />
              ) : undefined
            }
          />
        </>
      )}
    </div>
  );
}
