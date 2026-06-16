import { useEffect, useState } from "react";

export type Platform = "mobile" | "desktop";

// Дев-оверрайд для превью мобильной вёрстки в браузере: ?platform=mobile|desktop.
function overrideFromQuery(): Platform | undefined {
  if (typeof window === "undefined") return undefined;
  const value = new URLSearchParams(window.location.search).get("platform");
  return value === "mobile" || value === "desktop" ? value : undefined;
}

// Под Tauri рантайм инжектит этот глобал. В jsdom/браузере без Tauri его нет —
// тогда платформа остаётся desktop и плагин ОС не дёргается (тесты <App/> зелёные).
function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Выбор раскладки по платформе: android/ios → mobile, иначе desktop.
 * Старт всегда с desktop (первый кадр/SSR/jsdom), апгрейд до mobile асинхронно,
 * если плагин ОС сообщает мобильную платформу.
 */
export function usePlatform(): Platform {
  const [platform, setPlatform] = useState<Platform>(() => overrideFromQuery() ?? "desktop");

  useEffect(() => {
    if (overrideFromQuery() || !isTauriRuntime()) return;
    let cancelled = false;

    void import("@tauri-apps/plugin-os")
      .then((os) => os.platform())
      .then((name) => {
        if (!cancelled && (name === "android" || name === "ios")) setPlatform("mobile");
      })
      .catch(() => {
        // Не в Tauri / плагин недоступен → остаёмся desktop.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return platform;
}
