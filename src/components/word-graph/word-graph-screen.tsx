import { useReducedMotion } from "@/lib/player/use-reduced-motion";
import type { SavedWord } from "@/lib/saved-words/types";
import { useWordGraph } from "@/lib/word-graph/use-word-graph";
import { SnakeBorder } from "@/components/snake-border";
import { GraphCanvas } from "./graph-canvas";
import { GraphDetailCard } from "./graph-detail-card";
import { GraphFilterRow } from "./graph-filter-row";
import { GraphSearchField } from "./graph-search-field";

type WordGraphScreenProps = {
  words: SavedWord[];
  onBack: () => void;
};

export function WordGraphScreen({ words, onBack }: WordGraphScreenProps) {
  const reduceMotion = useReducedMotion();
  const graph = useWordGraph(words, reduceMotion);
  const isEmpty = words.length === 0;

  return (
    <div className="flex min-h-[calc(100vh-120px)] flex-col px-9 pt-[18px] pb-[30px]">
      {/* шапка: счётчики + возврат (заголовок убран по дизайну) */}
      <div className="flex items-center gap-3.5">
        <div className="ml-auto flex items-center gap-3.5">
          <span className="font-mono text-[13px] text-ink-3">
            <span className="text-sm font-semibold text-ink">{graph.counts.words}</span> слов
          </span>
          <span className="font-mono text-[13px] text-ink-3">
            <span className="text-sm font-semibold text-ink">{graph.counts.tags}</span> тегов
          </span>
          <button
            type="button"
            onClick={onBack}
            className="group/snake relative flex items-center gap-2 rounded-full border-[1.5px] border-line-2 bg-paper px-4 py-2 text-[13px] font-medium text-ink transition-colors hover:border-ink"
          >
            <span aria-hidden="true" className="inline-block transition-transform duration-[450ms] ease-spring group-hover/snake:-translate-x-1">
              ←
            </span>
            к плееру
            <SnakeBorder shape="pill" />
          </button>
        </div>
      </div>

      {isEmpty ? (
        <div className="mt-[18px] flex flex-1 items-center justify-center rounded-card border border-line bg-paper text-center text-[13px] leading-[1.7] text-ink-3">
          Сохранённых слов пока нет
        </div>
      ) : (
        <>
          <GraphSearchField
            className="mt-5"
            value={graph.search}
            onChange={graph.setSearch}
            onEnter={graph.focusFirstMatch}
          />
          <GraphFilterRow
            className="mt-3.5"
            tagOptions={graph.tagOptions}
            activeTags={graph.filterTags}
            onToggleTag={graph.toggleTagFilter}
            typeFilter={graph.typeFilter}
            onTypeChange={graph.setTypeFilter}
          />
          <GraphCanvas
            className="mt-[18px]"
            canvasRef={graph.canvasRef}
            containerRef={graph.containerRef}
            onZoomIn={graph.zoomIn}
            onZoomOut={graph.zoomOut}
            onReset={graph.reset}
            noResultQuery={graph.noResultQuery}
            isTouch={false}
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
