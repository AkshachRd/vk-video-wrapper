import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WordLookupPopover } from "./word-lookup-popover";

describe("WordLookupPopover", () => {
  it("renders the simple fallback word when lookup is idle", () => {
    render(<WordLookupPopover fallbackWord="утро" lookup={{ status: "idle" }} />);

    expect(screen.getByText("утро")).toBeInTheDocument();
  });

  it("renders a Russian loading message", () => {
    render(<WordLookupPopover fallbackWord="wir" lookup={{ status: "loading", query: "wir" }} />);

    expect(screen.getByText("wir")).toBeInTheDocument();
    expect(screen.getByText("Ищу в словаре...")).toBeInTheDocument();
  });

  it("renders meaning and grammar sections for ready lookup data", () => {
    render(
      <WordLookupPopover
        fallbackWord="wir"
        lookup={{
          status: "ready",
          query: "wir",
          data: {
            query: "wir",
            headword: "wir",
            ipa: "viːɐ̯",
            partOfSpeech: "местоимение",
            grammar: ["1-е лицо", "множественное число"],
            meanings: ["мы"],
            source: "ruwiktionary",
            sourceUrl: "https://ru.wiktionary.org/wiki/wir",
          },
        }}
      />,
    );

    expect(screen.getByText("wir")).toBeInTheDocument();
    expect(screen.getByText("/viːɐ̯/")).toBeInTheDocument();
    expect(screen.getByText("Значение")).toBeInTheDocument();
    expect(screen.getByText("мы")).toBeInTheDocument();
    expect(screen.getByText("Грамматика")).toBeInTheDocument();
    expect(screen.getByText(/местоимение/)).toBeInTheDocument();
    expect(screen.getByText(/1-е лицо/)).toBeInTheDocument();
  });

  it("renders not-found and unavailable messages", () => {
    const { rerender } = render(
      <WordLookupPopover fallbackWord="x" lookup={{ status: "not-found", query: "x" }} />,
    );
    expect(screen.getByText("Слово не найдено в немецком словаре")).toBeInTheDocument();

    rerender(<WordLookupPopover fallbackWord="x" lookup={{ status: "unavailable", query: "x" }} />);
    expect(screen.getByText("Словарь сейчас недоступен")).toBeInTheDocument();
  });

  it("uses wrapping styles for long lookup content", () => {
    const { container } = render(
      <WordLookupPopover
        fallbackWord="Donaudampfschifffahrtsgesellschaftskapitän"
        lookup={{
          status: "ready",
          query: "Donaudampfschifffahrtsgesellschaftskapitän",
          data: {
            query: "Donaudampfschifffahrtsgesellschaftskapitän",
            headword: "Donaudampfschifffahrtsgesellschaftskapitän",
            grammar: ["сложное существительное"],
            meanings: ["очень длинное значение без переносов".repeat(4)],
            source: "ruwiktionary",
          },
        }}
      />,
    );

    expect(container.firstElementChild).toHaveClass("max-w-[min(22rem,calc(100vw-2rem))]");
    expect(container.firstElementChild).toHaveClass("break-words");
  });
});
