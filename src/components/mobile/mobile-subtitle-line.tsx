import { useEffect, useRef } from "react";

import type { SubtitleCue, SubtitleWord } from "@/lib/subtitles/types";
import { cn } from "@/lib/utils";

type MobileSubtitleLineProps = {
  cue: SubtitleCue;
  activeWordId?: string;
  onWordTap: (cue: SubtitleCue, word: SubtitleWord) => void;
  className?: string;
};

// Подчёркивание-«змейка» по нажатию/наведению (как у desktop-слова) + active-состояние.
const wordButtonClassName =
  "relative inline cursor-pointer border-0 bg-transparent p-0 px-px text-[length:inherit] leading-[inherit] font-[inherit] text-ink outline-none after:absolute after:inset-x-0 after:-bottom-[2px] after:h-[5px] after:origin-left after:scale-x-0 after:bg-(image:--wave-ink) after:bg-position-[50%_50%] after:bg-size-[11px_5px] after:bg-repeat-x after:opacity-85 after:transition-transform after:duration-300 after:ease-spring after:content-[''] hover:after:scale-x-100 motion-safe:hover:after:animate-uslither focus-visible:after:scale-x-100 data-[active=true]:after:scale-x-100 motion-safe:data-[active=true]:after:animate-uslither";

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Кликабельная строка субтитров для мобильной вёрстки (reading area + landscape).
 * Слова берутся из cue.words. Вход анимируется ТОЛЬКО по transform (opacity=1
 * базово) и переигрывается на каждый cue.id — слова видны при паузе/троттлинге.
 */
export function MobileSubtitleLine({ cue, activeWordId, onWordTap, className }: MobileSubtitleLineProps) {
  const lineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = lineRef.current;
    if (!root || prefersReducedMotion()) return;

    const buttons = root.querySelectorAll<HTMLButtonElement>("button[data-word]");
    buttons.forEach((button, index) => {
      if (typeof button.animate !== "function") return;
      button.animate([{ transform: "translateY(7px)" }, { transform: "translateY(0)" }], {
        duration: 420,
        delay: index * 22,
        easing: "cubic-bezier(0.16,1.1,0.3,1)",
        fill: "backwards",
      });
    });
  }, [cue.id]);

  return (
    <div ref={lineRef} key={cue.id} className={cn(className)}>
      {cue.words.map((word, index) => (
        <span key={word.id}>
          <button
            type="button"
            data-word
            data-active={word.id === activeWordId ? "true" : undefined}
            onClick={() => onWordTap(cue, word)}
            className={wordButtonClassName}
          >
            {word.text}
          </button>
          {index < cue.words.length - 1 ? " " : null}
        </span>
      ))}
    </div>
  );
}
