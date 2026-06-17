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
