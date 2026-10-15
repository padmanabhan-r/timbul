// Calls to the Gemini Developer API. Used by the local dev server and the sample builder.
// The key stays on the server side; the browser never sees it.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";

const API = "https://generativelanguage.googleapis.com/v1beta/models";
const KEY_NAMES = ["GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "VITE_GEMINI_API_KEY"];

// Each model has its own free daily allowance, so when one is busy or used up the next one answers.
export const MODELS = {
  read: (process.env.TIMBUL_READ_MODEL || "gemini-3.8-flash,gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash,gemini-3-flash-preview,gemini-2.5-flash").split(","),
  ask: (process.env.TIMBUL_ASK_MODEL || "gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3.5-flash").split(","),
  speak: (process.env.TIMBUL_SPEAK_MODEL || "gemini-3.8-flash-tts,gemini-3.8-flash-lite-tts,gemini-3.1-flash-tts-preview").split(","),
};
export const VOICE = process.env.TIMBUL_VOICE || "Sulafat";

// Google's own Gemini API answers first; the same Gemini models through OpenRouter are the backup when
// Google's free allowance runs out or a model is busy. TIMBUL_PROVIDER=openrouter puts OpenRouter first.
// Speech always uses Google's Gemini TTS.
export const PRIMARY = (process.env.TIMBUL_PROVIDER || "google").toLowerCase();
export const FALLBACK = {
  read: (process.env.TIMBUL_READ_FALLBACK || "google/gemini-3.8-flash,google/gemini-3.5-flash").split(","),
  ask: (process.env.TIMBUL_ASK_FALLBACK || "google/gemini-3.5-flash-lite,google/gemini-3.5-flash").split(","),
};

export function loadKey(root = process.cwd(), names = KEY_NAMES) {
  for (const name of names) if (process.env[name]) return process.env[name].trim();
  for (const file of [".env.local", ".env"]) {
    let text;
    try {
      text = readFileSync(resolve(root, file), "utf8");
    } catch {
      continue;
    }
    for (const raw of text.split("\n")) {
      const line = raw.trim().replace(/^export\s+/, "");
      for (const name of names) {
        if (line.startsWith(name + "=")) {
          const value = line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "");
          if (value) return value;
        }
      }
    }
  }
  return null;
}

export class GeminiError extends Error {
  constructor(message, status, kind) {
    super(message);
    this.status = status;
    this.kind = kind; // "quota" | "key" | "model" | "other"
  }
}

async function generate(key, model, parts, schema, temperature = 0.2, timeout = 90_000) {
  let res;
  // A busy model (503) or a dropped connection is retried; a quota refusal (429) is not.
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(`${API}/${model}:generateContent`, {
        method: "POST",
        signal: AbortSignal.timeout(timeout),
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { temperature, responseMimeType: "application/json", responseSchema: schema },
        }),
      });
    } catch (e) {
      // a dropped connection is tried again; a model that ran out of time is not (the next model is)
      if (attempt < 2 && e.name !== "TimeoutError") {
        await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
        continue;
      }
      throw new GeminiError(`${model}: ${e.name === "TimeoutError" ? "timed out" : String(e)}`, 502, "other");
    }
    if ((res.status === 503 || res.status === 500) && attempt < 2) {
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
      continue;
    }
    break;
  }
  const body = await res.text();
  if (!res.ok) {
    const kind = res.status === 429 ? "quota" : res.status === 401 || res.status === 403 ? "key" : res.status === 404 ? "model" : "other";
    throw new GeminiError(body.slice(0, 600), res.status, kind);
  }
  const data = JSON.parse(body);
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  if (!text) throw new GeminiError("Gemini returned an empty answer", 502, "other");
  return JSON.parse(text);
}

// Gemini's schema dialect (OBJECT, STRING …) to plain JSON Schema, for OpenRouter.
function jsonSchema(s) {
  if (Array.isArray(s)) return s.map(jsonSchema);
  if (!s || typeof s !== "object") return s;
  const out = {};
  for (const [k, v] of Object.entries(s)) out[k] = k === "type" ? String(v).toLowerCase() : jsonSchema(v);
  return out;
}

