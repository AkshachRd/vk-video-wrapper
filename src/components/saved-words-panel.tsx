import { X } from "lucide-react";

import { TagFilterBar } from "@/components/tag-filter-bar";
import { WordTagEditor } from "@/components/word-tag-editor";
import { collectTagOptions, wordMatchesSelectedTags } from "@/lib/saved-words/tags";
import type { SavedWord } from "@/lib/saved-words/types";
import { cn } from "@/lib/utils";

type SavedWordsPanelProps = {
  words: SavedWord[];
  isLoading?: boolean;
  isUnavailable?: boolean;
  pendingWordIds?: string[];
  freshWordId?: string;
  error?: string;
  onRemove: (word: SavedWord) => void;
  selectedTagKeys?: string[];
  onToggleTagFilter?: (key: string) => void;
  onResetTagFilter?: () => void;
  tagPendingWordIds?: string[];
  onAddTag?: (wordId: string, tag: string) => void;
  onRemoveTag?: (wordId: string, tag: string) => void;
};

export function SavedWordsPanel({
  words,
  isLoading,
  isUnavailable,
  pendingWordIds = [],
  freshWordId,
  error,
  onRemove,
  selectedTagKeys = [],
  onToggleTagFilter,
  onResetTagFilter,
  tagPendingWordIds = [],
  onAddTag,
  onRemoveTag,
}: SavedWordsPanelProps) {
  const pendingWordIdSet = new Set(pendingWordIds);
  const tagPendingWordIdSet = new Set(tagPendingWordIds);

  const tagsEnabled = !isUnavailable && Boolean(onAddTag && onRemoveTag);
  const tagOptions = tagsEnabled ? collectTagOptions(words) : [];
  const suggestions = tagOptions.map((option) => option.display);

  const visibleWords = tagsEnabled
    ? words.filter((word) => wordMatchesSelectedTags(word, selectedTagKeys))
    : words;
  const isFiltered = tagsEnabled && selectedTagKeys.length > 0;

  return (
    <aside
      aria-label="Сохраненные слова"
      role="region"
      className="overflow-hidden rounded-card border border-line bg-paper"
    >
      <div className="flex items-center justify-between gap-3 px-[18px] pt-[18px] pb-3.5">
        <h2 className="text-base font-semibold tracking-[-0.01em] text-ink">Слова</h2>
        <div className="flex items-center gap-1.5">
          {isFiltered ? (
            <span className="font-mono text-[10px] text-ink-3">из {String(words.length).padStart(2, "0")}</span>
          ) : null}
          <span className="min-w-6 rounded-full bg-ink px-[9px] py-0.5 text-center font-mono text-xs font-medium text-paper">
            {String(visibleWords.length).padStart(2, "0")}
          </span>
        </div>
      </div>

      {tagsEnabled && tagOptions.length > 0 ? (
        <TagFilterBar
          options={tagOptions}
          selectedKeys={selectedTagKeys}
          onToggle={onToggleTagFilter ?? (() => {})}
          onReset={onResetTagFilter ?? (() => {})}
        />
      ) : null}

      {error && !isUnavailable ? <div className="px-[18px] pb-3 text-xs text-ink-2">{error}</div> : null}
      {isUnavailable ? <div className="px-[18px] pb-[18px] text-sm text-ink-3">Список слов недоступен</div> : null}
      {!isUnavailable && isLoading ? (
        <div className="px-[18px] pb-[18px] text-sm text-ink-3">Загружаю слова...</div>
      ) : null}
      {!isUnavailable && !isLoading && words.length === 0 ? (
        <div className="px-[18px] pt-5 pb-10 text-center text-[13px] leading-[1.7] text-ink-3">
          Сохраненных слов пока нет
        </div>
      ) : null}
      {!isUnavailable && !isLoading && words.length > 0 && visibleWords.length === 0 ? (
        <div className="px-[18px] pt-5 pb-10 text-center text-[13px] leading-[1.7] text-ink-3">
          Нет слов с выбранными тегами
        </div>
      ) : null}

      {!isUnavailable && visibleWords.length > 0 ? (
        <div className="flex flex-col gap-2 px-3 pt-1 pb-3">
          {visibleWords.map((word) => (
            <div
              key={word.id}
              data-fresh={word.id === freshWordId ? "true" : undefined}
              className={cn(
                "group/wcard relative rounded-card-sm bg-paper-2 px-3.5 py-3 motion-reduce:animate-none",
                word.id === freshWordId ? "animate-wcardflash" : "animate-wcardin",
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 text-[15px] font-semibold tracking-[-0.01em] break-words text-ink">
                  {word.displayWord}
                </span>
                <span className="shrink-0 pr-5 font-mono text-[9.5px] tracking-[0.08em] uppercase text-ink-3">
                  {word.language}
                </span>
              </div>
              <div className="mt-[5px] text-[13px] leading-[1.4] break-words text-ink-2">
                {word.firstMeaning || "без значения"}
              </div>
              {tagsEnabled && onAddTag && onRemoveTag ? (
                <WordTagEditor
                  wordId={word.id}
                  tags={word.tags}
                  suggestions={suggestions}
                  disabled={tagPendingWordIdSet.has(word.id)}
                  onAddTag={onAddTag}
                  onRemoveTag={onRemoveTag}
                />
              ) : null}
              <button
                type="button"
                aria-label={`Удалить ${word.displayWord}`}
                disabled={pendingWordIdSet.has(word.id)}
                onClick={() => onRemove(word)}
                className="absolute top-2.5 right-[9px] flex h-[22px] w-[22px] items-center justify-center rounded-full text-ink-3 opacity-0 [transition:opacity_0.2s,background-color_0.15s,color_0.15s] group-hover/wcard:opacity-100 hover:bg-ink hover:text-paper focus-visible:opacity-100 disabled:opacity-30"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </aside>
  );
}
