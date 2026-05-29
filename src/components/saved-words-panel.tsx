import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SavedWord } from "@/lib/saved-words/types";

type SavedWordsPanelProps = {
  words: SavedWord[];
  isLoading?: boolean;
  isUnavailable?: boolean;
  onRemove: (word: SavedWord) => void;
};

export function SavedWordsPanel({ words, isLoading, isUnavailable, onRemove }: SavedWordsPanelProps) {
  return (
    <aside
      aria-label="Сохраненные слова"
      role="region"
      className="rounded-md border border-slate-800 bg-slate-950/80 p-3 text-slate-100"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Слова</h2>
        <span className="text-xs text-slate-500">{words.length}</span>
      </div>

      {isUnavailable ? <div className="text-sm text-slate-400">Список слов недоступен</div> : null}
      {!isUnavailable && isLoading ? <div className="text-sm text-slate-400">Загружаю слова...</div> : null}
      {!isUnavailable && !isLoading && words.length === 0 ? (
        <div className="text-sm text-slate-500">Сохраненных слов пока нет</div>
      ) : null}

      {!isUnavailable && words.length > 0 ? (
        <div className="space-y-2">
          {words.map((word) => (
            <div key={word.id} className="rounded-md border border-slate-800 bg-slate-900/70 p-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="break-words text-sm font-semibold text-white">{word.displayWord}</div>
                  <div className="mt-1 text-xs text-slate-400">{word.language}</div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-7 w-7 shrink-0 px-0"
                  aria-label={`Удалить ${word.displayWord}`}
                  onClick={() => onRemove(word)}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
              <div className="mt-2 break-words text-xs leading-snug text-slate-300">
                {word.firstMeaning || "без значения"}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </aside>
  );
}
