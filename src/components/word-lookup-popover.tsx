import type { ReactNode } from "react";

import type { WordLookupState } from "@/lib/dictionary/types";

type WordLookupPopoverProps = {
  fallbackWord: string;
  lookup: WordLookupState;
};

const contentClassName = "max-w-[min(22rem,calc(100vw-2rem))] space-y-1 break-words text-left";
const readyContentClassName =
  "max-w-[min(22rem,calc(100vw-2rem))] space-y-3 break-words text-left";

function PopoverWordHeader({ word }: { word: string }) {
  return <div className="text-base font-semibold text-white break-words">{word}</div>;
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="space-y-1">
      <div className="text-[11px] font-semibold uppercase tracking-normal text-slate-400">{label}</div>
      <div className="text-sm leading-snug text-slate-100">{children}</div>
    </section>
  );
}

export function WordLookupPopover({ fallbackWord, lookup }: WordLookupPopoverProps) {
  if (lookup.status === "idle") {
    return <span className="font-medium text-white break-words">{fallbackWord}</span>;
  }

  if (lookup.status === "loading") {
    return (
      <div className={contentClassName}>
        <PopoverWordHeader word={lookup.query || fallbackWord} />
        <div className="text-sm text-slate-300">Ищу в словаре...</div>
      </div>
    );
  }

  if (lookup.status === "not-found") {
    return (
      <div className={contentClassName}>
        <PopoverWordHeader word={fallbackWord} />
        <div className="text-sm text-slate-300">Слово не найдено в словаре</div>
      </div>
    );
  }

  if (lookup.status === "unavailable") {
    return (
      <div className={contentClassName}>
        <PopoverWordHeader word={fallbackWord} />
        <div className="text-sm text-slate-300">Словарь сейчас недоступен</div>
      </div>
    );
  }

  const { data } = lookup;
  const grammarText = [data.partOfSpeech, ...data.grammar].filter(Boolean).join(", ");

  return (
    <div className={readyContentClassName}>
      <div className="space-y-1">
        <PopoverWordHeader word={data.headword} />
        {data.ipa ? <div className="text-sm text-slate-300 break-words">/{data.ipa}/</div> : null}
        {data.sourceUrl ? (
          <a
            href={data.sourceUrl}
            rel="noreferrer"
            target="_blank"
            className="text-[11px] text-sky-300 break-words hover:text-sky-200"
          >
            {data.source}
          </a>
        ) : (
          <div className="text-[11px] text-slate-400 break-words">{data.source}</div>
        )}
      </div>

      <Section label="Значение">
        <div className="space-y-1">
          {data.meanings.map((meaning) => (
            <div key={meaning} className="break-words">
              {meaning}
            </div>
          ))}
        </div>
      </Section>

      {grammarText ? <Section label="Грамматика">{grammarText}</Section> : null}
    </div>
  );
}
