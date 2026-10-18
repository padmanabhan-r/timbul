import { useEffect, useMemo, useRef, useState } from "react";
import type { Figure, Finding, Lang, SavedFigure } from "../lib/types";
import { readPage, locateFigure, verifyDrawing, ApiError } from "../lib/api";
import { saveFigure } from "../lib/store";
import { buildSheet, checkSvg } from "../lib/tactile";
import { svgToPng } from "../lib/render";
import { FigureView } from "../components/FigureView";
import { DotMark, TopBar, Checks } from "../components/Bits";

type Step = "pick" | "reading" | "checking" | "drawing" | "done" | "error";

const STAGES: Record<Lang, string[]> = {
  en: ["Found the figure", "Read every part", "Gemini checked its drawing", "Braille labels", "Tactile rules checked", "Ready for approval"],
  id: ["Gambar ditemukan", "Setiap bagian dibaca", "Gemini memeriksa gambarnya", "Label braille", "Aturan taktil diperiksa", "Siap disetujui"],
};
// Kept in both languages, so a message already on screen follows the language switch.
const ERRORS = {
  photo: { en: "Choose a photo or scan of the page (JPEG or PNG).", id: "Pilih foto atau pindaian halaman (JPEG atau PNG)." },
  none: { en: "Timbul could not find a diagram on this page. Try a closer photo of just the figure.", id: "Timbul tidak menemukan diagram di halaman ini. Coba foto yang lebih dekat, hanya gambarnya saja." },
  other: { en: "Something went wrong. Try again.", id: "Terjadi kesalahan. Coba lagi." },
};
const ROUNDS = 2;

/** The draft drawing over the page, as a PNG, for Gemini to compare with the page. */
const drawingPng = (saved: SavedFigure, sheet = buildSheet(saved)) => svgToPng(checkSvg(sheet, saved));

/** Shrinks the photo before it is sent and stored, so a phone photo stays small. */
async function prepare(file: File): Promise<{ dataUrl: string; base64: string; w: number; h: number }> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  URL.revokeObjectURL(url);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
  return { dataUrl, base64: dataUrl.split(",")[1], w, h };
}