async function openrouter(model, parts, schema, temperature, effort = "low", timeout = 90_000) {
  const key = loadKey(process.cwd(), ["OPENROUTER_API_KEY", "VITE_OPENROUTER_API_KEY"]);
  if (!key) throw new GeminiError("No OpenRouter key", 401, "key");
  const content = parts.map((p) => {
    if (p.text) return { type: "text", text: p.text };
    const { mimeType, data } = p.inlineData;
    if (mimeType.startsWith("audio/")) return { type: "input_audio", input_audio: { data, format: mimeType.split("/")[1] === "wav" ? "wav" : "mp3" } };
    return { type: "image_url", image_url: { url: `data:${mimeType};base64,${data}` } };
  });
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(timeout),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "X-Title": "Timbul" },
    body: JSON.stringify({
      model, temperature, messages: [{ role: "user", content }],
      response_format: { type: "json_schema", json_schema: { name: "answer", strict: false, schema: jsonSchema(schema) } },
      reasoning: { effort },
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new GeminiError(body.slice(0, 400), res.status, res.status === 429 ? "quota" : "other");
  const text = JSON.parse(body).choices?.[0]?.message?.content || "";
  if (!text) throw new GeminiError("OpenRouter returned an empty answer", 502, "other");
  return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
}

/** Tries each model in turn; moves on when one is busy (503) or its free allowance is used up (429). */
async function generateAny(key, models, parts, schema, temperature, fallback = [], effort = "low", timeout = 90_000) {
  let last;
  const routed = fallback.map((m) => "openrouter:" + m);
  const order = !fallback.length ? models : PRIMARY === "openrouter" && loadKey(process.cwd(), ["OPENROUTER_API_KEY", "VITE_OPENROUTER_API_KEY"]) ? [...routed, ...models] : [...models, ...routed];
  for (const model of order) {
    if (model.startsWith("openrouter:")) {
      try {
        return { result: await openrouter(model.slice(11), parts, schema, temperature, effort, timeout), model };
      } catch (e) {
        last = e;
        console.warn(`[timbul] ${model} failed (${e.status}); trying the next model`);
        continue;
      }
    }
    try {
      return { result: await generate(key, model, parts, schema, temperature, timeout), model };
    } catch (e) {
      last = e;
      const moveOn = e instanceof GeminiError && (e.kind === "quota" || e.kind === "model" || e.status === 503 || e.status === 500 || e.status === 502);
      if (!moveOn) throw e;
      console.warn(`[timbul] ${model} unavailable (${e.status}); trying the next model`);
    }
  }
  throw last;
}

// ---------------------------------------------------------------- reading a figure

const POINT = { type: "ARRAY", items: { type: "NUMBER" } };
const BOX = { type: "ARRAY", items: { type: "NUMBER" }, description: "[ymin, xmin, ymax, xmax] tight around the item as drawn, normalised 0-1000 over the whole image." };

const FIGURE_SCHEMA = {
  type: "OBJECT",
  properties: {
    found: { type: "BOOLEAN", description: "Whether the image contains a diagram or figure at all." },
    title_en: { type: "STRING" },
    title_id: { type: "STRING", description: "The title in Bahasa Indonesia." },
    subject: { type: "STRING", description: "School subject, e.g. Physics, Biology, Geography." },
    figure_type: { type: "STRING", enum: ["circuit", "biology", "cycle", "graph", "map", "process", "other"] },
    overview_en: { type: "STRING", description: "Two or three sentences a blind student hears first: what the figure shows and how it is laid out." },
    overview_id: { type: "STRING", description: "The same overview in Bahasa Indonesia." },
    parts: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING", description: "Short lowercase id, e.g. lamp, nucleus." },
          name_en: { type: "STRING" },
          name_id: { type: "STRING" },
          label: { type: "STRING", description: "The shortest clear English label for braille, one or two words, lowercase." },
          kind: { type: "STRING", enum: ["component", "region", "object"] },
          shape: { type: "STRING", enum: ["rect", "ellipse", "polygon", "group", "battery", "lamp", "switch_open", "switch_closed", "resistor", "cell"] },
          count: { type: "INTEGER", description: "For shape group only: how many identical items the group holds. 0 otherwise." },
          box_2d: BOX,
          outline: { type: "ARRAY", items: POINT, description: "For polygon only: 5 to 16 [y, x] points tracing the outline, normalised 0-1000 over the whole image. Empty otherwise." },
          detail_en: { type: "STRING", description: "One or two sentences: what this part is, what it does, and where it sits relative to its neighbours." },
          detail_id: { type: "STRING", description: "The same detail in Bahasa Indonesia." },
        },
        required: ["id", "name_en", "name_id", "label", "kind", "shape", "box_2d", "detail_en", "detail_id"],
      },
    },
    links: {
      type: "ARRAY",
      description: "Wires, arrows or lines joining parts.",
      items: {
        type: "OBJECT",
        properties: {
          from: { type: "STRING" },
          to: { type: "STRING" },
          kind: { type: "STRING", enum: ["wire", "arrow", "line"] },
          path: { type: "ARRAY", items: POINT, description: "[y, x] points along the drawn line from one part to the other, corners included, normalised 0-1000 over the whole image." },
        },
        required: ["from", "to", "kind", "path"],
      },
    },
    left_out: { type: "ARRAY", items: { type: "STRING" }, description: "Details deliberately left out of the tactile version to keep it readable by touch." },
  },
  required: ["found", "title_en", "title_id", "subject", "figure_type", "overview_en", "overview_id", "parts", "links", "left_out"],
};

