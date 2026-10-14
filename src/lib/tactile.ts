// Turns Gemini's structured reading of a figure into a tactile sheet: every line drawn as raised dots,
// braille labels placed clear of the lines, and the sheet checked against tactile-graphics rules.
// Gemini proposes what is in the figure; this code decides exactly where every dot goes.

import { toBraille, cellDots, cellsWidth, toUnicode, CELL, type Cell } from "./braille";
import type { SavedFigure, Part, Link } from "./types";
import qrcode from "qrcode-generator";

type P = [number, number];

export const SHEET = { w: 297, h: 210, margin: 14, titleH: 16, codeH: 18 };
const LINE = { gap: 2.3, r: 0.85 };
const MIN_GAP = 3; // millimetres between separate lines, a common tactile-graphics rule
const MAX_PARTS = 12;
const MAX_INK = 0.22;

export interface SheetPart {
  part: Part;
  box: [number, number, number, number];
  dots: P[];
  fill: P[];
  texture: number | null;
  key?: string;
  merged: string[];
}
export interface SheetLabel {
  partId: string;
  text: string;
  cells: Cell[];
  unicode: string;
  x: number;
  y: number;
  w: number;
  dots: P[];
  key?: string;
}
export interface Check {
  id: "spacing" | "labels" | "clutter" | "braille";
  name: string;
  pass: boolean;
  value: string;
  rule: string;
}
export interface Sheet {
  w: number;
  h: number;
  draw: { x: number; y: number; w: number; h: number };
  title: { text: string; cells: Cell[]; dots: P[] };
  parts: SheetPart[];
  links: { link: Link; dots: P[] }[];
  labels: SheetLabel[];
  keyList: { key: string; text: string; cells: Cell[]; dots: P[]; x: number; y: number }[];
  notes: string[];
  checks: Check[];
  dotR: number;
  /** How the student's phone finds this figure: a QR code in the bottom-right corner, the same code in braille
   *  bottom-left, and a raised notch at the top-right corner so the sheet can be oriented by touch. */
  code: { text: string; url: string; cells: Cell[]; dots: P[]; x: number; y: number; qr: { x: number; y: number; size: number; modules: boolean[][] } };
  notch: P[];
}

/** A short code a person can read or type: six characters from the figure's id. */
export function shortCode(id: string) {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 6; i++) { out += alphabet[h % alphabet.length]; h = Math.floor(h / alphabet.length) || (h * 2654435761) >>> 0; }
  return out;
}

export function figureUrl(id: string) {
  const origin = typeof location !== "undefined" ? location.origin : "https://timbul.app";
  return `${origin}/#/figure/${id}`;
}

// ---------------------------------------------------------------- geometry helpers

function along(points: P[], gap = LINE.gap, closed = false): P[] {
  const pts = closed ? [...points, points[0]] : points;
  const out: P[] = [];
  let carry = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len === 0) continue;
    let t = carry;
    while (t <= len) {
      out.push([x0 + ((x1 - x0) * t) / len, y0 + ((y1 - y0) * t) / len]);
      t += gap;
    }
    carry = t - len;
  }
  if (!closed && pts.length > 1) {
    const last = pts[pts.length - 1];
    const prev = out[out.length - 1];
    if (!prev || Math.hypot(prev[0] - last[0], prev[1] - last[1]) > gap * 0.45) out.push(last);
  }
  return out;
}

function ellipsePoints(cx: number, cy: number, rx: number, ry: number, n = 72): P[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] as P;
  });
}

function rectPoints(x0: number, y0: number, x1: number, y1: number): P[] {
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
}

