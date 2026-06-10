# Handoff: ЛУПА — «Змейка 2» visual style (B&W minimal + stitch-ring hover)

## Overview
Monochrome, minimal visual identity for the VK video language-learning app
(`vk-video-wrapper`). This handoff covers the **visual layer only** — design
tokens, typography, component styling, and the signature **"stitch-ring" hover
effect**: a dense, closed, wavy line that materialises *outside* an element in a
clear gap and slowly circles it while you hover/focus.

You keep your own logic, state, data fetching and player. Nothing here dictates
how the app works — only how it looks.

## About the design files
The files in `files/` are **design references created as in-browser HTML/JSX
prototypes** (React via Babel standalone, mock data, no build step). They are
**not** production code to copy verbatim. Your job is to **recreate this look in
the real Tauri + React + TypeScript codebase** using its existing patterns —
porting the CSS as-is and rewriting the one interactive helper component in TSX.

- `files/lupa-snake2.html` — open this in a browser to see/feel the final design.
- `files/mono.css` — **the design system.** Port this nearly 1:1.
- `files/snake.css` + `files/stitch.css` — the hover-ring styling. Port as-is.
- `files/pieces.jsx` — contains the `SnakeBorder` component (the only JS the
  visual effect needs). A clean TSX port is provided below in **§ SnakeBorder**.
- `files/app-snake2.jsx`, `files/data.jsx`, `files/tweaks-panel.jsx` — full
  prototype + mock data + the dev-only Tweaks panel. **Reference only**; do not
  ship these. The Tweaks panel is a prototyping tool, not part of the product.

## Fidelity
**High-fidelity.** Colors, type, spacing, radii, and the hover animation are
final. Recreate pixel-for-pixel using your codebase's conventions.

---

## Design tokens

All tokens live as CSS custom properties in `mono.css` (`:root`). Port them into
your token system (CSS vars, Tailwind theme, styled-system, etc.).

### Color (pure monochrome — no accent)
| Token        | Hex       | Use |
|--------------|-----------|-----|
| `--paper`    | `#ffffff` | App background / cards / pills |
| `--paper-2`  | `#f6f6f6` | Panel tint, saved-word cards, hover fill |
| `--paper-3`  | `#efefef` | Deeper tint / flash |
| `--ink`      | `#0c0c0c` | Primary text, black buttons, **snake stroke** |
| `--ink-2`    | `#707070` | Secondary text |
| `--ink-3`    | `#a8a8a8` | Tertiary text, placeholders, labels |
| `--line`     | `#e9e9e9` | Hairline dividers |
| `--line-2`   | `#dcdcdc` | Default borders (pills, inputs) |
| `--black`    | `#0a0a0a` | Video well background |
| page bg      | `#e9e9e7` | Behind the app window |

### Typography
- **Family:** `IBM Plex Sans` for everything UI; `IBM Plex Mono` for labels,
  timecodes, durations, tags. Both loaded with Cyrillic + Latin subsets (the UI
  is in Russian).
- Google Fonts import:
  `IBM+Plex+Sans:wght@400;450;500;600` and `IBM+Plex+Mono:wght@400;500`,
  `subset=cyrillic,cyrillic-ext,latin`.
- **Scale (px / weight / letter-spacing):**
  - Masthead tagline: 14 / 400 / 0
  - Section heading ("Недавние"): 17 / 600 / −0.01em
  - Card title: 14.5 / 500 / −0.01em
  - Card meta: 12.5 / 400 / normal, color `--ink-3`
  - Subtitle line (in video): 22 / 450 / −0.01em
  - Russian reference line: 14.5 / 400
  - Popover headword: 22 / 600 / −0.02em
  - Mono labels: 10.5 / 500 / +0.1em / uppercase / `--ink-3`
  - Timecode: 12 mono, tabular-nums

