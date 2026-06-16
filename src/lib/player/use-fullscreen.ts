import { useCallback, useEffect, useState } from "react";

/**
 * Полноэкранный режим для контейнера. `ref` — callback на корневой элемент;
 * `toggle` входит/выходит из fullscreen; `isFullscreen` отслеживает
 * `fullscreenchange` (включая системный выход по Esc/жесту назад).
 */
export function useFullscreen(): {
  ref: (element: HTMLElement | null) => void;
  isFullscreen: boolean;
  toggle: () => void;
} {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === element);
    onChange();
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [element]);

  const toggle = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    void element?.requestFullscreen?.();
  }, [element]);

  return { ref: setElement, isFullscreen, toggle };
}
