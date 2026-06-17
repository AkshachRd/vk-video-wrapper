import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/video-player", () => ({
  VideoPlayer: () => <div data-testid="video-player" />,
}));

import { DesktopApp } from "./desktop-app";
import { makeVideoAppStub } from "@/test/video-app-stub";

describe("DesktopApp · граф", () => {
  it("открывает граф из панели слов и возвращается к плееру", async () => {
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
    render(<DesktopApp app={app} />);
    await userEvent.click(screen.getByRole("button", { name: "Граф слов" }));
    // экран графа открыт: видны его поиск и кнопка возврата (заголовок убран)
    expect(screen.getByLabelText("Поиск по словам и тегам")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /к плееру/ }));
    expect(screen.getByTestId("player-container")).toBeInTheDocument();
  });
});
