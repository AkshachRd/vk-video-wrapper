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
            language: "de",
            languageName: "Немецкий",
            ipa: "viːɐ̯",
            partOfSpeech: "местоимение",
            grammar: ["1-е лицо", "множественное число"],
            meanings: ["мы"],
            source: "ruwiktionary-kaikki",
            sourceUrl: "https://kaikki.org/ruwiktionary/Немецкий/meaning/w/wi/wir.html",
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
    expect(screen.getByRole("link", { name: "ruwiktionary-kaikki" })).toHaveAttribute(
      "href",
      "https://kaikki.org/ruwiktionary/Немецкий/meaning/w/wi/wir.html",
    );
  });

  it("renders English ready lookup data", () => {
    render(
      <WordLookupPopover
        fallbackWord="house"
        lookup={{
          status: "ready",
          query: "house",
          data: {
            query: "house",
            headword: "house",
            language: "en",
            languageName: "Английский",
            ipa: "haʊs",
            partOfSpeech: "существительное",
            grammar: ["единственное число"],
            meanings: ["дом (сооружение)"],
            source: "ruwiktionary-kaikki",
            sourceUrl: "https://kaikki.org/ruwiktionary/Английский/meaning/h/ho/house.html",
          },
        }}
      />,
    );

    expect(screen.getByText("дом (сооружение)")).toBeInTheDocument();
    expect(screen.getByText(/единственное число/)).toBeInTheDocument();
  });

  it("renders Russian ready lookup data", () => {
    render(
      <WordLookupPopover
        fallbackWord="дом"
        lookup={{
          status: "ready",
          query: "дом",
          data: {
            query: "дом",
            headword: "дом",
            language: "ru",
            languageName: "Русский",
            ipa: "dom",
            partOfSpeech: "существительное",
            grammar: ["мужской род"],
            meanings: ["архитектурное сооружение, предназначенное для жилья"],
            source: "ruwiktionary-kaikki",
            sourceUrl: "https://kaikki.org/ruwiktionary/Русский/meaning/д/до/дом.html",
          },
        }}
      />,
    );

    expect(screen.getByText("архитектурное сооружение, предназначенное для жилья")).toBeInTheDocument();
    expect(screen.getByText(/мужской род/)).toBeInTheDocument();
  });

  it("renders not-found and unavailable messages", () => {
    const { rerender } = render(
      <WordLookupPopover fallbackWord="x" lookup={{ status: "not-found", query: "x" }} />,
    );
    expect(screen.getByText("Слово не найдено в словаре")).toBeInTheDocument();

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
            language: "de",
            languageName: "Немецкий",
            grammar: ["сложное существительное"],
            meanings: ["очень длинное значение без переносов".repeat(4)],
            source: "ruwiktionary-kaikki",
          },
        }}
      />,
    );

    expect(container.firstElementChild).toHaveClass("max-w-[min(22rem,calc(100vw-2rem))]");
    expect(container.firstElementChild).toHaveClass("break-words");
  });
});
