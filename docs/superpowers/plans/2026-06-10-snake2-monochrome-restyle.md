# Snake2 Monochrome Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перенести визуальный стиль «Змейка 2» (монохром, IBM Plex, волны, stitch-кольцо) на существующее приложение без изменения логики, с полной русификацией видимых текстов.

**Architecture:** Tailwind-first порт: токены дизайна в `@theme` (`src/styles.css`), стили компонентов — утилитами в JSX. Единственный новый JS — презентационный `SnakeBorder` (+ крошечный `Wave`). Плейн-CSS остаётся только для нативных range-инпутов. Спека: `docs/superpowers/specs/2026-06-10-snake2-monochrome-restyle-design.md`. Референс дизайна: `docs/design/snake2-handoff/` (README.md — контракт, `files/mono.css` — исходные значения, `files/lupa-snake2.html` — эталон в браузере).

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4 (@tailwindcss/vite), Radix popover, lucide-react, vitest + RTL, @fontsource.

**Правила выполнения:**
- Работаем в основном рабочем дереве на ветке `main`, коммиты сразу в `main` (предпочтение пользователя; worktree не создавать).
- Коммит-сообщения на русском, однострочный заголовок, краткое тело, трейлер `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. Без искусственных переносов строк внутри предложений.
- После каждой задачи: `npm test` зелёный, затем коммит.
- Кириллица в файлах: сохранять в UTF-8 (pwsh `Set-Content` по умолчанию UTF-8 без BOM — ок).

---

### Task 1: Шрифты, токены, база styles.css, компонент Wave

**Files:**
- Modify: `package.json` (через npm install)
- Modify: `src/main.tsx`
- Rewrite: `src/styles.css`
- Delete: `src/App.css` (мёртвый шаблон Tauri, нигде не импортируется)
- Modify: `index.html:2`
- Create: `src/components/wave.tsx`
- Test: `src/components/wave.test.tsx`

- [ ] **Step 1: Установить шрифты**

```powershell
npm install @fontsource-variable/ibm-plex-sans @fontsource/ibm-plex-mono
```

Expected: обе зависимости появились в `package.json` (`@fontsource-variable/ibm-plex-sans` ^5.2.8, `@fontsource/ibm-plex-mono` ^5.2.7).

- [ ] **Step 2: Импортировать шрифты в `src/main.tsx`**

Заменить весь файл на:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "@fontsource-variable/ibm-plex-sans";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

(`@fontsource-variable/ibm-plex-sans` — variable-шрифт с осью wght, включает кириллицу через unicode-range; вес 450 для строки субтитров берётся из оси. `400.css`/`500.css` моноширинного также включают кириллицу.)

- [ ] **Step 3: Написать падающий тест для Wave**

Create `src/components/wave.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Wave } from "./wave";

describe("Wave", () => {
  it("renders a decorative divider hidden from the accessibility tree", () => {
    const { container } = render(<Wave className="h-3" />);
    const wave = container.firstElementChild;

    expect(wave).not.toBeNull();
    expect(wave).toHaveAttribute("aria-hidden", "true");
    expect(wave!.className).toContain("h-3");
  });
});
```

- [ ] **Step 4: Убедиться, что тест падает**

Run: `npm test -- wave`
Expected: FAIL — `Cannot find module './wave'` (или эквивалент).

- [ ] **Step 5: Создать `src/components/wave.tsx`**

```tsx
import { cn } from "@/lib/utils";

// Декоративный волнистый разделитель «Змейки 2»: две встречные синусоиды
// (mono.css .wave). Чисто декоративный — скрыт от скринридеров.
export function Wave({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative h-4 w-full animate-wave-a bg-(image:--wave-a) bg-position-[0px_50%] bg-size-[60px_16px] bg-repeat-x motion-reduce:animate-none",
        "after:absolute after:inset-0 after:animate-wave-b after:bg-(image:--wave-b) after:bg-position-[0px_50%] after:bg-size-[84px_16px] after:bg-repeat-x after:opacity-70 after:content-[''] motion-reduce:after:animate-none",
        className,
      )}
    />
  );
}
```

- [ ] **Step 6: Переписать `src/styles.css` целиком**

```css
@import "tailwindcss";

@theme {
  /* Цвета «Змейки 2» (docs/design/snake2-handoff/files/mono.css :root) */
  --color-paper: #ffffff;
  --color-paper-2: #f6f6f6;
  --color-paper-3: #efefef;
  --color-ink: #0c0c0c;
  --color-ink-2: #707070;
  --color-ink-3: #a8a8a8;
  --color-line: #e9e9e9;
  --color-line-2: #dcdcdc;
  --color-well: #0a0a0a;
  --color-page: #e9e9e7;

  /* Радиусы */
  --radius-card: 20px;
  --radius-card-sm: 12px;
  --radius-card-lg: 25px;

  /* Шрифты */
  --font-sans: "IBM Plex Sans Variable", "IBM Plex Sans", system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, monospace;

  /* Изинги */
  --ease-spring: cubic-bezier(0.16, 1.1, 0.3, 1);
  --ease-soft: cubic-bezier(0.33, 0.9, 0.4, 1);

  /* Анимации. Входы — только transform, opacity:1 в базовом состоянии
     (паттерн хендоффа: контент виден даже при прерванной анимации). */
  --animate-wave-a: slither 3.1s linear infinite, bob 4.6s ease-in-out infinite;
  --animate-wave-b: slither-rev 5.4s linear infinite, bob2 6.2s ease-in-out infinite;
  --animate-flow: flow 1.1s linear infinite;
  --animate-cardrise: cardrise 0.5s var(--ease-spring) both;
  --animate-popin: popin 0.4s var(--ease-spring);
  --animate-wcardin: wcardin 0.5s var(--ease-spring);
  --animate-wcardflash: wcardflash 0.7s var(--ease-soft);
  --animate-pulse-dot: pulse-dot 1.5s var(--ease-soft) infinite;
  --animate-uslither: uslither 0.75s linear infinite;
  --animate-chkin: chkin 0.4s var(--ease-spring) forwards;

  @keyframes slither {
    from { background-position-x: 0; }
    to { background-position-x: 60px; }
  }
  @keyframes slither-rev {
    from { background-position-x: 0; }
    to { background-position-x: -84px; }
  }
  @keyframes bob {
    0%, 100% { transform: translateY(-1.5px); }
    50% { transform: translateY(1.5px); }
  }
  @keyframes bob2 {
    0%, 100% { transform: translateY(1.5px); }
    50% { transform: translateY(-2px); }
  }
  @keyframes flow {
    from { background-position-x: 0; }
    to { background-position-x: 44px; }
  }
  @keyframes cardrise {
    from { transform: translateY(9px); }
    to { transform: translateY(0); }
  }
  @keyframes popin {
    from { transform: translateY(6px) scale(0.97); }
    to { transform: none; }
  }
  @keyframes wcardin {
    from { transform: translateY(-6px); }
    to { transform: translateY(0); }
  }
  @keyframes wcardflash {
    0% { background-color: var(--color-paper-3); }
    100% { background-color: var(--color-paper-2); }
  }
  @keyframes pulse-dot {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.3; transform: scale(0.6); }
  }
  @keyframes uslither {
    from { background-position-x: 0; }
    to { background-position-x: 11px; }
  }
  @keyframes chkin {
    /* база галочки — индивидуальные свойства rotate/scale (v4-утилиты),
       поэтому анимируем индивидуальный scale, а не transform */
    to { scale: 1; }
  }
}

:root {
  /* Параметры stitch-кольца (Змейка 2). Читаются SnakeBorder через
     getComputedStyle; per-shape gap задаётся инлайн-переменной на svg. */
  --snake-sw: 3px;
  --snake-amp: 4px;
  --snake-wavelen: 13px;
  --snake-gap: 14px;
  /* Геометрия кольца shape="round" опирается на этот сырой радиус. */
  --radius: 20px;

  /* Волнистые SVG-паттерны (data-URI из mono.css) */
  --wave-ink: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='22' height='6' viewBox='0 0 22 6'%3E%3Cpath d='M1 4 C 4 1 7 1 11 4 C 15 7 18 7 21 4' fill='none' stroke='%230c0c0c' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");
  --wave-a: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='16' viewBox='0 0 60 16'%3E%3Cpath d='M0 8 C 10 1 20 1 30 8 C 40 15 50 15 60 8' fill='none' stroke='%23c4c4c4' stroke-width='1.7' stroke-linecap='round'/%3E%3C/svg%3E");
  --wave-b: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='84' height='16' viewBox='0 0 84 16'%3E%3Cpath d='M0 8 C 14 2 28 2 42 8 C 56 14 70 14 84 8' fill='none' stroke='%23dcdcdc' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");
  --wave-load: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='44' height='10' viewBox='0 0 44 10'%3E%3Cpath d='M0 5 C 6 0 11 0 16 5 C 21 10 27 10 32 5 C 35 1.5 38 1.5 44 5' fill='none' stroke='%230c0c0c' stroke-width='1.6' stroke-linecap='round'/%3E%3C/svg%3E");
}