const READ_PROMPT = `You are preparing a textbook figure for a blind student. It will be redrawn as a simplified tactile graphic (raised lines on swell paper, labels in braille) and explored by voice.

Find the main diagram in the image and describe it as structured data.
- Keep only what a student needs: the main parts, where they are, and the lines or arrows between them. Tactile graphics must be simple: at most 12 parts. Drop decoration, shading, repeated small items and text that is not a label, and list what you dropped in left_out.
- Locate every part precisely with box_2d = [ymin, xmin, ymax, xmax], normalised 0-1000 over the whole image, tight around the part as drawn (not around its text label). A part drawn inside another part has its box inside that part's box.
- Points in outlines and link paths are [y, x], normalised 0-1000 over the whole image.
- Circuits: use the symbol shapes (battery, lamp, switch_open, switch_closed, resistor, cell) and give every wire as a link whose path follows the drawn route, corners included, from the edge of one part to the edge of the next.
- Many identical items joined to many others (the nodes of a neural network's layers, the atoms of a lattice): do not give every item its own part or every line its own link, which would make a tangle no finger can follow. Make each layer or group one part with shape group, count = how many items it holds, and box_2d around all of them; join the groups with one arrow each, in the direction of flow. Say in the overview and in each group's detail how they connect, for example "every input node connects to every hidden node". Never draw only some of many connections: a partial set teaches the wrong structure.
- A separate inset or second diagram beside the main one (a close-up, a legend, a colour key): keep it only if the whole figure still fits in 12 parts; otherwise leave it out and name it in left_out. Colour keys are always left out, because colour cannot be felt.
- Organisms and rounded areas: ellipse. Irregular areas (land, water, regions on a map): polygon with an outline. Boxes and labelled blocks: rect.
- Descriptions are for a student aged 10 to 15: plain words, spatial language (left of, above, inside), no colour words unless colour matters.
- Bahasa Indonesia fields must be natural Indonesian, not word-for-word.
If there is no figure, set found to false and leave the arrays empty.`;

/** Gemini answers in its native [ymin, xmin, ymax, xmax] / [y, x] format; the app works in [x0, y0, x1, y1] / [x, y]. */
function normalise(raw) {
  const clamp = (v) => Math.max(0, Math.min(1000, Number(v) || 0));
  const box = (b) => (Array.isArray(b) && b.length === 4 ? [clamp(Math.min(b[1], b[3])), clamp(Math.min(b[0], b[2])), clamp(Math.max(b[1], b[3])), clamp(Math.max(b[0], b[2]))] : [0, 0, 0, 0]);
  const pt = (p) => [clamp(p?.[1]), clamp(p?.[0])];
  const parts = (raw.parts || []).map(({ box_2d, outline, ...p }) => ({ ...p, box: box(box_2d), outline: (outline || []).map(pt) }));
  const links = (raw.links || []).map((l) => ({ ...l, path: (l.path || []).map(pt) }));
  return { ...raw, figure_box: extent(parts, links), parts, links, coords: "image" };
}

