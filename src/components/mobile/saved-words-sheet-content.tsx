import { X } from "lucide-react";

import type { SavedWord } from "@/lib/saved-words/types";
import { cn } from "@/lib/utils";

type SavedWordsSheetContentProps = {
  words: SavedWord[];
  pendingWordIds?: string[];
  freshWordId?: string;
  error?: string;
  isLoading?: boolean;
  isUnavailable?: boolean;
  onRemove: (word: SavedWord) => void;
};

// Содержимое шторки/панели сохранённых слов (mobile.css .m-sw-*).
export function SavedWordsSheetContent({
  words,
  pendingWordIds = [],
  freshWordId,
  error,
  isLoading,
  isUnavailable,
  onRemove,
}: SavedWordsSheetContentProps) {
  const pendingWordIdSet = new Set(pendingWordIds);

  return (
    <div>
      <div className="flex items-center justify-between px-[22px] pt-2 pb-3.5">
        <h3 className="text-[22px] font-semibold tracking-[-0.01em] text-ink">Слова</h3>
        <span className="rounded-full bg-ink px-2.5 py-0.5 font-mono text-[13px] font-semibold text-paper">
          {String(words.length).padStart(2, "0")}
        </span>
      </div>

      {error && !isUnavailable ? <div className="px-[22px] pb-3 text-xs text-ink-2">{error}</div> : null}

      {isUnavailable ? (
        <div className="px-6 py-12 text-center text-sm text-ink-3">Список слов недоступен</div>
      ) : isLoading ? (
        <div className="px-6 py-12 text-center text-sm text-ink-3">Загружаю слова...</div>
      ) : words.length === 0 ? (
        <div className="px-6 py-[50px] text-center text-sm leading-[1.7] text-ink-3">
          Список пуст.
          <br />
          Нажми на слово в субтитрах,
          <br />
          чтобы сохранить его сюда.
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 px-4 pb-2">
          {words.map((word) => (
            <div
              key={word.id}
              data-fresh={word.id === freshWordId ? "true" : undefined}
              className={cn(
                "relative rounded-card bg-paper-2 px-[18px] py-4 motion-reduce:animate-none",
                word.id === freshWordId ? "animate-wcardflash" : null,
              )}
            >
              <div className="flex items-baseline gap-2.5">
                <span className="min-w-0 text-lg font-semibold tracking-[-0.01em] break-words text-ink">
                  {word.displayWord}
                </span>
                <span className="shrink-0 pr-7 font-mono text-[10px] tracking-[0.08em] uppercase text-ink-3">
                  {word.language}
                </span>
              </div>
              <div className="mt-1.5 text-sm leading-[1.4] break-words text-ink-2">
                {word.firstMeaning || "без значения"}
              </div>
              <button
                type="button"
                aria-label={`Удалить ${word.displayWord}`}
                disabled={pendingWordIdSet.has(word.id)}
                onClick={() => onRemove(word)}
                className="absolute top-3.5 right-3 flex h-[30px] w-[30px] items-center justify-center rounded-full text-ink-3 [transition:background-color_0.15s,color_0.15s] active:bg-ink active:text-paper disabled:opacity-30"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
