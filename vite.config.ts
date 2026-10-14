import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";
// @ts-expect-error plain ESM module shared with the sample builder
import { readFigure, askFigure, speakText, hearSheet, loadKey, MODELS, GeminiError } from "./server/gemini.mjs";

// Local API for development: the Gemini key is read on this side and never sent to the browser.
function timbulApi(): Plugin {
  const key = loadKey();

  async function body(req: IncomingMessage): Promise<any> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  }

  function send(res: ServerResponse, status: number, data: unknown) {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(data));
  }

  function fail(res: ServerResponse, e: any) {
    const kind = e instanceof GeminiError ? e.kind : "other";
    const status = e instanceof GeminiError ? e.status : 500;
    console.error(`[timbul] ${kind} ${status}: ${String(e.message).slice(0, 300)}`);
    send(res, status, { error: String(e.message).slice(0, 300), kind });
  }

  return {
    name: "timbul-api",
    configureServer(server) {
      server.middlewares.use("/api/status", (_req, res) => send(res, 200, { key: Boolean(key), models: MODELS }));
      server.middlewares.use("/api/read", async (req, res) => {
        if (req.method !== "POST") return send(res, 405, { error: "POST only" });
        if (!key) return send(res, 500, { error: "No Gemini key found in .env", kind: "key" });
        try {
          const { image, mime } = await body(req);
          send(res, 200, await readFigure(key, image, mime));
        } catch (e) {
          fail(res, e);
        }
      });
      server.middlewares.use("/api/speak", async (req, res) => {
        if (req.method !== "POST") return send(res, 405, { error: "POST only" });
        if (!key) return send(res, 500, { error: "No Gemini key found in .env", kind: "key" });
        try {
          const { text, lang } = await body(req);
          const out = await speakText(key, String(text || "").slice(0, 1200), lang);
          res.statusCode = 200;
          res.setHeader("Content-Type", "audio/wav");
          res.setHeader("X-Timbul-Cached", String(out.cached));
          res.end(out.audio);
        } catch (e) {
          fail(res, e);
        }
      });
      server.middlewares.use("/api/sheet", async (req, res) => {
        if (req.method !== "POST") return send(res, 405, { error: "POST only" });
        if (!key) return send(res, 500, { error: "No Gemini key found in .env", kind: "key" });
        try {
          send(res, 200, await hearSheet(key, await body(req)));
        } catch (e) {
          fail(res, e);
        }
      });
      server.middlewares.use("/api/ask", async (req, res) => {
        if (req.method !== "POST") return send(res, 405, { error: "POST only" });
        if (!key) return send(res, 500, { error: "No Gemini key found in .env", kind: "key" });
        try {
          send(res, 200, await askFigure(key, await body(req)));
        } catch (e) {
          fail(res, e);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), timbulApi()],
  server: { port: 5173, strictPort: false },
});
