import { get, set, del, keys } from "idb-keyval";
import type { SavedFigure } from "./types";
import { SAMPLES } from "../samples";

// Figures a teacher adds are kept in this browser (IndexedDB), so nothing is generated twice.
const PREFIX = "figure:";

export async function listFigures(): Promise<SavedFigure[]> {
  let own: SavedFigure[] = [];
  try {
    const ids = (await keys()).filter((k) => String(k).startsWith(PREFIX));
    own = (await Promise.all(ids.map((k) => get<SavedFigure>(k)))).filter(Boolean) as SavedFigure[];
  } catch {
    own = [];
  }
  own.sort((a, b) => b.createdAt - a.createdAt);
  return [...own, ...SAMPLES];
}

export async function getFigure(id: string): Promise<SavedFigure | undefined> {
  const sample = SAMPLES.find((s) => s.id === id);
  if (sample) return sample;
  try {
    return await get<SavedFigure>(PREFIX + id);
  } catch {
    return undefined;
  }
}

/** Saves a figure, giving it the next free sheet number if it has none. */
export async function saveFigure(fig: SavedFigure) {
  if (!fig.number) {
    const all = await listFigures();
    fig.number = Math.max(0, ...all.map((f) => f.number || 0)) + 1;
  }
  await set(PREFIX + fig.id, fig);
  return fig;
}

export async function figureByNumber(n: number) {
  return (await listFigures()).find((f) => f.number === n);
}

export async function deleteFigure(id: string) {
  await del(PREFIX + id);
}
