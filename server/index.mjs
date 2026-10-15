// Timbul in production on Cloud Run: serves the built app from dist/ and the API under /api, on $PORT.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { serve } from "./api.mjs";

const DIST = join(process.cwd(), "dist");
const PORT = Number(process.env.PORT || 8080);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json", ".woff2": "font/woff2", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path.startsWith("/api/")) return serve(req, res, path.slice(5).split("/")[0]);
  const file = normalize(join(DIST, path === "/" ? "index.html" : path));
  if (!file.startsWith(DIST)) {
    res.statusCode = 400;
    return res.end();
  }
  try {
    const body = await readFile(file);
    res.setHeader("Content-Type", TYPES[extname(file)] || "application/octet-stream");
    if (file.includes(`${join(DIST, "assets")}`)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.end(body);
  } catch {
    // the app uses hash routes, so anything unknown gets the app itself
    res.setHeader("Content-Type", TYPES[".html"]);
    res.end(await readFile(join(DIST, "index.html")));
  }
}).listen(PORT, () => console.log(`[timbul] listening on ${PORT}`));
