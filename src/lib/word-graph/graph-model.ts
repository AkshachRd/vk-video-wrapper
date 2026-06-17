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