@layer base {
  body {
    margin: 0;
    min-width: 960px;
    min-height: 720px;
    background-color: var(--color-page);
    font-family: var(--font-sans);
    color: var(--color-ink);
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  button,
  input,
  select {
    font: inherit;
  }

  button {
    cursor: pointer;
  }

  ::selection {
    background: var(--color-ink);
    color: var(--color-paper);
  }
}
```

- [ ] **Step 7: Удалить мёртвый `src/App.css` и поправить `index.html`**

```powershell
Remove-Item src/App.css
```

В `index.html` заменить `<html lang="en">` на `<html lang="ru">`.

- [ ] **Step 8: Прогнать тесты и сборку**

Run: `npm test` → Expected: PASS (старые slate-классы — встроенные утилиты Tailwind, они не зависели от styles.css).
Run: `npm run build` → Expected: успешная сборка без ошибок Tailwind.

- [ ] **Step 9: Commit**

```powershell
git add package.json package-lock.json src/main.tsx src/styles.css index.html src/components/wave.tsx src/components/wave.test.tsx
git rm src/App.css
git commit -m "feat: токены «Змейки 2» в @theme, self-hosted IBM Plex, компонент Wave" -m "Tailwind-first порт по спеке 2026-06-10: цвета/радиусы/изинги/кейфреймы из mono.css как @theme-токены, волны как CSS-переменные. Шрифты вшиты через fontsource (variable Sans ради веса 450, кириллица через unicode-range) — десктоп не должен зависеть от сети. App.css удалён как неимпортируемый шаблон Tauri." -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: ResizeObserver-мок и SnakeBorder

**Files:**
- Modify: `src/test/setup.ts`
- Create: `src/components/snake-border.tsx`
- Test: `src/components/snake-border.test.tsx`

- [ ] **Step 1: Добавить мок ResizeObserver в `src/test/setup.ts`**

Заменить весь файл на:

```ts
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
```

- [ ] **Step 2: Написать падающие тесты SnakeBorder**

Create `src/components/snake-border.test.tsx`:

```tsx
import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SnakeBorder } from "./snake-border";

function renderInHost(shape?: "pill" | "round" | "circle") {
  const result = render(
    <button type="button" className="group/snake relative">
      hover me
      <SnakeBorder shape={shape} />
    </button>,
  );
  const host = result.getByRole("button");
  const svg = host.querySelector("svg")!;
  const path = svg.querySelector("path")!;
  return { host, svg, path };
}

describe("SnakeBorder", () => {
  beforeEach(() => {
    vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders a decorative ring with a generated closed path", () => {
    const { svg, path } = renderInHost("round");

    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("data-shape", "round");
    expect(path.getAttribute("d")).toMatch(/^M.+Z$/);
  });

  it("starts the phase animation on hover and stops on leave", () => {
    const { host } = renderInHost();
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();

    fireEvent.mouseEnter(host);
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);

    fireEvent.mouseLeave(host);
    expect(window.cancelAnimationFrame).toHaveBeenCalled();
  });

  it("keeps the ring static under prefers-reduced-motion", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: true } as MediaQueryList),
    );
    const { host, path } = renderInHost();

    fireEvent.mouseEnter(host);

    expect(path.getAttribute("d")).toMatch(/^M.+Z$/);
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Убедиться, что тесты падают**

Run: `npm test -- snake-border`
Expected: FAIL — `Cannot find module './snake-border'`.

- [ ] **Step 4: Создать `src/components/snake-border.tsx`**

Порт референса из `docs/design/snake2-handoff/README.md` § SnakeBorder. Отличия: классы — утилиты Tailwind c group-вариантами; per-shape gap — инлайн CSS-переменная; guard `prefers-reduced-motion`.

```tsx
import { useEffect, useRef, type CSSProperties } from "react";

import { cn } from "@/lib/utils";

type SnakeShape = "pill" | "round" | "circle";

// Отступ кольца от края хоста по форме (stitch.css: pill 14 / round 16 / circle 12).
const GAP_BY_SHAPE: Record<SnakeShape, string> = {
  pill: "14px",
  round: "16px",
  circle: "12px",
};

/**
 * «Строчка-кольцо» (Змейка 2): плотная замкнутая волнистая линия, которая
 * проявляется снаружи элемента при hover/focus и кружит по периметру.
 * Хост обязан иметь классы `group/snake relative` и видимый overflow.
 */
export function SnakeBorder({ shape = "pill" }: { shape?: SnakeShape }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const raf = useRef(0);
  const phase = useRef(Math.random() * 6.28);

  useEffect(() => {
    const svg = svgRef.current;
    const path = pathRef.current;
    const host = svg?.parentElement;
    if (!svg || !path || !host) return;

    let base: [number, number][] = [];
    let cum: number[] = [];
    let amp = 4;
    let K = 0;

    const num = (el: Element, prop: string, fb: number) => {
      const v = parseFloat(getComputedStyle(el).getPropertyValue(prop));
      return isNaN(v) ? fb : v;
    };

    function measure() {
      if (!svg || !host) return;
      const root = document.documentElement;
      const gap = num(svg, "--snake-gap", 7);
      const sw = num(root, "--snake-sw", 3);
      amp = num(root, "--snake-amp", 4);
      const r = host.getBoundingClientRect();
      const W = Math.round(r.width) + gap * 2;
      const H = Math.round(r.height) + gap * 2;
      const rad = shape === "round" ? num(root, "--radius", 20) + gap : Math.min(W, H) / 2;
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      svg.setAttribute("width", String(W));
      svg.setAttribute("height", String(H));

      const inset = sw / 2 + amp + 0.5;
      const x0 = inset, y0 = inset, x1 = W - inset, y1 = H - inset;
      const rr = Math.max(0, Math.min(rad, Math.min(x1 - x0, y1 - y0) / 2));
      const step = 5;
      const pts: [number, number][] = [];
      const line = (ax: number, ay: number, bx: number, by: number) => {
        const len = Math.hypot(bx - ax, by - ay);
        const n = Math.max(1, Math.ceil(len / step));
        for (let i = 0; i < n; i++) pts.push([ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n]);
      };
      const arc = (cx: number, cy: number, a0: number, a1: number) => {
        const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * rr) / step));
        for (let i = 0; i < n; i++) {
          const a = a0 + ((a1 - a0) * i) / n;
          pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
        }
      };
      line(x0 + rr, y0, x1 - rr, y0);
      arc(x1 - rr, y0 + rr, -Math.PI / 2, 0);
      line(x1, y0 + rr, x1, y1 - rr);
      arc(x1 - rr, y1 - rr, 0, Math.PI / 2);
      line(x1 - rr, y1, x0 + rr, y1);
      arc(x0 + rr, y1 - rr, Math.PI / 2, Math.PI);
      line(x0, y1 - rr, x0, y0 + rr);
      arc(x0 + rr, y0 + rr, Math.PI, Math.PI * 1.5);
      base = pts;

      cum = [0];
      for (let i = 1; i < base.length; i++)
        cum[i] = cum[i - 1] + Math.hypot(base[i][0] - base[i - 1][0], base[i][1] - base[i - 1][1]);
      const seg = Math.hypot(base[0][0] - base.at(-1)![0], base[0][1] - base.at(-1)![1]);
      const total = cum[cum.length - 1] + seg;
      const wl = num(document.documentElement, "--snake-wavelen", 40);
      const waves = Math.max(4, Math.round(total / wl));
      K = (waves * 2 * Math.PI) / total;
    }

    function build(ph: number) {
      const n = base.length;
      const P: [number, number][] = new Array(n);
      for (let i = 0; i < n; i++) {
        const p = base[i];
        const a = base[(i - 1 + n) % n];
        const b = base[(i + 1) % n];
        let tx = b[0] - a[0], ty = b[1] - a[1];
        const tl = Math.hypot(tx, ty) || 1;
        tx /= tl; ty /= tl;
        const off = amp * Math.sin(K * cum[i] + ph);
        P[i] = [p[0] - ty * off, p[1] + tx * off];
      }
      const mid = (u: number[], v: number[]) => [(u[0] + v[0]) / 2, (u[1] + v[1]) / 2];
      const m0 = mid(P[n - 1], P[0]);
      let d = `M${m0[0].toFixed(1)} ${m0[1].toFixed(1)}`;
      for (let i = 0; i < n; i++) {
        const cur = P[i], nx = P[(i + 1) % n];
        const m = mid(cur, nx);
        d += ` Q${cur[0].toFixed(1)} ${cur[1].toFixed(1)} ${m[0].toFixed(1)} ${m[1].toFixed(1)}`;
      }
      return d + "Z";
    }

    const draw = () => path.setAttribute("d", build(phase.current));
    const reducedMotion = () =>
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let running = false;
    const loop = () => { phase.current += 0.1; draw(); raf.current = requestAnimationFrame(loop); };
    const start = () => {
      if (running) return;
      measure();
      draw();
      if (reducedMotion()) return; // статичное кольцо без вращения
      running = true;
      raf.current = requestAnimationFrame(loop);
    };
    const stop = () => { running = false; cancelAnimationFrame(raf.current); };

    measure();
    draw();
    host.addEventListener("mouseenter", start);
    host.addEventListener("mouseleave", stop);
    host.addEventListener("focusin", start);
    host.addEventListener("focusout", stop);
    const ro = new ResizeObserver(() => { measure(); if (!running) draw(); });
    ro.observe(host);

    return () => {
      stop();
      ro.disconnect();
      host.removeEventListener("mouseenter", start);
      host.removeEventListener("mouseleave", stop);
      host.removeEventListener("focusin", start);
      host.removeEventListener("focusout", stop);
    };
  }, [shape]);

  return (
    <svg
      ref={svgRef}
      data-shape={shape}
      aria-hidden="true"
      preserveAspectRatio="none"
      style={{ "--snake-gap": GAP_BY_SHAPE[shape] } as CSSProperties}
      className={cn(
        "pointer-events-none absolute -left-(--snake-gap) -top-(--snake-gap) z-[6] overflow-visible",
        "scale-[0.96] opacity-0 [transition:opacity_0.2s_var(--ease-soft),transform_0.4s_var(--ease-spring)]",
        "group-hover/snake:scale-100 group-hover/snake:opacity-100",
        "group-focus-visible/snake:scale-100 group-focus-visible/snake:opacity-100",
      )}
    >
      <path
        ref={pathRef}
        pathLength={100}
        vectorEffect="non-scaling-stroke"
        className="fill-none stroke-ink [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:var(--snake-sw)]"
      />
    </svg>
  );
}
```

- [ ] **Step 5: Прогнать тесты**

Run: `npm test -- snake-border` → Expected: PASS (3 теста).
Run: `npm test` → Expected: PASS (мок ResizeObserver ничего не ломает).

- [ ] **Step 6: Commit**

```powershell
git add src/test/setup.ts src/components/snake-border.tsx src/components/snake-border.test.tsx
git commit -m "feat: компонент SnakeBorder — stitch-кольцо «Змейки 2»" -m "Порт референса из дизайн-хендоффа: синусоидное кольцо по периметру хоста, rAF только при hover/focus, ResizeObserver для перемера. Стили — утилитами через group/snake, per-shape gap — инлайн-переменной. prefers-reduced-motion оставляет кольцо статичным. В setup тестов добавлен стаб ResizeObserver: jsdom его не реализует." -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Русификация всех видимых текстов

**Files:**
- Modify: `src/App.test.tsx` (ассерты — первыми)
- Modify: `src/components/player-controls.test.tsx`
- Modify: `src/components/subtitle-overlay.test.tsx:74`
- Modify: `src/App.tsx` (константы ошибок, лейблы, aria-атрибуты)
- Modify: `src/components/player-controls.tsx` (aria-лейблы)
- Modify: `src/components/subtitle-overlay.tsx:78`

Замечание: aria-label `VK Video URL` и title iframe `VK Video player` НЕ меняются — «VK Video» это имя продукта, и прототип сам использует `aria-label="VK Video URL"` (`docs/design/snake2-handoff/files/app-snake2.jsx:195`).

- [ ] **Step 1: Обновить ассерты тестов (тест-первым)**

