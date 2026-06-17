import "@testing-library/jest-dom/vitest";

// jsdom не реализует ResizeObserver, который нужен SnakeBorder.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

// jsdom не реализует canvas 2d — минимальная заглушка, чтобы монтировались
// компоненты с <canvas> (рисование в тестах не проверяем).
if (typeof HTMLCanvasElement !== "undefined") {
  const noop = () => {};
  HTMLCanvasElement.prototype.getContext = (() =>
    ({
      setTransform: noop,
      clearRect: noop,
      beginPath: noop,
      moveTo: noop,
      lineTo: noop,
      arc: noop,
      arcTo: noop,
      closePath: noop,
      fill: noop,
      stroke: noop,
      fillText: noop,
      measureText: () => ({ width: 0 }),
    }) as unknown as CanvasRenderingContext2D) as unknown as HTMLCanvasElement["getContext"];
}