/** The area of the page the figure covers, with a small margin. */
function extent(parts, links) {
  const xs = [], ys = [];
  for (const p of parts) xs.push(p.box[0], p.box[2]), ys.push(p.box[1], p.box[3]);
  for (const l of links) for (const [x, y] of l.path) xs.push(x), ys.push(y);
  const pad = 8;
  return xs.length ? [Math.max(0, Math.min(...xs) - pad), Math.max(0, Math.min(...ys) - pad), Math.min(1000, Math.max(...xs) + pad), Math.min(1000, Math.max(...ys) + pad)] : [0, 0, 1000, 1000];
}

export async function readFigure(key, imageBase64, mimeType) {
  const { result, model } = await generateAny(key, MODELS.read, [{ inlineData: { mimeType, data: imageBase64 } }, { text: READ_PROMPT }], FIGURE_SCHEMA, 0.1, FALLBACK.read);
  return { ...normalise(result), model };
}

// ---------------------------------------------------------------- finding the figure on the page

const LOCATE_SCHEMA = {
  type: "OBJECT",
  properties: {
    found: { type: "BOOLEAN" },
    box_2d: { ...BOX, description: "[ymin, xmin, ymax, xmax] around the main diagram and its labels, normalised 0-1000. Leave out the page's running text and caption." },
  },
  required: ["found", "box_2d"],
};

/** A quick first look: where on the page the figure is, so the full reading can work on a close-up of it. */
export async function locateFigure(key, { image, mime }) {
  const prompt = "Find the main diagram or figure on this textbook page. Return a box around the diagram itself with its labels, without the page's paragraphs or the caption. If there is no figure, set found to false.";
  const { result, model } = await generateAny(key, MODELS.ask, [{ inlineData: { mimeType: mime || "image/jpeg", data: image } }, { text: prompt }], LOCATE_SCHEMA, 0, FALLBACK.ask);
  const b = result.box_2d || [];
  const clamp = (v) => Math.max(0, Math.min(1000, Number(v) || 0));
  const box = b.length === 4 ? [clamp(Math.min(b[1], b[3])), clamp(Math.min(b[0], b[2])), clamp(Math.max(b[1], b[3])), clamp(Math.max(b[0], b[2]))] : [0, 0, 1000, 1000];
  return { found: Boolean(result.found), box, model };
}

// ---------------------------------------------------------------- checking the drawing against the page

const PART_ITEM = FIGURE_SCHEMA.properties.parts.items;
const LINK_ITEM = FIGURE_SCHEMA.properties.links.items;

const VERIFY_SCHEMA = {
  type: "OBJECT",
  properties: {
    matches: { type: "BOOLEAN", description: "True when the tactile drawing tells a blind student the same thing as the figure on the page." },
    findings: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          kind: { type: "STRING", enum: ["missing_part", "misplaced", "wrong_name", "missing_link", "wrong_link", "extra_part"] },
          part: { type: "STRING", description: "The id of the part concerned, or the new id for a missing part." },
          note_en: { type: "STRING", description: "One short sentence a teacher reads: what was wrong and what was changed." },
        },
        required: ["kind", "part", "note_en"],
      },
    },
    moves: { type: "ARRAY", items: { type: "OBJECT", properties: { id: { type: "STRING" }, box_2d: BOX }, required: ["id", "box_2d"] } },
    renames: { type: "ARRAY", items: { type: "OBJECT", properties: { id: { type: "STRING" }, name_en: { type: "STRING" }, name_id: { type: "STRING" }, label: { type: "STRING" } }, required: ["id", "name_en", "name_id", "label"] } },
    add_parts: { type: "ARRAY", items: PART_ITEM },
    remove_parts: { type: "ARRAY", items: { type: "STRING" } },
    add_links: { type: "ARRAY", items: LINK_ITEM },
    remove_links: { type: "ARRAY", items: { type: "OBJECT", properties: { from: { type: "STRING" }, to: { type: "STRING" } }, required: ["from", "to"] } },
  },
  required: ["matches", "findings", "moves", "renames", "add_parts", "remove_parts", "add_links", "remove_links"],
};

