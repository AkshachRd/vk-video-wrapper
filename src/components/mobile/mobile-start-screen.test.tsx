import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MobileStartScreen } from "./mobile-start-screen";
import type { RecentVideo } from "@/lib/recent-videos/types";

function makeVideo(id: string, title: string): RecentVideo {
  return {
    id,
    url: `https://vkvideo.ru/${id}`,
    ownerId: -1,
    videoId: 1,
    title,
    thumbnailUrl: null,
    createdAtMs: 1,
    lastWatchedAtMs: 2,
  };
}

const baseProps = {
  url: "",
  onUrlChange: () => {},
  isLoading: false,
  onSubmit: () => {},
  recentVideos: [] as RecentVideo[],
  areRecentVideosLoading: false,
  recentVideosUnavailable: false,
  recentVideosError: undefined,
  onSelectRecent: () => {},
  onRemoveRecent: () => {},
  savedWordsCount: 0,
  onOpenSaved: () => {},
};

describe("MobileStartScreen", () => {
  it("submits the URL form", () => {
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    render(<MobileStartScreen {...baseProps} onSubmit={onSubmit} />);
    fireEvent.submit(screen.getByTestId("mobile-url-form"));
    expect(onSubmit).toHaveBeenCalled();
  });

  it("shows the saved-words count and opens the saved sheet", () => {
    const onOpenSaved = vi.fn();
    render(<MobileStartScreen {...baseProps} savedWordsCount={7} onOpenSaved={onOpenSaved} />);
    const dock = screen.getByRole("button", { name: /Мои слова/ });
    expect(dock).toHaveTextContent("7");
    fireEvent.click(dock);
    expect(onOpenSaved).toHaveBeenCalled();
  });

  it("renders a card per recent video", () => {
    render(
      <MobileStartScreen
        {...baseProps}
        recentVideos={[makeVideo("a", "Alpha"), makeVideo("b", "Beta")]}
      />,
    );
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("shows the empty state with no videos", () => {
    render(<MobileStartScreen {...baseProps} />);
    expect(screen.getByText("История пуста")).toBeInTheDocument();
  });
});
