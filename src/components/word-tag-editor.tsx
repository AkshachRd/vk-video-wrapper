import { Plus, X } from "lucide-react";
import { useState } from "react";

import { normalizeTag } from "@/lib/saved-words/tags";

type WordTagEditorProps = {
  wordId: string;
  tags: string[];
  suggestions: string[];
  disabled?: boolean;
  onAddTag: (wordId: string, tag: string) => void;
  onRemoveTag: (wordId: string, tag: string) => void;
};

export function WordTagEditor({
  wordId,
  tags,
  suggestions,
  disabled,
  onAddTag,
  onRemoveTag,
}: WordTagEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState("");

  const existingKeys = new Set(tags.map(normalizeTag));
  const query = normalizeTag(value);
  const matches = suggestions
    .filter((suggestion) => !existingKeys.has(normalizeTag(suggestion)))
    .filter((suggestion) => (query ? normalizeTag(suggestion).includes(query) : true))
    .slice(0, 6);

  function close() {
    setValue("");
    setIsEditing(false);
  }

  function commit(tag: string) {
    const trimmed = tag.trim();
    const key = normalizeTag(trimmed);
    if (key && !existingKeys.has(key)) {
      onAddTag(wordId, trimmed);
    }
    close();
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span
          key={normalizeTag(tag)}
          className="inline-flex items-center gap-1 rounded-full bg-paper px-2 py-0.5 text-[11px] text-ink-2"
        >
          {tag}
          <button
            type="button"
            aria-label={`Снять тег ${tag}`}
            disabled={disabled}
            onClick={() => onRemoveTag(wordId, tag)}
            className="text-ink-3 hover:text-ink disabled:opacity-30"
          >
            <X className="h-2.5 w-2.5" aria-hidden="true" />
          </button>
        </span>
      ))}

      {isEditing ? (
        <span className="relative">
          <input
            autoFocus
            value={value}
            disabled={disabled}
            aria-label="Новый тег"
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commit(value);
              }
              if (event.key === "Escape") {
                event.preventDefault();
                close();
              }
            }}
            onBlur={close}
            className="w-24 rounded-full bg-paper px-2 py-0.5 text-[11px] text-ink outline-none"
          />
          {matches.length > 0 ? (
            <span className="absolute top-full left-0 z-10 mt-1 flex max-w-[160px] flex-col rounded-card-sm border border-line bg-paper p-1 shadow-sm">
              {matches.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  // mousedown fires before the input's blur, so the click is not lost
                  onMouseDown={(event) => {
                    event.preventDefault();
                    commit(suggestion);
                  }}
                  className="rounded px-2 py-1 text-left text-[11px] text-ink-2 hover:bg-paper-2"
                >
                  {suggestion}
                </button>
              ))}
            </span>
          ) : null}
        </span>
      ) : (
        <button
          type="button"
          disabled={disabled}
          aria-label="Добавить тег"
          onClick={() => setIsEditing(true)}
          className="inline-flex items-center gap-0.5 rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-3 hover:border-ink hover:text-ink disabled:opacity-30"
        >
          <Plus className="h-2.5 w-2.5" aria-hidden="true" /> тег
        </button>
      )}
    </div>
  );
}
