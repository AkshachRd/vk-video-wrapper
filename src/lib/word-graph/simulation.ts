import { toScreenX, toScreenY } from "./graph-model";
import type { Camera, GraphData, GraphNode } from "./types";

const ALPHA_MIN = 0.02;
const ALPHA_DECAY = 0.012;
const CHARGE = 2600;
const LINK_LEN = 96;
const LINK_K = 0.035;
const GRAVITY = 0.018;
const DAMP = 0.86;
const MAX_SPEED = 30;
const WOBBLE = 0.18;

export class Simulation {
  data: GraphData;
  byId: Map<string, GraphNode>;
  cam: Camera = { x: 0, y: 0, scale: 1 };
  alpha = 1;
  reduceMotion = false;

  // состояние взаимодействия/рендера (выставляет хук)
  dragNodeId: string | null = null;
  selId: string | null = null;
  hoverId: string | null = null;
  highlight: Set<string> | null = null; // null = поиск неактивен
  core: Set<string> | null = null;

  private clock = 0;

  constructor(data: GraphData) {
    this.data = data;
    this.byId = new Map(data.nodes.map((n) => [n.id, n]));
  }

  setData(data: GraphData): void {
    this.data = data;
    this.byId = new Map(data.nodes.map((n) => [n.id, n]));
  }

  reheat(v = 0.7): void {
    this.alpha = Math.max(this.alpha, v);
  }