### Shape / spacing
| Token        | Value   | Use |
|--------------|---------|-----|
| `--radius`   | `20px`  | Card / video-well / popover / menu corner |
| `--r-sm`     | `12px`  | (= radius × 0.6) saved-word cards |
| `--r-lg`     | `25px`  | (= radius × 1.25) window + video well |
| pills        | `999px` | URL bar, buttons, chips, track selects |
| window max-w | `1140px`| Centred app window, 32px viewport padding |
| outer shadow | `0 40px 90px -40px rgba(0,0,0,0.32)` | Window / popovers |

### Motion
- Spring easing: `cubic-bezier(0.16, 1.1, 0.3, 1)`
- Standard ease: `cubic-bezier(0.33, 0.9, 0.4, 1)`
- `--motion` (0–1) scales entrance transforms; default `0.55`.
- **Entrance pattern (important):** elements animate **transform only**, with
  `opacity:1` as the base state (never animate from `opacity:0` with `forwards`).
  This keeps content visible even if an animation is interrupted/throttled.
  E.g. cards use `@keyframes cardrise { from { transform: translateY(9px) } }`.

### Decorative "wave" divider
A horizontal slithering wave sits under the masthead and section header
(`.wave` in `mono.css`): two repeating SVG-data-URI sine strokes scrolling in
opposite directions (`slither` / `slither-rev`) with a gentle vertical `bob`.
Toggle via the `.curves` class on the root. Port the `.wave` rules verbatim.

---

## The signature effect — "stitch ring" (Змейка 2)

On hover/focus of a target element, a **bold, dense, closed wavy line** fades in
*outside* the element (in a ~14–16px gap, never overlapping it) and circles the
perimeter. It is a real sine-wave geometry generated in JS to fit each element's
size and corner radius, drawn as a smooth closed path (quadratic béziers), then
animated by advancing the wave phase every frame (the loops appear to travel /
the ring appears to rotate).

### How it's built (two parts)
1. **CSS** (`snake.css` + `stitch.css`) — positions a floating `<svg>` overlay,
   reveals it on `:hover`/`:focus-within`, and (for the base "Змейка 1" look)
   provides a dashed traveling segment. `stitch.css` overrides that to a **full
   continuous ring** (`stroke-dasharray: none`) pushed further out (`--snake-gap`
   14–16px). For Змейка 2 you load **both** `snake.css` then `stitch.css`, and
   put class `stitch snakes` on the root container.
2. **JS** (`SnakeBorder` component) — measures the host, samples its rounded-rect
   perimeter, displaces each sample along its normal by `amp·sin(K·dist + phase)`,
   smooths into a closed path, and re-draws each frame while hovered.

### Snake tokens (CSS vars, set on `:root`)
| Var               | Default | Meaning |
|-------------------|---------|---------|
| `--snake-sw`      | `3px`   | Stroke weight (boldness) |
| `--snake-dur`     | `1.5s`  | Reserved (used by Змейка 1 dash crawl) |
| `--snake-amp`     | `4px`   | Wave amplitude (loop depth) |
| `--snake-gap`     | `14px`  | Distance the ring floats off the edge (stitch) |
| `--snake-wavelen` | `13px`  | Wavelength → loop density (smaller = tighter loops) |

Defaults in the prototype's Tweaks (Змейка 2): weight `3`, wavelength `13`,
amplitude `4`, gap `14`. These produce the tight frilly stitch ring.

### Which elements get the ring (and shape)
Add a positioning host class + render one `<SnakeBorder shape="…">` child:
| Element | host class | `shape` |
|---|---|---|
| "Загрузить" submit button | `btn-load snake-host` | `pill` |
| Recent video card | `rcard snake-host` | `round` (uses `--radius`) |
| "Назад" button | `btn-back snake-host` | `pill` |
| Player corner buttons (gear, fullscreen) | `corner-btn snake-host` | `circle` |
| "Сохранить слово" button | `btn-save snake-host` | `pill` |

`shape` only affects the corner radius used when sampling the perimeter:
`pill`/`circle` → fully rounded (`min(W,H)/2`); `round` → `--radius + gap`.

