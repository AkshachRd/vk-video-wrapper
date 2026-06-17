# «Граф слов» (Word & Tag Graph) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a force-directed «Граф слов» screen that visualises saved words and their tags as an interactive zoom/pan/drag canvas graph, reachable from the words panel (desktop) and the saved-words sheet (mobile), backed by the existing `app.savedWords` store.

**Architecture:** A framework-agnostic layer (`src/lib/word-graph/`) holds the pure graph model, coordinate math, persistence, and a canvas force-simulation. A React hook (`use-word-graph.ts`) owns the canvas ref + RAF loop, wires pointer/wheel/pinch events, and exposes state + actions. React components (`src/components/word-graph/`) render the chrome (header, search, filters, legend, zoom, detail card) using existing monochrome tokens and `SnakeBorder`. Navigation is local screen state in `DesktopApp`/`MobileApp`; `useVideoApp` is untouched.

**Tech Stack:** React 19, TypeScript, Vitest + React Testing Library (jsdom), Tailwind v4 `@theme` tokens, HTML5 Canvas 2D. Path alias `@/` → `src/`. Test command: `npm test` (vitest run) or `npx vitest run <path>` for a single file.

**Spec:** `docs/superpowers/specs/2026-06-17-word-graph-screen-design.md`

**Conventions observed in this repo:**
- Tests live next to source as `*.test.ts` / `*.test.tsx`, import from `vitest` (`globals: true`, but explicit imports are used).
- Comments are in Russian; keep that style.
- `jsdom` setup is `src/test/setup.ts`; `ResizeObserver` is already stubbed there. Canvas `getContext` is NOT stubbed yet (added in Task 12).
- No `React` import needed for JSX (new transform).

---

## File Structure

**Create:**
- `src/lib/word-graph/types.ts` — `GraphNode`, `GraphLink`, `GraphData`, `Camera`, `TypeFilter`, `GraphFilters`, `TagOptionCount`, `CardData`.
- `src/lib/word-graph/graph-model.ts` — `buildGraph`, `seedLayout`, `reconcileGraph`, `matchNodes`, `computeHiddenIds`, `toScreenX/Y`, `toWorldX/Y`, `nodeAt`, `tagOptionsFromNodes`, `cardDataFor`.
- `src/lib/word-graph/persistence.ts` — `loadGraphState`, `saveGraphState`, `clearGraphState`, `applyPersisted`.
- `src/lib/word-graph/simulation.ts` — `Simulation` class (physics + draw).
- `src/lib/word-graph/use-word-graph.ts` — `useWordGraph` hook.
- `src/components/word-graph/graph-search-field.tsx`
- `src/components/word-graph/graph-filter-row.tsx`
- `src/components/word-graph/graph-detail-card.tsx`
- `src/components/word-graph/graph-canvas.tsx`
- `src/components/word-graph/word-graph-screen.tsx`
- `src/components/word-graph/mobile-word-graph-screen.tsx`

**Modify:**
- `src/components/saved-words-panel.tsx` — add optional `onOpenGraph` button in the header.
- `src/app/desktop-app.tsx` — local `showGraph` state + render the screen.
- `src/components/mobile/saved-words-sheet-content.tsx` — add optional `onOpenGraph` action.
- `src/app/mobile-app.tsx` — `graph` screen mode + render the mobile screen.
- `src/test/setup.ts` — stub canvas `getContext` (Task 12).

---

## Task 1: Types + `buildGraph` (graph structure)

**Files:**
- Create: `src/lib/word-graph/types.ts`
- Create: `src/lib/word-graph/graph-model.ts`
- Test: `src/lib/word-graph/graph-model.test.ts`

- [ ] **Step 1: Write the types**

Create `src/lib/word-graph/types.ts`:

```ts
export type NodeType = "word" | "tag";

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  // только для слов:
  lang?: string;
  meaning?: string;
  tags?: string[]; // отображаемые ярлыки тегов (для карточки)
  tagKeys?: string[]; // нормализованные ключи тегов (связи + фильтр)
  // только для тегов:
  key?: string; // нормализованный ключ тега (фильтр)
  // общее:
  deg: number; // степень (для тега — сколько слов его несут)
  r: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  neighbors: string[]; // id соседних узлов
  hidden: boolean;
}

export interface GraphLink {
  a: string; // id слова
  b: string; // id тега
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface Camera {
  x: number;
  y: number;
  scale: number;
}

export type TypeFilter = "all" | "word" | "tag";

export interface GraphFilters {
  tags: Set<string>; // нормализованные ключи
  type: TypeFilter;
}

export interface TagOptionCount {
  key: string;
  display: string;
  count: number;
}

export type CardData =
  | { kind: "word"; node: GraphNode; tags: { id: string; label: string }[] }
  | { kind: "tag"; node: GraphNode; words: { id: string; label: string; lang: string }[] };
```

- [ ] **Step 2: Write the failing test for `buildGraph`**

Create `src/lib/word-graph/graph-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { SavedWord } from "@/lib/saved-words/types";
import { buildGraph } from "./graph-model";

function word(overrides: Partial<SavedWord> = {}): SavedWord {
  return {
    id: "de-haus",
    normalizedWord: "haus",
    displayWord: "Haus",
    language: "de",
    languageName: "Немецкий",
    firstMeaning: "дом",
    source: null,
    sourceUrl: null,
    createdAtMs: 1000,
    updatedAtMs: 1000,
    tags: [],
    ...overrides,
  };
}

describe("buildGraph", () => {
  it("создаёт по узлу на слово и по узлу на уникальный тег", () => {
    const { nodes } = buildGraph([
      word({ id: "a", displayWord: "muss", tags: ["aufgabe", "pflicht"] }),
      word({ id: "b", displayWord: "arbeit", tags: ["Aufgabe"] }), // дедуп по нормализованному ключу
    ]);
    const words = nodes.filter((n) => n.type === "word");
    const tags = nodes.filter((n) => n.type === "tag");
    expect(words).toHaveLength(2);
    expect(tags.map((t) => t.key).sort()).toEqual(["aufgabe", "pflicht"]);
  });

  it("связывает слово с каждым его тегом и считает степень тега", () => {
    const { nodes, links } = buildGraph([
      word({ id: "a", tags: ["aufgabe", "pflicht"] }),
      word({ id: "b", tags: ["aufgabe"] }),
    ]);
    expect(links).toHaveLength(3);
    const aufgabe = nodes.find((n) => n.key === "aufgabe")!;
    expect(aufgabe.deg).toBe(2);
    expect(aufgabe.r).toBeCloseTo(15 + 2 * 1.7, 5);
    const wordA = nodes.find((n) => n.id === "word:a")!;
    expect(wordA.r).toBe(7);
    expect(wordA.neighbors).toContain(aufgabe.id);
    expect(aufgabe.neighbors).toContain("word:a");
  });

  it("слова без тегов остаются изолированными узлами", () => {
    const { nodes, links } = buildGraph([word({ id: "lonely", tags: [] })]);
    expect(links).toHaveLength(0);
    const n = nodes.find((x) => x.id === "word:lonely")!;
    expect(n.neighbors).toHaveLength(0);
    expect(n.deg).toBe(0);
  });

  it("даёт префиксованные id и берёт lang/meaning из слова", () => {
    const { nodes } = buildGraph([
      word({ id: "x", displayWord: "no", language: "en", firstMeaning: "нет", tags: ["negation"] }),
    ]);
    const w = nodes.find((n) => n.id === "word:x")!;
    expect(w.lang).toBe("EN");
    expect(w.meaning).toBe("нет");
    expect(w.tags).toEqual(["negation"]);
    const t = nodes.find((n) => n.type === "tag")!;
    expect(t.id).toBe("tag:negation");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/word-graph/graph-model.test.ts`
Expected: FAIL — `buildGraph` is not exported / module missing.

- [ ] **Step 4: Implement `buildGraph`**

Create `src/lib/word-graph/graph-model.ts`:

```ts
import { collectTagOptions, normalizeTag } from "@/lib/saved-words/tags";
import type { SavedWord } from "@/lib/saved-words/types";
import type { GraphData, GraphNode } from "./types";

const TAG_BASE_R = 15;
const TAG_DEG_R = 1.7;
const TAG_MAX_DEG = 12;
const WORD_R = 7;

// Строит структуру графа из сохранённых слов. Позиции узлов нулевые —
// раскладку задаёт seedLayout(); так buildGraph детерминирован и тестируем.
export function buildGraph(words: SavedWord[]): GraphData {
  const nodes: GraphNode[] = [];
  const links: GraphData["links"] = [];
  const byId: Record<string, GraphNode> = {};

  // теги — из общего нормализующего хелпера (дедуп по ключу)
  const tagOptions = collectTagOptions(words);
  const tagIdByKey: Record<string, string> = {};
  for (const option of tagOptions) {
    const id = `tag:${option.key}`;
    tagIdByKey[option.key] = id;
    const node: GraphNode = {
      id,
      type: "tag",
      label: option.display,
      key: option.key,
      deg: 0,
      r: TAG_BASE_R,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      phase: 0,
      neighbors: [],
      hidden: false,
    };
    nodes.push(node);
    byId[id] = node;
  }

  for (const word of words) {
    const id = `word:${word.id}`;
    const tagKeys = word.tags.map(normalizeTag).filter(Boolean);
    const node: GraphNode = {
      id,
      type: "word",
      label: word.displayWord,
      lang: word.language.toUpperCase(),
      meaning: word.firstMeaning ?? "",
      tags: word.tags.slice(),
      tagKeys,
      deg: 0,
      r: WORD_R,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      phase: 0,
      neighbors: [],
      hidden: false,
    };
    nodes.push(node);
    byId[id] = node;

    for (const key of tagKeys) {
      const tid = tagIdByKey[key];
      if (!tid) continue;
      links.push({ a: id, b: tid });
      node.neighbors.push(tid);
      node.deg++;
      const tagNode = byId[tid];
      tagNode.neighbors.push(id);
      tagNode.deg++;
    }
  }

  // радиус тега зависит от степени
  for (const node of nodes) {
    if (node.type === "tag") {
      node.r = TAG_BASE_R + Math.min(node.deg, TAG_MAX_DEG) * TAG_DEG_R;
    }
  }

  return { nodes, links };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/word-graph/graph-model.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/word-graph/types.ts src/lib/word-graph/graph-model.ts src/lib/word-graph/graph-model.test.ts
git commit -m "feat(word-graph): модель графа buildGraph + типы"
```

