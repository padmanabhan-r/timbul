// Runs Timbul's reading pipeline on one page outside the browser and writes what it saw to .cache/check:
// find the figure → crop → read → draw → Gemini's self-check (up to two rounds), with an overlay image per round.
// Usage: node scripts/check-reading.mjs <page.png|jpg> [--nocrop] [--redraw]
// --break <id> moves one part of the last reading to the wrong corner, to test that the self-check catches it.
// --redraw draws the last reading again (after a change to the drawing code) without calling Gemini.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const ROOT = process.cwd();
const OUT = resolve(ROOT, ".cache/check");
mkdirSync(OUT, { recursive: true });
const { createServer } = await import(ROOT + "/node_modules/vite/dist/node/index.js");
const { chromium } = await import(process.env.PLAYWRIGHT || "/Users/paddy/.claude/skills/video-edit/node_modules/playwright-core/index.mjs");
const g = await import(ROOT + "/server/gemini.mjs");
const key = g.loadKey();
const vite = await createServer({ root: ROOT, server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
const t = await vite.ssrLoadModule("/src/lib/tactile.ts");

const page = resolve(process.argv[2]);
const dims = (f) => execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", f]).toString().trim().split(",").map(Number);
const b64 = (f) => readFileSync(f).toString("base64");
let [W, H] = dims(page);
let img = page;
const mime = "image/png";
const brk = process.argv.includes("--break") ? process.argv[process.argv.indexOf("--break") + 1] : null;
const redraw = process.argv.includes("--redraw") || Boolean(brk);
if (redraw) {
  img = OUT + "/crop.png";
  [W, H] = dims(img);
} else if (!process.argv.includes("--nocrop")) {
  const where = await g.locateFigure(key, { image: b64(page), mime });
  console.log("locate", where.box, where.model);
  const [x0, y0, x1, y1] = where.box, m = 30;
  const sx = Math.max(0, Math.round(((x0 - m) / 1000) * W)), sy = Math.max(0, Math.round(((y0 - m) / 1000) * H));
  const ex = Math.min(W, Math.round(((x1 + m) / 1000) * W)), ey = Math.min(H, Math.round(((y1 + m) / 1000) * H));
  img = OUT + "/crop.png";
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", page, "-vf", `crop=${ex - sx}:${ey - sy}:${sx}:${sy}`, img]);
  [W, H] = dims(img);
}
let t0 = Date.now();
const figure = redraw ? JSON.parse(readFileSync(`${OUT}/figure.json`, "utf8")) : await g.readFigure(key, b64(img), mime);
console.log("read", (Date.now() - t0) / 1000, "s", figure.model, "\n ", figure.parts.map((p) => `${p.id}:${p.shape}:${p.box.map(Math.round)}`).join("\n  "));
const saved = { id: "check", createdAt: 0, number: 0, image: `data:${mime};base64,${b64(img)}`, imageW: W, imageH: H, figure };
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });

async function render(fig, name) {
  const s = { ...saved, figure: fig };
  const sheet = t.buildSheet(s);
  const svg = t.checkSvg(sheet, s);
  const p = await browser.newPage({ viewport: { width: 1400, height: 990 } });
  await p.setContent(`<body style="margin:0"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}" style="width:1400px;height:990px">`);
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/${name}.png` });
  await p.close();
  console.log(name, sheet.checks.map((c) => `${c.name}: ${c.pass ? "ok" : "FAIL"} (${c.value})`).join(" · "));
  return { sheet, png: readFileSync(`${OUT}/${name}.png`).toString("base64") };
}

if (brk) {
  const p = figure.parts.find((q) => q.id === brk);
  const w = p.box[2] - p.box[0], h = p.box[3] - p.box[1];
  p.box = [880 - w, 120, 880, 120 + h];
  console.log("moved", brk, "to", p.box.map(Math.round));
}
let fig = figure;
for (let r = 1; r <= (redraw && !brk ? 0 : 2); r++) {
  const { sheet, png } = await render(fig, "round" + r);
  t0 = Date.now();
  const out = await g.verifyFigure(key, { image: b64(img), mime, drawing: png, figure: fig, checks: sheet.checks });
  console.log(`self-check ${r}: ${(Date.now() - t0) / 1000}s ${out.model} matches=${out.matches} changed=${out.changed}`, JSON.stringify(out.findings));
  fig = out.figure;
  if (out.matches || !out.changed) break;
}
await render(fig, "final");
if (!brk) writeFileSync(`${OUT}/figure.json`, JSON.stringify(fig, null, 1));
await browser.close();
await vite.close();
console.log("written to", OUT);