The host must be `position: relative` and `overflow: visible` (so the ring can
escape). See the small overflow overrides at the bottom of `snake.css`.

### SnakeBorder — TSX port (drop-in)
This is the only piece of JS the visual needs. It's presentational and
self-contained (no app state). Port:

```tsx
import { useEffect, useRef } from "react";

type SnakeShape = "pill" | "round" | "circle";

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
    let running = false;
    const loop = () => { phase.current += 0.1; draw(); raf.current = requestAnimationFrame(loop); };
    const start = () => { if (running) return; running = true; measure(); draw(); raf.current = requestAnimationFrame(loop); };
    const stop = () => { running = false; cancelAnimationFrame(raf.current); };

    measure(); draw();
    host.addEventListener("mouseenter", start);
    host.addEventListener("mouseleave", stop);
    host.addEventListener("focusin", start);
    host.addEventListener("focusout", stop);
    const ro = new ResizeObserver(() => { measure(); if (!running) draw(); });
    ro.observe(host);

    return () => {
      stop(); ro.disconnect();
      host.removeEventListener("mouseenter", start);
      host.removeEventListener("mouseleave", stop);
      host.removeEventListener("focusin", start);
      host.removeEventListener("focusout", stop);
    };
  }, [shape]);

  return (
    <svg ref={svgRef} className="snake-svg" data-shape={shape} aria-hidden="true" preserveAspectRatio="none">
      <path ref={pathRef} className="snake-path" pathLength={100} />
    </svg>
  );
}
```

Usage:
```tsx
<button className="btn-load snake-host" type="submit">
  Загрузить →
  <SnakeBorder shape="pill" />
</button>
```

### Accessibility / perf notes
- The ring only animates while hovered/focused (rAF starts on enter, cancels on
  leave), so it's cheap and idle-friendly.
- Wrap the rAF loop in a `prefers-reduced-motion` guard if you want to disable the
  travel for users who opt out (the static wavy ring still renders fine).
- `aria-hidden` on the SVG — it's purely decorative.

---

## Components to restyle (visual spec)

### App window
Centred card, max-width 1140px, `--r-lg` corners, big soft drop shadow, on a
`#e9e9e7` page. Title bar: 46px tall, 1px bottom hairline, three `--line-2`
"traffic light" dots (decorative, 10px), app name in mono uppercase `--ink-2`,
right-aligned mono meta (`библиотека · v0.4`).

### Masthead
In this version the wordmark/icon were intentionally **removed** — the masthead
is just the animated `.wave` divider with generous top spacing. Keep it minimal.

### URL bar
Full-width pill, `1.5px solid --line-2` border, `padding: 6px 6px 6px 22px`.
Focus: border → `--ink`, soft `0 0 0 4px rgba(12,12,12,0.05)` ring. Inside: a
borderless input (placeholder `--ink-3`) and the black "Загрузить →" pill button
(`--ink` bg, white text, 44px tall, arrow nudges +5px on hover). Button is a
`snake-host` with `shape="pill"`.

### Section header ("Недавние")
17px/600 heading, then a `.wave` divider beneath.

### Recent grid
3 columns, 18px gap. Each card: `--radius` corners, 16:9 thumbnail = dark radial
gradient well (`#1c1c1c → #0a0a0a`), duration in white mono bottom-right, on
hover a white circular play chip scales in (0.7→1) and the whole card lifts
−4px with a soft shadow. Title 14.5/500, meta (relative date) 12.5 `--ink-3`.
Remove "×" appears top-right on hover (white circle → ink on hover). Card is a
`snake-host shape="round"`. Cards enter with `cardrise` (translateY only).

### Player view
- **Back row:** "← Назад" outline pill (`snake-host`), plus muted now-playing title.
- **Layout:** `grid-template-columns: 1fr 280px`, 18px gap (collapses to 1 col in
  fullscreen, hiding the side panel).
- **Video well:** `--r-lg` dark rounded rect, centred placeholder mark + label,
  `ВОСПРОИЗВЕДЕНИЕ` pulse dot top-left while playing.