```powershell
$f = "src/App.test.tsx"
$c = Get-Content $f -Raw
$c = $c -replace 'name: "Load" \}', 'name: /Загрузить/ }'
$c = $c -replace 'name: "Loading\.\.\." \}', 'name: /Загрузка/ }'
$c = $c -replace '← К списку', '← Назад'
$c = $c -replace 'name: "Subtitles" \}', 'name: "Субтитры" }'
$c = $c -replace 'Word details: ', 'Слово: '
$c = $c -replace 'Subtitles were not found for this video\.', 'Субтитры для этого видео не найдены.'
$c = $c -replace 'Subtitles could not be parsed for this video\.', 'Не удалось разобрать субтитры этого видео.'
$c = $c -replace 'Subtitles could not be parsed for this track\.', 'Не удалось разобрать субтитры этой дорожки.'
$c = $c -replace 'This subtitle track is no longer available\.', 'Эта дорожка субтитров больше недоступна.'
$c = $c -replace 'name: "Fullscreen" \}', 'name: "Полный экран" }'
$c = $c -replace 'name: "Exit fullscreen" \}', 'name: "Выйти из полноэкранного режима" }'
$c = $c -replace 'name: "VK controls \(speed, quality\)" \}', 'name: "Настройки VK (скорость, качество)" }'
$c = $c -replace 'name: "Back to clean controls" \}', 'name: "Вернуться к своим контролам" }'
$c = $c -replace 'name: "Play" \}', 'name: "Воспроизвести" }'
$c = $c -replace 'name: "Pause" \}', 'name: "Пауза" }'
$c = $c -replace 'ru_auto\.vtt auto', 'ru_auto.vtt (авто)'
Set-Content $f $c -NoNewline

$f = "src/components/player-controls.test.tsx"
$c = Get-Content $f -Raw
$c = $c -replace 'name: "Play" \}', 'name: "Воспроизвести" }'
$c = $c -replace 'name: "Pause" \}', 'name: "Пауза" }'
$c = $c -replace 'name: "Seek" \}', 'name: "Перемотка" }'
$c = $c -replace 'name: "Unmute" \}', 'name: "Включить звук" }'
Set-Content $f $c -NoNewline

$f = "src/components/subtitle-overlay.test.tsx"
$c = Get-Content $f -Raw
$c = $c -replace 'Word details: ', 'Слово: '
Set-Content $f $c -NoNewline
```

- [ ] **Step 2: Добавить тест на непокрытый код ошибки (invalid-link)**

Коды `subtitles-not-found` и parse-ошибки уже покрыты существующими тестами (теперь с русскими текстами); `invalid-link` не покрыт ни одним. В `src/App.test.tsx`, рядом с тестом `maps plain string backend errors to a user-facing message` (~строка 733), добавить по тому же паттерну:

```tsx
it("shows the Russian invalid-link error", async () => {
  const user = userEvent.setup();
  mocks.invoke.mockImplementation((command: string) => {
    if (command === "list_saved_words") return Promise.resolve([]);
    if (command === "list_recent_videos") return Promise.resolve([]);
    return Promise.reject(
      JSON.stringify({
        kind: "invalid-link",
        message: "invalid-link",
      }),
    );
  });

  render(<App />);

  await user.type(screen.getByLabelText("VK Video URL"), "https://example.com/not-vk");
  await user.click(screen.getByRole("button", { name: /Загрузить/ }));

  expect(
    await screen.findByText("Это не похоже на публичную ссылку VK Video."),
  ).toBeInTheDocument();
});
```

- [ ] **Step 3: Убедиться, что тесты падают**

Run: `npm test`
Expected: FAIL — десятки падений в `App.test.tsx`, `player-controls.test.tsx`, `subtitle-overlay.test.tsx` (не находятся кнопки «Загрузить», «Воспроизвести» и русские тексты ошибок, включая новый тест invalid-link).

- [ ] **Step 4: Русифицировать `src/App.tsx`**

Заменить блок констант (строки 27–40):

```ts
const LOAD_ERROR_MESSAGES: Record<string, string> = {
  "invalid-link": "Это не похоже на публичную ссылку VK Video.",
  "video-unavailable": "Видео недоступно без входа в VK или не может быть открыто.",
  "subtitles-not-found": "Субтитры для этого видео не найдены.",
  "subtitle-fetch-failed": "Не удалось скачать файл субтитров.",
  "subtitle-parse-failed": "Не удалось разобрать субтитры этого видео.",
};

const UNKNOWN_LOAD_ERROR = "Не удалось загрузить видео.";
const SUBTITLE_PARSE_ERROR = "Не удалось разобрать субтитры этого видео.";
const TRACK_PARSE_ERROR = "Не удалось разобрать субтитры этой дорожки.";
```

(`SAVE_WORD_ERROR`, `REMOVE_WORD_ERROR`, `SECONDARY_TRACK_ERROR` уже русские — не трогать.)

В `mapTrackLoadError` (строки ~1032–1045) заменить возвращаемые строки:

```ts
function mapTrackLoadError(error: unknown): string {
  const code = extractErrorCode(error);

  switch (code) {
    case "subtitles-not-found":
      return "Эта дорожка субтитров больше недоступна.";
    case "subtitle-fetch-failed":
      return "Не удалось скачать файл субтитров.";
    case "subtitle-parse-failed":
      return TRACK_PARSE_ERROR;
    default:
      return "Не удалось загрузить дорожку субтитров.";
  }
}
```

Точечные замены в JSX (через Edit, по одной):
- строка ~796: `placeholder="https://vkvideo.ru/video-..."` → `placeholder="вставь ссылку vkvideo.ru/video…"`
- строка ~802: `{isLoading ? "Loading..." : "Load"}` → `{isLoading ? "Загрузка" : "Загрузить"}`
- строка ~827: `← К списку` → `← Назад`
- строка ~753: `aria-label="Subtitles"` → `aria-label="Субтитры"`
- строка ~857: `aria-label="Play/pause video"` → `aria-label="Воспроизведение или пауза"`
- строки ~923–932 (оба aria-label и title кнопки VK-режима):

```tsx
aria-label={
  playerMode === "vk"
    ? "Вернуться к своим контролам"
    : "Настройки VK (скорость, качество)"
}
title={
  playerMode === "vk"
    ? "Вернуться к своим контролам"
    : "Настройки VK (скорость, качество)"
}
```

- строки ~944–945: `aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}` → `aria-label={isFullscreen ? "Выйти из полноэкранного режима" : "Полный экран"}`, и так же `title`.

В `formatTrackLabel` (строка ~976): `` return track.isAuto ? `${label} auto` : label; `` → `` return track.isAuto ? `${label} (авто)` : label; ``

- [ ] **Step 5: Русифицировать `src/components/player-controls.tsx`**

- строка 35: `aria-label={isPlaying ? "Pause" : "Play"}` → `aria-label={isPlaying ? "Пауза" : "Воспроизвести"}`
- строка 48: `aria-label="Seek"` → `aria-label="Перемотка"`
- строка 58: `aria-label={muted ? "Unmute" : "Mute"}` → `aria-label={muted ? "Включить звук" : "Выключить звук"}`
- строка 67: `aria-label="Volume"` → `aria-label="Громкость"`

- [ ] **Step 6: Русифицировать `src/components/subtitle-overlay.tsx`**

- строка 78: ``aria-label={`Word details: ${fallbackWord}`}`` → ``aria-label={`Слово: ${fallbackWord}`}``

- [ ] **Step 7: Прогнать тесты**

Run: `npm test`
Expected: PASS — все тесты зелёные.

- [ ] **Step 8: Commit**

