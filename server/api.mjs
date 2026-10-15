// Timbul's API, written once and served three ways: by the Vite dev server (vite.config.ts), by the Node server
// that runs on Cloud Run (server/index.mjs), and by Vercel functions (api/[route].mjs). The Gemini key stays here.

import { readFigure, locateFigure, verifyFigure, askFigure, speakText, hearSheet, loadKey, MODELS, PRIMARY, GeminiError } from "./gemini.mjs";
import { listSheets, saveSheet, store } from "./library.mjs";

const key = loadKey();
const json = (status, data) => ({ status, type: "application/json", body: JSON.stringify(data) });

const ROUTES = {
  status: async () => json(200, { key: Boolean(key), provider: PRIMARY, models: MODELS, store }),
  read: async (b) => json(200, await readFigure(key, b.image, b.mime)),
  locate: async (b) => json(200, await locateFigure(key, b)),
  verify: async (b) => json(200, await verifyFigure(key, b)),
  sheet: async (b) => json(200, await hearSheet(key, b)),
  ask: async (b) => json(200, await askFigure(key, b)),
  speak: async (b) => {
    const out = await speakText(key, String(b.text || "").slice(0, 1200), b.lang);
    return { status: 200, type: "audio/wav", body: out.audio, headers: { "X-Timbul-Cached": String(out.cached) } };
  },
};

/** One request: the route name (the part after /api/), the method, the query and the parsed JSON body. */
export async function handle(route, method, query, body) {
  try {
    if (route === "library") {
      if (method === "GET") return json(200, { sheets: await listSheets(query.class) });
      if (method === "POST") return json(200, await saveSheet(body.class, body.sheet));
      return json(405, { error: "GET or POST" });
    }
    const fn = ROUTES[route];
    if (!fn) return json(404, { error: "No such route" });
    if (route !== "status" && method !== "POST") return json(405, { error: "POST only" });
    if (route !== "status" && !key) return json(500, { error: "No Gemini key on the server", kind: "key" });
    return await fn(body || {});
  } catch (e) {
    const kind = e instanceof GeminiError ? e.kind : "other";
    const status = e instanceof GeminiError ? e.status : e.status || 500;
    console.error(`[timbul] ${route} ${kind} ${status}: ${String(e.message).slice(0, 300)}`);
    return json(status, { error: String(e.message).slice(0, 300), kind });
  }
}

/** Reads a JSON body from a Node request, up to 8 MB (a page photo is the largest thing sent). */
export async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8 * 1024 * 1024) throw Object.assign(new Error("Too large"), { status: 413 });
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

/** Serves one /api request on a Node http request and response. */
export async function serve(req, res, route) {
  const url = new URL(req.url, "http://x");
  let body = {};
  try {
    if (req.method === "POST") body = req.body && typeof req.body === "object" ? req.body : await readBody(req);
  } catch (e) {
    res.statusCode = e.status || 400;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "Bad request body" }));
  }
  const out = await handle(route, req.method, Object.fromEntries(url.searchParams), body);
  res.statusCode = out.status;
  res.setHeader("Content-Type", out.type);
  for (const [k, v] of Object.entries(out.headers || {})) res.setHeader(k, v);
  res.end(out.body);
}