  step(dt: number): void {
    this.clock += dt;
    const t = this.clock;
    const nodes = this.data.nodes;
    const { alpha } = this;

    // отталкивание O(n^2)
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      if (a.hidden) continue;
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        if (b.hidden) continue;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) {
          d2 = 0.01;
          dx = (Math.random() - 0.5) * 0.1;
          dy = (Math.random() - 0.5) * 0.1;
        }
        const minD = a.r + b.r + 16;
        const d = Math.sqrt(d2);
        let f = (CHARGE * alpha) / d2;
        if (d < minD) f += (minD - d) * 0.5;
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
    }

    // пружины на связях
    for (const l of this.data.links) {
      const a = this.byId.get(l.a)!;
      const b = this.byId.get(l.b)!;
      if (a.hidden || b.hidden) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 0.01;
      const f = (d - LINK_LEN) * LINK_K * alpha;
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }

    // гравитация к центру + лёгкое «дыхание»
    for (const n of nodes) {
      if (n.hidden) continue;
      n.vx += -n.x * GRAVITY * alpha;
      n.vy += -n.y * GRAVITY * alpha;
      if (!this.reduceMotion) {
        n.vx += Math.cos(t * 0.5 + n.phase) * WOBBLE;
        n.vy += Math.sin(t * 0.42 + n.phase * 1.3) * WOBBLE;
      }
    }

    // интеграция
    for (const n of nodes) {
      if (n.hidden) continue;
      if (n.id === this.dragNodeId) {
        n.vx = 0;
        n.vy = 0;
        continue;
      }
      n.vx *= DAMP;
      n.vy *= DAMP;
      const sp = Math.hypot(n.vx, n.vy);
      if (sp > MAX_SPEED) {
        n.vx = (n.vx / sp) * MAX_SPEED;
        n.vy = (n.vy / sp) * MAX_SPEED;
      }
      n.x += n.vx;
      n.y += n.vy;
    }

    if (this.alpha > ALPHA_MIN) this.alpha = Math.max(ALPHA_MIN, this.alpha - ALPHA_DECAY);
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number, dpr: number): void {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    this.drawGrid(ctx, width, height);

    const cam = this.cam;
    const dimMode = this.highlight !== null;
    const coreSet = this.core;
    const selNode = this.selId ? this.byId.get(this.selId) : null;

    // связи
    ctx.lineWidth = 1;
    for (const l of this.data.links) {
      const a = this.byId.get(l.a)!;
      const b = this.byId.get(l.b)!;
      if (a.hidden || b.hidden) continue;
      let on = true;
      if (dimMode) on = this.highlight!.has(a.id) && this.highlight!.has(b.id);
      else if (selNode) on = a.id === selNode.id || b.id === selNode.id;
      const strong =
        (selNode && (a.id === selNode.id || b.id === selNode.id)) ||
        (coreSet && (coreSet.has(a.id) || coreSet.has(b.id)));
      ctx.beginPath();
      ctx.moveTo(toScreenX(a.x, cam), toScreenY(a.y, cam));
      ctx.lineTo(toScreenX(b.x, cam), toScreenY(b.y, cam));
      if (!on) ctx.strokeStyle = "rgba(12,12,12,0.035)";
      else if (strong) ctx.strokeStyle = "rgba(12,12,12,0.32)";
      else ctx.strokeStyle = "rgba(12,12,12,0.10)";
      ctx.stroke();
    }

    const labelFade = Math.max(0, Math.min(1, (cam.scale - 0.55) / 0.5));

    // узлы
    for (const n of this.data.nodes) {
      if (n.hidden) continue;
      const sx = toScreenX(n.x, cam);
      const sy = toScreenY(n.y, cam);
      const r = n.r * cam.scale;
      let dim = false;
      if (dimMode) dim = !this.highlight!.has(n.id);
      else if (selNode) dim = !(n.id === selNode.id || selNode.neighbors.indexOf(n.id) >= 0);
      ctx.globalAlpha = dim ? 0.16 : 1;

      const isSel = selNode && n.id === selNode.id;
      const isHover = this.hoverId && n.id === this.hoverId;
      const isCore = coreSet && coreSet.has(n.id);

      if ((isSel || isHover || isCore) && !dim) {
        ctx.beginPath();
        ctx.arc(sx, sy, r + 5, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(12,12,12,0.9)";
        ctx.lineWidth = isSel || isCore ? 2 : 1.4;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      if (n.type === "tag") {
        ctx.fillStyle = "#0c0c0c";
        ctx.fill();
      } else {
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = "#0c0c0c";
        ctx.stroke();
      }

      ctx.globalAlpha = dim ? 0.16 : 1;
      if (n.type === "tag") {
        const fs = Math.max(9, Math.min(13, r * 0.42));
        ctx.font = `600 ${fs}px 'IBM Plex Mono', monospace`;
        const tw = ctx.measureText(n.label).width;
        if (tw < r * 1.7 && r > 14) {
          ctx.fillStyle = "#ffffff";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(n.label, sx, sy + 0.5);
        } else {
          this.drawLabelBelow(ctx, n.label, sx, sy + r, fs + 1, "#0c0c0c", "600");
        }
      } else if (labelFade > 0.02 || isSel || isHover || isCore) {
        const a = isSel || isHover || isCore ? 1 : labelFade;
        const fs = Math.max(11, 13 * Math.min(1.1, cam.scale));
        ctx.globalAlpha = (dim ? 0.16 : 1) * a;
        this.drawLabelBelow(ctx, n.label, sx, sy + r, fs, "#0c0c0c", "500");
      }
      ctx.globalAlpha = 1;
    }
    ctx.globalAlpha = 1;
  }

  private drawLabelBelow(
    ctx: CanvasRenderingContext2D,
    text: string,
    sx: number,
    sy: number,
    fs: number,
    color: string,
    weight: string,
  ): void {
    ctx.font = `${weight} ${fs}px 'IBM Plex Sans', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = "rgba(255,255,255,0.82)";
    const pad = 3;
    const y = sy + 4;
    this.roundRect(ctx, sx - tw / 2 - pad, y - 1, tw + pad * 2, fs + 4, 4);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText(text, sx, y);
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  private drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const step = 34 * this.cam.scale;
    if (step < 14) return;
    const ox = ((this.cam.x % step) + step) % step;
    const oy = ((this.cam.y % step) + step) % step;
    ctx.fillStyle = "rgba(12,12,12,0.045)";
    for (let x = ox; x < width; x += step) {
      for (let y = oy; y < height; y += step) {
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
