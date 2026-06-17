import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/platform/use-orientation", () => ({ useOrientation: () => "portrait" }));
vi.mock("@/components/video-player", () => ({
  VideoPlayer: () => <div data-testid="video-player" />,
}));

import { MobileApp } from "./mobile-app";
import { makeVideoAppStub } from "@/test/video-app-stub";

describe("MobileApp · граф", () => {
  it("из шторки слов открывает граф и возвращается", async () => {
    const app = makeVideoAppStub({
      video: {
        videoId: { ownerId: -1, videoId: 1 },
        embedUrl: "https://vk.com/video_ext.php",
        title: "t",
        tracks: [],
        selectedTrackId: "l",
        subtitleText: "",
      },
      lane: { role: "primary", source: "vk-track", trackId: "l", cues: [] },
      savedWords: [
        {
          id: "a",
          normalizedWord: "muss",
          displayWord: "muss",
          language: "de",
          languageName: null,
          firstMeaning: "должен",
          source: null,
          sourceUrl: null,
          createdAtMs: 0,
          updatedAtMs: 0,
          tags: ["aufgabe"],
        },
      ],
    });
    render(<MobileApp app={app} />);
    // открыть шторку слов
    await userEvent.click(screen.getByRole("button", { name: /Мои слова/ }));
    await userEvent.click(screen.getByRole("button", { name: "Открыть граф" }));
    expect(screen.getByText("Граф слов")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Назад" }));
    expect(screen.queryByText("Граф слов")).toBeNull();
  });
});
