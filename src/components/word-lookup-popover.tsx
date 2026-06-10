import type { ReactNode } from "react";

import { SnakeBorder } from "@/components/snake-border";
import type { WordLookupState } from "@/lib/dictionary/types";
import type { WordSaveControl } from "@/lib/saved-words/types";
import { cn } from "@/lib/utils";

type WordLookupPopoverProps = {
  fallbackWord: string;
  lookup: WordLookupState;
  saveControl?: WordSaveControl;
};

const monoLabelClassName =
  "font-mono text-[10.5px] font-medium tracking-[0.1em] uppercase text-ink-3";

function PopoverWordHeader({ word, ipa }: { word: string; ipa?: string | null }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
      <span className="min-w-0 text-[22px] font-semibold tracking-[-0.02em] break-words text-ink">{word}</span>
      {ipa ? <span className="font-mono text-[13px] text-ink-2">/{ipa}/</span> : null}
    </div>
  );
}

function SourceNote({ language, sourceUrl }: { language: string; sourceUrl: string | null }) {
  const label = `ВИКИСЛОВАРЬ · ${language.toUpperCase()}`;

  if (!sourceUrl) {
    return <div className="mt-2 font-mono text-[10px] tracking-[0.06em] text-ink-2">{label}</div>;
  }

  return (
    <div className="mt-2">
      <a
        href={sourceUrl}
        rel="noreferrer"
        target="_blank"
        className="border-b border-line-2 pb-px font-mono text-[10px] tracking-[0.06em] text-ink no-underline transition-colors hover:border-ink"
      >
        {label} ↗
      </a>
    </div>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="space-y-[5px]">
      <div className={monoLabelClassName}>{label}</div>
      <div className="text-sm leading-[1.45] break-words text-ink">{children}</div>
    </section>
  );
}

function StatusNote({ children }: { children: ReactNode }) {
  return <div className="px-[18px] pb-3.5 text-sm text-ink-2">{children}</div>;
}

function SavedWordButton({ control }: { control?: WordSaveControl }) {
  if (!control) return null;

  const labels = {
    unsaved: "Сохранить слово",
    saving: "Сохраняю...",
    saved: "Сохранено",
    removing: "Удаляю...",
    unavailable: "Сохранение недоступно",
  };
  const isSavedLook = control.status === "saved" || control.status === "removing";

  return (
    <div className="space-y-2 px-[18px] pt-1 pb-4">
      <button
        type="button"
        disabled={
          control.status === "saving" || control.status === "removing" || control.status === "unavailable"
        }
        onClick={control.onToggle}
        className={cn(
          "group/snake relative flex w-full items-center justify-center gap-[9px] rounded-full p-3 text-[13px] font-medium tracking-[0.01em] [transition:translate_0.3s_var(--ease-spring),background-color_0.2s,color_0.2s] disabled:opacity-60",
          isSavedLook
            ? "bg-paper-2 text-ink shadow-[inset_0_0_0_1.5px_var(--color-line-2)]"
            : "bg-ink text-paper hover:-translate-y-px",
        )}
      >
        {control.status === "saved" ? (
          <span
            aria-hidden="true"
            className="h-[7px] w-[13px] -rotate-45 scale-0 animate-chkin border-b-2 border-l-2 border-current motion-reduce:scale-100 motion-reduce:animate-none"
          />
        ) : null}
        {labels[control.status]}
        {control.status === "unsaved" || control.status === "saved" ? <SnakeBorder shape="pill" /> : null}
      </button>
      {control.error ? <div className="px-1 text-xs text-ink-2">{control.error}</div> : null}
    </div>
  );
}

export function WordLookupPopover({ fallbackWord, lookup, saveControl }: WordLookupPopoverProps) {
  if (lookup.status === "idle") {
    return (
      <div className="break-words text-left">
        <div className="px-[18px] pt-4 pb-3">
          <PopoverWordHeader word={fallbackWord} />
        </div>
        <SavedWordButton control={saveControl} />
      </div>
    );
  }

  if (lookup.status === "loading") {
    return (
      <div className="break-words text-left">
        <div className="px-[18px] pt-4 pb-3">
          <PopoverWordHeader word={lookup.query || fallbackWord} />
        </div>
        <div className="flex items-center gap-[9px] px-[18px] pb-3.5 font-mono text-xs tracking-[0.04em] text-ink-2">
          <span
            aria-hidden="true"
            className="h-3 w-3 animate-spin rounded-full border-2 border-line-2 border-t-ink motion-reduce:animate-none"
          />
          Ищу в словаре...
        </div>
        <SavedWordButton control={saveControl} />
      </div>
    );
  }

  if (lookup.status === "not-found") {
    return (
      <div className="break-words text-left">
        <div className="px-[18px] pt-4 pb-3">
          <PopoverWordHeader word={fallbackWord} />
        </div>
        <StatusNote>Слово не найдено в словаре</StatusNote>
        <SavedWordButton control={saveControl} />
      </div>
    );
  }

  if (lookup.status === "unavailable") {
    return (
      <div className="break-words text-left">
        <div className="px-[18px] pt-4 pb-3">
          <PopoverWordHeader word={fallbackWord} />
        </div>
        <StatusNote>Словарь сейчас недоступен</StatusNote>
        <SavedWordButton control={saveControl} />
      </div>
    );
  }

  const { data } = lookup;
  const grammarText = [data.partOfSpeech, ...data.grammar].filter(Boolean).join(", ");

  return (
    <div className="break-words text-left">
      <div className="px-[18px] pt-4 pb-3">
        <PopoverWordHeader word={data.headword} ipa={data.ipa} />
        <SourceNote language={data.language} sourceUrl={data.sourceUrl} />
      </div>

      <div className="space-y-[13px] px-[18px] pt-1 pb-3.5">
        <Section label="Значение">
          <div className="space-y-[3px]">
            {data.meanings.map((meaning) => (
              <div key={meaning}>{meaning}</div>
            ))}
          </div>
        </Section>

        {grammarText ? (
          <Section label="Грамматика">
            <span className="font-mono text-[13px]">{grammarText}</span>
          </Section>
        ) : null}
      </div>

      <SavedWordButton control={saveControl} />
    </div>
  );
}