```powershell
git add src/App.tsx src/App.test.tsx src/components/player-controls.tsx src/components/player-controls.test.tsx src/components/subtitle-overlay.tsx src/components/subtitle-overlay.test.tsx
git commit -m "feat: русификация всех видимых текстов и aria-лейблов" -m "Дизайн «Змейки 2» подразумевает целиком русский интерфейс; переведены кнопка загрузки, ошибки загрузки видео и дорожек, aria-лейблы плеера, суффикс auto у дорожек. aria-label «VK Video URL» и title iframe сохранены: это имя продукта, и прототип использует такой же лейбл. Тестовые имена кнопок «Загрузить»/«Загрузка» — регэкспами, чтобы пережить добавление стрелки в кнопку при рестайле." -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Оболочка: карточка-окно, мастхед, URL-бар, лоадер, блок ошибки

**Files:**
- Modify: `src/App.tsx` (импорты + внешний каркас return)
- Delete: `src/components/ui/input.tsx`, `src/components/ui/alert.tsx`

- [ ] **Step 1: Обновить импорты в `src/App.tsx`**

Удалить строки:

```tsx
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
```

Добавить:

```tsx
import { SnakeBorder } from "@/components/snake-border";
import { Wave } from "@/components/wave";
```

- [ ] **Step 2: Заменить внешний каркас return**

Текущий return начинается с `<main className="min-h-screen bg-slate-950 p-6 text-slate-100">`, содержит `<form className="mx-auto flex max-w-7xl gap-2"...>` и `<section className="mx-auto mt-6 max-w-7xl">`. Заменить всю обёртку (форму, блок ошибки и секцию) на следующий каркас. Блоки `{!video || !lane ? (<RecentVideosList .../>) : null}` и `{video && lane ? (...) : null}` оставить с их ТЕКУЩИМ содержимым, перенеся внутрь нового каркаса:

```tsx
return (
  <main className="flex min-h-screen p-8">
    <div className="m-auto flex w-full max-w-[1140px] flex-col overflow-hidden rounded-card-lg bg-paper shadow-[0_1px_0_rgba(0,0,0,0.04),0_40px_90px_-40px_rgba(0,0,0,0.32)]">
      <div className="relative min-h-[640px] pb-[34px]">
        {/* мастхед: в этой версии дизайна — только волна */}
        <header className="px-9 pt-[34px] pb-2">
          <Wave className="mt-[18px] h-[18px]" />
        </header>

        <form
          className="mx-9 mt-[22px] flex items-center gap-2 rounded-full border-[1.5px] border-line-2 bg-paper py-1.5 pr-1.5 pl-[22px] [transition:border-color_0.2s_var(--ease-soft),box-shadow_0.2s_var(--ease-soft)] focus-within:border-ink focus-within:shadow-[0_0_0_4px_rgba(12,12,12,0.05)]"
          onSubmit={handleSubmit}
        >
          <input
            aria-label="VK Video URL"
            placeholder="вставь ссылку vkvideo.ru/video…"
            value={url}
            disabled={isLoading}
            onChange={(event) => setUrl(event.target.value)}
            className="min-w-0 flex-1 border-0 bg-transparent py-2.5 text-[15px] tracking-[-0.01em] text-ink outline-none placeholder:text-ink-3"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="group/snake relative flex h-11 items-center gap-[9px] rounded-full bg-ink px-6 text-sm font-medium tracking-[0.01em] whitespace-nowrap text-paper transition-transform duration-400 ease-spring active:scale-[0.97] disabled:cursor-progress disabled:opacity-45"
          >
            {isLoading ? "Загрузка" : "Загрузить"}
            <span
              aria-hidden="true"
              className="inline-block transition-transform duration-500 ease-spring group-hover/snake:translate-x-[5px]"
            >
              →
            </span>
            <SnakeBorder shape="pill" />
          </button>
        </form>

        {isLoading ? (
          <div data-testid="load-wave" className="mx-9 mt-4 h-3.5 overflow-hidden">
            <div className="h-full w-full animate-flow bg-(image:--wave-load) bg-position-[0px_50%] bg-size-[44px_10px] bg-repeat-x motion-reduce:animate-none" />
          </div>
        ) : null}

        {error ? (
          <div role="alert" className="mx-9 mt-4 rounded-card bg-paper-2 px-5 py-3 text-sm text-ink-2">
            {error}
          </div>
        ) : null}

        {!video || !lane ? (
          <RecentVideosList
            videos={recentVideos}
            isLoading={areRecentVideosLoading}
            isUnavailable={recentVideosUnavailable}
            error={recentVideosError}
            onSelect={handleSelectRecentVideo}
            onRemove={handleRemoveRecentVideo}
          />
        ) : null}

        {video && lane ? (
          <>{/* сюда переносится ТЕКУЩИЙ блок плеера из старого return дословно,
                включая кнопку «← Назад», грид, player-container, SavedWordsPanel.
                Его рестайл — отдельная Task 6; в этой задаче он не меняется. */}</>
        ) : null}
      </div>
    </div>
  </main>
);
```

Примечания:
- `m-auto` на карточке вместо `items-center` на flex-родителе: центрирует и по вертикали, но не клипует верх, когда карточка выше вьюпорта.
- Стрелка кнопки — `aria-hidden`, accessible name остаётся «Загрузить»/«Загрузка» (тестовые регэкспы Task 3 это уже учитывают).
- Старая обёртка `<section className="mx-auto mt-6 max-w-7xl">` удаляется; `RecentVideosList` и блок плеера становятся прямыми детьми каркаса.

- [ ] **Step 3: Удалить осиротевшие ui-примитивы**

```powershell
git rm src/components/ui/input.tsx src/components/ui/alert.tsx
```

Проверить, что на них больше нет ссылок:

```powershell
Get-ChildItem src -Recurse -Include *.tsx,*.ts | Select-String -Pattern 'ui/input|ui/alert'
```

Expected: пусто.

- [ ] **Step 4: Прогнать тесты**

Run: `npm test`
Expected: PASS. Тесты ищут кнопку по `/Загрузить/`, инпут по `VK Video URL`, ошибки по тексту — всё это сохранено.

- [ ] **Step 5: Commit**

```powershell
git add src/App.tsx
git commit -m "feat: оболочка «Змейки 2» — карточка-окно, мастхед-волна, пилюля URL-бара" -m "Белая карточка-окно (1140px, r-lg, мягкая тень) на сером фоне страницы, без декоративного титлбара — решение из спеки. Кнопка «Загрузить →» со snake-кольцом и сдвигом стрелки, волнистый лоадер на время загрузки, ошибки — спокойным блоком на paper-2 вместо алой плашки. shadcn Input/Alert/Button заменены обычными элементами с утилитами, input и alert удалены как неиспользуемые." -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Сетка «Недавние»

**Files:**
- Rewrite: `src/components/recent-videos-list.tsx`
- Test: `src/components/recent-videos-list.test.tsx` (существующий — должен пройти без правок)

- [ ] **Step 1: Переписать `src/components/recent-videos-list.tsx`**

```tsx
import { useState } from "react";
import { X } from "lucide-react";

import { SnakeBorder } from "@/components/snake-border";
import { Wave } from "@/components/wave";
import { formatRelativeDate } from "@/lib/recent-videos/format-relative-date";
import type { RecentVideo } from "@/lib/recent-videos/types";

type RecentVideosListProps = {
  videos: RecentVideo[];
  isLoading?: boolean;
  isUnavailable?: boolean;
  error?: string;
  onSelect: (video: RecentVideo) => void;
  onRemove: (video: RecentVideo) => void;
};

export function RecentVideosList({
  videos,
  isLoading,
  isUnavailable,
  error,
  onSelect,
  onRemove,
}: RecentVideosListProps) {
  return (
    <section aria-label="Недавние видео">
      <div className="px-9 pt-[30px]">
        <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-ink">Недавние</h2>
        <Wave className="mt-3 h-3" />
      </div>

      <div className="px-9 pt-[18px]">
        {error ? <div className="mb-3 text-xs text-ink-2">{error}</div> : null}

        {isUnavailable ? (
          <div className="py-14 text-center text-sm text-ink-3">История недоступна</div>
        ) : isLoading ? (
          <div className="py-14 text-center text-sm text-ink-3">Загружаю историю...</div>
        ) : videos.length === 0 ? (
          <div className="py-14 text-center text-sm text-ink-3">История пуста</div>
        ) : (
          <ul className="grid grid-cols-3 gap-[18px]">
            {videos.map((video, index) => {
              const title = video.title?.trim() || `video${video.ownerId}_${video.videoId}`;

              return (
                <li key={video.id} className="group/card relative">
                  <button
                    type="button"
                    onClick={() => onSelect(video)}
                    aria-label={title}
                    style={{ animationDelay: `${index * 0.06}s` }}
                    className="group/snake relative block w-full animate-cardrise rounded-card bg-paper text-left [transition:translate_0.35s_var(--ease-spring),box-shadow_0.35s_var(--ease-soft)] hover:-translate-y-1 hover:shadow-[0_22px_40px_-24px_rgba(0,0,0,0.4)] motion-reduce:animate-none"
                  >
                    <span className="relative block aspect-video overflow-hidden rounded-card bg-[radial-gradient(130%_130%_at_50%_30%,#1c1c1c_0%,#0a0a0a_80%)]">
                      <RecentThumbnail url={video.thumbnailUrl} />
                      <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 ease-soft group-hover/card:opacity-100">
                        <span className="relative block h-[46px] w-[46px] scale-[0.7] rounded-full bg-paper transition-transform duration-[450ms] ease-spring after:absolute after:top-1/2 after:left-[54%] after:h-0 after:w-0 after:-translate-x-1/2 after:-translate-y-1/2 after:border-y-8 after:border-l-[13px] after:border-y-transparent after:border-l-ink after:content-[''] group-hover/card:scale-100" />
                      </span>
                    </span>
                    <span className="block px-1 pt-[13px] pb-1">
                      <span className="mb-[5px] line-clamp-2 block text-[14.5px] leading-[1.3] font-medium tracking-[-0.01em] break-words text-ink">
                        {title}
                      </span>
                      <span className="block text-[12.5px] text-ink-3">
                        {formatRelativeDate(video.lastWatchedAtMs, Date.now())}
                      </span>
                    </span>
                    <SnakeBorder shape="round" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(video)}
                    aria-label={`Удалить из истории: ${title}`}
                    className="absolute top-2.5 right-2.5 z-[2] flex h-[26px] w-[26px] scale-[0.8] items-center justify-center rounded-full bg-white/92 text-ink opacity-0 [transition:opacity_0.2s,scale_0.3s_var(--ease-spring),background-color_0.15s,color_0.15s] group-hover/card:scale-100 group-hover/card:opacity-100 hover:bg-ink hover:text-paper focus-visible:scale-100 focus-visible:opacity-100"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function RecentThumbnail({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false);

  if (!url || failed) {
    // Тёмный градиентный «колодец» уже нарисован на родителе —
    // плейсхолдер лишь резервирует слой.
    return (
      <span
        data-testid="recent-thumb-placeholder"
        className="absolute inset-0 block"
        aria-hidden="true"
      />
    );
  }

  return (
    <img
      data-testid="recent-thumb"
      src={url}
      alt=""
      onError={() => setFailed(true)}
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
}
```

Что сохранено намеренно: aria-лейблы, data-testid, структура «кнопка-карточка + соседняя кнопка ×» (вложенные кнопки прототипа — плохая a11y), реальные превью (градиент — только подложка/плейсхолдер), без бейджа длительности (мы её не храним).

- [ ] **Step 2: Прогнать тесты**

Run: `npm test -- recent-videos-list`
Expected: PASS — все 7 существующих тестов без правок.

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Commit**