function inside(part: Part, box: number[], outline: P[] | null, [x, y]: P, inset: number) {
  const [x0, y0, x1, y1] = box;
  if (part.shape === "ellipse") {
    const rx = (x1 - x0) / 2 - inset, ry = (y1 - y0) / 2 - inset;
    if (rx <= 0 || ry <= 0) return false;
    const dx = (x - (x0 + x1) / 2) / rx, dy = (y - (y0 + y1) / 2) / ry;
    return dx * dx + dy * dy <= 1;
  }
  if (part.shape === "polygon" && outline && outline.length > 2) {
    let hit = false;
    for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
      const [xi, yi] = outline[i], [xj, yj] = outline[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    if (!hit) return false;
    return outline.every((p, i) => distToSegment([x, y], p, outline[(i + 1) % outline.length]) >= inset);
  }
  return x >= x0 + inset && x <= x1 - inset && y >= y0 + inset && y <= y1 - inset;
}

function distToSegment([px, py]: P, [ax, ay]: P, [bx, by]: P) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Circuit symbols, drawn inside the part's box as line segments. */
function symbol(shape: Part["shape"], [x0, y0, x1, y1]: number[]): P[][] {
  const w = x1 - x0, h = y1 - y0;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const horiz = w >= h;
  const long = horiz ? w : h, short = horiz ? h : w;
  // map (u along the long axis, v across it) to x, y
  const at = (u: number, v: number): P => (horiz ? [cx + u, cy + v] : [cx + v, cy + u]);
  switch (shape) {
    case "lamp": {
      const r = Math.min(w, h) / 2 * 0.92;
      const k = r * 0.68;
      return [[...ellipsePoints(cx, cy, r, r, 48), ellipsePoints(cx, cy, r, r, 48)[0]], [[cx - k, cy - k], [cx + k, cy + k]], [[cx - k, cy + k], [cx + k, cy - k]]];
    }
    case "battery":
    case "cell": {
      const g = Math.min(long * 0.12, 3.5);
      const lead = long / 2;
      return [
        [at(-lead, 0), at(-g, 0)],
        [at(-g, -short * 0.48), at(-g, short * 0.48)],
        [at(g, -short * 0.24), at(g, short * 0.24)],
        [at(g, 0), at(lead, 0)],
      ];
    }
    case "resistor": {
      const amp = Math.min(short * 0.38, 4);
      const lead = long * 0.18;
      const zig: P[] = [at(-long / 2, 0), at(-long / 2 + lead, 0)];
      const n = 6;
      const span = long - lead * 2;
      for (let i = 0; i < n; i++) zig.push(at(-long / 2 + lead + (span * (i + 0.5)) / n, i % 2 ? amp : -amp));
      zig.push(at(long / 2 - lead, 0), at(long / 2, 0));
      return [zig];
    }
    case "switch_open":
    case "switch_closed": {
      const a = at(-long * 0.3, 0), b = at(long * 0.3, 0);
      const lever = shape === "switch_open" ? at(long * 0.24, -Math.min(short * 0.45, long * 0.3)) : b;
      return [[at(-long / 2, 0), a], [a, lever], [b, at(long / 2, 0)]];
    }
    default:
      return [rectPoints(x0, y0, x1, y1)];
  }
}

const isSymbol = (s: Part["shape"]) => ["battery", "lamp", "switch_open", "switch_closed", "resistor", "cell"].includes(s);

// ---------------------------------------------------------------- the sheet

export function buildSheet(saved: SavedFigure): Sheet {
  const fig = saved.figure;
  const notes: string[] = [];

  // Figure proportions in the original image.
  const [bx0, by0, bx1, by1] = fig.figure_box?.length === 4 ? fig.figure_box : [0, 0, 1000, 1000];
  const aspect = (((bx1 - bx0) / 1000) * saved.imageW) / Math.max(1, ((by1 - by0) / 1000) * saved.imageH);

  // First pass decides whether a key column is needed; the second lays the sheet out for real.
  let sheet = layout(saved, aspect, false, notes);
  if (sheet.keyList.length) sheet = layout(saved, aspect, true, []);
  return sheet;
}

function layout(saved: SavedFigure, aspect: number, withKey: boolean, notesIn: string[]): Sheet {
  const fig = saved.figure;
  const notes = [...notesIn];
  const keyW = withKey ? 78 : 0;
  const area = { x: SHEET.margin, y: SHEET.margin + SHEET.titleH, w: SHEET.w - SHEET.margin * 2 - keyW, h: SHEET.h - SHEET.margin * 2 - SHEET.titleH - SHEET.codeH };
  const pad = 16; // room for labels around the drawing
  const availW = area.w - pad * 2, availH = area.h - pad * 2;
  const dw = Math.min(availW, availH * aspect);
  const dh = dw / aspect;
  const draw = { x: area.x + (area.w - dw) / 2, y: area.y + (area.h - dh) / 2, w: dw, h: dh };
  const [fx0, fy0, fx1, fy1] = fig.figure_box?.length === 4 ? fig.figure_box : [0, 0, 1000, 1000];
  const X = (v: number) => draw.x + ((v - fx0) / Math.max(1, fx1 - fx0)) * draw.w;
  const Y = (v: number) => draw.y + ((v - fy0) / Math.max(1, fy1 - fy0)) * draw.h;
  const toBox = (b: number[]): [number, number, number, number] => [X(Math.min(b[0], b[2])), Y(Math.min(b[1], b[3])), X(Math.max(b[0], b[2])), Y(Math.max(b[1], b[3]))];

  // Merge outlines that would sit on top of each other: a reader cannot tell two lines 3 mm apart from one.
  const kept: SheetPart[] = [];
  const sorted = [...fig.parts].sort((a, b) => area2(b.box) - area2(a.box));
  for (const part of sorted) {
    const box = toBox(part.box);
    const twin = !isSymbol(part.shape) && kept.find((k) => !isSymbol(k.part.shape) && box.every((v, i) => Math.abs(v - k.box[i]) < MIN_GAP + 2.5));
    if (twin) {
      twin.merged.push(part.name_en);
      notes.push(`${cap(part.name_en)} is drawn as one line with ${twin.part.name_en.toLowerCase()}: the two outlines were too close to tell apart by touch.`);
      continue;
    }
    kept.push({ part, box, dots: [], fill: [], texture: null, merged: [] });
  }

  // Outlines and symbols.
  for (const sp of kept) {
    const [x0, y0, x1, y1] = sp.box;
    const p = sp.part;
    if (isSymbol(p.shape)) sp.dots = symbol(p.shape, sp.box).flatMap((seg) => along(seg));
    else if (p.shape === "ellipse") sp.dots = along(ellipsePoints((x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2), LINE.gap, true);
    else if (p.shape === "polygon" && p.outline && p.outline.length > 2) sp.dots = along(p.outline.map(([x, y]) => [X(x), Y(y)] as P), LINE.gap, true);
    else sp.dots = along(rectPoints(x0, y0, x1, y1), LINE.gap, true);
  }

  // Textures for the innermost areas, so neighbouring areas feel different.
  let tex = 0;
  for (const sp of kept) {
    if (isSymbol(sp.part.shape) || sp.part.kind === "component") continue;
    const holdsOthers = kept.some((o) => o !== sp && contains(sp.box, o.box));
    const share = ((sp.box[2] - sp.box[0]) * (sp.box[3] - sp.box[1])) / (draw.w * draw.h);
    if (holdsOthers || share > 0.35 || share < 0.004) continue;
    const outline = sp.part.shape === "polygon" && sp.part.outline ? sp.part.outline.map(([x, y]) => [X(x), Y(y)] as P) : null;
    const pattern = tex++ % 2;
    sp.texture = pattern;
    const step = pattern === 0 ? 3.4 : 3.0;
    for (let y = sp.box[1]; y <= sp.box[3]; y += step) {
      for (let x = sp.box[0]; x <= sp.box[2]; x += step) {
        const px = pattern === 0 ? x : x + ((y - sp.box[1]) % (step * 2) < step ? step / 2 : 0);
        if (inside(sp.part, sp.box, outline, [px, y], 2.6)) sp.fill.push([px, y]);
      }
    }
  }

  // Lines and arrows between parts.
  const links = fig.links
    .filter((l) => l.path?.length > 1)
    .map((link) => {
      const pts = link.path.map(([x, y]) => [X(x), Y(y)] as P);
      const dots = along(pts);
      if (link.kind === "arrow") {
        const [ax, ay] = pts[pts.length - 2], [bx, by] = pts[pts.length - 1];
        const ang = Math.atan2(by - ay, bx - ax);
        for (const s of [-1, 1]) dots.push(...along([[bx, by], [bx - 5 * Math.cos(ang + s * 0.5), by - 5 * Math.sin(ang + s * 0.5)]]).slice(1));
      }
      return { link, dots };
    });

  occlude(kept, links, X, Y);

  // Braille labels, placed clear of every line; a key letter when the full label will not fit.
  const lineDots: { owner: string; p: P }[] = [
    ...kept.flatMap((k) => k.dots.map((p) => ({ owner: k.part.id, p }))),
    ...kept.flatMap((k) => k.fill.map((p) => ({ owner: k.part.id + ":fill", p }))),
    ...links.flatMap((l, i) => l.dots.map((p) => ({ owner: "link" + i, p }))),
  ];
  const labels: SheetLabel[] = [];
  const keyList: Sheet["keyList"] = [];
  const bounds = { x0: area.x, y0: area.y, x1: area.x + area.w, y1: area.y + area.h };
  const H = CELL.dotGap * 2;
  const clear = (x: number, y: number, w: number) => {
    if (x < bounds.x0 || y < bounds.y0 || x + w > bounds.x1 || y + H > bounds.y1) return false;
    const m = MIN_GAP + LINE.r + CELL.dotR;
    if (lineDots.some(({ p }) => p[0] > x - m && p[0] < x + w + m && p[1] > y - m && p[1] < y + H + m)) return false;
    return !labels.some((l) => x < l.x + l.w + 4 && x + w + 4 > l.x && y < l.y + H + 6 && y + H + 6 > l.y);
  };
  const letters = "abcdefghijklmnopqrstuvwxyz";
  // Small parts first: they have the fewest places to put a label.
  const order = [...kept].sort((a, b) => area2(a.box) - area2(b.box));
  for (const sp of order) {
    const text = (sp.part.label || sp.part.name_en).toLowerCase().slice(0, 24);
    const { cells } = toBraille(text);
    const w = cellsWidth(cells.length);
    const [x0, y0, x1, y1] = sp.box;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const off = MIN_GAP + 1.5;
    const candidates: P[] = [
      [x1 + off, cy - H / 2],
      [x0 - off - w, cy - H / 2],
      [cx - w / 2, y0 - off - H],
      [cx - w / 2, y1 + off],
      [cx - w / 2, y0 + off + 2],
      [cx - w / 2, cy - H / 2],
      [x1 + off, y0],
      [x0 - off - w, y1 - H],
    ];
    const spot = candidates.find(([x, y]) => clear(x, y, w));
    if (spot) {
      labels.push({ partId: sp.part.id, text, cells, unicode: toUnicode(cells), x: spot[0], y: spot[1], w, dots: cellDots(cells, spot[0], spot[1]) });
      continue;
    }
    const key = letters[keyList.length % 26];
    const kc = toBraille(key).cells;
    const kw = cellsWidth(kc.length);
    const kspot = ([[cx - kw / 2, cy - H / 2], ...candidates.map(([x, y]) => [x + (w - kw) / 2, y])] as P[]).find(([x, y]) => clear(x, y, kw)) || ([cx - kw / 2, cy - H / 2] as P);
    sp.key = key;
    labels.push({ partId: sp.part.id, text: key, cells: kc, unicode: toUnicode(kc), x: kspot[0], y: kspot[1], w: kw, dots: cellDots(kc, kspot[0], kspot[1]), key });
    keyList.push({ key, text, cells, dots: [], x: 0, y: 0 });
  }
  // The key column, right of the drawing.
  if (withKey) {
    const kx = SHEET.w - SHEET.margin - keyW + 10;
    keyList.forEach((k, i) => {
      const y = area.y + 6 + i * 13;
      const cells = [...toBraille(k.key).cells, [], ...k.cells].slice(0, 10);
      k.x = kx;
      k.y = y;
      k.dots = cellDots(cells, kx, y);
    });
  }

  const titleText = (fig.title_en || "figure").toLowerCase().slice(0, 40);
  const titleCells = toBraille(titleText).cells;
  const maxTitle = Math.floor((SHEET.w - SHEET.margin * 2) / CELL.cellGap);
  const tCells = titleCells.slice(0, maxTitle);
  const title = { text: titleText, cells: tCells, dots: cellDots(tCells, SHEET.margin, SHEET.margin) };

  // The code row along the bottom: braille code on the left, QR code on the right; a raised notch top-right.
  const url = figureUrl(saved.id);
  const codeText = shortCode(saved.id);
  const codeCells = toBraille("code " + codeText).cells;
  const codeY = SHEET.h - SHEET.margin - 8;
  const qr = qrcode(0, "M");
  qr.addData(url);
  qr.make();
  const n = qr.getModuleCount();
  const modules = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
  const qrSize = 22;
  const code = {
    text: codeText, url, cells: codeCells, x: SHEET.margin, y: codeY,
    dots: cellDots(codeCells, SHEET.margin, codeY),
    qr: { x: SHEET.w - SHEET.margin - qrSize, y: SHEET.h - SHEET.margin - qrSize + 4, size: qrSize, modules },
  };
  const notchDots: P[] = [];
  for (let r = 0; r < 6; r++) for (let c = 0; c < 6 - r; c++) notchDots.push([SHEET.w - 6 - c * 2.4, 6 + r * 2.4]);

  const sheet: Sheet = { w: SHEET.w, h: SHEET.h, draw, title, parts: kept, links, labels, keyList, notes, checks: [], dotR: LINE.r, code, notch: notchDots };
  sheet.checks = runChecks(sheet);
  return sheet;
}

/**
 * Tactile-graphics practice for lines that overlap or cross: the shape in front is drawn whole, the one
 * behind stops 3 mm short of it, and a line crossing an outline is broken with a 3 mm gap either side.
 * Textures stay inside their own area and clear of every line.
 */
function occlude(parts: SheetPart[], links: { link: Link; dots: P[] }[], X: (v: number) => number, Y: (v: number) => number) {
  const outlineOf = (sp: SheetPart) => (sp.part.shape === "polygon" && sp.part.outline && sp.part.outline.length > 2 ? sp.part.outline.map(([x, y]) => [X(x), Y(y)] as P) : null);
  const near = (p: P, dots: P[], d: number) => dots.some((q) => Math.abs(q[0] - p[0]) < d && Math.abs(q[1] - p[1]) < d && Math.hypot(q[0] - p[0], q[1] - p[1]) < d);
  const keepOff = MIN_GAP + LINE.r * 2;
  const overlaps = (a: number[], b: number[]) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

  // Shapes behind give way to shapes in front (smaller shapes sit in front).
  const bySize = [...parts].sort((a, b) => area2(a.box) - area2(b.box));
  const original = new Map(parts.map((sp) => [sp, sp.dots]));
  for (let i = 0; i < bySize.length; i++) {
    const front = bySize[i];
    for (let j = i + 1; j < bySize.length; j++) {
      const back = bySize[j];
      if (!overlaps(front.box, back.box) || contains(back.box, front.box)) continue;
      const frontDots = original.get(front)!;
      const outline = outlineOf(front);
      back.dots = back.dots.filter((p) => !inside(front.part, front.box, outline, p, -keepOff) && !near(p, frontDots, keepOff));
    }
  }

  // Lines crossing an outline they do not end at are broken around the crossing.
  const ends = (l: Link) => new Set([l.from, l.to]);
  for (const l of links) {
    const own = ends(l.link);
    const others = parts.filter((sp) => !own.has(sp.part.id)).flatMap((sp) => sp.dots);
    l.dots = l.dots.filter((p) => !near(p, others, keepOff));
  }

  // Textures: inside their own area, outside smaller areas in front, clear of every line.
  const allLines = [...parts.flatMap((sp) => sp.dots), ...links.flatMap((l) => l.dots)];
  for (const sp of parts) {
    if (!sp.fill.length) continue;
    const fronts = parts.filter((o) => o !== sp && area2(o.box) < area2(sp.box) && overlaps(o.box, sp.box));
    sp.fill = sp.fill.filter((p) => !fronts.some((o) => inside(o.part, o.box, outlineOf(o), p, -MIN_GAP)) && !near(p, allLines, MIN_GAP));
  }
}

function area2(b: number[]) {
  return Math.abs((b[2] - b[0]) * (b[3] - b[1]));
}
function contains(a: number[], b: number[]) {
  return b[0] >= a[0] && b[1] >= a[1] && b[2] <= a[2] && b[3] <= a[3] && area2(b) < area2(a);
}
function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------- checks

function runChecks(sheet: Sheet): Check[] {
  // 1. Line spacing: separate lines must be at least 3 mm apart, edge to edge.
  type D = { owner: string; p: P; ends?: string[] };
  const outlines: D[] = sheet.parts.map((sp) => sp.dots.map((p) => ({ owner: sp.part.id, p }))).flat();
  const linkDots: D[] = sheet.links.flatMap((l, i) => l.dots.map((p) => ({ owner: "link" + i, p, ends: [l.link.from, l.link.to] })));
  const all = [...outlines, ...linkDots];
  const partBox = new Map(sheet.parts.map((sp) => [sp.part.id, sp.box]));
  const nearOwnEnd = (d: D, other: D) => {
    if (!d.ends) return false;
    if (other.ends) return other.ends.some((e) => d.ends!.includes(e)); // two wires meeting at the same part
    const b = partBox.get(other.owner);
    return d.ends.includes(other.owner) && !!b && d.p[0] > b[0] - 6 && d.p[0] < b[2] + 6 && d.p[1] > b[1] - 6 && d.p[1] < b[3] + 6;
  };
  let minGap = Infinity;
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j];
      if (a.owner === b.owner) continue;
      if (nearOwnEnd(a, b) || nearOwnEnd(b, a)) continue;
      const d = Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1]) - sheet.dotR * 2;
      if (d < minGap) minGap = d;
    }
  }
  const spacingPass = minGap >= MIN_GAP;

  // 2. Labels: braille clear of every line by at least 3 mm.
  let labelGap = Infinity;
  const inkDots = [...all.map((d) => d.p), ...sheet.parts.flatMap((p) => p.fill)];
  for (const l of sheet.labels) for (const p of l.dots) for (const q of inkDots) labelGap = Math.min(labelGap, Math.hypot(p[0] - q[0], p[1] - q[1]) - sheet.dotR - CELL.dotR);
  const keyed = sheet.labels.filter((l) => l.key).length;

  // 3. Clutter: few parts, and not too much of the drawing raised.
  const dotCount = all.length + sheet.parts.reduce((n, p) => n + p.fill.length, 0);
  const ink = (dotCount * Math.PI * sheet.dotR * sheet.dotR) / (sheet.draw.w * sheet.draw.h);
  const clutterPass = sheet.parts.length <= MAX_PARTS && ink <= MAX_INK;

  // 4. Braille: every label written in standard cells with nothing left out.
  const unsupported = sheet.parts.flatMap((p) => toBraille((p.part.label || p.part.name_en).toLowerCase()).unsupported);
  const cells = sheet.labels.reduce((n, l) => n + l.cells.length, 0) + sheet.keyList.reduce((n, k) => n + k.cells.length, 0);

  return [
    { id: "spacing", name: "Line spacing", pass: spacingPass, value: !isFinite(minGap) ? "no lines" : minGap <= 0 ? "some lines touch or cross" : `closest lines ${minGap.toFixed(1)} mm apart`, rule: "Separate lines at least 3 mm apart" },
    { id: "labels", name: "Label size", pass: labelGap >= MIN_GAP - 0.01, value: `${sheet.labels.length} labels, ${keyed ? `${keyed} in the key, ` : ""}${!isFinite(labelGap) ? "clear" : labelGap <= 0 ? "some touch a line" : labelGap.toFixed(1) + " mm clear"}`, rule: "Standard 6 mm braille cells, 3 mm clear of lines" },
    { id: "clutter", name: "Clutter", pass: clutterPass, value: `${sheet.parts.length} parts, ${(ink * 100).toFixed(0)}% raised`, rule: `At most ${MAX_PARTS} parts and ${MAX_INK * 100}% of the drawing raised` },
    { id: "braille", name: "Braille", pass: unsupported.length === 0, value: `${cells} cells${unsupported.length ? `, ${unsupported.length} characters not written` : ""}`, rule: "Uncontracted braille, every character written" },
  ];
}

