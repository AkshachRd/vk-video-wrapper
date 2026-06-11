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
      // Перемер на каждое включение: геометрия, замеренная во время входной
      // анимации предка (transform не двигает ResizeObserver), не должна залипать.
      measure();
      draw();
      if (running || reducedMotion()) return; // статичное кольцо без вращения
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
        "scale-[0.96] opacity-0 [transition:opacity_0.2s_var(--ease-soft),scale_0.4s_var(--ease-spring)]",
        "group-hover/snake:scale-100 group-hover/snake:opacity-100",
        "group-focus-within/snake:scale-100 group-focus-within/snake:opacity-100",
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