/** Cuts the figure out of the page, with a margin, so Gemini reads a close-up of it. */
async function crop(dataUrl: string, w: number, h: number, box: [number, number, number, number]) {
  const [x0, y0, x1, y1] = box;
  if ((x1 - x0) * (y1 - y0) > 850 * 850 || x1 - x0 < 80 || y1 - y0 < 80) return null; // already a close-up, or a doubtful box
  const m = 30;
  const sx = Math.max(0, ((x0 - m) / 1000) * w), sy = Math.max(0, ((y0 - m) / 1000) * h);
  const sw = Math.min(w, ((x1 + m) / 1000) * w) - sx, sh = Math.min(h, ((y1 + m) / 1000) * h) - sy;
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const scale = Math.min(2, 1600 / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const out = canvas.toDataURL("image/jpeg", 0.9);
  return { dataUrl: out, base64: out.split(",")[1], w: canvas.width, h: canvas.height };
}

export function AddPage({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  const [step, setStep] = useState<Step>("pick");
  const [photo, setPhoto] = useState<{ dataUrl: string; w: number; h: number } | null>(null);
  const [saved, setSaved] = useState<SavedFigure | null>(null);
  const [stage, setStage] = useState(0);
  const [reveal, setReveal] = useState(0);
  const [error, setError] = useState<Record<Lang, string> | null>(null);
  const [over, setOver] = useState(false);
  const [draft, setDraft] = useState<SavedFigure | null>(null);
  const [round, setRound] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const sheet = useMemo(() => (saved ? buildSheet(saved) : null), [saved]);
  const draftSheet = useMemo(() => (draft ? buildSheet(draft) : null), [draft]);

  // Once Gemini has answered, the sheet feeds out of the "embosser" while each stage ticks off.
  useEffect(() => {
    if (step !== "drawing") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const total = reduce ? 1 : 2600;
    const t0 = performance.now();
    let raf = 0;
    const frame = (t: number) => {
      const k = Math.min(1, (t - t0) / total);
      setReveal(k);
      setStage(3 + Math.min(2, Math.floor(k * 3)));
      if (k < 1) raf = requestAnimationFrame(frame);
      else {
        setStage(5);
        setStep("done");
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [step]);

  const start = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError(ERRORS.photo);
      setStep("error");
      return;
    }
    setError(null);
    setStage(0);
    setReveal(0);
    const p = await prepare(file);
    setPhoto(p);
    setStep("reading");
    try {
      // First a quick look for where the figure is, then the full reading on a close-up of it.
      const where = await locateFigure(p.base64, "image/jpeg").catch(() => null);
      if (where && !where.found) {
        setError(ERRORS.none);
        setStep("error");
        return;
      }
      const close = where ? await crop(p.dataUrl, p.w, p.h, where.box) : null;
      const shot = close || p;
      setStage(1);
      const figure = await readPage(shot.base64, "image/jpeg");
      if (!figure.found || !figure.parts.length) {
        setError(ERRORS.none);
        setStep("error");
        return;
      }
      const base: SavedFigure = { id: crypto.randomUUID().slice(0, 8), createdAt: Date.now(), image: shot.dataUrl, imageW: shot.w, imageH: shot.h, figure };
      setStage(2);
      setDraft(base);
      setStep("checking");
      const checked = await selfCheck(base, shot.base64);
      const stored = await saveFigure(checked);
      setDraft(null);
      setSaved(stored);
      setStep("drawing");
    } catch (e) {
      setError(e instanceof ApiError ? { en: e.message, id: e.message } : ERRORS.other);
      setStep("error");
    }
  };

  /** Gemini compares its drawing with the page and corrects the reading, up to two rounds. */
  const selfCheck = async (base: SavedFigure, page: string): Promise<SavedFigure> => {
    let figure: Figure = base.figure;
    const findings: Finding[] = [];
    let matches = false;
    let rounds = 0;
    for (let r = 1; r <= ROUNDS; r++) {
      setRound(r);
      try {
        const current = { ...base, figure };
        const sheet = buildSheet(current);
        const drawing = await drawingPng(current, sheet);
        const out = await verifyDrawing(page, "image/jpeg", drawing, figure, sheet.checks.map((c) => ({ name: c.name, pass: c.pass, value: c.value })));
        rounds = r;
        findings.push(...out.findings);
        figure = out.figure;
        setDraft({ ...base, figure });
        matches = out.matches;
        if (out.matches || !out.changed) break;
      } catch {
        break; // the check is a safeguard; without it the teacher still compares by eye before approving
      }
    }
    return { ...base, figure, review: { rounds, findings, matches } };
  };

  const approve = async () => {
    if (!saved) return;
    setSaved(await saveFigure({ ...saved, approved: true }));
  };

  const onFiles = (files: FileList | null) => files?.[0] && start(files[0]);

  return (
    <div className="feed">
      <TopBar title={lang === "id" ? "Tambah halaman" : "Add a page"} lang={lang} setLang={setLang} />
      <div className="perf" aria-hidden="true" />
      <main className="add">
        {step === "pick" || (step === "error" && !photo) ? (
          <label
            className={`drop ${over ? "over" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); onFiles(e.dataTransfer.files); }}
          >
            <div>
              <h2>{lang === "id" ? "Tambah halaman buku pelajaran" : "Add a textbook page"}</h2>
              <p>{lang === "id" ? "Foto atau pindaian satu halaman yang berisi diagram. Timbul menemukan gambarnya dan menggambarnya untuk diraba." : "A photo or scan of one page with a diagram on it. Timbul finds the figure and draws it for touch."}</p>
              <div className="btns">
                <button className="btn" type="button" onClick={(e) => { e.preventDefault(); fileRef.current?.click(); }}>{lang === "id" ? "Pilih foto" : "Choose a photo"}</button>
                <button className="btn ghost" type="button" onClick={(e) => { e.preventDefault(); cameraRef.current?.click(); }}>{lang === "id" ? "Ambil foto" : "Take a photo"}</button>
              </div>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onFiles(e.target.files)} />
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFiles(e.target.files)} />
            </div>
          </label>
        ) : (
          <>
            <div className="page-photo">{photo && <img src={photo.dataUrl} alt={lang === "id" ? "Halaman buku pelajaran yang diunggah" : "The uploaded textbook page"} />}</div>
            <div className="mid">
            <ol className="stages" aria-live="polite">
              {STAGES[lang].map((label, i) => {
                const done = step === "done" || i < stage;
                const active = !done && i === stage && step !== "error";
                return (
                  <li key={i} className={done ? "done" : active ? "active" : "todo"}>
                    <DotMark ok={done ? true : step === "error" && i === stage ? false : null} active={active} size={30} />
                    {label}
                  </li>
                );
              })}
            </ol>
            {saved?.review && step === "done" && <ReviewNote review={saved.review} approved={Boolean(saved.approved)} lang={lang} />}
            </div>
            <div className="emerge" aria-label={lang === "id" ? "Gambar taktil" : "Tactile figure"}>
              {saved && sheet ? (
                <FigureView saved={saved} sheet={sheet} reveal={reveal} lang={lang} />
              ) : draft && draftSheet ? (
                <div className="draft">
                  <FigureView saved={draft} sheet={draftSheet} lang={lang} showOriginal />
                  <p className="draft-note" aria-live="polite">{lang === "id" ? `Gemini sedang membandingkan gambarnya dengan halaman${round > 1 ? ", sekali lagi" : ""}…` : `Gemini is comparing its drawing with the page${round > 1 ? ", again" : ""}…`}</p>
                </div>
              ) : (
                <p className="waiting">
                  {step === "error" ? (lang === "id" ? "Dihentikan." : "Stopped.") : (lang === "id" ? "Gemini sedang membaca halaman…" : "Gemini is reading the page…")}
                </p>
              )}
            </div>
            {error && <p className="add-error" role="alert">{error[lang]}</p>}
            <div className="add-foot">
              {sheet && step === "done" ? <Checks checks={sheet.checks} lang={lang} /> : <span />}
              <div className="actions">
                {(step === "error" || (step === "done" && saved?.approved)) && (
                  <button className="btn ghost" type="button" onClick={() => { setStep("pick"); setPhoto(null); setSaved(null); }}>{lang === "id" ? "Tambah halaman lain" : "Add another page"}</button>
                )}
                {step === "done" && saved && !saved.approved && (
                  <button className="btn" type="button" onClick={approve}>{lang === "id" ? "Setujui untuk dicetak" : "Approve for printing"}</button>
                )}
                {step === "done" && saved?.approved && <a className="btn" href={`#/figure/${saved.id}`}>{lang === "id" ? `Jelajahi lembar ${saved.number}` : `Explore sheet ${saved.number}`}</a>}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

/** What Gemini's self-check found and fixed, for the teacher to read before approving. */
function ReviewNote({ review, approved, lang }: { review: NonNullable<SavedFigure["review"]>; approved: boolean; lang: Lang }) {
  if (!review.rounds) {
    return lang === "id"
      ? <div className="review"><b>Pemeriksaan mandiri tidak tersedia.</b> Bandingkan lembar dengan aslinya sebelum menyetujui.</div>
      : <div className="review"><b>Self-check unavailable.</b> Compare the sheet with the original before approving.</div>;
  }
  return (
    <div className="review" aria-live="polite">
      <b>{lang === "id" ? `Gemini memeriksa gambarnya terhadap halaman${review.rounds > 1 ? `, ${review.rounds} kali` : ""}.` : `Gemini checked its drawing against the page${review.rounds > 1 ? `, ${review.rounds} times` : ""}.`}</b>
      {review.findings.length ? (
        <ul>{review.findings.map((f, i) => <li key={i}>{f.note_en}</li>)}</ul>
      ) : (
        <p>{lang === "id" ? "Gambarnya sesuai dengan halaman. Tidak ada yang perlu diperbaiki." : "It matches the page. Nothing needed fixing."}</p>
      )}
      <p className="review-tail">{approved ? (lang === "id" ? "Disetujui untuk dicetak." : "Approved for printing.") : (lang === "id" ? "Periksa di samping aslinya, lalu setujui." : "Look it over beside the original, then approve it.")}</p>
    </div>
  );
}
