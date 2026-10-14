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

// The same Gemini models through OpenRouter. By default they answer first (the team's choice: Google's
// free tier is too small and too often busy), and Google's own Gemini API is the fallback.
// TIMBUL_PROVIDER=google puts Google first. Speech always uses Google's Gemini TTS.
export const PRIMARY = (process.env.TIMBUL_PROVIDER || "openrouter").toLowerCase();
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

async function generate(key, model, parts, schema, temperature = 0.2) {
  let res;
  // A busy model (503) or a dropped connection is retried; a quota refusal (429) is not.
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(`${API}/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { temperature, responseMimeType: "application/json", responseSchema: schema },
        }),
      });
    } catch (e) {
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
        continue;
      }
      throw new GeminiError(String(e), 502, "other");
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

async function openrouter(model, parts, schema, temperature) {
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
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "X-Title": "Timbul" },
    body: JSON.stringify({
      model, temperature, messages: [{ role: "user", content }],
      response_format: { type: "json_schema", json_schema: { name: "answer", strict: false, schema: jsonSchema(schema) } },
      reasoning: { effort: "low" },
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new GeminiError(body.slice(0, 400), res.status, res.status === 429 ? "quota" : "other");
  const text = JSON.parse(body).choices?.[0]?.message?.content || "";
  if (!text) throw new GeminiError("OpenRouter returned an empty answer", 502, "other");
  return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
}

/** Tries each model in turn; moves on when one is busy (503) or its free allowance is used up (429). */
async function generateAny(key, models, parts, schema, temperature, fallback = []) {
  let last;
  const routed = fallback.map((m) => "openrouter:" + m);
  const order = !fallback.length ? models : PRIMARY === "openrouter" && loadKey(process.cwd(), ["OPENROUTER_API_KEY", "VITE_OPENROUTER_API_KEY"]) ? [...routed, ...models] : [...models, ...routed];
  for (const model of order) {
    if (model.startsWith("openrouter:")) {
      try {
        return { result: await openrouter(model.slice(11), parts, schema, temperature), model };
      } catch (e) {
        last = e;
        console.warn(`[timbul] ${model} failed (${e.status}); trying the next model`);
        continue;
      }
    }
    try {
      return { result: await generate(key, model, parts, schema, temperature), model };
    } catch (e) {
      last = e;
      const moveOn = e instanceof GeminiError && (e.kind === "quota" || e.kind === "model" || e.status === 503 || e.status === 500);
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
          shape: { type: "STRING", enum: ["rect", "ellipse", "polygon", "battery", "lamp", "switch_open", "switch_closed", "resistor", "cell"] },
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
  const xs = [], ys = [];
  for (const p of parts) xs.push(p.box[0], p.box[2]), ys.push(p.box[1], p.box[3]);
  for (const l of links) for (const [x, y] of l.path) xs.push(x), ys.push(y);
  const pad = 8;
  const figure_box = xs.length ? [Math.max(0, Math.min(...xs) - pad), Math.max(0, Math.min(...ys) - pad), Math.min(1000, Math.max(...xs) + pad), Math.min(1000, Math.max(...ys) + pad)] : [0, 0, 1000, 1000];
  return { ...raw, figure_box, parts, links, coords: "image" };
}

export async function readFigure(key, imageBase64, mimeType) {
  const { result, model } = await generateAny(key, MODELS.read, [{ inlineData: { mimeType, data: imageBase64 } }, { text: READ_PROMPT }], FIGURE_SCHEMA, 0.1, FALLBACK.read);
  return { ...normalise(result), model };
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

// ---------------------------------------------------------------- speaking

// Every spoken line is cached on disk by its words, voice and language, so a part's description is
// generated once and replayed for free after that.
const SPEECH_CACHE = resolve(process.cwd(), ".cache/speech");

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
    const res = await fetch(`${API}/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text }] }],
        generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } } },
      }),
    });
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
    mkdirSync(SPEECH_CACHE, { recursive: true });
    writeFileSync(file, audio);
    writeFileSync(file.replace(/\.wav$/, ".json"), JSON.stringify({ text, lang, voice: VOICE, model }, null, 1));
    return { audio, cached: false, file, model };
  }
  throw last;
}
