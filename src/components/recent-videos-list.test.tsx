import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { RecentVideo } from "@/lib/recent-videos/types";

import { RecentVideosList } from "./recent-videos-list";

function recentVideo(overrides: Partial<RecentVideo> = {}): RecentVideo {
  return {
    id: "-1_2",
    url: "https://vkvideo.ru/video-1_2",
    ownerId: -1,
    videoId: 2,
    title: "Deutsch lernen",
    thumbnailUrl: "https://img.example/preview.jpg",
    createdAtMs: 1000,
    lastWatchedAtMs: 2000,
    ...overrides,
  };
}

describe("RecentVideosList", () => {
  it("renders recent videos with a clickable title", () => {
    render(<RecentVideosList videos={[recentVideo()]} onSelect={vi.fn()} onRemove={vi.fn()} />);

    expect(screen.getByRole("region", { name: "Недавние видео" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deutsch lernen" })).toBeInTheDocument();
  });

  it("renders a quiet empty state", () => {
    render(<RecentVideosList videos={[]} onSelect={vi.fn()} onRemove={vi.fn()} />);

    expect(screen.getByText("История пуста")).toBeInTheDocument();
  });

  it("renders the unavailable state", () => {
    render(<RecentVideosList videos={[]} isUnavailable onSelect={vi.fn()} onRemove={vi.fn()} />);

    expect(screen.getByText("История недоступна")).toBeInTheDocument();
  });

  it("calls onSelect when a card is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<RecentVideosList videos={[recentVideo()]} onSelect={onSelect} onRemove={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Deutsch lernen" }));

    expect(onSelect).toHaveBeenCalledWith(recentVideo());
  });

  it("calls onRemove when the remove control is clicked", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<RecentVideosList videos={[recentVideo()]} onSelect={vi.fn()} onRemove={onRemove} />);

    await user.click(screen.getByRole("button", { name: "Удалить из истории: Deutsch lernen" }));

    expect(onRemove).toHaveBeenCalledWith(recentVideo());
  });

  it("falls back to a placeholder when the thumbnail fails to load", () => {
    render(<RecentVideosList videos={[recentVideo()]} onSelect={vi.fn()} onRemove={vi.fn()} />);

    fireEvent.error(screen.getByTestId("recent-thumb"));

    expect(screen.getByTestId("recent-thumb-placeholder")).toBeInTheDocument();
  });

  it("uses a fallback label when the title is missing", () => {
    render(
      <RecentVideosList videos={[recentVideo({ title: null })]} onSelect={vi.fn()} onRemove={vi.fn()} />,
    );

    expect(screen.getByRole("button", { name: "video-1_2" })).toBeInTheDocument();
  });
});