const VERIFY_PROMPT = `You are checking a tactile graphic before it is printed for a blind student.
Image 1 is the figure from the textbook page. Image 2 is the tactile drawing made from an earlier reading of it, laid over a faded copy of image 1: every line of the drawing is a row of black dots, and each part carries its id in small grey text. Every dotted outline should sit on the part of the figure it stands for; one that sits somewhere else, or is the wrong size, is misplaced.
The reading it was drawn from is below, with boxes as [ymin, xmin, ymax, xmax] normalised 0-1000 over image 1.

Compare the drawing with the page, part by part. Report only errors that would mislead a student who reads by touch:
- a main part of the figure that is missing from the drawing (missing_part, and give it in add_parts with box_2d over image 1);
- a part in the wrong place relative to its neighbours, wrong size, or outside the part it sits in (misplaced, and give the corrected box_2d over image 1 in moves);
- a part with the wrong name (wrong_name, with the fix in renames);
- a connection, wire or arrow missing or wrong (missing_link / wrong_link, with add_links / remove_links);
- a part drawn that is not in the figure (extra_part, in remove_parts);
- only some of many connections drawn as separate lines, which teaches the wrong structure (wrong_link): say so in the note.
A group (a row of identical small circles standing for one layer of a network, say) joined to the next group by one arrow is a correct simplification, not an error.
The drawing is deliberately simplified: dotted lines, symbols for circuit parts, braille instead of text, no shading, at most 12 parts, and the details listed in left_out are left out on purpose. None of that is an error.
Spacing and braille rules are Timbul's own code's job, not yours: the results of its rule checks are below for context only, and are never a reason to remove a part.
If the drawing is faithful, set matches to true and leave every list empty. Do not invent problems.`;

/** Gemini looks at the page and at its own drawing side by side, and corrects the reading where they disagree. */
export async function verifyFigure(key, { image, mime, drawing, figure, checks = [] }) {
  const native = (b) => [b[1], b[0], b[3], b[2]];
  const reading = {
    title: figure.title_en,
    left_out: figure.left_out,
    parts: figure.parts.map((p) => ({ id: p.id, name: p.name_en, shape: p.shape, box_2d: native(p.box) })),
    links: figure.links.map((l) => ({ from: l.from, to: l.to, kind: l.kind })),
  };
  const parts = [
    { inlineData: { mimeType: mime || "image/jpeg", data: image } },
    { inlineData: { mimeType: "image/png", data: drawing } },
    { text: `${VERIFY_PROMPT}\n\nThe reading:\n${JSON.stringify(reading)}\n\nThe rule checks:\n${checks.map((c) => `- ${c.name}: ${c.pass ? "pass" : "FAIL"} (${c.value})`).join("\n") || "- not run"}` },
  ];
  // The check is a safeguard, not a gate: two models at most, 45 seconds each, then the teacher's own look decides.
  const { result, model } = await generateAny(key, MODELS.read.slice(0, 2), parts, VERIFY_SCHEMA, 0.1, FALLBACK.read.slice(0, 1), "low", 45_000);
  return { ...applyReview(figure, result), model };
}

