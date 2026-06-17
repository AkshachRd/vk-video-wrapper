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
