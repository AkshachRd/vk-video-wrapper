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