```powershell
git add src/components/recent-videos-list.tsx
git commit -m "feat: сетка «Недавние» в стиле «Змейки 2»" -m "Три фиксированные колонки, карточки со скруглением 20px, входом cardrise со стаггером, подъёмом и play-чипом на ховере, «×» по ховеру, snake-кольцо формы round. Реальные превью сохранены, тёмный градиент прототипа — подложка и плейсхолдер; бейджа длительности нет — длительность не хранится. Кнопка удаления оставлена соседом карточки, а не вложенной, ради валидной a11y-структуры." -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Экран плеера: «Назад», сетка, колодец, угловые кнопки, индикатор воспроизведения

**Files:**
- Modify: `src/App.tsx` (блок `{video && lane ? ... : null}`)
- Test: `src/App.test.tsx` (новый тест в describe `App player chrome`)

- [ ] **Step 1: Написать падающий тест индикатора**

В `src/App.test.tsx`, в describe `App player chrome` (после теста `renders the auto-hide chrome wrappers visible by default`, ~строка 1936) добавить:

```tsx
it("shows the playing indicator only while playing and chrome is visible", async () => {
  render(<App />);
  await loadAndPlay();

  expect(screen.queryByTestId("playing-indicator")).not.toBeInTheDocument();

  act(() => {
    mocks.playerProps.current?.onPlayingChange?.(true);
  });

  expect(screen.getByTestId("playing-indicator").className).toContain("opacity-100");
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npm test -- App`
Expected: FAIL — `Unable to find an element by: [data-testid="playing-indicator"]` во второй части теста.

- [ ] **Step 3: Заменить блок плеера в `src/App.tsx`**

Заменить весь `{video && lane ? (<>...</>) : null}` (кнопка «← Назад», грид, контейнер плеера, угловые кнопки, панель) на:

```tsx
{video && lane ? (
  <div className="px-9 pt-[18px]">
    <div className="mb-4 flex items-center gap-3">
      <button
        type="button"
        onClick={handleBackToList}
        className="group/snake relative flex items-center gap-[9px] rounded-full border-[1.5px] border-line-2 bg-paper px-4 py-2 text-[13px] font-medium text-ink transition-colors duration-200 hover:border-ink"
      >
        <span
          aria-hidden="true"
          className="inline-block transition-transform duration-[450ms] ease-spring group-hover/snake:-translate-x-1"
        >
          ←
        </span>
        Назад
        <SnakeBorder shape="pill" />
      </button>
      {video.title ? (
        <span className="ml-auto min-w-0 truncate text-[13px] font-medium text-ink-2">{video.title}</span>
      ) : null}
    </div>

    <div className="grid grid-cols-[minmax(0,1fr)_280px] items-start gap-[18px]">
      <div
        ref={setPlayerContainer}
        data-testid="player-container"
        onPointerMove={revealControls}
        className={cn(
          "relative aspect-video overflow-hidden bg-well",
          isFullscreen ? "" : "rounded-card-lg",
          !controlsVisible && "cursor-none",
        )}
      >
        <VideoPlayer
          embedUrl={video.embedUrl}
          onTimeUpdate={handleTimeUpdate}
          onDurationChange={handleDurationChange}
          onPlayingChange={handlePlayingChange}
          onVolumeChange={handleVolumeChange}
          onAdChange={handleAdChange}
          onPlaybackStart={handlePlaybackStart}
          onControlsReady={handlePlayerControlsReady}
          blockInput={blockInput}
        />

        {showCustomUi ? (
          <button
            type="button"
            tabIndex={-1}
            aria-label="Воспроизведение или пауза"
            data-testid="player-click-surface"
            onClick={handlePlayPause}
            className={cn(
              "absolute inset-0 h-full w-full bg-transparent",
              controlsVisible ? "cursor-pointer" : "cursor-none",
            )}
          />
        ) : null}

        {isPlaying && showCustomUi ? (
          <div
            data-testid="playing-indicator"
            className={cn(
              "pointer-events-none absolute top-[15px] left-4 z-[6] flex items-center gap-2 font-mono text-[10px] tracking-[0.12em] text-white/75 transition-opacity duration-300",
              controlsVisible ? "opacity-100" : "opacity-0",
            )}
          >
            <span className="h-[7px] w-[7px] animate-pulse-dot rounded-full bg-white motion-reduce:animate-none" />
            ВОСПРОИЗВЕДЕНИЕ
          </div>
        ) : null}

        {showCustomUi ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-[76px] z-[5] flex flex-col items-center gap-[9px] px-[26px]">
            <SubtitleOverlay
              lane={lane}
              timeMs={effectiveTimeMs}
              wordLookup={wordLookup}
              onWordInspect={handleSubtitleWordInspect}
              onWordInspectEnd={handleSubtitleWordInspectEnd}
              getWordSaveControl={getWordSaveControl}
              popoverContainer={isFullscreen ? playerContainer : undefined}
            />
            {secondaryLane ? (
              <div data-testid="secondary-subtitle-slot" className="flex min-h-10 w-full justify-center">
                <SubtitleReferenceLine lane={secondaryLane} primaryCue={primaryCue} />
              </div>
            ) : null}
          </div>
        ) : null}

        {showCustomUi ? (
          <div
            data-testid="player-control-bar"
            className={cn(
              "absolute inset-x-3.5 bottom-3.5 z-[7] [transition:translate_0.35s_var(--ease-soft),opacity_0.3s_var(--ease-soft)]",
              controlsVisible ? "opacity-100" : "pointer-events-none translate-y-[140%] opacity-0",
            )}
          >
            <PlayerControls
              isPlaying={isPlaying}
              currentTimeMs={currentTimeMs}
              durationMs={durationMs}
              volume={volume}
              muted={muted}
              onPlayPause={handlePlayPause}
              onSeek={handleSeek}
              onSetVolume={handleSetVolume}
              onToggleMute={handleToggleMute}
              trailing={subtitlesMenu}
            />
          </div>
        ) : null}

        {!isAd ? (
          <div
            data-testid="player-corner-controls"
            className={cn(
              "absolute top-3.5 right-3.5 z-[7] flex gap-2 transition-opacity duration-300",
              controlsVisible ? "opacity-100" : "pointer-events-none opacity-0",
            )}
          >
            <button
              type="button"
              onClick={toggleVkMode}
              aria-label={
                playerMode === "vk"
                  ? "Вернуться к своим контролам"
                  : "Настройки VK (скорость, качество)"
              }
              title={
                playerMode === "vk"
                  ? "Вернуться к своим контролам"
                  : "Настройки VK (скорость, качество)"
              }
              className="group/snake relative flex h-9 w-9 items-center justify-center rounded-full bg-white/94 text-ink [transition:background-color_0.18s_var(--ease-soft),color_0.18s,scale_0.3s_var(--ease-spring)] hover:bg-ink hover:text-paper active:scale-90"
            >
              {playerMode === "vk" ? (
                <X className="h-[18px] w-[18px]" aria-hidden="true" />
              ) : (
                <Settings className="h-[18px] w-[18px]" aria-hidden="true" />
              )}
              <SnakeBorder shape="circle" />
            </button>
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? "Выйти из полноэкранного режима" : "Полный экран"}
              title={isFullscreen ? "Выйти из полноэкранного режима" : "Полный экран"}
              className="group/snake relative flex h-9 w-9 items-center justify-center rounded-full bg-white/94 text-ink [transition:background-color_0.18s_var(--ease-soft),color_0.18s,scale_0.3s_var(--ease-spring)] hover:bg-ink hover:text-paper active:scale-90"
            >
              {isFullscreen ? (
                <Minimize2 className="h-[18px] w-[18px]" aria-hidden="true" />
              ) : (
                <Maximize2 className="h-[18px] w-[18px]" aria-hidden="true" />
              )}
              <SnakeBorder shape="circle" />
            </button>
          </div>
        ) : null}
      </div>

      <SavedWordsPanel
        words={savedWords}
        isLoading={areSavedWordsLoading}
        isUnavailable={savedWordsUnavailable}
        pendingWordIds={savedWords
          .filter((word) => pendingSavedWordActions[savedWordKey(word.language, word.normalizedWord)] === "removing")
          .map((word) => word.id)}
        error={savedWordsPanelError}
        onRemove={handleRemoveSavedWord}
      />
    </div>
  </div>
) : null}
```

Сознательные отступления (см. спеку § Deviations): VK-режим без оверлея (iframe должен быть кликабельным), настоящий fullscreen, индикатор «ВОСПРОИЗВЕДЕНИЕ» привязан к видимости контролов.

- [ ] **Step 4: Прогнать тесты**

Run: `npm test`
Expected: PASS, включая новый тест индикатора и старые ассерты `opacity-100` на обёртках (`player-control-bar`, `player-corner-controls`).

- [ ] **Step 5: Commit**

```powershell
git add src/App.tsx src/App.test.tsx
git commit -m "feat: экран плеера «Змейки 2» — «Назад», колодец, угловые кнопки, индикатор" -m "Контурная пилюля «← Назад» со snake-кольцом и заголовком текущего видео, сетка 1fr/280px, тёмный колодец r-lg без рамки, белые круглые угловые кнопки (snake circle), контролбар уезжает вниз при автоскрытии. Индикатор «ВОСПРОИЗВЕДЕНИЕ» показывается только при видимых контролах — постоянный пульс поверх настоящего фильма был бы шумом (отступление зафиксировано в спеке). Оверлей «РЕЖИМ VK» из прототипа не перенесён: он закрывал бы само меню VK." -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Контролбар: плавающая пилюля и нативные range-инпуты

**Files:**
- Rewrite: `src/components/player-controls.tsx`
- Modify: `src/styles.css` (добавить блок `.range-ink` в конец)
- Test: `src/components/player-controls.test.tsx` (существующий — должен пройти без правок)

- [ ] **Step 1: Добавить стили range-инпутов в конец `src/styles.css`**

```css
/* Нативные range-инпуты контролбара: тонкий трек + круглая ручка.
   Псевдоэлементы трека нельзя выразить утилитами; заполнение слева от
   ручки передаётся инлайн-переменной --range-fill. */
.range-ink {
  -webkit-appearance: none;
  appearance: none;
  height: 16px;
  background: transparent;
  cursor: pointer;
}
.range-ink:focus-visible {
  outline: 2px solid var(--color-ink);
  outline-offset: 2px;
  border-radius: 999px;
}
.range-ink::-webkit-slider-runnable-track {
  height: 3px;
  border-radius: 3px;
  background:
    linear-gradient(var(--color-ink), var(--color-ink)) 0 0 / var(--range-fill, 0%) 100% no-repeat,
    var(--color-line-2);
}
.range-ink::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 13px;
  height: 13px;
  margin-top: -5px;
  border-radius: 50%;
  background: var(--color-ink);
  transition: transform 0.2s var(--ease-spring);
}
.range-ink:hover::-webkit-slider-thumb {
  transform: scale(1.25);
}
.range-ink::-moz-range-track {
  height: 3px;
  border-radius: 3px;
  background: var(--color-line-2);
}
.range-ink::-moz-range-progress {
  height: 3px;
  border-radius: 3px;
  background: var(--color-ink);
}
.range-ink::-moz-range-thumb {
  width: 13px;
  height: 13px;
  border: 0;
  border-radius: 50%;
  background: var(--color-ink);
  transition: transform 0.2s var(--ease-spring);
}
.range-ink:hover::-moz-range-thumb {
  transform: scale(1.25);
}
```

- [ ] **Step 2: Переписать `src/components/player-controls.tsx`**

