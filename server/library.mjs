// The class library: every sheet a teacher approves, shared by everyone with the class code, so a sheet made on
// the teacher's laptop opens on the student's phone when she says its number.
// On Google Cloud (Cloud Run) it lives in Firestore; anywhere else in a JSON file per class.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

// Sheet 1 is the built-in sample, so a class's own sheets start at 2.
const FIRST_NUMBER = 2;
const MAX_SHEETS = 300;

const useFirestore = process.env.TIMBUL_STORE === "firestore" || (Boolean(process.env.K_SERVICE) && process.env.TIMBUL_STORE !== "file");
const DATA_DIR = process.env.TIMBUL_DATA_DIR || (process.env.VERCEL ? "/tmp/timbul" : resolve(process.cwd(), ".cache/library"));

export const store = useFirestore ? "firestore" : "file";

/** A class code is short, lowercase letters, digits and dashes. */
export function classCode(raw) {
  const code = String(raw || "demo").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 32);
  return code || "demo";
}

// ---------------------------------------------------------------- Firestore

let db;
async function firestore() {
  if (!db) {
    const { Firestore } = await import("@google-cloud/firestore");
    db = new Firestore({ ignoreUndefinedProperties: true });
  }
  return db;
}

// Firestore cannot store arrays of arrays, and a polygon outline is one ([[x, y], …]), so the figure is kept as
// JSON text. Sheets saved before this change hold the figure as an object and are read as they are.
function fromDoc(data) {
  if (typeof data.figureJson !== "string") return data;
  const { figureJson, ...rest } = data;
  return { ...rest, figure: JSON.parse(figureJson) };
}

async function fsList(code) {
  const snap = await (await firestore()).collection("classes").doc(code).collection("sheets").orderBy("number", "desc").limit(MAX_SHEETS).get();
  return snap.docs.map((d) => fromDoc(d.data()));
}

async function fsSave(code, sheet) {
  const d = await firestore();
  const cls = d.collection("classes").doc(code);
  return d.runTransaction(async (tx) => {
    const ref = cls.collection("sheets").doc(sheet.id);
    const [clsSnap, prev] = await Promise.all([tx.get(cls), tx.get(ref)]);
    let number = prev.exists ? prev.data().number : null;
    if (!number) {
      number = clsSnap.exists ? clsSnap.data().next || FIRST_NUMBER : FIRST_NUMBER;
      tx.set(cls, { next: number + 1, updatedAt: Date.now() }, { merge: true });
    }
    const saved = { ...sheet, number };
    const { figure, ...rest } = saved;
    tx.set(ref, { ...rest, figureJson: JSON.stringify(figure) });
    return saved;
  });
}

// ---------------------------------------------------------------- file

function file(code) {
  mkdirSync(DATA_DIR, { recursive: true });
  return join(DATA_DIR, `${code}.json`);
}
function readClass(code) {
  const f = file(code);
  if (!existsSync(f)) return { next: FIRST_NUMBER, sheets: [] };
  try {
    return JSON.parse(readFileSync(f, "utf8"));
  } catch {
    return { next: FIRST_NUMBER, sheets: [] };
  }
}

// ---------------------------------------------------------------- the library

export async function listSheets(raw) {
  const code = classCode(raw);
  if (useFirestore) return fsList(code);
  return readClass(code).sheets.sort((a, b) => b.number - a.number);
}

/** Saves a sheet; a new one gets the class's next sheet number, an existing one keeps its number. */
export async function saveSheet(raw, sheet) {
  const code = classCode(raw);
  if (!sheet || typeof sheet.id !== "string" || !sheet.figure) throw Object.assign(new Error("Not a sheet"), { status: 400 });
  const clean = { ...sheet, id: sheet.id.slice(0, 40), sample: false };
  if (useFirestore) return fsSave(code, clean);
  const cls = readClass(code);
  const prev = cls.sheets.find((s) => s.id === clean.id);
  if (!prev && cls.sheets.length >= MAX_SHEETS) throw Object.assign(new Error("This class library is full"), { status: 413 });
  const saved = { ...clean, number: prev?.number || cls.next };
  if (!prev) cls.next = saved.number + 1;
  cls.sheets = [...cls.sheets.filter((s) => s.id !== saved.id), saved];
  writeFileSync(file(code), JSON.stringify(cls));
  return saved;
}

/** Removes a sheet. Its number is not given out again, so a printed sheet never opens a different figure. */
export async function deleteSheet(raw, id) {
  const code = classCode(raw);
  // The shared "demo" class is what every visitor opens first, so its sheets cannot be deleted; other classes can.
  if (code === "demo") throw Object.assign(new Error("The demo library is read-only. Use your own class code to delete sheets."), { status: 403 });
  if (typeof id !== "string" || !/^[\w-]{1,40}$/.test(id)) throw Object.assign(new Error("Not a sheet"), { status: 400 });
  if (useFirestore) {
    await (await firestore()).collection("classes").doc(code).collection("sheets").doc(id).delete();
    return { deleted: id };
  }
  const cls = readClass(code);
  const sheets = cls.sheets.filter((s) => s.id !== id);
  if (sheets.length !== cls.sheets.length) writeFileSync(file(code), JSON.stringify({ ...cls, sheets }));
  return { deleted: id };
}