// ---------------------------------------------------------------- export

/** The tactile sheet as a print-ready SVG in real millimetres (A4 landscape), for swell paper or an embosser. */
export function sheetSvg(sheet: Sheet, opts: { ink?: boolean } = {}): string {
  const c = (p: P, r: number) => `<circle cx="${p[0].toFixed(2)}" cy="${p[1].toFixed(2)}" r="${r}"/>`;
  const line = [...sheet.parts.flatMap((p) => p.dots), ...sheet.links.flatMap((l) => l.dots)].map((p) => c(p, sheet.dotR)).join("");
  const fill = sheet.parts.flatMap((p) => p.fill).map((p) => c(p, 0.5)).join("");
  const braille = [...sheet.title.dots, ...sheet.labels.flatMap((l) => l.dots), ...sheet.keyList.flatMap((k) => k.dots), ...sheet.code.dots, ...sheet.notch].map((p) => c(p, CELL.dotR)).join("");
  const { qr } = sheet.code;
  const cell = qr.size / qr.modules.length;
  const qrInk = qr.modules.flatMap((row, r) => row.map((on, k) => (on ? `<rect x="${(qr.x + k * cell).toFixed(2)}" y="${(qr.y + r * cell).toFixed(2)}" width="${cell.toFixed(3)}" height="${cell.toFixed(3)}"/>` : ""))).join("");
  const codeInk = `<text x="${sheet.code.x}" y="${(sheet.code.y + 10.5).toFixed(1)}" font-size="3.4" font-family="sans-serif">Scan the corner code with Timbul, or type ${sheet.code.text}</text>`;
  const ink = opts.ink
    ? sheet.labels.map((l) => `<text x="${l.x.toFixed(1)}" y="${(l.y + 9.5).toFixed(1)}" font-size="3.2" font-family="sans-serif">${esc(l.key ? l.key : l.text)}</text>`).join("") +
      sheet.keyList.map((k) => `<text x="${k.x.toFixed(1)}" y="${(k.y + 9.5).toFixed(1)}" font-size="3.2" font-family="sans-serif">${esc(k.key + "  " + k.text)}</text>`).join("")
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${sheet.w}mm" height="${sheet.h}mm" viewBox="0 0 ${sheet.w} ${sheet.h}">
<title>${esc(sheet.title.text)}</title>
<rect width="100%" height="100%" fill="#fff"/>
<g fill="#000">${line}${fill}${braille}${ink}${qrInk}${codeInk}</g>
</svg>`;
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
}
