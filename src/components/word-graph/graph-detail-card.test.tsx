import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { GraphDetailCard } from "./graph-detail-card";
import type { CardData, GraphNode } from "@/lib/word-graph/types";

function tagNode(id: string, label: string): GraphNode {
  return { id, type: "tag", label, key: label, deg: 1, r: 16, x: 0, y: 0, vx: 0, vy: 0, phase: 0, neighbors: [], hidden: false };
}

describe("GraphDetailCard", () => {
  it("рисует слово, бейдж языка и теги-пилюли; клик по тегу фокусирует", async () => {
    const node: GraphNode = {
      id: "word:nein",
      type: "word",
      label: "nein",
      lang: "DE",
      meaning: "нет",
      tags: ["negation"],
      tagKeys: ["negation"],
      deg: 1,
      r: 7,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      phase: 0,
      neighbors: ["tag:negation"],
      hidden: false,
    };
    const card: CardData = { kind: "word", node, tags: [{ id: "tag:negation", label: "negation" }] };
    const onFocus = vi.fn();
    render(<GraphDetailCard card={card} onClose={vi.fn()} onFocusNode={onFocus} />);
    expect(screen.getByText("nein")).toBeInTheDocument();
    expect(screen.getByText("DE")).toBeInTheDocument();
    expect(screen.getByText("нет")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "negation" }));
    expect(onFocus).toHaveBeenCalledWith("tag:negation");
  });

  it("рисует тег и его слова-пилюли; клик по слову фокусирует", async () => {
    const card: CardData = {
      kind: "tag",
      node: tagNode("tag:negation", "negation"),
      words: [{ id: "word:nein", label: "nein", lang: "DE" }],
    };
    const onFocus = vi.fn();
    render(<GraphDetailCard card={card} onClose={vi.fn()} onFocusNode={onFocus} />);
    expect(screen.getByText("тег")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /nein/ }));
    expect(onFocus).toHaveBeenCalledWith("word:nein");
  });

  it("закрывается крестиком", async () => {
    const card: CardData = { kind: "tag", node: tagNode("tag:t", "t"), words: [] };
    const onClose = vi.fn();
    render(<GraphDetailCard card={card} onClose={onClose} onFocusNode={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    expect(onClose).toHaveBeenCalled();
  });
});
