import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BottomSheet } from "./bottom-sheet";
import { SidePanel } from "./side-panel";
import { WordSheetContent } from "./word-sheet-content";
import { SavedWordsSheetContent } from "./saved-words-sheet-content";
import { TrackSheetContent } from "./track-sheet-content";
import type { WordLookupState } from "@/lib/dictionary/types";
import type { SavedWord } from "@/lib/saved-words/types";
import type { SubtitleTrack } from "@/lib/subtitles/types";

describe("BottomSheet", () => {
  it("renders children inside a labelled dialog and closes on backdrop tap", () => {
    const onClose = vi.fn();
    render(
      <BottomSheet label="Слово: hello" onClose={onClose}>
        <p>body</p>
      </BottomSheet>,
    );
    expect(screen.getByRole("dialog", { name: "Слово: hello" })).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("sheet-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("SidePanel", () => {
  it("renders children inside a labelled dialog and closes on backdrop tap", () => {
    const onClose = vi.fn();
    render(
      <SidePanel label="Слово: hello" onClose={onClose}>
        <p>body</p>
      </SidePanel>,
    );
    expect(screen.getByRole("dialog", { name: "Слово: hello" })).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("panel-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("WordSheetContent", () => {
  const ready: WordLookupState = {
    status: "ready",
    query: "hello",
    data: {
      query: "hello",
      headword: "hello",
      language: "en",
      languageName: "Английский",
      ipa: "həˈloʊ",
      partOfSpeech: "сущ.",
      grammar: ["мн. hellos"],
      meanings: ["приветствие", "оклик"],
      source: "ruwiktionary-kaikki",
      sourceUrl: "https://ru.wiktionary.org/wiki/hello",
    },
  };

  it("renders headword, meaning, grammar and source for a ready lookup", () => {
    render(<WordSheetContent fallbackWord="hello" lookup={ready} />);
    expect(screen.getByText("hello")).toBeInTheDocument();
    expect(screen.getByText("приветствие")).toBeInTheDocument();
    expect(screen.getByText(/сущ\., мн\. hellos/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ВИКИСЛОВАРЬ · EN/ })).toBeInTheDocument();
  });

  it("shows the loading note", () => {
    render(<WordSheetContent fallbackWord="hello" lookup={{ status: "loading", query: "hello" }} />);
    expect(screen.getByText("Ищу в словаре...")).toBeInTheDocument();
  });

  it("shows the not-found note", () => {
    render(<WordSheetContent fallbackWord="zzz" lookup={{ status: "not-found", query: "zzz" }} />);
    expect(screen.getByText("Слово не найдено в словаре")).toBeInTheDocument();
  });

  it("drives the save control", () => {
    const onToggle = vi.fn();
    render(
      <WordSheetContent fallbackWord="hello" lookup={ready} saveControl={{ status: "unsaved", onToggle }} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Сохранить слово" }));
    expect(onToggle).toHaveBeenCalled();
  });

  it("shows the saved state", () => {
    render(
      <WordSheetContent fallbackWord="hello" lookup={ready} saveControl={{ status: "saved", onToggle: () => {} }} />,
    );
    expect(screen.getByRole("button", { name: "Сохранено" })).toBeInTheDocument();
  });
});

describe("SavedWordsSheetContent", () => {
  const word: SavedWord = {
    id: "s1",
    normalizedWord: "hello",
    displayWord: "hello",
    language: "en",
    languageName: "Английский",
    firstMeaning: "приветствие",
    source: null,
    sourceUrl: null,
    createdAtMs: 1,
    updatedAtMs: 1,
  };

  it("renders a card per word and removes on tap", () => {
    const onRemove = vi.fn();
    render(<SavedWordsSheetContent words={[word]} onRemove={onRemove} />);
    expect(screen.getByText("hello")).toBeInTheDocument();
    expect(screen.getByText("приветствие")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Удалить hello" }));
    expect(onRemove).toHaveBeenCalledWith(word);
  });

  it("shows the empty state", () => {
    render(<SavedWordsSheetContent words={[]} onRemove={() => {}} />);
    expect(screen.getByText(/Список пуст/)).toBeInTheDocument();
  });
});

describe("TrackSheetContent", () => {
  const tracks: SubtitleTrack[] = [
    { id: "en", lang: "en", title: "English", url: "u", manifestName: "English", isAuto: false, storageIndex: 0 },
    { id: "ru", lang: "ru", title: "Русский", url: "u", manifestName: "Русский", isAuto: false, storageIndex: 1 },
  ];

  it("renders both groups with a 'Нет' translation option", () => {
    render(
      <TrackSheetContent
        tracks={tracks}
        selectedTrackId="en"
        selectedSecondaryTrackId=""
        onSelectPrimary={() => {}}
        onSelectSecondary={() => {}}
      />,
    );
    expect(screen.getByRole("listbox", { name: "Субтитры" })).toBeInTheDocument();
    expect(screen.getByRole("listbox", { name: "Перевод" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Нет" })).toBeInTheDocument();
  });

  it("calls the selection callbacks", () => {
    const onSelectPrimary = vi.fn();
    const onSelectSecondary = vi.fn();
    render(
      <TrackSheetContent
        tracks={tracks}
        selectedTrackId="en"
        selectedSecondaryTrackId=""
        onSelectPrimary={onSelectPrimary}
        onSelectSecondary={onSelectSecondary}
      />,
    );
    const subtitles = screen.getByRole("listbox", { name: "Субтитры" });
    fireEvent.click(within(subtitles).getByRole("option", { name: "Русский" }));
    expect(onSelectPrimary).toHaveBeenCalledWith("ru");

    const translation = screen.getByRole("listbox", { name: "Перевод" });
    fireEvent.click(within(translation).getByRole("option", { name: "Русский" }));
    expect(onSelectSecondary).toHaveBeenCalledWith("ru");
  });
});
