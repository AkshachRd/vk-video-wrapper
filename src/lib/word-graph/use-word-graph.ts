import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { SavedWord } from "@/lib/saved-words/types";
import {
  buildGraph,
  cardDataFor,
  computeHiddenIds,
  matchNodes,
  nodeAt,
  reconcileGraph,
  seedLayout,
  tagOptionsFromNodes,
  toWorldX,
  toWorldY,
} from "./graph-model";
import { applyPersisted, clearGraphState, loadGraphState, saveGraphState } from "./persistence";
import { Simulation } from "./simulation";
import type { CardData, GraphFilters, TagOptionCount, TypeFilter } from "./types";

const SCALE_MIN = 0.3;
const SCALE_MAX = 3.2;

export interface WordGraphController {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  counts: { words: number; tags: number };
  tagOptions: TagOptionCount[];
  search: string;
  setSearch: (value: string) => void;
  filterTags: string[];
  toggleTagFilter: (key: string) => void;
  typeFilter: TypeFilter;
  setTypeFilter: (type: TypeFilter) => void;
  card: CardData | null;
  noResultQuery: string | null;
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
  focusAndSelect: (id: string) => void;
  closeCard: () => void;
}

export function useWordGraph(words: SavedWord[], reduceMotion = false): WordGraphController {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const simRef = useRef<Simulation | null>(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filtersRef = useRef<GraphFilters>({ tags: new Set<string>(), type: "all" });

  const [search, setSearchState] = useState("");
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [typeFilter, setTypeFilterState] = useState<TypeFilter>("all");
  const [card, setCard] = useState<CardData | null>(null);
  const [noResultQuery, setNoResultQuery] = useState<string | null>(null);

  // Опции тегов и счётчики выводим напрямую из слов (а не из simRef, который
  // на первом рендере ещё null) — buildGraph дёшев при ~десятках узлов.
  const tagOptions = useMemo(() => tagOptionsFromNodes(buildGraph(words).nodes), [words]);
  const counts = useMemo(() => ({ words: words.length, tags: tagOptions.length }), [words, tagOptions]);

  // ленивое создание симуляции
  const ensureSim = useCallback(() => {
    if (!simRef.current) {
      const data = buildGraph(words);
      seedLayout(data);
      const sim = new Simulation(data);
      sim.reduceMotion = reduceMotion;
      const persisted = loadGraphState();
      if (persisted) {
        sim.cam = persisted.cam;
        applyPersisted(data.nodes, persisted);
      }
      simRef.current = sim;
    }
    return simRef.current;
  }, [words, reduceMotion]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) return;
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      const sim = simRef.current;
      if (!sim) return;
      const pos: Record<string, [number, number]> = {};
      for (const n of sim.data.nodes) pos[n.id] = [Math.round(n.x * 10) / 10, Math.round(n.y * 10) / 10];
      saveGraphState({ cam: { ...sim.cam }, pos });
    }, 400);
  }, []);

  const applyFilters = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return;
    const hidden = computeHiddenIds(sim.data.nodes, filtersRef.current);
    for (const n of sim.data.nodes) n.hidden = hidden.has(n.id);
    if (sim.selId && hidden.has(sim.selId)) {
      sim.selId = null;
      setCard(null);
    }
    if (sim.hoverId && hidden.has(sim.hoverId)) sim.hoverId = null;
    sim.reheat(0.6);
  }, []);

  // перестройка при изменении слов с сохранением позиций
  useEffect(() => {
    const sim = ensureSim();
    const next = buildGraph(words);
    reconcileGraph(sim.data, next);
    sim.setData(next);
    applyFilters();
    sim.reheat(0.6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words]);

  const setSearch = useCallback((value: string) => {
    setSearchState(value);
    const sim = simRef.current;
    if (!sim) return;
    const { core, highlight } = matchNodes(sim.data.nodes, value);
    if (!value.trim()) {
      sim.highlight = null;
      sim.core = null;
      setNoResultQuery(null);
    } else {
      sim.highlight = highlight;
      sim.core = core;
      setNoResultQuery(core.size === 0 ? value.trim() : null);
    }
    sim.reheat(0.6);
  }, []);

  const selectById = useCallback(
    (id: string | null) => {
      const sim = simRef.current;
      if (!sim) return;
      sim.selId = id;
      if (!id) {
        setCard(null);
        return;
      }
      const node = sim.data.nodes.find((n) => n.id === id);
      if (!node) {
        setCard(null);
        return;
      }
      setCard(cardDataFor(node, sim.data.nodes));
      sim.reheat(0.4);
    },
    [],
  );

  const focusNode = useCallback((id: string) => {
    const sim = simRef.current;
    if (!sim) return;
    const node = sim.data.nodes.find((n) => n.id === id);
    if (!node) return;
    const { w, h } = sizeRef.current;
    const targetScale = Math.max(sim.cam.scale, 1.1);
    const tx = w / 2 - node.x * targetScale;
    const ty = h / 2 - node.y * targetScale;
    const sx = sim.cam.x;
    const sy = sim.cam.y;
    const ss = sim.cam.scale;
    const t0 = performance.now();
    const dur = 420;
    const stepAnim = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      sim.cam.x = sx + (tx - sx) * e;
      sim.cam.y = sy + (ty - sy) * e;
      sim.cam.scale = ss + (targetScale - ss) * e;
      if (k < 1) requestAnimationFrame(stepAnim);
      else scheduleSave();
    };
    requestAnimationFrame(stepAnim);
  }, [scheduleSave]);

  const focusAndSelect = useCallback(
    (id: string) => {
      focusNode(id);
      selectById(id);
    },
    [focusNode, selectById],
  );

  const closeCard = useCallback(() => selectById(null), [selectById]);

  const toggleTagFilter = useCallback(
    (key: string) => {
      const set = filtersRef.current.tags;
      if (set.has(key)) set.delete(key);
      else set.add(key);
      setFilterTags([...set]);
      applyFilters();
    },
    [applyFilters],
  );

  const setTypeFilter = useCallback(
    (type: TypeFilter) => {
      filtersRef.current.type = type;
      setTypeFilterState(type);
      applyFilters();
    },
    [applyFilters],
  );

  const zoomAround = useCallback(
    (factor: number, sx: number, sy: number) => {
      const sim = simRef.current;
      if (!sim) return;
      const wx = toWorldX(sx, sim.cam);
      const wy = toWorldY(sy, sim.cam);
      sim.cam.scale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, sim.cam.scale * factor));
      sim.cam.x = sx - wx * sim.cam.scale;
      sim.cam.y = sy - wy * sim.cam.scale;
      scheduleSave();
    },
    [scheduleSave],
  );

  const zoomIn = useCallback(() => {
    const { w, h } = sizeRef.current;
    zoomAround(1.25, w / 2, h / 2);
  }, [zoomAround]);
  const zoomOut = useCallback(() => {
    const { w, h } = sizeRef.current;
    zoomAround(0.8, w / 2, h / 2);
  }, [zoomAround]);

  const reset = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return;
    seedLayout(sim.data);
    const { w, h } = sizeRef.current;
    sim.cam = { x: w / 2, y: h / 2, scale: w < 720 ? 0.8 : 1 };
    sim.selId = null;
    sim.hoverId = null;
    sim.highlight = null;
    sim.core = null;
    filtersRef.current = { tags: new Set<string>(), type: "all" };
    setSearchState("");
    setFilterTags([]);
    setTypeFilterState("all");
    setCard(null);
    setNoResultQuery(null);
    applyFilters();
    sim.reheat(1);
    clearGraphState();
  }, [applyFilters]);

  // RAF + измерение + события указателя/колеса/пинча
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const sim = ensureSim();
    sim.reduceMotion = reduceMotion;

    const ctx = canvas.getContext("2d");

    const measure = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      sizeRef.current = { w: rect.width, h: rect.height, dpr };
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };
    measure();
    if (!loadGraphState()) {
      sim.cam = { x: sizeRef.current.w / 2, y: sizeRef.current.h / 2, scale: sizeRef.current.w < 720 ? 0.8 : 1 };
    }
    const ro = new ResizeObserver(measure);
    ro.observe(container);

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      sim.step(dt);
      if (ctx) sim.draw(ctx, sizeRef.current.w, sizeRef.current.h, sizeRef.current.dpr);
      if (sim.alpha > 0.021 || sim.dragNodeId) scheduleSave();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // ---- указатель ----
    const rel = (e: PointerEvent): [number, number] => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    let panning = false;
    let panSX = 0;
    let panSY = 0;
    let panCX = 0;
    let panCY = 0;
    let downX = 0;
    let downY = 0;
    let moved = false;
    const pointers = new Map<number, [number, number]>();
    let pinchDist = 0;

    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture?.(e.pointerId);
      pointers.set(e.pointerId, rel(e));
      if (pointers.size === 2) {
        const pts = [...pointers.values()];
        pinchDist = Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]);
        panning = false;
        sim.dragNodeId = null;
        return;
      }
      const [sx, sy] = rel(e);
      downX = sx;
      downY = sy;
      moved = false;
      const n = nodeAt(sim.data.nodes, sx, sy, sim.cam);
      if (n) {
        sim.dragNodeId = n.id;
        sim.reheat(0.5);
        canvas.classList.add("grabbing");
      } else {
        panning = true;
        panSX = sx;
        panSY = sy;
        panCX = sim.cam.x;
        panCY = sim.cam.y;
        canvas.classList.add("grabbing");
      }
    };

    const onMove = (e: PointerEvent) => {
      const [sx, sy] = rel(e);
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [sx, sy]);
      if (pointers.size === 2) {
        const pts = [...pointers.values()];
        const dist = Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]);
        if (pinchDist > 0) {
          const midX = (pts[0][0] + pts[1][0]) / 2;
          const midY = (pts[0][1] + pts[1][1]) / 2;
          zoomAround(dist / pinchDist, midX, midY);
        }
        pinchDist = dist;
        return;
      }
      if (sim.dragNodeId) {
        moved = moved || Math.hypot(sx - downX, sy - downY) > 3;
        const n = sim.data.nodes.find((x) => x.id === sim.dragNodeId);
        if (n) {
          n.x = toWorldX(sx, sim.cam);
          n.y = toWorldY(sy, sim.cam);
          n.vx = 0;
          n.vy = 0;
        }
        sim.reheat(0.45);
        return;
      }
      if (panning) {
        moved = moved || Math.hypot(sx - downX, sy - downY) > 3;
        sim.cam.x = panCX + (sx - panSX);
        sim.cam.y = panCY + (sy - panSY);
        scheduleSave();
        return;
      }
      const n = nodeAt(sim.data.nodes, sx, sy, sim.cam);
      sim.hoverId = n ? n.id : null;
      canvas.classList.toggle("hovering", !!n);
    };

    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchDist = 0;
      if (sim.dragNodeId) {
        if (!moved) selectById(sim.dragNodeId);
        else sim.reheat(0.5);
        sim.dragNodeId = null;
      } else if (panning) {
        if (!moved) selectById(null);
        panning = false;
      }
      canvas.classList.remove("grabbing");
    };

    const onCancel = () => {
      pointers.clear();
      pinchDist = 0;
      sim.dragNodeId = null;
      panning = false;
      canvas.classList.remove("grabbing");
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      zoomAround(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onCancel);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      if (saveTimer.current) clearTimeout(saveTimer.current);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onCancel);
      canvas.removeEventListener("wheel", onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    canvasRef,
    containerRef,
    counts,
    tagOptions,
    search,
    setSearch,
    filterTags,
    toggleTagFilter,
    typeFilter,
    setTypeFilter,
    card,
    noResultQuery,
    zoomIn,
    zoomOut,
    reset,
    focusAndSelect,
    closeCard,
  };
}
