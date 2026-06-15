import { useEffect, useState } from "react";

export type Orientation = "portrait" | "landscape";

const QUERY = "(orientation: landscape)";

function read(): Orientation {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "portrait";
  }
  return window.matchMedia(QUERY).matches ? "landscape" : "portrait";
}

/**
 * Ориентация устройства для переключения мобильного дерева компонентов
 * (portrait — нижние шторки; landscape — оверлей-плеер с боковыми панелями).
 */
export function useOrientation(): Orientation {
  const [orientation, setOrientation] = useState<Orientation>(read);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(QUERY);
    const onChange = () => setOrientation(mql.matches ? "landscape" : "portrait");
    onChange();
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, []);

  return orientation;
}