```tsx
import type { CSSProperties, ReactNode } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";

type PlayerControlsProps = {
  isPlaying: boolean;
  currentTimeMs: number;
  durationMs: number;
  volume: number;
  muted: boolean;
  onPlayPause: () => void;
  onSeek: (timeMs: number) => void;
  onSetVolume: (value: number) => void;
  onToggleMute: () => void;
  trailing?: ReactNode;
};

// Круглая кнопка контролбара; экспортируется для кнопки субтитров в App.
export const playerControlButtonClassName =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink [transition:background-color_0.18s_var(--ease-soft),scale_0.3s_var(--ease-spring)] hover:bg-ink hover:text-paper active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink";

export function PlayerControls({
  isPlaying,
  currentTimeMs,
  durationMs,
  volume,
  muted,
  onPlayPause,
  onSeek,
  onSetVolume,
  onToggleMute,
  trailing,
}: PlayerControlsProps) {
  const clampedTime = Math.min(currentTimeMs, durationMs || currentTimeMs);
  const seekFillPercent = durationMs > 0 ? (clampedTime / durationMs) * 100 : 0;
  const volumeValue = muted ? 0 : volume;

  return (
    <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-white/96 px-3 py-[7px] shadow-[0_10px_30px_-12px_rgba(0,0,0,0.4)]">
      <button
        type="button"
        aria-label={isPlaying ? "Пауза" : "Воспроизвести"}
        onClick={onPlayPause}
        className={playerControlButtonClassName}
      >
        {isPlaying ? (
          <Pause className="h-[18px] w-[18px]" aria-hidden="true" />
        ) : (
          <Play className="h-[18px] w-[18px]" aria-hidden="true" />
        )}
      </button>

      <span className="font-mono text-xs whitespace-nowrap tabular-nums text-ink-2">
        {formatTime(clampedTime)} / {formatTime(durationMs)}
      </span>

      <input
        type="range"
        aria-label="Перемотка"
        min={0}
        max={Math.max(durationMs, 0)}
        value={clampedTime}
        onChange={(event) => onSeek(Number(event.target.value))}
        style={{ "--range-fill": `${seekFillPercent}%` } as CSSProperties}
        className="range-ink min-w-0 flex-1"
      />

      <button
        type="button"
        aria-label={muted ? "Включить звук" : "Выключить звук"}
        onClick={onToggleMute}
        className={playerControlButtonClassName}
      >
        {muted ? (
          <VolumeX className="h-[18px] w-[18px]" aria-hidden="true" />
        ) : (
          <Volume2 className="h-[18px] w-[18px]" aria-hidden="true" />
        )}
      </button>

      <input
        type="range"
        aria-label="Громкость"
        min={0}
        max={1}
        step={0.05}
        value={volumeValue}
        onChange={(event) => onSetVolume(Number(event.target.value))}
        style={{ "--range-fill": `${volumeValue * 100}%` } as CSSProperties}
        className="range-ink w-[60px] shrink-0"
      />

      <span aria-hidden="true" className="h-5 w-px shrink-0 bg-line-2" />

      {trailing}
    </div>
  );
}

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${minutes}:${pad(seconds)}`;
}
```

Важно: таймкод остаётся одним текстовым узлом `{...} / {...}` — тест `renders elapsed and total time` ищет строку целиком.

- [ ] **Step 3: Прогнать тесты**

Run: `npm test -- player-controls`
Expected: PASS — все 5 тестов без правок (лейблы русифицированы в Task 3).

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add src/components/player-controls.tsx src/styles.css
git commit -m "feat: контролбар-пилюля с ink-треками в стиле «Змейки 2»" -m "Плавающая белая пилюля с тенью, круглые кнопки с заливкой ink на ховере, моноширинный таймкод, тонкие сик/громкость. Сик и громкость остаются нативными range-инпутами ради доступности и существующих тестов; вид трека и ручки задан плейн-CSS блоком .range-ink — псевдоэлементы трека утилитами не выражаются, заполнение передаётся переменной --range-fill." -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Radix-попап и меню дорожек

**Files:**
- Modify: `src/components/ui/popover.tsx:20`
- Modify: `src/App.tsx` (const `subtitlesMenu`)

- [ ] **Step 1: Монохромные дефолты PopoverContent**

В `src/components/ui/popover.tsx` заменить строку классов:

```tsx
className={cn(
  "z-50 animate-popin rounded-card bg-paper text-sm text-ink shadow-[0_26px_60px_-22px_rgba(0,0,0,0.55),0_0_0_1px_var(--color-line)] outline-none motion-reduce:animate-none",
  className,
)}
```

(Паддинга в дефолте больше нет — задают вызывающие: меню `p-4`, словарный попап управляет внутренними отступами сам.)

- [ ] **Step 2: Переписать `subtitlesMenu` в `src/App.tsx`**

Импортировать константу кнопки:

```tsx
import { PlayerControls, playerControlButtonClassName } from "@/components/player-controls";
```

Вынести класс пилюльного селекта над компонентом `App` (используется дважды):

```tsx
const trackSelectWrapClassName =
  "relative block rounded-full border-[1.5px] border-line-2 bg-paper transition-colors duration-200 focus-within:border-ink after:pointer-events-none after:absolute after:top-1/2 after:right-4 after:h-[7px] after:w-[7px] after:-translate-y-[65%] after:rotate-45 after:border-r-2 after:border-b-2 after:border-ink-2 after:content-['']";

const trackSelectClassName =
  "w-full cursor-pointer appearance-none rounded-full border-0 bg-transparent py-2.5 pr-9 pl-4 text-sm text-ink outline-none disabled:opacity-50";

const monoLabelClassName =
  "font-mono text-[10.5px] font-medium tracking-[0.1em] uppercase";
