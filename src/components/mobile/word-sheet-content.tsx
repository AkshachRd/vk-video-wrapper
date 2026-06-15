import type { ReactNode } from "react";

import { SnakeBorder } from "@/components/snake-border";
import type { WordLookupState } from "@/lib/dictionary/types";
import type { WordSaveControl } from "@/lib/saved-words/types";
import { cn } from "@/lib/utils";

type WordSheetContentProps = {
  fallbackWord: string;
  lookup: WordLookupState;
  saveControl?: WordSaveControl;
};

function Header({ word, ipa }: { word: string; ipa?: string | null }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="min-w-0 text-[30px] font-semibold tracking-[-0.02em] break-words text-ink">{word}</span>
      {ipa ? <span className="font-mono text-[15px] text-ink-2">/{ipa}/</span> : null}
    </div>
  );
}

function SourceNote({ language, sourceUrl }: { language: string; sourceUrl: string | null }) {
  const label = `ВИКИСЛОВАРЬ · ${language.toUpperCase()}`;
  if (!sourceUrl) {
    return <div className="mt-2.5 font-mono text-[11px] tracking-[0.05em] text-ink-2">{label}</div>;
  }
  return (
    <div className="mt-2.5">
      <a
        href={sourceUrl}
        rel="noreferrer"
        target="_blank"
        className="border-b border-line-2 pb-px font-mono text-[11px] tracking-[0.05em] text-ink no-underline"
      >
        {label} ↗
      </a>
    </div>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="[&+&]:mt-4">
      <div className="mb-1.5 font-mono text-[10px] tracking-[0.12em] uppercase text-ink-3">{label}</div>
      <div className="text-base leading-[1.45] break-words text-ink">{children}</div>
    </section>
  );
}

function StatusNote({ children }: { children: ReactNode }) {
  return <div className="text-base leading-[1.45] text-ink-2">{children}</div>;
}

function SaveButton({ control }: { control?: WordSaveControl }) {
  if (!control) return null;

  const labels: Record<WordSaveControl["status"], string> = {
    unsaved: "Сохранить слово",
    saving: "Сохраняю...",
    saved: "Сохранено",
    removing: "Удаляю...",
    unavailable: "Сохранение недоступно",
  };
  const isSavedLook = control.status === "saved" || control.status === "removing";
  const disabled =
    control.status === "saving" || control.status === "removing" || control.status === "unavailable";

  return (
    <div className="px-[22px] pt-3.5 pb-1.5">
      <button
        type="button"
        disabled={disabled}
        onClick={control.onToggle}
        className={cn(
          "group/snake relative flex h-14 w-full items-center justify-center gap-2.5 rounded-full text-base font-medium [transition:scale_0.3s_var(--ease-spring)] active:scale-[0.98] disabled:opacity-60",
          isSavedLook ? "bg-paper-2 text-ink shadow-[inset_0_0_0_1.5px_var(--color-line-2)]" : "bg-ink text-paper",
        )}
      >
        {control.status === "saved" ? (
          <span
            aria-hidden="true"
            className="h-2 w-[15px] -rotate-45 border-b-[2.5px] border-l-[2.5px] border-current"
          />
        ) : null}
        {labels[control.status]}
        {control.status === "unsaved" || control.status === "saved" ? <SnakeBorder shape="pill" /> : null}
      </button>
      {control.error ? <div className="px-1 pt-2 text-xs text-ink-2">{control.error}</div> : null}
    </div>
  );
}

// Содержимое шторки/панели слова (mobile.css .m-wl-*). Контракты те же, что у
// desktop-поповера (WordLookupState/WordSaveControl) — отличается только вёрстка.
export function WordSheetContent({ fallbackWord, lookup, saveControl }: WordSheetContentProps) {
  const headword = lookup.status === "ready" ? lookup.data.headword : lookup.status === "loading" ? lookup.query || fallbackWord : fallbackWord;
  const ipa = lookup.status === "ready" ? lookup.data.ipa : null;

  return (
    <div className="break-words text-left">
      <div className="px-[22px] pt-2 pb-3.5">
        <Header word={headword} ipa={ipa} />
        {lookup.status === "ready" ? (
          <SourceNote language={lookup.data.language} sourceUrl={lookup.data.sourceUrl} />
        ) : null}
      </div>

      <div className="px-[22px] pt-1 pb-2">
        {lookup.status === "loading" ? (
          <div className="flex items-center gap-2.5 py-2.5 font-mono text-[13px] text-ink-2">
            <span
              aria-hidden="true"
              className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line-2 border-t-ink motion-reduce:animate-none"
            />
            Ищу в словаре...
          </div>
        ) : lookup.status === "not-found" ? (
          <StatusNote>Слово не найдено в словаре</StatusNote>
        ) : lookup.status === "unavailable" ? (
          <StatusNote>Словарь сейчас недоступен</StatusNote>
        ) : lookup.status === "ready" ? (
          <>
            <Section label="Значение">
              <div className="space-y-1">
                {lookup.data.meanings.map((meaning) => (
                  <div key={meaning}>{meaning}</div>
                ))}
              </div>
            </Section>
            {[lookup.data.partOfSpeech, ...lookup.data.grammar].filter(Boolean).length > 0 ? (
              <Section label="Грамматика">
                <span className="font-mono text-sm text-ink-2">
                  {[lookup.data.partOfSpeech, ...lookup.data.grammar].filter(Boolean).join(", ")}
                </span>
              </Section>
            ) : null}
          </>
        ) : null}
      </div>

      <SaveButton control={saveControl} />
    </div>
  );
}
