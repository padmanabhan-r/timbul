// Reads each sample image in public/samples with Gemini and saves the result in src/samples,
// so the library opens on finished figures without spending the day's free quota.
// Usage: node scripts/make-samples.mjs [name ...]   (skips samples that already have a JSON file)
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { readFigure, loadKey } from "../server/gemini.mjs";

const key = loadKey();
if (!key) throw new Error("No Gemini key in .env");
const wanted = process.argv.slice(2);
for (const file of readdirSync("public/samples")) {
  const name = file.replace(/\.[^.]+$/, "");
  if (wanted.length && !wanted.includes(name)) continue;
  const out = `src/samples/${name}.json`;
  if (existsSync(out) && !wanted.length) continue;
  const mime = file.endsWith(".png") ? "image/png" : "image/jpeg";
  const t = Date.now();
  const figure = await readFigure(key, readFileSync(`public/samples/${file}`).toString("base64"), mime);
  writeFileSync(out, JSON.stringify(figure, null, 1));
  console.log(`${name}: ${figure.parts.length} parts, ${figure.links.length} links, ${((Date.now() - t) / 1000).toFixed(0)}s`);
}