```

Заменить весь const `subtitlesMenu` на:

```tsx
const subtitlesMenu =
  video && video.tracks.length > 0 ? (
    <Popover open={subtitlesMenuOpen} onOpenChange={setSubtitlesMenuOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Субтитры и перевод"
          title="Субтитры и перевод"
          className={playerControlButtonClassName}
        >
          <Captions className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        sideOffset={10}
        container={isFullscreen ? playerContainer : undefined}
        className="w-[262px] p-4"
      >
        <div className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-[7px]">
            <span className={cn(monoLabelClassName, "text-ink-2")}>Субтитры</span>
            <span className={trackSelectWrapClassName}>
              <select
                aria-label="Субтитры"
                value={selectedTrackId}
                disabled={isTrackLoading}
                onChange={handleTrackChange}
                className={trackSelectClassName}
              >
                {video.tracks.map((track) => (
                  <option key={track.id} value={track.id}>
                    {formatTrackLabel(track)}
                  </option>
                ))}
              </select>
            </span>
          </label>
          <label className="flex flex-col gap-[7px]">
            <span className={cn(monoLabelClassName, "text-ink-2")}>Перевод</span>
            <span className={trackSelectWrapClassName}>
              <select
                aria-label="Перевод"
                value={selectedSecondaryTrackId}
                disabled={isSecondaryTrackLoading}
                onChange={handleSecondaryTrackChange}
                className={trackSelectClassName}
              >
                <option value="">Нет</option>
                {video.tracks.map((track) => (
                  <option key={track.id} value={track.id}>
                    {formatTrackLabel(track)}
                  </option>
                ))}
              </select>
            </span>
          </label>
          {secondaryError ? <span className="text-sm text-ink-2">{secondaryError}</span> : null}
        </div>
      </PopoverContent>
    </Popover>
  ) : null;
```

- [ ] **Step 3: Прогнать тесты**

Run: `npm test`
Expected: PASS — комбобоксы по-прежнему `<select>` с aria-label «Субтитры»/«Перевод», кнопка «Субтитры и перевод» на месте.

- [ ] **Step 4: Commit**

```powershell
git add src/components/ui/popover.tsx src/App.tsx
git commit -m "feat: монохромный Radix-попап и меню дорожек с пилюльными селектами" -m "Дефолты PopoverContent переведены на токены (paper, r-card, тень с кольцом line, вход popin), паддинг задают вызывающие. Меню дорожек — карточка 262px с двумя пилюльными select и нарисованным шевроном; Radix сохранён ради позиционирования и фокуса. Кнопка субтитров использует общий класс круглых кнопок контролбара." -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Субтитры: карточка, волнистое подчёркивание слов, опорная строка

**Files:**
- Modify: `src/components/subtitle-overlay.tsx`
- Modify: `src/components/subtitle-reference-line.tsx`

- [ ] **Step 1: Рестайл `src/components/subtitle-overlay.tsx`**

Заменить return компонента `SubtitleOverlay` (логика lookupForWord и пропсы не меняются):

```tsx
return (
  <div className="pointer-events-auto max-w-[92%] rounded-card bg-paper px-[22px] py-[13px] text-center text-[22px] leading-[1.45] font-[450] tracking-[-0.01em] text-ink shadow-[0_16px_40px_-16px_rgba(0,0,0,0.55)]">
    {cue.words.map((word) => {
      const fallbackWord = word.cleanText || word.text;
      const lookup = lookupForWord(wordLookup, fallbackWord);
      const saveControl = getWordSaveControl?.(cue, word, fallbackWord, lookup);

      return (
        <Popover
          key={word.id}
          onOpenChange={(open) => {
            if (open) {
              onWordInspect?.(cue, word);
              return;
            }

            onWordInspectEnd?.();
          }}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              className="relative mx-1 inline-block px-px text-ink outline-none after:absolute after:inset-x-0 after:-bottom-[5px] after:h-[5px] after:origin-left after:scale-x-0 after:bg-(image:--wave-ink) after:bg-position-[50%_50%] after:bg-size-[11px_5px] after:bg-repeat-x after:opacity-85 after:transition-transform after:duration-300 after:ease-spring after:content-[''] hover:after:scale-x-100 motion-safe:hover:after:animate-uslither focus-visible:after:scale-x-100 aria-expanded:after:scale-x-100 motion-safe:aria-expanded:after:animate-uslither"
            >
              {word.text}
            </button>
          </PopoverTrigger>
          <PopoverContent aria-label={`Слово: ${fallbackWord}`} container={popoverContainer} className="w-[282px]">
            <WordLookupPopover fallbackWord={fallbackWord} lookup={lookup} saveControl={saveControl} />
          </PopoverContent>
        </Popover>
      );
    })}
  </div>
);
```

(Активное слово: Radix ставит `aria-expanded="true"` на триггер открытого попапа — подчёркивание держится через `aria-expanded:`-варианты.)

- [ ] **Step 2: Рестайл `src/components/subtitle-reference-line.tsx`**

Заменить return:

```tsx
return (
  <div className="max-w-[88%] rounded-full bg-[rgba(10,10,10,0.78)] px-4 py-[7px] text-center text-[14.5px] text-white backdrop-blur-[3px]">
    {cue.text}
  </div>
);
```

- [ ] **Step 3: Прогнать тесты**

Run: `npm test -- subtitle`
Expected: PASS — тесты overlay/reference-line ассертят роли и тексты, классы не проверяют.

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add src/components/subtitle-overlay.tsx src/components/subtitle-reference-line.tsx
git commit -m "feat: белая карточка субтитров с волнистым подчёркиванием слов" -m "Строка 22px/450 на белой карточке r-card с глубокой тенью; слова подчёркиваются волнистым SVG-паттерном с шевелением uslither на ховере и при открытом попапе (aria-expanded от Radix). Опорная строка — тёмная полупрозрачная пилюля с blur. Постоянная анимация входа слов из прототипа не перенесена: README её не специфицирует, а перезапуск на каждой фразе шумит поверх видео." -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Попап слова: словарная карточка и «Сохранить слово»

**Files:**
- Modify: `src/components/word-lookup-popover.test.tsx` (ассерты — первыми)
- Modify: `src/App.test.tsx` (имя кнопки сохранения)
- Rewrite: `src/components/word-lookup-popover.tsx`

- [ ] **Step 1: Обновить ассерты (тест-первым)**

```powershell
$f = "src/components/word-lookup-popover.test.tsx"
$c = Get-Content $f -Raw
$c = $c -replace 'name: "Сохранить" \}', 'name: "Сохранить слово" }'
$c = $c -replace 'getByRole\("link", \{ name: "ruwiktionary-kaikki" \}\)', 'getByRole("link", { name: "ВИКИСЛОВАРЬ · DE ↗" })'
$c = $c -replace 'getByText\("ruwiktionary-kaikki"\)', 'getByText("ВИКИСЛОВАРЬ · RU")'
Set-Content $f $c -NoNewline

$f = "src/App.test.tsx"
$c = Get-Content $f -Raw
$c = $c -replace 'name: "Сохранить" \}', 'name: "Сохранить слово" }'
Set-Content $f $c -NoNewline
```

Затем в `src/components/word-lookup-popover.test.tsx` вручную заменить два class-ассерта (строки ~174–175):

```tsx
expect(container.firstElementChild).toHaveClass("text-left");
expect(container.firstElementChild).toHaveClass("break-words");
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npm test -- word-lookup-popover`
Expected: FAIL — нет кнопки «Сохранить слово», нет ссылки «ВИКИСЛОВАРЬ · DE ↗», класс `text-left` не найден.

- [ ] **Step 3: Переписать `src/components/word-lookup-popover.tsx`**

```tsx
import type { ReactNode } from "react";

import { SnakeBorder } from "@/components/snake-border";
import type { WordLookupState } from "@/lib/dictionary/types";
import type { WordSaveControl } from "@/lib/saved-words/types";
import { cn } from "@/lib/utils";

type WordLookupPopoverProps = {
  fallbackWord: string;
  lookup: WordLookupState;
  saveControl?: WordSaveControl;
};

const monoLabelClassName =
  "font-mono text-[10.5px] font-medium tracking-[0.1em] uppercase text-ink-3";

function PopoverWordHeader({ word, ipa }: { word: string; ipa?: string | null }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
      <span className="min-w-0 text-[22px] font-semibold tracking-[-0.02em] break-words text-ink">{word}</span>
      {ipa ? <span className="font-mono text-[13px] text-ink-2">/{ipa}/</span> : null}
    </div>
  );
}

function SourceNote({ language, sourceUrl }: { language: string; sourceUrl: string | null }) {
  const label = `ВИКИСЛОВАРЬ · ${language.toUpperCase()}`;

  if (!sourceUrl) {
    return <div className="mt-2 font-mono text-[10px] tracking-[0.06em] text-ink-2">{label}</div>;
  }

  return (
    <div className="mt-2">
      <a
        href={sourceUrl}
        rel="noreferrer"
        target="_blank"
        className="border-b border-line-2 pb-px font-mono text-[10px] tracking-[0.06em] text-ink no-underline transition-colors hover:border-ink"
      >
        {label} ↗
      </a>
    </div>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="space-y-[5px]">
      <div className={monoLabelClassName}>{label}</div>
      <div className="text-sm leading-[1.45] break-words text-ink">{children}</div>
    </section>
  );
}

function StatusNote({ children }: { children: ReactNode }) {
  return <div className="px-[18px] pt-1 pb-3.5 text-sm text-ink-2">{children}</div>;
}

function SavedWordButton({ control }: { control?: WordSaveControl }) {
  if (!control) return null;

  const labels = {
    unsaved: "Сохранить слово",
    saving: "Сохраняю...",
    saved: "Сохранено",
    removing: "Удаляю...",
    unavailable: "Сохранение недоступно",
  };
  const isSavedLook = control.status === "saved" || control.status === "removing";

  return (
    <div className="space-y-2 px-[18px] pt-1 pb-4">
      <button
        type="button"
        disabled={
          control.status === "saving" || control.status === "removing" || control.status === "unavailable"
        }
        onClick={control.onToggle}
        className={cn(
          "group/snake relative flex w-full items-center justify-center gap-[9px] rounded-full p-3 text-[13px] font-medium tracking-[0.01em] [transition:translate_0.3s_var(--ease-spring),background-color_0.2s,color_0.2s] hover:-translate-y-px disabled:opacity-60",
          isSavedLook
            ? "bg-paper-2 text-ink shadow-[inset_0_0_0_1.5px_var(--color-line-2)]"
            : "bg-ink text-paper",
        )}
      >
        {control.status === "saved" ? (
          <span
            aria-hidden="true"
            className="h-[7px] w-[13px] -rotate-45 scale-0 animate-chkin border-b-2 border-l-2 border-current motion-reduce:scale-100 motion-reduce:animate-none"
          />
        ) : null}
        {labels[control.status]}
        {control.status === "unsaved" || control.status === "saved" ? <SnakeBorder shape="pill" /> : null}
      </button>
      {control.error ? <div className="px-1 text-xs text-ink-2">{control.error}</div> : null}
    </div>
  );
}

export function WordLookupPopover({ fallbackWord, lookup, saveControl }: WordLookupPopoverProps) {
  if (lookup.status === "idle") {
    return (
      <div className="break-words text-left">
        <div className="px-[18px] pt-4 pb-3">
          <PopoverWordHeader word={fallbackWord} />
        </div>
        <SavedWordButton control={saveControl} />
      </div>
    );
  }

  if (lookup.status === "loading") {
    return (
      <div className="break-words text-left">
        <div className="px-[18px] pt-4 pb-3">
          <PopoverWordHeader word={lookup.query || fallbackWord} />
        </div>
        <div className="flex items-center gap-[9px] px-[18px] pb-3.5 font-mono text-xs tracking-[0.04em] text-ink-2">
          <span
            aria-hidden="true"
            className="h-3 w-3 animate-spin rounded-full border-2 border-line-2 border-t-ink motion-reduce:animate-none"
          />
          Ищу в словаре...
        </div>
        <SavedWordButton control={saveControl} />
      </div>
    );
  }

  if (lookup.status === "not-found") {
    return (
      <div className="break-words text-left">
        <div className="px-[18px] pt-4 pb-3">
          <PopoverWordHeader word={fallbackWord} />
        </div>
        <StatusNote>Слово не найдено в словаре</StatusNote>
        <SavedWordButton control={saveControl} />
      </div>
    );
  }

  if (lookup.status === "unavailable") {
    return (
      <div className="break-words text-left">
        <div className="px-[18px] pt-4 pb-3">
          <PopoverWordHeader word={fallbackWord} />
        </div>
        <StatusNote>Словарь сейчас недоступен</StatusNote>
        <SavedWordButton control={saveControl} />
      </div>
    );
  }

  const { data } = lookup;
  const grammarText = [data.partOfSpeech, ...data.grammar].filter(Boolean).join(", ");

  return (
    <div className="break-words text-left">
      <div className="px-[18px] pt-4 pb-3">
        <PopoverWordHeader word={data.headword} ipa={data.ipa} />
        <SourceNote language={data.language} sourceUrl={data.sourceUrl} />
      </div>

      <div className="space-y-[13px] px-[18px] pt-1 pb-3.5">
        <Section label="Значение">
          <div className="space-y-[3px]">
            {data.meanings.map((meaning) => (
              <div key={meaning}>{meaning}</div>
            ))}
          </div>
        </Section>

        {grammarText ? (
          <Section label="Грамматика">
            <span className="font-mono text-[13px]">{grammarText}</span>
          </Section>
        ) : null}
      </div>

      <SavedWordButton control={saveControl} />
    </div>
  );
}
```

- [ ] **Step 4: Прогнать тесты**

Run: `npm test -- word-lookup-popover` → Expected: PASS (все 10 тестов).
Run: `npm test` → Expected: PASS (включая сценарии сохранения в App.test).

- [ ] **Step 5: Commit**

```powershell
git add src/components/word-lookup-popover.tsx src/components/word-lookup-popover.test.tsx src/App.test.tsx
git commit -m "feat: словарная карточка попапа и кнопка «Сохранить слово»" -m "Макет хендоффа: headword 22/600 с моноширинным IPA, источник как подчёркнутая моно-ссылка «ВИКИСЛОВАРЬ · ЯЗЫК» из существующих полей language/sourceUrl, секции «Значение»/«Грамматика» с моно-лейблами, футер — чёрная пилюля «Сохранить слово» со snake-кольцом; сохранённое состояние — светлая пилюля с пружинной галочкой chkin. Все статусы lookup сохранены с прежними текстами. Ширину 282px задаёт PopoverContent в subtitle-overlay." -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: Панель «Слова»: карточки, счётчик-чип, вспышка свежего слова

**Files:**
- Modify: `src/components/saved-words-panel.test.tsx` (новый тест — первым)
- Rewrite: `src/components/saved-words-panel.tsx`
- Modify: `src/App.tsx` (состояние freshSavedWordId)
- Delete: `src/components/ui/button.tsx`

- [ ] **Step 1: Написать падающий тест вспышки**

В `src/components/saved-words-panel.test.tsx` добавить в describe:

```tsx
it("marks the freshly saved word for the flash highlight", () => {
  render(<SavedWordsPanel words={[savedWord()]} freshWordId="de:welt" onRemove={vi.fn()} />);

  expect(screen.getByText("Welt").closest("[data-fresh='true']")).not.toBeNull();
});

it("does not mark stale words as fresh", () => {
  render(<SavedWordsPanel words={[savedWord()]} onRemove={vi.fn()} />);

  expect(screen.getByText("Welt").closest("[data-fresh='true']")).toBeNull();
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npm test -- saved-words-panel`
Expected: FAIL — TypeScript/прогон: проп `freshWordId` не существует, первый новый тест падает.

- [ ] **Step 3: Переписать `src/components/saved-words-panel.tsx`**

```tsx
import { X } from "lucide-react";

import type { SavedWord } from "@/lib/saved-words/types";
import { cn } from "@/lib/utils";

type SavedWordsPanelProps = {
  words: SavedWord[];
  isLoading?: boolean;
  isUnavailable?: boolean;
  pendingWordIds?: string[];
  freshWordId?: string;
  error?: string;
  onRemove: (word: SavedWord) => void;
};

export function SavedWordsPanel({
  words,
  isLoading,
  isUnavailable,
  pendingWordIds = [],
  freshWordId,
  error,
  onRemove,
}: SavedWordsPanelProps) {
  const pendingWordIdSet = new Set(pendingWordIds);

  return (
    <aside
      aria-label="Сохраненные слова"
      role="region"
      className="overflow-hidden rounded-card border border-line bg-paper"
    >
      <div className="flex items-center justify-between gap-3 px-[18px] pt-[18px] pb-3.5">
        <h2 className="text-base font-semibold tracking-[-0.01em] text-ink">Слова</h2>
        <span className="min-w-6 rounded-full bg-ink px-[9px] py-0.5 text-center font-mono text-xs font-medium text-paper">
          {String(words.length).padStart(2, "0")}
        </span>
      </div>

      {error && !isUnavailable ? <div className="px-[18px] pb-3 text-xs text-ink-2">{error}</div> : null}
      {isUnavailable ? <div className="px-[18px] pb-[18px] text-sm text-ink-3">Список слов недоступен</div> : null}
      {!isUnavailable && isLoading ? (
        <div className="px-[18px] pb-[18px] text-sm text-ink-3">Загружаю слова...</div>
      ) : null}
      {!isUnavailable && !isLoading && words.length === 0 ? (
        <div className="px-[18px] pt-5 pb-10 text-center text-[13px] leading-[1.7] text-ink-3">
          Сохраненных слов пока нет
        </div>
      ) : null}

      {!isUnavailable && words.length > 0 ? (
        <div className="flex flex-col gap-2 px-3 pt-1 pb-3">
          {words.map((word) => (
            <div
              key={word.id}
              data-fresh={word.id === freshWordId ? "true" : undefined}
              className={cn(
                "group/wcard relative rounded-card-sm bg-paper-2 px-3.5 py-3 motion-reduce:animate-none",
                word.id === freshWordId ? "animate-wcardflash" : "animate-wcardin",
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 text-[15px] font-semibold tracking-[-0.01em] break-words text-ink">
                  {word.displayWord}
                </span>
                <span className="shrink-0 pr-5 font-mono text-[9.5px] tracking-[0.08em] uppercase text-ink-3">
                  {word.language}
                </span>
              </div>
              <div className="mt-[5px] text-[13px] leading-[1.4] break-words text-ink-2">
                {word.firstMeaning || "без значения"}
              </div>
              <button
                type="button"
                aria-label={`Удалить ${word.displayWord}`}
                disabled={pendingWordIdSet.has(word.id)}
                onClick={() => onRemove(word)}
                className="absolute top-2.5 right-[9px] flex h-[22px] w-[22px] items-center justify-center rounded-full text-ink-3 opacity-0 [transition:opacity_0.2s,background-color_0.15s,color_0.15s] group-hover/wcard:opacity-100 hover:bg-ink hover:text-paper focus-visible:opacity-100 disabled:opacity-30"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </aside>
  );
}
```

- [ ] **Step 4: Подключить freshWordId в `src/App.tsx`**

Добавить состояние и реф рядом с остальными (после `savedWordsPanelError`):

```ts
const [freshSavedWordId, setFreshSavedWordId] = useState<string | undefined>();
const freshSavedWordTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
```

В `handleToggleSavedWord`, сразу после `setSavedWords((words) => replaceSavedWord(words, savedWord));`:

```ts
setFreshSavedWordId(savedWord.id);
if (freshSavedWordTimerRef.current) clearTimeout(freshSavedWordTimerRef.current);
freshSavedWordTimerRef.current = setTimeout(() => setFreshSavedWordId(undefined), 700);
```

Рядом с другими эффектами добавить очистку таймера:

```ts
useEffect(
  () => () => {
    if (freshSavedWordTimerRef.current) clearTimeout(freshSavedWordTimerRef.current);
  },
  [],
);
```

В JSX передать проп панели:

```tsx
<SavedWordsPanel
  words={savedWords}
  isLoading={areSavedWordsLoading}
  isUnavailable={savedWordsUnavailable}
  pendingWordIds={savedWords
    .filter((word) => pendingSavedWordActions[savedWordKey(word.language, word.normalizedWord)] === "removing")
    .map((word) => word.id)}
  freshWordId={freshSavedWordId}
  error={savedWordsPanelError}
  onRemove={handleRemoveSavedWord}
/>
```

- [ ] **Step 5: Удалить осиротевший `ui/button.tsx`**

```powershell
Get-ChildItem src -Recurse -Include *.tsx,*.ts | Select-String -Pattern 'ui/button'
```

Expected: пусто. Затем:

```powershell
git rm src/components/ui/button.tsx
```

- [ ] **Step 6: Прогнать тесты**

Run: `npm test`
Expected: PASS — оба новых теста панели и все существующие (тексты состояний панели не менялись).

- [ ] **Step 7: Commit**

```powershell
git add src/components/saved-words-panel.tsx src/components/saved-words-panel.test.tsx src/App.tsx
git commit -m "feat: панель «Слова» — карточки paper-2, чип-счётчик, вспышка свежего слова" -m "Заголовок с ink-чипом счётчика (нули до двух знаков, как в макете), карточки слов на paper-2 с r-sm, язык моноширинным тегом, «×» по ховеру. Свежесохранённое слово помечается data-fresh и вспыхивает wcardflash 700мс — id свежего слова живёт в App рядом с обработчиком сохранения. shadcn Button удалён: после рестайла на него не осталось ссылок." -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: Финал: документация, полная верификация, fidelity-чеклист

**Files:**
- Modify: `AGENTS.md` (Codebase Map)
- Modify: `docs/llm/current-behavior.md:12,20`

- [ ] **Step 1: Обновить Codebase Map в `AGENTS.md`**

В секцию `Frontend:` добавить после строки про `subtitle-reference-line.tsx`:

```markdown
- `src/components/snake-border.tsx`: decorative "stitch ring" hover overlay (Змейка 2 visual style); presentational only.
- `src/components/wave.tsx`: decorative animated wave divider.
```

И в конец секции `## Codebase Map` добавить абзац:

```markdown
Visual style: monochrome "Змейка 2" theme; design tokens live as Tailwind v4 `@theme`
variables in `src/styles.css`, components are styled with Tailwind utilities. The
design reference bundle is vendored at `docs/design/snake2-handoff/` (see
`docs/superpowers/specs/2026-06-10-snake2-monochrome-restyle-design.md`). The old
shadcn-style `ui/button|input|alert` primitives were removed; `ui/popover.tsx` remains.
```

- [ ] **Step 2: Обновить `docs/llm/current-behavior.md`**

- Строка 12: `` 8. User can switch the primary app subtitle track with the `Subtitles` dropdown. `` → `` 8. User can switch the primary app subtitle track with the «Субтитры» dropdown. ``
- Строка 20: заменить `A "← К списку" control returns from a loaded video to the start screen.` на `A "← Назад" control returns from a loaded video to the start screen.`

- [ ] **Step 3: Полная верификация**

```powershell
npm test
npm run build
git diff --check
```

Expected: тесты зелёные, сборка успешна, никаких whitespace-ошибок. Бэкенд не трогали — cargo-проверки не требуются.

- [ ] **Step 4: Ручной fidelity-проход (нужен исполнитель с GUI или пользователь)**

Открыть эталон и приложение рядом:

```powershell
Start-Process "docs/design/snake2-handoff/files/lupa-snake2.html"
npm run tauri dev
```

Чеклист (из README хендоффа + спеки):
- [ ] Стартовый экран: карточка-окно на сером фоне, волна в мастхеде, пилюля URL-бара, фокус даёт ink-бордер с мягким кольцом.
- [ ] Ховер «Загрузить →»: стрелка сдвигается, stitch-кольцо сидит снаружи кнопки с видимым зазором, кружит.
- [ ] Карточки «Недавние»: 3 колонки, вход cardrise, подъём + play-чип + «×» на ховере, кольцо round вокруг карточки.
- [ ] Загрузка: волнистый лоадер под URL-баром.
- [ ] Плеер: «← Назад» (кольцо pill), тёмный колодец r-lg, белая карточка субтитров, волнистое подчёркивание слова на ховере и при открытом попапе.
- [ ] Контролбар: белая пилюля, ink-заливка кнопок на ховере, ручка сика растёт на ховере, бар уезжает вниз при бездействии, «ВОСПРОИЗВЕДЕНИЕ» исчезает вместе с ним.
- [ ] Угловые кнопки: круглые, кольцо circle; VK-режим открывает родные контролы VK (без оверлея).
- [ ] Попап слова: 282px, IPA, «ВИКИСЛОВАРЬ · …», «Сохранить слово» → «Сохранено» с галочкой; панель «Слова» вспыхивает.
- [ ] Меню дорожек: карточка 262px, пилюльные селекты с шевроном.
- [ ] Шрифты: IBM Plex Sans/Mono без сети (отключить сеть и перезапустить — вид не меняется).

- [ ] **Step 5: Commit**

```powershell
git add AGENTS.md docs/llm/current-behavior.md
git commit -m "docs: карта кодовой базы и current-behavior после рестайла «Змейка 2»" -m "Добавлены snake-border и wave в Codebase Map, зафиксирован Tailwind-first подход к токенам и вендоринг дизайн-референса; в current-behavior лейблы «Субтитры» и «← Назад» приведены к фактическим." -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Сводка покрытия спеки

| Требование спеки | Задача |
|---|---|
| Токены @theme, кейфреймы, волны, базовые стили | 1 |
| Self-hosted шрифты (450 для субтитров) | 1 |
| index.html lang=ru, удаление App.css | 1 |
| SnakeBorder + prefers-reduced-motion + ResizeObserver-мок | 2 |
| Русификация текстов, ошибок, aria-лейблов, «(авто)» | 3 |
| Карточка-окно без титлбара, мастхед-волна | 4 |
| URL-бар, «Загрузить →», волнистый лоадер | 4 |
| Тихие блоки ошибок на токенах | 4 |
| Удаление ui/input, ui/alert, ui/button | 4, 11 |
| Сетка «Недавние»: 3 колонки, cardrise, play-чип, без длительности | 5 |
| «← Назад», now-playing, грид 1fr/280px | 6 |
| Колодец r-lg, индикатор только при видимых контролах | 6 |
| Угловые кнопки circle + snake, VK-режим без оверлея | 6 |
| Контролбар-пилюля, нативные range со стилями | 7 |
| Монохромный PopoverContent + popin | 8 |
| Меню дорожек 262px с пилюльными селектами | 8 |
| Карточка субтитров, волнистое подчёркивание, опорная пилюля | 9 |
| Попап 282px: IPA, источник, секции, «Сохранить слово»+chkin | 10 |
| Панель «Слова»: чип, wcard, вспышка свежего | 11 |
| AGENTS.md/current-behavior, полный прогон, fidelity-чеклист | 12 |