---

## Task 2: `seedLayout` + `reconcileGraph` (position preservation)

**Files:**
- Modify: `src/lib/word-graph/graph-model.ts`
- Test: `src/lib/word-graph/graph-model.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `src/lib/word-graph/graph-model.test.ts` (add the new functions to the existing import line: `import { buildGraph, reconcileGraph, seedLayout } from "./graph-model";`):

```ts
describe("seedLayout", () => {
  it("разносит узлы из начала координат (теги ближе, слова дальше)", () => {
    const data = buildGraph([word({ id: "a", tags: ["aufgabe"] })]);
    seedLayout(data);
    for (const n of data.nodes) {
      expect(Math.hypot(n.x, n.y)).toBeGreaterThan(0);
      expect(n.phase).toBeGreaterThanOrEqual(0);
    }
    const tag = data.nodes.find((n) => n.type === "tag")!;
    const wordN = data.nodes.find((n) => n.type === "word")!;
    expect(Math.hypot(tag.x, tag.y)).toBeLessThan(Math.hypot(wordN.x, wordN.y));
  });
});

describe("reconcileGraph", () => {
  it("сохраняет координаты выживших узлов и засевает новые", () => {
    const prev = buildGraph([word({ id: "a", tags: ["aufgabe"] })]);
    seedLayout(prev);
    const a = prev.nodes.find((n) => n.id === "word:a")!;
    a.x = 123;
    a.y = -45;
    a.vx = 2;

    const next = buildGraph([
      word({ id: "a", tags: ["aufgabe"] }),
      word({ id: "b", tags: ["aufgabe"] }),
    ]);
    const merged = reconcileGraph(prev, next);

    const keptA = merged.nodes.find((n) => n.id === "word:a")!;
    expect(keptA.x).toBe(123);
    expect(keptA.y).toBe(-45);
    expect(keptA.vx).toBe(2);

    const newB = merged.nodes.find((n) => n.id === "word:b")!;
    expect(Math.hypot(newB.x, newB.y)).toBeGreaterThan(0); // засеян
  });

  it("отбрасывает узлы, которых больше нет", () => {
    const prev = buildGraph([word({ id: "a", tags: ["aufgabe"] })]);
    seedLayout(prev);
    const next = buildGraph([word({ id: "b", tags: ["aufgabe"] })]);
    const merged = reconcileGraph(prev, next);
    expect(merged.nodes.find((n) => n.id === "word:a")).toBeUndefined();
    expect(merged.nodes.find((n) => n.id === "word:b")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/word-graph/graph-model.test.ts`
Expected: FAIL — `seedLayout` / `reconcileGraph` not exported.

- [ ] **Step 3: Implement**

Append to `src/lib/word-graph/graph-model.ts`:

```ts
const SEED_R = 230;

// Засев позиций: теги по внутреннему кольцу, слова по внешнему с джиттером.
export function seedLayout(data: GraphData): void {
  const tags = data.nodes.filter((n) => n.type === "tag");
  const words = data.nodes.filter((n) => n.type === "word");
  tags.forEach((n, i) => {
    const a = (i / Math.max(1, tags.length)) * Math.PI * 2;
    n.x = Math.cos(a) * SEED_R * 0.5;
    n.y = Math.sin(a) * SEED_R * 0.5;
    n.vx = 0;
    n.vy = 0;
    n.phase = Math.random() * Math.PI * 2;
  });
  words.forEach((n, i) => {
    const a = (i / Math.max(1, words.length)) * Math.PI * 2 + 0.3;
    n.x = Math.cos(a) * SEED_R * (0.95 + Math.random() * 0.25);
    n.y = Math.sin(a) * SEED_R * (0.95 + Math.random() * 0.25);
    n.vx = 0;
    n.vy = 0;
    n.phase = Math.random() * Math.PI * 2;
  });
}

// Пересборка с сохранением координат: выжившие узлы (по id) держат
// x/y/vx/vy/phase, новые — засеваются.
export function reconcileGraph(prev: GraphData, next: GraphData): GraphData {
  const prevById = new Map(prev.nodes.map((n) => [n.id, n]));
  for (const node of next.nodes) {
    const old = prevById.get(node.id);
    if (old) {
      node.x = old.x;
      node.y = old.y;
      node.vx = old.vx;
      node.vy = old.vy;
      node.phase = old.phase;
    } else {
      const angle = Math.random() * Math.PI * 2;
      const radius = node.type === "tag" ? SEED_R * 0.5 : SEED_R * (0.95 + Math.random() * 0.25);
      node.x = Math.cos(angle) * radius;
      node.y = Math.sin(angle) * radius;
      node.phase = Math.random() * Math.PI * 2;
    }
  }
  return next;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/word-graph/graph-model.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/word-graph/graph-model.ts src/lib/word-graph/graph-model.test.ts
git commit -m "feat(word-graph): seedLayout + reconcileGraph (сохранение позиций)"
```

---

## Task 3: `matchNodes` (unified search)

**Files:**
- Modify: `src/lib/word-graph/graph-model.ts`
- Test: `src/lib/word-graph/graph-model.test.ts`

- [ ] **Step 1: Add failing tests**

Add `matchNodes` to the import line and append:

```ts
describe("matchNodes", () => {
  const data = buildGraph([
    word({ id: "nein", displayWord: "nein", firstMeaning: "нет", tags: ["negation", "decline"] }),
    word({ id: "tag", displayWord: "tag", firstMeaning: "день", tags: ["time"] }),
  ]);

  it("пустой запрос не даёт совпадений", () => {
    const r = matchNodes(data.nodes, "  ");
    expect(r.core.size).toBe(0);
    expect(r.highlight.size).toBe(0);
  });

  it("находит по ярлыку слова и добавляет соседей в highlight", () => {
    const r = matchNodes(data.nodes, "nein");
    expect(r.core.has("word:nein")).toBe(true);
    expect(r.highlight.has("tag:negation")).toBe(true); // сосед
    expect(r.highlight.has("tag:decline")).toBe(true);
  });

  it("находит по значению слова и по ярлыку тега", () => {
    expect(matchNodes(data.nodes, "день").core.has("word:tag")).toBe(true);
    expect(matchNodes(data.nodes, "negation").core.has("tag:negation")).toBe(true);
    // совпадение по тексту тега у слова
    expect(matchNodes(data.nodes, "decline").core.has("word:nein")).toBe(true);
  });

  it("регистронезависимый и по подстроке", () => {
    expect(matchNodes(data.nodes, "NEG").core.has("tag:negation")).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/word-graph/graph-model.test.ts`
Expected: FAIL — `matchNodes` not exported.

- [ ] **Step 3: Implement**

Append to `src/lib/word-graph/graph-model.ts`:

```ts
export interface SearchResult {
  core: Set<string>; // прямые совпадения
  highlight: Set<string>; // совпадения + соседи
}

// Единый поиск по словам И тегам: подстрока в ярлыке, значении слова
// или в ярлыках тегов слова. Пустой запрос — без совпадений.
export function matchNodes(nodes: GraphNode[], query: string): SearchResult {
  const q = query.trim().toLowerCase();
  const core = new Set<string>();
  if (!q) return { core, highlight: new Set() };

  for (const n of nodes) {
    if (n.label.toLowerCase().includes(q)) {
      core.add(n.id);
      continue;
    }
    if (n.type === "word") {
      if (n.meaning && n.meaning.toLowerCase().includes(q)) {
        core.add(n.id);
        continue;
      }
      if (n.tags && n.tags.some((t) => t.toLowerCase().includes(q))) {
        core.add(n.id);
      }
    }
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const highlight = new Set(core);
  for (const id of core) {
    const node = byId.get(id);
    node?.neighbors.forEach((nb) => highlight.add(nb));
  }
  return { core, highlight };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/word-graph/graph-model.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/word-graph/graph-model.ts src/lib/word-graph/graph-model.test.ts
git commit -m "feat(word-graph): matchNodes (единый поиск слова + теги)"
```

---

## Task 4: `computeHiddenIds` (filters)

**Files:**
- Modify: `src/lib/word-graph/graph-model.ts`
- Test: `src/lib/word-graph/graph-model.test.ts`

- [ ] **Step 1: Add failing tests**

Add `computeHiddenIds` to the import line; append:

```ts
describe("computeHiddenIds", () => {
  const data = buildGraph([
    word({ id: "a", tags: ["aufgabe"] }),
    word({ id: "b", tags: ["time"] }),
  ]);

  it("без фильтров не прячет ничего", () => {
    const hidden = computeHiddenIds(data.nodes, { tags: new Set(), type: "all" });
    expect(hidden.size).toBe(0);
  });

  it("type=word прячет теги, type=tag прячет слова", () => {
    const wOnly = computeHiddenIds(data.nodes, { tags: new Set(), type: "word" });
    expect(wOnly.has("tag:aufgabe")).toBe(true);
    expect(wOnly.has("word:a")).toBe(false);

    const tOnly = computeHiddenIds(data.nodes, { tags: new Set(), type: "tag" });
    expect(tOnly.has("word:a")).toBe(true);
    expect(tOnly.has("tag:aufgabe")).toBe(false);
  });

  it("выбранные теги оставляют только их и несущие слова", () => {
    const hidden = computeHiddenIds(data.nodes, { tags: new Set(["aufgabe"]), type: "all" });
    expect(hidden.has("tag:aufgabe")).toBe(false);
    expect(hidden.has("word:a")).toBe(false);
    expect(hidden.has("tag:time")).toBe(true);
    expect(hidden.has("word:b")).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/word-graph/graph-model.test.ts`
Expected: FAIL — `computeHiddenIds` not exported.

- [ ] **Step 3: Implement**

Append to `src/lib/word-graph/graph-model.ts` (add `GraphFilters` to the type import at the top: `import type { CardData, GraphData, GraphFilters, GraphNode, TagOptionCount } from "./types";` — note `CardData`/`TagOptionCount` are used in Task 5):

```ts
// Возвращает множество id скрытых узлов по фильтрам (тип + теги, И-логика).
export function computeHiddenIds(nodes: GraphNode[], filters: GraphFilters): Set<string> {
  const hasTagFilter = filters.tags.size > 0;
  const hidden = new Set<string>();
  for (const n of nodes) {
    let visible = true;
    if (filters.type === "word" && n.type === "tag") visible = false;
    if (filters.type === "tag" && n.type === "word") visible = false;
    if (visible && hasTagFilter) {
      if (n.type === "tag") visible = !!n.key && filters.tags.has(n.key);
      else visible = !!n.tagKeys && n.tagKeys.some((k) => filters.tags.has(k));
    }
    if (!visible) hidden.add(n.id);
  }
  return hidden;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/word-graph/graph-model.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/word-graph/graph-model.ts src/lib/word-graph/graph-model.test.ts
git commit -m "feat(word-graph): computeHiddenIds (фильтры тип + теги)"
```

---

## Task 5: Transforms, `nodeAt`, `tagOptionsFromNodes`, `cardDataFor`

**Files:**
- Modify: `src/lib/word-graph/graph-model.ts`
- Test: `src/lib/word-graph/graph-model.test.ts`

- [ ] **Step 1: Add failing tests**

Add `toScreenX, toWorldX, nodeAt, tagOptionsFromNodes, cardDataFor` to the import line; append:

```ts
import type { Camera } from "./types";

describe("transforms", () => {
  const cam: Camera = { x: 50, y: -20, scale: 1.5 };
  it("world→screen→world возвращает исходную координату", () => {
    expect(toWorldX(toScreenX(12.5, cam), cam)).toBeCloseTo(12.5, 6);
  });
});

describe("nodeAt", () => {
  it("находит узел под экранной точкой и пропускает скрытые", () => {
    const data = buildGraph([word({ id: "a", tags: [] })]);
    const cam: Camera = { x: 0, y: 0, scale: 1 };
    const n = data.nodes[0];
    n.x = 0;
    n.y = 0; // экранная точка (0,0)
    expect(nodeAt(data.nodes, 0, 0, cam)?.id).toBe(n.id);
    expect(nodeAt(data.nodes, 999, 999, cam)).toBeNull();
    n.hidden = true;
    expect(nodeAt(data.nodes, 0, 0, cam)).toBeNull();
  });
});

describe("tagOptionsFromNodes", () => {
  it("даёт ключ/ярлык/счётчик из тег-узлов, сортируя по ключу", () => {
    const data = buildGraph([
      word({ id: "a", tags: ["time", "aufgabe"] }),
      word({ id: "b", tags: ["aufgabe"] }),
    ]);
    expect(tagOptionsFromNodes(data.nodes)).toEqual([
      { key: "aufgabe", display: "aufgabe", count: 2 },
      { key: "time", display: "time", count: 1 },
    ]);
  });
});

describe("cardDataFor", () => {
  const data = buildGraph([
    word({ id: "nein", displayWord: "nein", language: "de", tags: ["negation"] }),
  ]);
  it("для слова перечисляет его теги", () => {
    const node = data.nodes.find((n) => n.id === "word:nein")!;
    const card = cardDataFor(node, data.nodes);
    expect(card.kind).toBe("word");
    if (card.kind === "word") expect(card.tags).toEqual([{ id: "tag:negation", label: "negation" }]);
  });
  it("для тега перечисляет несущие слова с языком", () => {
    const node = data.nodes.find((n) => n.id === "tag:negation")!;
    const card = cardDataFor(node, data.nodes);
    expect(card.kind).toBe("tag");
    if (card.kind === "tag") expect(card.words).toEqual([{ id: "word:nein", label: "nein", lang: "DE" }]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/word-graph/graph-model.test.ts`
Expected: FAIL — new functions not exported.

- [ ] **Step 3: Implement**

Append to `src/lib/word-graph/graph-model.ts`:

```ts
import type { Camera } from "./types";

export function toScreenX(x: number, cam: Camera): number {
  return x * cam.scale + cam.x;
}
export function toScreenY(y: number, cam: Camera): number {
  return y * cam.scale + cam.y;
}
export function toWorldX(sx: number, cam: Camera): number {
  return (sx - cam.x) / cam.scale;
}
export function toWorldY(sy: number, cam: Camera): number {
  return (sy - cam.y) / cam.scale;
}

// Хит-тест: верхний (последний) видимый узел под экранной точкой, +4px запас.
export function nodeAt(nodes: GraphNode[], sx: number, sy: number, cam: Camera): GraphNode | null {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (n.hidden) continue;
    const dx = sx - toScreenX(n.x, cam);
    const dy = sy - toScreenY(n.y, cam);
    const r = n.r * cam.scale + 4;
    if (dx * dx + dy * dy <= r * r) return n;
  }
  return null;
}

// Опции чипов-фильтров из тег-узлов (ключ, ярлык, число слов), сортировка по ключу.
export function tagOptionsFromNodes(nodes: GraphNode[]): TagOptionCount[] {
  return nodes
    .filter((n) => n.type === "tag")
    .map((n) => ({ key: n.key!, display: n.label, count: n.deg }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

// Данные карточки выбранного узла.
export function cardDataFor(node: GraphNode, nodes: GraphNode[]): CardData {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  if (node.type === "word") {
    const tags = (node.tagKeys ?? []).map((key) => {
      const tagNode = byId.get(`tag:${key}`);
      return { id: `tag:${key}`, label: tagNode?.label ?? key };
    });
    return { kind: "word", node, tags };
  }
  const words = node.neighbors
    .map((id) => byId.get(id))
    .filter((n): n is GraphNode => !!n && n.type === "word")
    .map((n) => ({ id: n.id, label: n.label, lang: n.lang ?? "" }));
  return { kind: "tag", node, words };
}
```

Note: the file now has a couple of `import type { Camera }` lines — merge them into one at the top (`import type { Camera, CardData, GraphData, GraphFilters, GraphNode, TagOptionCount } from "./types";`) and remove the duplicate inline import so `tsc` stays clean.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/word-graph/graph-model.test.ts`
Expected: PASS (all groups).

- [ ] **Step 5: Verify types compile**

Run: `npx tsc -b --noEmit` (or `npm run build` later). Expected: no errors from `graph-model.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/word-graph/graph-model.ts src/lib/word-graph/graph-model.test.ts
git commit -m "feat(word-graph): transforms, nodeAt, опции тегов и данные карточки"
```

---

## Task 6: Persistence

**Files:**
- Create: `src/lib/word-graph/persistence.ts`
- Test: `src/lib/word-graph/persistence.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/word-graph/persistence.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";

import { buildGraph } from "./graph-model";
import { applyPersisted, clearGraphState, loadGraphState, saveGraphState } from "./persistence";
import type { SavedWord } from "@/lib/saved-words/types";

function word(id: string, tags: string[]): SavedWord {
  return {
    id,
    normalizedWord: id,
    displayWord: id,
    language: "de",
    languageName: null,
    firstMeaning: null,
    source: null,
    sourceUrl: null,
    createdAtMs: 0,
    updatedAtMs: 0,
    tags,
  };
}

afterEach(() => {
  localStorage.clear();
});

describe("persistence", () => {
  it("save → load восстанавливает камеру и позиции", () => {
    saveGraphState({ cam: { x: 1, y: 2, scale: 1.5 }, pos: { "word:a": [10, 20] } });
    const loaded = loadGraphState();
    expect(loaded?.cam).toEqual({ x: 1, y: 2, scale: 1.5 });
    expect(loaded?.pos["word:a"]).toEqual([10, 20]);
  });

  it("load возвращает null при отсутствии и при битом JSON", () => {
    expect(loadGraphState()).toBeNull();
    localStorage.setItem("lupa-graph-v1", "{not json");
    expect(loadGraphState()).toBeNull();
  });

  it("clearGraphState стирает ключ", () => {
    saveGraphState({ cam: { x: 0, y: 0, scale: 1 }, pos: {} });
    clearGraphState();
    expect(loadGraphState()).toBeNull();
  });

  it("applyPersisted ставит координаты известным id и игнорирует устаревшие", () => {
    const data = buildGraph([word("a", [])]);
    applyPersisted(data.nodes, { cam: { x: 0, y: 0, scale: 1 }, pos: { "word:a": [7, 8], "word:ghost": [1, 1] } });
    const a = data.nodes.find((n) => n.id === "word:a")!;
    expect([a.x, a.y]).toEqual([7, 8]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/word-graph/persistence.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/lib/word-graph/persistence.ts`:

```ts
import type { Camera, GraphNode } from "./types";

const STORE_KEY = "lupa-graph-v1";

export interface PersistedState {
  cam: Camera;
  pos: Record<string, [number, number]>;
}

export function loadGraphState(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    if (!parsed || !parsed.cam || !parsed.pos) return null;
    return { cam: parsed.cam, pos: parsed.pos };
  } catch {
    return null;
  }
}

export function saveGraphState(state: PersistedState): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    // webview без localStorage — молча пропускаем
  }
}

export function clearGraphState(): void {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    // ignore
  }
}

// Применяет сохранённые позиции к узлам по id; неизвестные id игнорируются.
export function applyPersisted(nodes: GraphNode[], state: PersistedState): void {
  for (const n of nodes) {
    const p = state.pos[n.id];
    if (p) {
      n.x = p[0];
      n.y = p[1];
      n.vx = 0;
      n.vy = 0;
    }
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/word-graph/persistence.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/word-graph/persistence.ts src/lib/word-graph/persistence.test.ts
git commit -m "feat(word-graph): персистентность камеры и позиций (localStorage)"
```

---

## Task 7: `Simulation` (physics + draw)

**Files:**
- Create: `src/lib/word-graph/simulation.ts`
- Test: `src/lib/word-graph/simulation.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/word-graph/simulation.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { buildGraph, seedLayout } from "./graph-model";
import { Simulation } from "./simulation";
import type { SavedWord } from "@/lib/saved-words/types";

function word(id: string, tags: string[]): SavedWord {
  return {
    id,
    normalizedWord: id,
    displayWord: id,
    language: "de",
    languageName: null,
    firstMeaning: null,
    source: null,
    sourceUrl: null,
    createdAtMs: 0,
    updatedAtMs: 0,
    tags,
  };
}

function makeSim() {
  const data = buildGraph([word("a", ["t"]), word("b", ["t"]), word("c", [])]);
  seedLayout(data);
  return new Simulation(data);
}

describe("Simulation", () => {
  it("step() держит координаты конечными и не бросает", () => {
    const sim = makeSim();
    for (let i = 0; i < 200; i++) sim.step(0.016);
    for (const n of sim.data.nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    }
  });

  it("alpha остывает к полу, reheat поднимает", () => {
    const sim = makeSim();
    for (let i = 0; i < 500; i++) sim.step(0.016);
    expect(sim.alpha).toBeLessThan(0.1);
    sim.reheat(0.8);
    expect(sim.alpha).toBeGreaterThanOrEqual(0.8);
  });

  it("draw() вызывает рисующие методы контекста и не бросает", () => {
    const sim = makeSim();
    const ctx = fakeCtx();
    expect(() => sim.draw(ctx as unknown as CanvasRenderingContext2D, 600, 400, 1)).not.toThrow();
    expect(ctx.clearRect).toHaveBeenCalled();
    expect(ctx.arc).toHaveBeenCalled();
  });
});

function fakeCtx() {
  return {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    arcTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 10 })),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    textAlign: "",
    textBaseline: "",
    globalAlpha: 1,
  };
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/word-graph/simulation.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/lib/word-graph/simulation.ts` (ported from the handoff engine; physics constants verbatim):

```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/word-graph/simulation.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/word-graph/simulation.ts src/lib/word-graph/simulation.test.ts
git commit -m "feat(word-graph): canvas force-simulation (физика + отрисовка)"
```

---

## Task 8: `useWordGraph` hook

**Files:**
- Create: `src/lib/word-graph/use-word-graph.ts`

(The hook is integration glue over already-tested units; it is exercised by the component/navigation tests in later tasks. No isolated unit test — RAF + canvas + pointer capture are not meaningful in jsdom.)

- [ ] **Step 1: Implement the hook**

Create `src/lib/word-graph/use-word-graph.ts`:

```ts
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
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc -b --noEmit`
Expected: no type errors. (No test yet — covered by component tests.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/word-graph/use-word-graph.ts
git commit -m "feat(word-graph): хук useWordGraph (RAF, события, действия)"
```

---

## Task 9: `GraphSearchField` component

**Files:**
- Create: `src/components/word-graph/graph-search-field.tsx`
- Test: `src/components/word-graph/graph-search-field.test.tsx`

- [ ] **Step 1: Write failing test**

Create `src/components/word-graph/graph-search-field.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { GraphSearchField } from "./graph-search-field";

describe("GraphSearchField", () => {
  it("показывает кнопку очистки только при непустом значении и очищает", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<GraphSearchField value="" onChange={onChange} />);
    expect(screen.queryByRole("button", { name: "Очистить" })).toBeNull();

    rerender(<GraphSearchField value="nein" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Очистить" }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("вводит текст и сообщает наверх", async () => {
    const onChange = vi.fn();
    render(<GraphSearchField value="" onChange={onChange} />);
    await userEvent.type(screen.getByLabelText("Поиск по словам и тегам"), "n");
    expect(onChange).toHaveBeenCalledWith("n");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/word-graph/graph-search-field.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/components/word-graph/graph-search-field.tsx`:

```tsx
import { Search, X } from "lucide-react";

type GraphSearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  onEnter?: () => void;
  className?: string;
};

export function GraphSearchField({ value, onChange, onClear, onEnter, className }: GraphSearchFieldProps) {
  return (
    <div
      className={
        "flex h-[54px] items-center gap-3 rounded-full border-[1.5px] border-line-2 bg-paper px-5 [transition:border-color_0.2s_var(--ease-soft),box-shadow_0.2s_var(--ease-soft)] focus-within:border-ink focus-within:shadow-[0_0_0_4px_rgba(12,12,12,0.05)] " +
        (className ?? "")
      }
    >
      <Search className="h-5 w-5 shrink-0 text-ink-2" aria-hidden="true" />
      <input
        aria-label="Поиск по словам и тегам"
        placeholder="искать слово или тег…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            onChange("");
            onClear?.();
          }
          if (e.key === "Enter") onEnter?.();
        }}
        className="min-w-0 flex-1 border-0 bg-transparent text-base text-ink outline-none placeholder:text-ink-3"
      />
      <span className="hidden shrink-0 font-mono text-[10px] tracking-[0.1em] text-ink-3 uppercase sm:inline">
        слова + теги
      </span>
      {value.length > 0 ? (
        <button
          type="button"
          aria-label="Очистить"
          onClick={() => {
            onChange("");
            onClear?.();
          }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-paper-2 text-ink-2 transition-colors hover:bg-ink hover:text-paper"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/word-graph/graph-search-field.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/word-graph/graph-search-field.tsx src/components/word-graph/graph-search-field.test.tsx
git commit -m "feat(word-graph): поле единого поиска"
```

---

## Task 10: `GraphFilterRow` component

**Files:**
- Create: `src/components/word-graph/graph-filter-row.tsx`
- Test: `src/components/word-graph/graph-filter-row.test.tsx`

- [ ] **Step 1: Write failing test**

Create `src/components/word-graph/graph-filter-row.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { GraphFilterRow } from "./graph-filter-row";

const tagOptions = [
  { key: "aufgabe", display: "aufgabe", count: 2 },
  { key: "time", display: "time", count: 1 },
];

describe("GraphFilterRow", () => {
  it("переключает тег-чип и помечает активным", async () => {
    const onToggle = vi.fn();
    render(
      <GraphFilterRow
        tagOptions={tagOptions}
        activeTags={["aufgabe"]}
        onToggleTag={onToggle}
        typeFilter="all"
        onTypeChange={vi.fn()}
      />,
    );
    const chip = screen.getByRole("button", { name: /aufgabe/ });
    expect(chip).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: /time/ }));
    expect(onToggle).toHaveBeenCalledWith("time");
  });

  it("переключает сегмент типа", async () => {
    const onTypeChange = vi.fn();
    render(
      <GraphFilterRow
        tagOptions={tagOptions}
        activeTags={[]}
        onToggleTag={vi.fn()}
        typeFilter="all"
        onTypeChange={onTypeChange}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "слова" }));
    expect(onTypeChange).toHaveBeenCalledWith("word");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/word-graph/graph-filter-row.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/components/word-graph/graph-filter-row.tsx`:

```tsx
import type { TagOptionCount, TypeFilter } from "@/lib/word-graph/types";
import { cn } from "@/lib/utils";

type GraphFilterRowProps = {
  tagOptions: TagOptionCount[];
  activeTags: string[];
  onToggleTag: (key: string) => void;
  typeFilter: TypeFilter;
  onTypeChange: (type: TypeFilter) => void;
  className?: string;
};

const TYPE_SEGMENTS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "всё" },
  { value: "word", label: "слова" },
  { value: "tag", label: "теги" },
];

export function GraphFilterRow({
  tagOptions,
  activeTags,
  onToggleTag,
  typeFilter,
  onTypeChange,
  className,
}: GraphFilterRowProps) {
  const active = new Set(activeTags);
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="shrink-0 font-mono text-[10px] tracking-[0.1em] text-ink-3 uppercase">показать</span>
      <div className="flex min-w-0 flex-1 flex-wrap gap-[7px]">
        {tagOptions.map((option) => {
          const on = active.has(option.key);
          return (
            <button
              key={option.key}
              type="button"
              aria-pressed={on}
              onClick={() => onToggleTag(option.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border-[1.5px] px-3 py-[5px] text-[12.5px] transition-colors",
                on ? "border-ink bg-ink text-paper" : "border-line-2 bg-paper text-ink hover:border-ink",
              )}
            >
              {option.display}
              <span className={cn("font-mono text-[10px]", on ? "text-paper/70" : "text-ink-3")}>
                {option.count}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex shrink-0 gap-0.5 rounded-full border border-line-2 bg-paper p-0.5">
        {TYPE_SEGMENTS.map((segment) => (
          <button
            key={segment.value}
            type="button"
            aria-pressed={typeFilter === segment.value}
            onClick={() => onTypeChange(segment.value)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              typeFilter === segment.value ? "bg-ink text-paper" : "text-ink-2 hover:text-ink",
            )}
          >
            {segment.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/word-graph/graph-filter-row.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/word-graph/graph-filter-row.tsx src/components/word-graph/graph-filter-row.test.tsx
git commit -m "feat(word-graph): строка фильтров (чипы тегов + сегмент типа)"
```

---

## Task 11: `GraphDetailCard` component

**Files:**
- Create: `src/components/word-graph/graph-detail-card.tsx`
- Test: `src/components/word-graph/graph-detail-card.test.tsx`

- [ ] **Step 1: Write failing test**

Create `src/components/word-graph/graph-detail-card.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { GraphDetailCard } from "./graph-detail-card";
import type { CardData, GraphNode } from "@/lib/word-graph/types";

function tagNode(id: string, label: string): GraphNode {
  return { id, type: "tag", label, key: label, deg: 1, r: 16, x: 0, y: 0, vx: 0, vy: 0, phase: 0, neighbors: [], hidden: false };
}

describe("GraphDetailCard", () => {
  it("рисует слово, бейдж языка и теги-пилюли; клик по тегу фокусирует", async () => {
    const node: GraphNode = {
      id: "word:nein",
      type: "word",
      label: "nein",
      lang: "DE",
      meaning: "нет",
      tags: ["negation"],
      tagKeys: ["negation"],
      deg: 1,
      r: 7,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      phase: 0,
      neighbors: ["tag:negation"],
      hidden: false,
    };
    const card: CardData = { kind: "word", node, tags: [{ id: "tag:negation", label: "negation" }] };
    const onFocus = vi.fn();
    render(<GraphDetailCard card={card} onClose={vi.fn()} onFocusNode={onFocus} />);
    expect(screen.getByText("nein")).toBeInTheDocument();
    expect(screen.getByText("DE")).toBeInTheDocument();
    expect(screen.getByText("нет")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "negation" }));
    expect(onFocus).toHaveBeenCalledWith("tag:negation");
  });

  it("рисует тег и его слова-пилюли; клик по слову фокусирует", async () => {
    const card: CardData = {
      kind: "tag",
      node: tagNode("tag:negation", "negation"),
      words: [{ id: "word:nein", label: "nein", lang: "DE" }],
    };
    const onFocus = vi.fn();
    render(<GraphDetailCard card={card} onClose={vi.fn()} onFocusNode={onFocus} />);
    expect(screen.getByText("тег")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /nein/ }));
    expect(onFocus).toHaveBeenCalledWith("word:nein");
  });

  it("закрывается крестиком", async () => {
    const card: CardData = { kind: "tag", node: tagNode("tag:t", "t"), words: [] };
    const onClose = vi.fn();
    render(<GraphDetailCard card={card} onClose={onClose} onFocusNode={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/word-graph/graph-detail-card.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/components/word-graph/graph-detail-card.tsx`:

```tsx
import { X } from "lucide-react";

import type { CardData } from "@/lib/word-graph/types";
import { cn } from "@/lib/utils";

type GraphDetailCardProps = {
  card: CardData;
  onClose: () => void;
  onFocusNode: (id: string) => void;
  className?: string;
};

export function GraphDetailCard({ card, onClose, onFocusNode, className }: GraphDetailCardProps) {
  return (
    <div
      className={cn(
        "w-[274px] rounded-card border border-line bg-paper p-4 shadow-[0_12px_40px_rgba(12,12,12,0.12)] motion-safe:animate-popin",
        className,
      )}
    >
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute top-3 right-3 flex h-6 w-6 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-ink hover:text-paper"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      <div className="flex items-center gap-2 pr-7">
        <span className="text-[23px] leading-none font-semibold tracking-[-0.01em] text-ink">{card.node.label}</span>
        {card.kind === "word" && card.node.lang ? (
          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">{card.node.lang}</span>
        ) : null}
        <span
          className={cn(
            "ml-auto rounded-full px-2 py-0.5 font-mono text-[9.5px] tracking-[0.08em] uppercase",
            card.kind === "word" ? "bg-paper-2 text-ink-2" : "bg-ink text-paper",
          )}
        >
          {card.kind === "word" ? "слово" : "тег"}
        </span>
      </div>

      {card.kind === "word" ? (
        <>
          <div className="mt-2.5 text-sm leading-[1.5] text-ink-2">{card.node.meaning || "без значения"}</div>
          <div className="mt-3.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Теги · {card.tags.length}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {card.tags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => onFocusNode(tag.id)}
                className="rounded-full border-[1.5px] border-line-2 px-2.5 py-1 text-[12.5px] text-ink transition-colors hover:border-ink"
              >
                {tag.label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="mt-3.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Слова · {card.words.length}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {card.words.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => onFocusNode(w.id)}
                className="flex items-center gap-1 rounded-full bg-ink px-2.5 py-1 text-[12.5px] text-paper transition-opacity hover:opacity-85"
              >
                {w.label}
                <span className="font-mono text-[9px] text-paper/70">{w.lang}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/word-graph/graph-detail-card.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/word-graph/graph-detail-card.tsx src/components/word-graph/graph-detail-card.test.tsx
git commit -m "feat(word-graph): карточка узла (слово/тег) с пилюлями"
```

---

## Task 12: `GraphCanvas` component + canvas stub in test setup

**Files:**
- Modify: `src/test/setup.ts`
- Create: `src/components/word-graph/graph-canvas.tsx`
- Test: `src/components/word-graph/graph-canvas.test.tsx`

- [ ] **Step 1: Stub canvas `getContext` in jsdom**

Edit `src/test/setup.ts`, append (jsdom returns `null` from `getContext`, which breaks any mounted `<canvas>`):

```ts
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
```

- [ ] **Step 2: Write failing test**

Create `src/components/word-graph/graph-canvas.test.tsx`:

```tsx
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
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/components/word-graph/graph-canvas.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 4: Implement**

Create `src/components/word-graph/graph-canvas.tsx`:

```tsx
import { Minus, Plus, RotateCcw } from "lucide-react";
import type { ReactNode, RefObject } from "react";

import { cn } from "@/lib/utils";

type GraphCanvasProps = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  noResultQuery: string | null;
  isTouch: boolean;
  card?: ReactNode;
  className?: string;
};

export function GraphCanvas({
  canvasRef,
  containerRef,
  onZoomIn,
  onZoomOut,
  onReset,
  noResultQuery,
  isTouch,
  card,
  className,
}: GraphCanvasProps) {
  return (
    <div
      ref={containerRef}
      className={cn(
        "relative min-h-[520px] flex-1 overflow-hidden rounded-card border border-line bg-paper",
        className,
      )}
    >
      <canvas ref={canvasRef} className="absolute inset-0 touch-none [cursor:grab] [&.grabbing]:cursor-grabbing [&.hovering]:cursor-pointer" />

      {/* легенда */}
      <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-3 rounded-full bg-paper/85 px-3 py-1.5 text-[13px] text-ink-2 backdrop-blur">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-ink" /> тег
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-[11px] w-[11px] rounded-full border-[1.5px] border-ink bg-paper" /> слово
        </span>
      </div>

      {/* подсказка по управлению */}
      <div className="pointer-events-none absolute top-3 right-3 text-right font-mono text-[10px] leading-[1.6] tracking-[0.04em] text-ink-3">
        {isTouch ? (
          <>
            <div>щипок — зум</div>
            <div>тяни — двигать</div>
            <div>тап — открыть</div>
          </>
        ) : (
          <>
            <div>колесо — зум</div>
            <div>тяни узел — двигать</div>
            <div>клик — открыть</div>
          </>
        )}
      </div>

      {/* зум */}
      <div className="absolute bottom-3 left-3 flex flex-col overflow-hidden rounded-[14px] border border-line bg-paper">
        <button type="button" aria-label="Приблизить" onClick={onZoomIn} className="flex h-[38px] w-[38px] items-center justify-center text-ink transition-colors hover:bg-ink hover:text-paper">
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" aria-label="Отдалить" onClick={onZoomOut} className="flex h-[38px] w-[38px] items-center justify-center border-t border-line text-ink transition-colors hover:bg-ink hover:text-paper">
          <Minus className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" aria-label="Сбросить" onClick={onReset} className="flex h-[38px] w-[38px] items-center justify-center border-t border-line text-ink transition-colors hover:bg-ink hover:text-paper">
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* нет результатов */}
      {noResultQuery ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-center">
          <div className="text-[17px] font-medium text-ink-2">Пусто</div>
          <div className="text-[13px] text-ink-3">по запросу «{noResultQuery}» ничего не найдено</div>
        </div>
      ) : null}

      {/* карточка */}
      {card ? <div className="absolute right-3 bottom-3">{card}</div> : null}
    </div>
  );
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/components/word-graph/graph-canvas.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Run the whole suite to confirm the setup change didn't break anything**

Run: `npm test`
Expected: PASS (all existing + new tests).

- [ ] **Step 7: Commit**

```bash
git add src/test/setup.ts src/components/word-graph/graph-canvas.tsx src/components/word-graph/graph-canvas.test.tsx
git commit -m "feat(word-graph): canvas-область (легенда, зум, оверлей пустоты) + canvas-заглушка в тестах"
```

---

## Task 13: `WordGraphScreen` (desktop) — assembles hook + chrome

**Files:**
- Create: `src/components/word-graph/word-graph-screen.tsx`
- Test: `src/components/word-graph/word-graph-screen.test.tsx`

- [ ] **Step 1: Write failing test**

Create `src/components/word-graph/word-graph-screen.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { WordGraphScreen } from "./word-graph-screen";
import type { SavedWord } from "@/lib/saved-words/types";

function word(id: string, tags: string[]): SavedWord {
  return {
    id,
    normalizedWord: id,
    displayWord: id,
    language: "de",
    languageName: null,
    firstMeaning: id,
    source: null,
    sourceUrl: null,
    createdAtMs: 0,
    updatedAtMs: 0,
    tags,
  };
}

describe("WordGraphScreen", () => {
  it("рисует заголовок, счётчики и кнопку назад", async () => {
    const onBack = vi.fn();
    render(<WordGraphScreen words={[word("muss", ["aufgabe"]), word("nein", ["negation"])]} onBack={onBack} />);
    expect(screen.getByRole("heading", { name: "Граф слов" })).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument(); // 2 слова
    await userEvent.click(screen.getByRole("button", { name: /к плееру/ }));
    expect(onBack).toHaveBeenCalled();
  });

  it("показывает пустое состояние без слов", () => {
    render(<WordGraphScreen words={[]} onBack={vi.fn()} />);
    expect(screen.getByText(/Сохранённых слов пока нет/)).toBeInTheDocument();
  });

  it("чип фильтра по тегу присутствует", () => {
    render(<WordGraphScreen words={[word("muss", ["aufgabe"])]} onBack={vi.fn()} />);
    expect(screen.getByRole("button", { name: /aufgabe/ })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/word-graph/word-graph-screen.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/components/word-graph/word-graph-screen.tsx`:

```tsx
import { useReducedMotion } from "@/lib/player/use-reduced-motion";
import type { SavedWord } from "@/lib/saved-words/types";
import { useWordGraph } from "@/lib/word-graph/use-word-graph";
import { SnakeBorder } from "@/components/snake-border";
import { GraphCanvas } from "./graph-canvas";
import { GraphDetailCard } from "./graph-detail-card";
import { GraphFilterRow } from "./graph-filter-row";
import { GraphSearchField } from "./graph-search-field";

type WordGraphScreenProps = {
  words: SavedWord[];
  onBack: () => void;
};

export function WordGraphScreen({ words, onBack }: WordGraphScreenProps) {
  const reduceMotion = useReducedMotion();
  const graph = useWordGraph(words, reduceMotion);
  const isEmpty = words.length === 0;

  return (
    <div className="flex min-h-[calc(100vh-120px)] flex-col px-9 pt-[18px] pb-[30px]">
      {/* шапка */}
      <div className="flex items-end gap-3.5">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="relative inline-block h-[26px] w-[26px] rounded-full border-2 border-ink after:absolute after:top-[20px] after:left-[18px] after:h-[10px] after:w-[2px] after:rotate-45 after:bg-ink after:content-['']" />
          <div>
            <h1 className="text-[26px] leading-none font-medium tracking-[-0.02em] text-ink">Граф слов</h1>
            <p className="mt-1 text-[13px] text-ink-2">сохранённые слова и их теги — как созвездие связей</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3.5">
          <span className="font-mono text-[13px] text-ink-3">
            <span className="text-sm font-semibold text-ink">{graph.counts.words}</span> слов
          </span>
          <span className="font-mono text-[13px] text-ink-3">
            <span className="text-sm font-semibold text-ink">{graph.counts.tags}</span> тегов
          </span>
          <button
            type="button"
            onClick={onBack}
            className="group/snake relative flex items-center gap-2 rounded-full border-[1.5px] border-line-2 bg-paper px-4 py-2 text-[13px] font-medium text-ink transition-colors hover:border-ink"
          >
            <span aria-hidden="true" className="inline-block transition-transform duration-[450ms] ease-spring group-hover/snake:-translate-x-1">
              ←
            </span>
            к плееру
            <SnakeBorder shape="pill" />
          </button>
        </div>
      </div>

      {isEmpty ? (
        <div className="mt-[18px] flex flex-1 items-center justify-center rounded-card border border-line bg-paper text-center text-[13px] leading-[1.7] text-ink-3">
          Сохранённых слов пока нет
        </div>
      ) : (
        <>
          <GraphSearchField
            className="mt-5"
            value={graph.search}
            onChange={graph.setSearch}
          />
          <GraphFilterRow
            className="mt-3.5"
            tagOptions={graph.tagOptions}
            activeTags={graph.filterTags}
            onToggleTag={graph.toggleTagFilter}
            typeFilter={graph.typeFilter}
            onTypeChange={graph.setTypeFilter}
          />
          <GraphCanvas
            className="mt-[18px]"
            canvasRef={graph.canvasRef}
            containerRef={graph.containerRef}
            onZoomIn={graph.zoomIn}
            onZoomOut={graph.zoomOut}
            onReset={graph.reset}
            noResultQuery={graph.noResultQuery}
            isTouch={false}
            card={
              graph.card ? (
                <GraphDetailCard card={graph.card} onClose={graph.closeCard} onFocusNode={graph.focusAndSelect} />
              ) : undefined
            }
          />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create the reduced-motion hook if it does not exist**

Check: `ls src/lib/player/use-reduced-motion.ts`. If missing, create `src/lib/player/use-reduced-motion.ts`:

```ts
import { useEffect, useState } from "react";

// true, если пользователь предпочитает уменьшить движение.
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/components/word-graph/word-graph-screen.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/word-graph/word-graph-screen.tsx src/lib/player/use-reduced-motion.ts
git add src/components/word-graph/word-graph-screen.test.tsx
git commit -m "feat(word-graph): десктоп-экран «Граф слов»"
```

---

## Task 14: `MobileWordGraphScreen` (full-screen mobile)

**Files:**
- Create: `src/components/word-graph/mobile-word-graph-screen.tsx`
- Test: `src/components/word-graph/mobile-word-graph-screen.test.tsx`

- [ ] **Step 1: Write failing test**

Create `src/components/word-graph/mobile-word-graph-screen.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MobileWordGraphScreen } from "./mobile-word-graph-screen";
import type { SavedWord } from "@/lib/saved-words/types";

function word(id: string, tags: string[]): SavedWord {
  return {
    id,
    normalizedWord: id,
    displayWord: id,
    language: "de",
    languageName: null,
    firstMeaning: id,
    source: null,
    sourceUrl: null,
    createdAtMs: 0,
    updatedAtMs: 0,
    tags,
  };
}

describe("MobileWordGraphScreen", () => {
  it("рисует заголовок и зовёт onBack", async () => {
    const onBack = vi.fn();
    render(<MobileWordGraphScreen words={[word("muss", ["aufgabe"])]} onBack={onBack} />);
    expect(screen.getByText("Граф слов")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Назад" }));
    expect(onBack).toHaveBeenCalled();
  });

  it("пустое состояние без слов", () => {
    render(<MobileWordGraphScreen words={[]} onBack={vi.fn()} />);
    expect(screen.getByText(/Сохранённых слов пока нет/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/word-graph/mobile-word-graph-screen.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/components/word-graph/mobile-word-graph-screen.tsx`:

```tsx
import { ChevronLeft } from "lucide-react";

import { useReducedMotion } from "@/lib/player/use-reduced-motion";
import type { SavedWord } from "@/lib/saved-words/types";
import { useWordGraph } from "@/lib/word-graph/use-word-graph";
import { GraphCanvas } from "./graph-canvas";
import { GraphDetailCard } from "./graph-detail-card";
import { GraphFilterRow } from "./graph-filter-row";
import { GraphSearchField } from "./graph-search-field";

type MobileWordGraphScreenProps = {
  words: SavedWord[];
  onBack: () => void;
};

export function MobileWordGraphScreen({ words, onBack }: MobileWordGraphScreenProps) {
  const reduceMotion = useReducedMotion();
  const graph = useWordGraph(words, reduceMotion);
  const isEmpty = words.length === 0;

  return (
    <div className="fixed inset-0 flex flex-col bg-paper px-4 pt-3 pb-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Назад"
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-line-2 text-ink active:bg-ink active:text-paper"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <span className="text-lg font-semibold tracking-[-0.01em] text-ink">Граф слов</span>
        <span className="ml-auto font-mono text-[11px] text-ink-3">
          {graph.counts.words} слов · {graph.counts.tags} тегов
        </span>
      </div>

      {isEmpty ? (
        <div className="mt-3 flex flex-1 items-center justify-center rounded-card border border-line text-center text-sm text-ink-3">
          Сохранённых слов пока нет
        </div>
      ) : (
        <>
          <GraphSearchField className="mt-3" value={graph.search} onChange={graph.setSearch} />
          <div className="mt-2.5 -mx-4 overflow-x-auto px-4">
            <GraphFilterRow
              className="min-w-max"
              tagOptions={graph.tagOptions}
              activeTags={graph.filterTags}
              onToggleTag={graph.toggleTagFilter}
              typeFilter={graph.typeFilter}
              onTypeChange={graph.setTypeFilter}
            />
          </div>
          <GraphCanvas
            className="mt-3"
            canvasRef={graph.canvasRef}
            containerRef={graph.containerRef}
            onZoomIn={graph.zoomIn}
            onZoomOut={graph.zoomOut}
            onReset={graph.reset}
            noResultQuery={graph.noResultQuery}
            isTouch
            card={
              graph.card ? (
                <GraphDetailCard card={graph.card} onClose={graph.closeCard} onFocusNode={graph.focusAndSelect} />
              ) : undefined
            }
          />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/word-graph/mobile-word-graph-screen.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/word-graph/mobile-word-graph-screen.tsx src/components/word-graph/mobile-word-graph-screen.test.tsx
git commit -m "feat(word-graph): мобильный полноэкранный экран графа"
```

---

## Task 15: Desktop navigation wiring

**Files:**
- Modify: `src/components/saved-words-panel.tsx`
- Modify: `src/app/desktop-app.tsx`
- Test: `src/components/saved-words-panel.test.tsx` (extend), `src/App.test.tsx` (extend) — or a focused new test file.

- [ ] **Step 1: Add a failing test for the panel button**

Append to `src/components/saved-words-panel.test.tsx` a test inside the existing top-level `describe` (imports `render`, `screen`, `userEvent`, `vi` are already present in that file; if not, add them):

```tsx
it("показывает кнопку «граф» и зовёт onOpenGraph", async () => {
  const onOpenGraph = vi.fn();
  render(
    <SavedWordsPanel
      words={[
        {
          id: "a",
          normalizedWord: "muss",
          displayWord: "muss",
          language: "de",
          languageName: null,
          firstMeaning: "должен",
          source: null,
          sourceUrl: null,
          createdAtMs: 0,
          updatedAtMs: 0,
          tags: ["aufgabe"],
        },
      ]}
      onRemove={vi.fn()}
      onAddTag={vi.fn()}
      onRemoveTag={vi.fn()}
      onOpenGraph={onOpenGraph}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Граф слов" }));
  expect(onOpenGraph).toHaveBeenCalled();
});

it("не рисует кнопку «граф» без onOpenGraph или без слов", () => {
  const { rerender } = render(<SavedWordsPanel words={[]} onRemove={vi.fn()} onOpenGraph={vi.fn()} />);
  expect(screen.queryByRole("button", { name: "Граф слов" })).toBeNull(); // нет слов
  rerender(
    <SavedWordsPanel
      words={[
        {
          id: "a",
          normalizedWord: "m",
          displayWord: "m",
          language: "de",
          languageName: null,
          firstMeaning: null,
          source: null,
          sourceUrl: null,
          createdAtMs: 0,
          updatedAtMs: 0,
          tags: [],
        },
      ]}
      onRemove={vi.fn()}
    />,
  );
  expect(screen.queryByRole("button", { name: "Граф слов" })).toBeNull(); // нет колбэка
});
```

If `saved-words-panel.test.tsx` does not already import these, ensure the file has:
`import { render, screen } from "@testing-library/react";`, `import userEvent from "@testing-library/user-event";`, `import { describe, expect, it, vi } from "vitest";`, and `import { SavedWordsPanel } from "./saved-words-panel";`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/saved-words-panel.test.tsx`
Expected: FAIL — `onOpenGraph` prop / button not present.

- [ ] **Step 3: Add the prop + button to the panel**

In `src/components/saved-words-panel.tsx`:

Add to `SavedWordsPanelProps`:

```ts
  onOpenGraph?: () => void;
```

Add `onOpenGraph` to the destructured params. Then replace the header count cluster (the `<div className="flex items-center gap-1.5">…</div>` block) so the button appears before the count chip when available:

```tsx
        <div className="flex items-center gap-1.5">
          {onOpenGraph && words.length > 0 ? (
            <button
              type="button"
              onClick={onOpenGraph}
              className="rounded-full border-[1.5px] border-line-2 px-2.5 py-0.5 font-mono text-[10px] tracking-[0.06em] text-ink-2 uppercase transition-colors hover:border-ink hover:text-ink"
            >
              Граф слов
            </button>
          ) : null}
          <span className="min-w-6 rounded-full bg-ink px-[9px] py-0.5 text-center font-mono text-xs font-medium text-paper">
            {String(visibleWords.length).padStart(2, "0")}
          </span>
          {isFiltered ? (
            <span className="font-mono text-[10px] text-ink-3">из {String(words.length).padStart(2, "0")}</span>
          ) : null}
        </div>
```

- [ ] **Step 4: Run to verify the panel test passes**

Run: `npx vitest run src/components/saved-words-panel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Add a failing test for desktop navigation**

Create `src/app/desktop-app.graph.test.tsx`. This mounts the real `DesktopApp` with a minimal stub `VideoApp` that has a loaded video + one saved word, then drives the entry/back flow.

First inspect the `VideoApp` type and `App.test.tsx` to copy the existing stub/mock pattern for `useVideoApp` and the player bridge:

Run: `grep -n "VideoApp\b" src/lib/app/use-video-app.ts | head; grep -n "vi.mock\|makeApp\|stubApp\|video:" src/App.test.tsx | head`

Then create the test using the same mock shape already used in `src/App.test.tsx` (reuse its helper if it exports one; otherwise replicate the minimal object). The test body:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { DesktopApp } from "./desktop-app";
import { makeVideoAppStub } from "@/test/video-app-stub"; // см. шаг 6

describe("DesktopApp · граф", () => {
  it("открывает граф из панели слов и возвращается к плееру", async () => {
    const app = makeVideoAppStub({
      video: { embedUrl: "https://vk.com/video_ext.php", title: "t", tracks: [], durationMs: 0 },
      lane: { id: "l", lang: "de", cues: [] },
      savedWords: [
        {
          id: "a",
          normalizedWord: "muss",
          displayWord: "muss",
          language: "de",
          languageName: null,
          firstMeaning: "должен",
          source: null,
          sourceUrl: null,
          createdAtMs: 0,
          updatedAtMs: 0,
          tags: ["aufgabe"],
        },
      ],
    });
    render(<DesktopApp app={app} />);
    await userEvent.click(screen.getByRole("button", { name: "Граф слов" }));
    expect(screen.getByRole("heading", { name: "Граф слов" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /к плееру/ }));
    expect(screen.getByTestId("player-container")).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Provide the `VideoApp` stub helper**

If `src/App.test.tsx` already exports a reusable builder, import that instead and skip this step. Otherwise create `src/test/video-app-stub.ts` that returns a full `VideoApp` with no-op handlers and sensible defaults, overridable via `Partial<VideoApp>`:

```ts
import { vi } from "vitest";

import type { VideoApp } from "@/lib/app/use-video-app";

// Полный VideoApp с заглушками; перекрывается частичным объектом в тестах.
export function makeVideoAppStub(overrides: Partial<VideoApp> = {}): VideoApp {
  const noop = vi.fn();
  const base = {
    url: "",
    setUrl: noop,
    isLoading: false,
    error: undefined,
    handleSubmit: noop,
    video: null,
    lane: null,
    secondaryLane: null,
    primaryCue: undefined,
    selectedTrack: undefined,
    selectedTrackId: "",
    selectedSecondaryTrackId: "",
    isTrackLoading: false,
    isSecondaryTrackLoading: false,
    secondaryError: undefined,
    handleTrackChange: noop,
    handleSecondaryTrackChange: noop,
    selectPrimaryTrack: noop,
    selectSecondaryTrack: noop,
    effectiveTimeMs: 0,
    currentTimeMs: 0,
    durationMs: 0,
    isPlaying: false,
    isAd: false,
    volume: 1,
    muted: false,
    showCustomUi: true,
    blockInput: false,
    playerMode: "clean",
    handleTimeUpdate: noop,
    handleDurationChange: noop,
    handlePlayingChange: noop,
    handleVolumeChange: noop,
    handleAdChange: noop,
    handlePlaybackStart: noop,
    handlePlayerControlsReady: noop,
    handlePlayPause: noop,
    handleSeek: noop,
    handleSetVolume: noop,
    handleToggleMute: noop,
    toggleVkMode: noop,
    handleBackToList: noop,
    recentVideos: [],
    areRecentVideosLoading: false,
    recentVideosUnavailable: false,
    recentVideosError: undefined,
    handleSelectRecentVideo: noop,
    handleRemoveRecentVideo: noop,
    wordLookup: { status: "idle" },
    handleSubtitleWordInspect: noop,
    handleSubtitleWordInspectEnd: noop,
    getWordSaveControl: () => ({ status: "unsaved", onToggle: noop }),
    savedWords: [],
    areSavedWordsLoading: false,
    savedWordsUnavailable: false,
    savedWordsPanelError: undefined,
    freshSavedWordId: undefined,
    pendingSavedWordActions: {},
    savedWordKey: (lang: string, word: string) => `${lang}:${word}`,
    handleRemoveSavedWord: noop,
    selectedTagKeys: [],
    handleToggleTagFilter: noop,
    handleResetTagFilter: noop,
    tagPendingWordIds: [],
    generatingTagWordIds: [],
    handleAddWordTag: noop,
    handleRemoveWordTag: noop,
  };
  return { ...(base as unknown as VideoApp), ...overrides };
}
```

> If `tsc` flags missing/extra fields, open `src/lib/app/use-video-app.ts`, read the `VideoApp` return type, and align the stub field-by-field. The stub must satisfy the real type — do not cast away required members beyond the single `as unknown as VideoApp` seam.

- [ ] **Step 7: Wire `DesktopApp`**

In `src/app/desktop-app.tsx`:

Add the import near the other component imports:

```ts
import { WordGraphScreen } from "@/components/word-graph/word-graph-screen";
```

Add state next to the other `useState` calls in `DesktopApp`:

```ts
  const [showGraph, setShowGraph] = useState(false);
```

Pass the entry callback to the panel — change the `<SavedWordsPanel … />` usage to add:

```tsx
                onOpenGraph={() => setShowGraph(true)}
```

Render the graph screen as an early branch inside the `{app.video && app.lane ? (` block. At the very top of that block's JSX (right after the opening `<div className="px-9 pt-[18px]">` is replaced), guard with `showGraph`. Concretely, wrap the existing player layout: replace

```tsx
        {app.video && app.lane ? (
          <div className="px-9 pt-[18px]">
```

with

```tsx
        {app.video && app.lane && showGraph ? (
          <WordGraphScreen words={app.savedWords} onBack={() => setShowGraph(false)} />
        ) : null}

        {app.video && app.lane && !showGraph ? (
          <div className="px-9 pt-[18px]">
```

(The existing closing `) : null}` for that block stays as-is.)

Also reset `showGraph` when leaving the player: change the back button `onClick={app.handleBackToList}` to:

```tsx
                onClick={() => {
                  setShowGraph(false);
                  app.handleBackToList();
                }}
```

- [ ] **Step 8: Run the navigation + panel tests**

Run: `npx vitest run src/app/desktop-app.graph.test.tsx src/components/saved-words-panel.test.tsx`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/components/saved-words-panel.tsx src/components/saved-words-panel.test.tsx src/app/desktop-app.tsx src/app/desktop-app.graph.test.tsx src/test/video-app-stub.ts
git commit -m "feat(word-graph): вход в граф из панели слов (десктоп) + возврат к плееру"
```

---

## Task 16: Mobile navigation wiring

**Files:**
- Modify: `src/components/mobile/saved-words-sheet-content.tsx`
- Modify: `src/app/mobile-app.tsx`
- Test: `src/app/mobile-app.test.tsx` (extend) or new `src/app/mobile-app.graph.test.tsx`

- [ ] **Step 1: Add `onOpenGraph` to the sheet (failing test first)**

Create `src/components/mobile/saved-words-sheet-content.graph.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SavedWordsSheetContent } from "./saved-words-sheet-content";

const w = {
  id: "a",
  normalizedWord: "muss",
  displayWord: "muss",
  language: "de",
  languageName: null,
  firstMeaning: "должен",
  source: null,
  sourceUrl: null,
  createdAtMs: 0,
  updatedAtMs: 0,
  tags: ["aufgabe"],
};

describe("SavedWordsSheetContent · граф", () => {
  it("показывает кнопку «Открыть граф» и зовёт onOpenGraph", async () => {
    const onOpenGraph = vi.fn();
    render(<SavedWordsSheetContent words={[w]} onRemove={vi.fn()} onAddTag={vi.fn()} onRemoveTag={vi.fn()} onOpenGraph={onOpenGraph} />);
    await userEvent.click(screen.getByRole("button", { name: "Открыть граф" }));
    expect(onOpenGraph).toHaveBeenCalled();
  });

  it("без слов кнопки нет", () => {
    render(<SavedWordsSheetContent words={[]} onRemove={vi.fn()} onOpenGraph={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Открыть граф" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/mobile/saved-words-sheet-content.graph.test.tsx`
Expected: FAIL — `onOpenGraph` not supported.

- [ ] **Step 3: Implement in the sheet**

In `src/components/mobile/saved-words-sheet-content.tsx`:

Add to props type:

```ts
  onOpenGraph?: () => void;
```

Destructure `onOpenGraph`. Then add the button into the header cluster `<div className="flex items-center gap-2">` (before the count chip):

```tsx
          {onOpenGraph && words.length > 0 ? (
            <button
              type="button"
              onClick={onOpenGraph}
              className="rounded-full border-[1.5px] border-line-2 px-3 py-1 font-mono text-[11px] tracking-[0.04em] text-ink-2 uppercase active:bg-ink active:text-paper"
            >
              Открыть граф
            </button>
          ) : null}
```

- [ ] **Step 4: Run to verify the sheet test passes**

Run: `npx vitest run src/components/mobile/saved-words-sheet-content.graph.test.tsx`
Expected: PASS.

- [ ] **Step 5: Add failing test for mobile screen navigation**

Create `src/app/mobile-app.graph.test.tsx`. Reuse `makeVideoAppStub` from Task 15. Mobile uses `usePlatform`/orientation; mount `MobileApp` directly (it does not call `useVideoApp`). The default `useOrientation` returns portrait in jsdom; if the test needs to force it, mock `@/lib/platform/use-orientation` to return `"portrait"`.

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MobileApp } from "./mobile-app";
import { makeVideoAppStub } from "@/test/video-app-stub";

vi.mock("@/lib/platform/use-orientation", () => ({ useOrientation: () => "portrait" }));

describe("MobileApp · граф", () => {
  it("из шторки слов открывает граф и возвращается", async () => {
    const app = makeVideoAppStub({
      video: { embedUrl: "https://vk.com/video_ext.php", title: "t", tracks: [], durationMs: 0 },
      lane: { id: "l", lang: "de", cues: [] },
      savedWords: [
        {
          id: "a",
          normalizedWord: "muss",
          displayWord: "muss",
          language: "de",
          languageName: null,
          firstMeaning: "должен",
          source: null,
          sourceUrl: null,
          createdAtMs: 0,
          updatedAtMs: 0,
          tags: ["aufgabe"],
        },
      ],
    });
    render(<MobileApp app={app} />);
    // открыть шторку слов
    await userEvent.click(screen.getByRole("button", { name: /Слова|Сохранённые/ }));
    await userEvent.click(screen.getByRole("button", { name: "Открыть граф" }));
    expect(screen.getByText("Граф слов")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Назад" }));
    expect(screen.queryByText("Граф слов")).toBeNull();
  });
});
```

> If the saved-words sheet opener button has a different accessible name, run `grep -n "onOpenSaved" src/components/mobile/mobile-player-screen.tsx` to find the exact label and adjust the selector.

- [ ] **Step 6: Wire `MobileApp`**

In `src/app/mobile-app.tsx`:

Add import:

```ts
import { MobileWordGraphScreen } from "@/components/word-graph/mobile-word-graph-screen";
```

Add a graph flag to the local state. Change the `Sheet` usage: add `const [showGraph, setShowGraph] = useState(false);`. In the saved-words sheet's content, pass the opener:

```tsx
          <SavedWordsSheetContent
            …existing props…
            onOpenGraph={() => {
              setSheet("none");
              setShowGraph(true);
            }}
          />
```

Render the graph as a top-priority branch. At the start of the returned JSX (right after the outer `<div className="fixed inset-0 …">` opens), add:

```tsx
      {showGraph && app.video ? (
        <MobileWordGraphScreen words={app.savedWords} onBack={() => setShowGraph(false)} />
      ) : null}
```

Wrap the existing screen selection so it does not render underneath the graph: change the existing ternary chain start `{useLandscapePlayer && app.video ? (` to `{!showGraph && useLandscapePlayer && app.video ? (`. (The `MobileWordGraphScreen` is `fixed inset-0`, but gating avoids running the player RAF behind it.)

Also clear `showGraph` in `onBack` (the player back handler):

```tsx
  const onBack = () => {
    setShowGraph(false);
    setWordTarget(null);
    setSheet("none");
    app.handleBackToList();
  };
```

- [ ] **Step 7: Run the mobile tests**

Run: `npx vitest run src/app/mobile-app.graph.test.tsx src/components/mobile/saved-words-sheet-content.graph.test.tsx src/app/mobile-app.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/mobile/saved-words-sheet-content.tsx src/components/mobile/saved-words-sheet-content.graph.test.tsx src/app/mobile-app.tsx src/app/mobile-app.graph.test.tsx
git commit -m "feat(word-graph): вход в граф из шторки слов (мобайл) + возврат"
```

---

## Task 17: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: PASS (all suites, including the pre-existing ones).

- [ ] **Step 2: Type-check + production build**

Run: `npm run build`
Expected: `tsc -b` clean, Vite build succeeds.

- [ ] **Step 3: Whitespace check**

Run: `git diff --check`
Expected: no output.

- [ ] **Step 4: Manual smoke (optional but recommended)**

Run: `npm run dev`, load a VK video with at least one saved word that has tags, click `Граф слов` in the words panel. Verify: nodes float, wheel zooms to cursor, dragging a node and releasing springs it back, clicking a node opens the card, search dims non-matches, a tag chip filters, reset re-centres and clears filters, refresh restores camera/positions. Resize the window — the canvas re-measures.

- [ ] **Step 5: Final commit (if any lint/format fixups were needed)**

```bash
git add -A
git commit -m "chore(word-graph): финальные правки после проверки"
```

---

## Self-Review Notes (author checklist — already reconciled)

- **Spec coverage:** model/build (T1–T2), search (T3), filters (T4), transforms/hit-test/card data (T5), persistence (T6), simulation + render values + physics constants (T7), hook with pan/zoom/drag/pinch/focus/reset/reactivity (T8), search field (T9), filter row (T10), detail card (T11), canvas+legend+hint+zoom+no-result (T12), desktop screen + empty state + reduced-motion (T13), mobile screen (T14), desktop nav + entry-disabled-at-zero (T15), mobile nav (T16), verification (T17). Gloss is intentionally omitted (spec decision 3).
- **Type consistency:** controller API names (`setSearch`, `toggleTagFilter`, `setTypeFilter`, `focusAndSelect`, `closeCard`, `zoomIn/zoomOut/reset`, `filterTags`, `typeFilter`, `tagOptions`, `counts`, `card`, `noResultQuery`, `canvasRef`, `containerRef`) are used identically in T8 and consumed in T13/T14. `CardData`, `GraphNode`, `TagOptionCount`, `TypeFilter`, `GraphFilters` defined in T1 and reused throughout. `buildGraph/seedLayout/reconcileGraph/matchNodes/computeHiddenIds/nodeAt/toWorldX/toWorldY/tagOptionsFromNodes/cardDataFor` defined in T1–T5 and imported by T7/T8.
- **Known follow-up risk:** the `VideoApp` stub (T15 step 6) must mirror the real `VideoApp` type; the step instructs the engineer to reconcile against `use-video-app.ts`. The `useReducedMotion` hook is created in T13 only if absent.
