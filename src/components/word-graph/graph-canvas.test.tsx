import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { GraphCanvas } from "./graph-canvas";

function Harness(props: Partial<React.ComponentProps<typeof GraphCanvas>>) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  return (
    <GraphCanvas
      canvasRef={canvasRef}
      containerRef={containerRef}
      onZoomIn={vi.fn()}
      onZoomOut={vi.fn()}
      onReset={vi.fn()}
      noResultQuery={null}
      isTouch={false}
      {...props}
    />
  );
}

describe("GraphCanvas", () => {
  it("показывает легенду и кнопки зума", () => {
    render(<Harness />);
    expect(screen.getByText("тег")).toBeInTheDocument();
    expect(screen.getByText("слово")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Приблизить" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Отдалить" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сбросить" })).toBeInTheDocument();
  });

  it("оверлей «ничего не найдено» виден только при noResultQuery", () => {
    const { rerender } = render(<Harness noResultQuery={null} />);
    expect(screen.queryByText("Пусто")).toBeNull();
    rerender(<Harness noResultQuery="zzz" />);
    expect(screen.getByText("Пусто")).toBeInTheDocument();
    expect(screen.getByText(/zzz/)).toBeInTheDocument();
  });

  it("кнопки зума вызывают коллбэки", async () => {
    const onZoomIn = vi.fn();
    render(<Harness onZoomIn={onZoomIn} />);
    await userEvent.click(screen.getByRole("button", { name: "Приблизить" }));
    expect(onZoomIn).toHaveBeenCalled();
  });
});