function applyReview(figure, r) {
  const clamp = (v) => Math.max(0, Math.min(1000, Number(v) || 0));
  const box = (b) => [clamp(Math.min(b[1], b[3])), clamp(Math.min(b[0], b[2])), clamp(Math.max(b[1], b[3])), clamp(Math.max(b[0], b[2]))];
  const pt = (p) => [clamp(p?.[1]), clamp(p?.[0])];
  let parts = figure.parts.map((p) => ({ ...p }));
  let links = figure.links.map((l) => ({ ...l }));
  let changed = 0;
  const gone = new Set(r.remove_parts || []);
  if (gone.size) { parts = parts.filter((p) => !gone.has(p.id)); links = links.filter((l) => !gone.has(l.from) && !gone.has(l.to)); changed++; }
  for (const m of r.moves || []) {
    const p = parts.find((q) => q.id === m.id);
    if (p && Array.isArray(m.box_2d) && m.box_2d.length === 4) {
      const next = box(m.box_2d);
      // an outline moves with its box
      if (p.outline?.length) {
        const [a0, b0, a1, b1] = p.box, [c0, d0, c1, d1] = next;
        const sx = (c1 - c0) / Math.max(1, a1 - a0), sy = (d1 - d0) / Math.max(1, b1 - b0);
        p.outline = p.outline.map(([x, y]) => [c0 + (x - a0) * sx, d0 + (y - b0) * sy]);
      }
      p.box = next;
      changed++;
    }
  }
  for (const n of r.renames || []) {
    const p = parts.find((q) => q.id === n.id);
    if (p) { Object.assign(p, { name_en: n.name_en, name_id: n.name_id, label: n.label }); changed++; }
  }
  for (const a of r.add_parts || []) {
    if (parts.length >= 12 || parts.some((p) => p.id === a.id) || !Array.isArray(a.box_2d)) continue;
    const { box_2d, outline, ...rest } = a;
    parts.push({ ...rest, box: box(box_2d), outline: (outline || []).map(pt) });
    changed++;
  }
  const ids = new Set(parts.map((p) => p.id));
  const drop = (r.remove_links || []).map((l) => `${l.from}>${l.to}`);
  if (drop.length) { links = links.filter((l) => !drop.includes(`${l.from}>${l.to}`) && !drop.includes(`${l.to}>${l.from}`)); changed++; }
  for (const l of r.add_links || []) {
    if (!ids.has(l.from) || !ids.has(l.to)) continue;
    links.push({ ...l, path: (l.path || []).map(pt) });
    changed++;
  }
  // the findings a teacher sees are the ones that led to a change
  const findings = (r.findings || []).filter((f) => f.note_en).slice(0, 8);
  return { figure: changed ? { ...figure, parts, links, figure_box: extent(parts, links) } : figure, matches: Boolean(r.matches) && !changed, changed, findings };
}

// ---------------------------------------------------------------- answering a question

const ASK_SCHEMA = {
  type: "OBJECT",
  properties: {
    heard: { type: "STRING", description: "The student's question as you understood it, in their language." },
    answer: { type: "STRING", description: "The spoken answer: one to three short sentences, in the student's language." },
    focus: { type: "ARRAY", items: { type: "STRING" }, description: "Ids of the parts the answer is about, most important first. Empty if none." },
  },
  required: ["heard", "answer", "focus"],
};

