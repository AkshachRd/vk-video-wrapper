import { describe, expect, it, vi } from "vitest";

import { buildGraph, seedLayout } from "./graph-model";
import { Simulation } from "./simulation";
import type { SavedWord } from "@/lib/saved-words/types";

function word(id: string, tags: string[]): SavedWord {
  return {
    id,
    normalizedWord: id,
    displayWord: id,
    language: "de",
    languageName: null,
    firstMeaning: null,
    source: null,
    sourceUrl: null,
    createdAtMs: 0,
    updatedAtMs: 0,
    tags,
  };
}

function makeSim() {
  const data = buildGraph([word("a", ["t"]), word("b", ["t"]), word("c", [])]);
  seedLayout(data);
  return new Simulation(data);
}

describe("Simulation", () => {
  it("step() держит координаты конечными и не бросает", () => {
    const sim = makeSim();
    for (let i = 0; i < 200; i++) sim.step(0.016);
    for (const n of sim.data.nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    }
  });

  it("alpha остывает к полу, reheat поднимает", () => {
    const sim = makeSim();
    for (let i = 0; i < 500; i++) sim.step(0.016);
    expect(sim.alpha).toBeLessThan(0.1);
    sim.reheat(0.8);
    expect(sim.alpha).toBeGreaterThanOrEqual(0.8);
  });

  it("draw() вызывает рисующие методы контекста и не бросает", () => {
    const sim = makeSim();
    const ctx = fakeCtx();
    expect(() => sim.draw(ctx as unknown as CanvasRenderingContext2D, 600, 400, 1)).not.toThrow();
    expect(ctx.clearRect).toHaveBeenCalled();
    expect(ctx.arc).toHaveBeenCalled();
  });
});

function fakeCtx() {
  return {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    arcTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 10 })),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    textAlign: "",
    textBaseline: "",
    globalAlpha: 1,
  };
}