- **Subtitles:** white pill-ish card (`--radius`) with `0 16px 40px` shadow,
  centred; each word is a `<button>` that on hover/active shows a small **wavy
  underline** (SVG data-URI, `--wave-ink`, wiggles via `uslither`). Below it, the
  Russian reference line: dark translucent pill (`rgba(10,10,10,0.78)`, white,
  `border-radius:999px`, `backdrop-filter: blur(3px)`).
- **Control bar:** floating rounded-pill bar (`rgba(255,255,255,0.96)`,
  `border-radius:999px`, 10px/30px shadow), inset 14px from edges; circular
  ctrl buttons (hover → ink fill), mono timecode, thin seek track (`--line-2`)
  with ink fill + round knob (scales 1.25 on hover), volume mini-track, captions
  button. Auto-hides after ~2.8s of playback, slides down.
- **Corner buttons:** two white circular buttons top-right (gear → VK mode,
  expand/collapse fullscreen). Both `snake-host shape="circle"`.

### Word popover
282px, `--radius` corners, `0 26px 60px` shadow + `0 0 0 1px --line` ring.
Header: headword 22/600 + mono IPA `--ink-2`, then a small underlined mono source
link ("WIKTIONARY · EN"). Body: "Значение" (mono label + meaning lines) and
"Грамматика" (mono). Footer: full-width black pill **"Сохранить слово"**
(`snake-host`); when saved it flips to a light pill with inset border + a check
mark that springs in. Opens with `popin` (translateY + slight scale, opacity 1
base).

### Track menu
262px rounded card, two pill `<select>`s ("Субтитры" / "Перевод") with custom
chevron, ink focus border.

### Saved-words side panel
Header "Слова" + count chip (ink pill, white text). List of `--paper-2` cards
(`--r-sm`): word 15/600, mono lang tag, meaning 13 `--ink-2`, "×" on hover.
Newly-saved card flashes (`wcardflash`) and slides in. Empty state: centred mono
hint.

---

## Interactions & behaviour (for context — logic stays yours)
- URL submit / clicking a recent card → load (prototype shows a flowing wave
  loading bar) → player.
- Click a subtitle word → pause + open dictionary popover anchored above the word.
- Save/un-save → side panel updates + flash.
- Captions button → track/translation menu. Gear → "VK mode" overlay. Expand →
  fullscreen (hides side panel).
- These flows are illustrative; wire them to your real player + data.

## Assets
None external. Icons are inline SVG (stroke, `currentColor`) defined in
`data.jsx` (`Ic`) — play/pause/volume/mute/captions/gear/expand/collapse/x.
The decorative waves and word-underline are inline SVG data-URIs in `mono.css`.
Fonts come from Google Fonts (IBM Plex Sans / Mono). No raster images.

## Files in this bundle
- `files/lupa-snake2.html` — runnable prototype (open in a browser).
- `files/mono.css` — design system (port ~1:1).
- `files/snake.css`, `files/stitch.css` — hover-ring styling (port as-is).
- `files/pieces.jsx` — source of `SnakeBorder` + all view components (reference).
- `files/app-snake2.jsx` — app shell wiring (reference for structure/markup).
- `files/data.jsx` — mock data + inline icon set (reference).
- `files/tweaks-panel.jsx` — dev-only Tweaks panel (do NOT ship).

## Suggested integration order
1. Add IBM Plex Sans/Mono + port `mono.css` tokens into your styling system.
2. Port `snake.css` + `stitch.css`; load both, add `class="stitch snakes curves"`
   to your app root (or equivalent).
3. Add the `SnakeBorder.tsx` component (above). Drop `<SnakeBorder>` + the
   `snake-host` class onto your real buttons/cards per the table in § "Which
   elements get the ring".
4. Restyle your existing components (URL bar, cards, player chrome, popover,
   panel) to match § "Components to restyle", reusing your current logic/state.
5. Verify hover/focus on each target shows the ring sitting cleanly *outside* the
   element with a visible gap.