export async function askFigure(key, { figure, question, audioBase64, audioMime, lang, focusId }) {
  const scene = {
    title: figure.title_en,
    overview: figure.overview_en,
    parts: figure.parts.map((p) => ({ id: p.id, name: p.name_en, box: p.box, detail: p.detail_en })),
    links: figure.links.map((l) => ({ from: l.from, to: l.to, kind: l.kind })),
  };
  const language = lang === "id" ? "Bahasa Indonesia" : "English";
  const text = `You are Timbul, speaking to a blind student who is exploring a textbook figure by touch and by voice.
The figure, as structured data (boxes are [x0, y0, x1, y1] on a 0-1000 grid over the page; smaller x is further left, smaller y is higher up):
${JSON.stringify(scene)}
${focusId ? `The student's finger or cursor is on the part "${focusId}".` : ""}
Answer the student's ${audioBase64 ? "spoken question in the audio" : `question: "${question}"`}
Rules: answer only from the figure data and basic school knowledge of the subject. Use spatial words (left, right, above, below, inside, connected to). Be short and warm. Answer in ${language}. If the question is not about the figure, answer briefly and guide them back to it.`;
  const parts = audioBase64 ? [{ inlineData: { mimeType: audioMime || "audio/wav", data: audioBase64 } }, { text }] : [{ text }];
  const { result, model } = await generateAny(key, MODELS.ask, parts, ASK_SCHEMA, 0.3, FALLBACK.ask);
  return { ...result, model };
}

// ---------------------------------------------------------------- opening a sheet by its number

const SHEET_SCHEMA = {
  type: "OBJECT",
  properties: {
    heard: { type: "STRING", description: "What the student said, as you understood it." },
    number: { type: "INTEGER", description: "The sheet number the student asked for, or 0 if no number was said." },
  },
  required: ["heard", "number"],
};

/** The student says a sheet number ("sheet two", "nomor dua", "open 12"); Gemini hears which one. */
export async function hearSheet(key, { audioBase64, audioMime, text }) {
  const prompt = `A blind student is opening a tactile sheet in Timbul by saying its number, in English or Bahasa Indonesia. ${audioBase64 ? "Listen to the audio." : `They typed: "${text}".`} Return the sheet number they asked for as an integer (for example "sheet two" is 2, "nomor dua belas" is 12), or 0 if they did not say a number.`;
  const parts = audioBase64 ? [{ inlineData: { mimeType: audioMime || "audio/wav", data: audioBase64 } }, { text: prompt }] : [{ text: prompt }];
  const { result, model } = await generateAny(key, MODELS.ask, parts, SHEET_SCHEMA, 0, FALLBACK.ask);
  return { ...result, model };
}

// ---------------------------------------------------------------- speaking

// Every spoken line is cached on disk by its words, voice and language, so a part's description is
// generated once and replayed for free after that.
const SPEECH_CACHE = process.env.TIMBUL_CACHE_DIR || (process.env.VERCEL ? "/tmp/timbul-speech" : resolve(process.cwd(), ".cache/speech"));

/** Gemini's speech can arrive at full scale and sounds harsh: bring the loudest sample to about -4 dBFS. */
function level(pcm) {
  let peak = 1;
  for (let i = 0; i < pcm.length - 1; i += 2) peak = Math.max(peak, Math.abs(pcm.readInt16LE(i)));
  const k = Math.min(1, (32767 * 0.63) / peak);
  if (k >= 1) return pcm;
  const out = Buffer.alloc(pcm.length);
  for (let i = 0; i < pcm.length - 1; i += 2) out.writeInt16LE(Math.round(pcm.readInt16LE(i) * k), i);
  return out;
}

function wav(pcm, rate = 24000) {
  pcm = level(pcm);
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.writeUInt32LE(36 + pcm.length, 4);
  head.write("WAVEfmt ", 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36);
  head.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([head, pcm]);
}

export async function speakText(key, text, lang = "en") {
  const id = createHash("sha256").update(`v3|${VOICE}|${lang}|${text}`).digest("hex").slice(0, 24);
  const file = join(SPEECH_CACHE, `${id}.wav`);
  if (existsSync(file)) return { audio: readFileSync(file), cached: true, file };
  // The text alone: a style instruction in front of it was sometimes read aloud as part of the line.
  let last;
  for (const model of MODELS.speak) {
    // a speech model that hangs is given up on after 25 seconds, and the next one tries
    let res;
    try {
      res = await fetch(`${API}/${model}:generateContent`, {
        method: "POST",
        signal: AbortSignal.timeout(25_000),
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text }] }],
        generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } } },
        }),
      });
    } catch (e) {
      last = new GeminiError(`${model}: ${e.name === "TimeoutError" ? "timed out" : e.message}`, 504, "other");
      console.warn(`[timbul] ${model} ${last.message}; trying the next voice model`);
      continue;
    }
    const body = await res.text();
    if (!res.ok) {
      last = new GeminiError(body.slice(0, 400), res.status, res.status === 429 ? "quota" : res.status === 404 ? "model" : "other");
      if ([429, 404, 500, 503].includes(res.status)) continue;
      throw last;
    }
    const part = JSON.parse(body).candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
    if (!part) { last = new GeminiError("No audio in the answer", 502, "other"); continue; }
    const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType || "")?.[1] || 24000);
    const audio = wav(Buffer.from(part.inlineData.data, "base64"), rate);
    try {
      mkdirSync(SPEECH_CACHE, { recursive: true });
      writeFileSync(file, audio);
      writeFileSync(file.replace(/\.wav$/, ".json"), JSON.stringify({ text, lang, voice: VOICE, model }, null, 1));
    } catch {
      // a read-only disk only means the line is generated again next time
    }
    return { audio, cached: false, file, model };
  }
  throw last;
}
