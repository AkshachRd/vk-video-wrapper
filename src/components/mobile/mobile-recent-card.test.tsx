import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MobileRecentCard } from "./mobile-recent-card";
import type { RecentVideo } from "@/lib/recent-videos/types";

const video: RecentVideo = {
  id: "r1",
  url: "https://vkvideo.ru/video-1_1",
  ownerId: -1,
  videoId: 1,
  title: "City of Tomorrow",
  thumbnailUrl: null,
  createdAtMs: 1_000,
  lastWatchedAtMs: 2_000,
};

describe("MobileRecentCard", () => {
  it("renders the title", () => {
    render(<MobileRecentCard video={video} onSelect={() => {}} onRemove={() => {}} />);
    expect(screen.getByText("City of Tomorrow")).toBeInTheDocument();
  });

  it("calls onSelect when the card is tapped", () => {
    const onSelect = vi.fn();
    render(<MobileRecentCard video={video} onSelect={onSelect} onRemove={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "City of Tomorrow" }));
    expect(onSelect).toHaveBeenCalledWith(video);
  });

  it("calls onRemove without selecting when remove is tapped", () => {
    const onSelect = vi.fn();
    const onRemove = vi.fn();
    render(<MobileRecentCard video={video} onSelect={onSelect} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: /Удалить из истории/ }));
    expect(onRemove).toHaveBeenCalledWith(video);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
