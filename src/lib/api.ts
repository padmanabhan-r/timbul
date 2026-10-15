import type { Figure, Finding, Lang, SavedFigure } from "./types";

// The browser talks to /api, which holds the Gemini key. Locally that is the Vite dev server.

export class ApiError extends Error {
  constructor(message: string, public kind: string, public status: number) {
    super(message);
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new ApiError("Could not reach Timbul's server. Is ./start.sh still running?", "network", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(friendly(data.kind, data.error), data.kind || "other", res.status);
  return data as T;
}

function friendly(kind: string, raw: string) {
  if (kind === "quota") return "Today's free Gemini allowance is used up. It resets at 12:30 pm India time (midnight Pacific). The figures already in the library still work.";
  if (kind === "key") return "Gemini refused the API key. Check GEMINI_API_KEY in .env.";
  if (kind === "model") return "That Gemini model is not available to this key.";
  return raw && raw.includes("high demand") ? "Gemini is busy right now. Try again in a minute." : "Something went wrong talking to Gemini. Try again.";
}

export function readPage(image: string, mime: string) {
  return post<Figure>("/api/read", { image, mime });
}

export function locateFigure(image: string, mime: string) {
  return post<{ found: boolean; box: [number, number, number, number] }>("/api/locate", { image, mime });
}

export function verifyDrawing(image: string, mime: string, drawing: string, figure: Figure, checks: { name: string; pass: boolean; value: string }[]) {
  return post<{ figure: Figure; matches: boolean; changed: number; findings: Finding[] }>("/api/verify", { image, mime, drawing, figure, checks });
}

export interface Answer {
  heard: string;
  answer: string;
  focus: string[];
}

export function ask(figure: Figure, lang: Lang, input: { question?: string; audio?: string; audioMime?: string }, focusId?: string) {
  return post<Answer>("/api/ask", { figure, lang, focusId, question: input.question, audioBase64: input.audio, audioMime: input.audioMime });
}

export function hearSheet(input: { audio?: string; audioMime?: string; text?: string }) {
  return post<{ heard: string; number: number }>("/api/sheet", { audioBase64: input.audio, audioMime: input.audioMime, text: input.text });
}

export async function listLibrary(cls: string): Promise<SavedFigure[]> {
  const res = await fetch(`/api/library?class=${encodeURIComponent(cls)}`);
  if (!res.ok) throw new ApiError("Could not load the class library.", "library", res.status);
  return (await res.json()).sheets as SavedFigure[];
}

export function saveToLibrary(cls: string, sheet: SavedFigure) {
  return post<SavedFigure>("/api/library", { class: cls, sheet });
}
