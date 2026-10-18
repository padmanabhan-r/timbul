import { get, set, del, keys } from "idb-keyval";
import type { SavedFigure } from "./types";
import { SAMPLES } from "../samples";
import { listLibrary, saveToLibrary, deleteFromLibrary } from "./api";

// Sheets live in the class library on the server, shared by everyone with the class code, so a sheet the teacher
// makes on her laptop opens on a student's phone by its number. This browser keeps a copy (IndexedDB) for offline use.
const PREFIX = "figure:";
const CLASS_KEY = "timbul:class";

export function currentClass() {
  try {
    return localStorage.getItem(CLASS_KEY) || "demo";
  } catch {
    return "demo";
  }
}

export function setClass(code: string) {
  const clean = code.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 32) || "demo";
  try {
    localStorage.setItem(CLASS_KEY, clean);
  } catch {
    /* private mode: the class lasts this visit */
  }
  return clean;
}

async function cached(): Promise<SavedFigure[]> {
  try {
    const ids = (await keys()).filter((k) => String(k).startsWith(PREFIX));
    return (await Promise.all(ids.map((k) => get<SavedFigure>(k)))).filter(Boolean) as SavedFigure[];
  } catch {
    return [];
  }
}

export async function listFigures(): Promise<SavedFigure[]> {
  let own: SavedFigure[];
  try {
    own = await listLibrary(currentClass());
    for (const f of own) set(PREFIX + f.id, f).catch(() => {});
  } catch {
    own = await cached(); // offline: what this browser has seen
  }
  own.sort((a, b) => (b.number || 0) - (a.number || 0));
  return [...own, ...SAMPLES];
}

export async function getFigure(id: string): Promise<SavedFigure | undefined> {
  const sample = SAMPLES.find((s) => s.id === id);
  if (sample) return sample;
  try {
    const local = await get<SavedFigure>(PREFIX + id);
    if (local) return local;
  } catch {
    /* fall through to the library */
  }
  return (await listFigures()).find((f) => f.id === id);
}

/** Saves a sheet to the class library, which gives a new sheet the class's next number. */
export async function saveFigure(fig: SavedFigure) {
  let saved: SavedFigure;
  try {
    saved = await saveToLibrary(currentClass(), fig);
  } catch {
    // offline: number it from what this browser knows, and keep it here
    const all = await listFigures();
    saved = { ...fig, number: fig.number || Math.max(0, ...all.map((f) => f.number || 0)) + 1 };
  }
  await set(PREFIX + saved.id, saved).catch(() => {});
  return saved;
}

export async function figureByNumber(n: number) {
  return (await listFigures()).find((f) => f.number === n);
}

/** Removes a sheet from the class library, for everyone with the class code, and from this browser. */
export async function deleteFigure(id: string) {
  await deleteFromLibrary(currentClass(), id);
  await del(PREFIX + id).catch(() => {});
}
