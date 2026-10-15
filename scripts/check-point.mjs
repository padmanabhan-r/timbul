// Tests Point and ask outside the browser: which part of a printed sheet is the fingertip in a photo on?
// Usage: node scripts/check-point.mjs <photo> [sheet number, default 2] [class, default demo]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const [photo, num = "2", cls = "demo"] = process.argv.slice(2);
const { createServer } = await import(ROOT + "/node_modules/vite/dist/node/index.js");
const { chromium } = await import(process.env.PLAYWRIGHT || "/Users/paddy/.claude/skills/video-edit/node_modules/playwright-core/index.mjs");
const g = await import(ROOT + "/server/gemini.mjs");
const vite = await createServer({ root: ROOT, server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
const t = await vite.ssrLoadModule("/src/lib/tactile.ts");

const lib = JSON.parse(readFileSync(resolve(ROOT, `.cache/library/${cls}.json`), "utf8"));
const saved = lib.sheets.find((s) => String(s.number) === String(num));
if (!saved) throw new Error(`no sheet ${num} in class ${cls}`);
const sheet = t.buildSheet(saved);
const svg = t.checkSvg(sheet);
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const p = await browser.newPage({ viewport: { width: 1400, height: 990 } });
await p.setContent(`<body style="margin:0"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}" style="width:1400px;height:990px">`);
await p.waitForTimeout(300);
mkdirSync(resolve(ROOT, ".cache/point"), { recursive: true });
const refFile = resolve(ROOT, ".cache/point/reference.png");
await p.screenshot({ path: refFile });
await browser.close();
await vite.close();

const t0 = Date.now();
const out = await g.pointAt(g.loadKey(), {
  photo: readFileSync(resolve(photo)).toString("base64"),
  mime: photo.endsWith(".png") ? "image/png" : "image/jpeg",
  reference: readFileSync(refFile).toString("base64"),
  parts: sheet.parts.map((sp) => sp.part.id),
});
console.log(`${((Date.now() - t0) / 1000).toFixed(1)} s`, out.model, JSON.stringify({ part: out.part, sheet: out.sheet_visible, finger: out.finger_visible, note: out.note_en }));
