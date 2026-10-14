import { useEffect, useMemo, useRef, useState } from "react";
import type { Lang, SavedFigure } from "../lib/types";
import { readPage, ApiError } from "../lib/api";
import { saveFigure } from "../lib/store";
import { buildSheet } from "../lib/tactile";
import { FigureView } from "../components/FigureView";
import { DotMark, TopBar, Checks } from "../components/Bits";

type Step = "pick" | "reading" | "drawing" | "done" | "error";

const STAGES = ["Reading the page", "Found the figure", "Simplified for touch", "Braille labels", "Checked", "Ready to explore"];

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

export function AddPage({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  const [step, setStep] = useState<Step>("pick");
  const [photo, setPhoto] = useState<{ dataUrl: string; w: number; h: number } | null>(null);
  const [saved, setSaved] = useState<SavedFigure | null>(null);
  const [stage, setStage] = useState(0);
  const [reveal, setReveal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const sheet = useMemo(() => (saved ? buildSheet(saved) : null), [saved]);

  useEffect(() => {
    if (step !== "reading") return;
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [step]);

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
      setStage(1 + Math.min(4, Math.floor(k * 5)));
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
      setError("Choose a photo or scan of the page (JPEG or PNG).");
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
      const figure = await readPage(p.base64, "image/jpeg");
      if (!figure.found || !figure.parts.length) {
        setError("Timbul could not find a diagram on this page. Try a closer photo of just the figure.");
        setStep("error");
        return;
      }
      const s: SavedFigure = { id: crypto.randomUUID().slice(0, 8), createdAt: Date.now(), image: p.dataUrl, imageW: p.w, imageH: p.h, figure };
      await saveFigure(s);
      setSaved(s);
      setStep("drawing");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Try again.");
      setStep("error");
    }
  };

  const onFiles = (files: FileList | null) => files?.[0] && start(files[0]);

  return (
    <div className="feed">
      <TopBar title="Add a page" lang={lang} setLang={setLang} />
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
              <h2>Add a textbook page</h2>
              <p>A photo or scan of one page with a diagram on it. Timbul finds the figure and draws it for touch.</p>
              <div className="btns">
                <button className="btn" type="button" onClick={(e) => { e.preventDefault(); fileRef.current?.click(); }}>Choose a photo</button>
                <button className="btn ghost" type="button" onClick={(e) => { e.preventDefault(); cameraRef.current?.click(); }}>Take a photo</button>
              </div>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onFiles(e.target.files)} />
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFiles(e.target.files)} />
            </div>
          </label>
        ) : (
          <>
            <div className="page-photo">{photo && <img src={photo.dataUrl} alt="The uploaded textbook page" />}</div>
            <ol className="stages" aria-live="polite">
              {STAGES.map((label, i) => {
                const done = step === "done" || i < stage;
                const active = !done && i === stage && step !== "error";
                return (
                  <li key={label} className={done ? "done" : active ? "active" : "todo"}>
                    <DotMark ok={done ? true : step === "error" && i === stage ? false : null} active={active} size={30} />
                    {label}
                  </li>
                );
              })}
            </ol>
            <div className="emerge" aria-label="Tactile figure">
              {saved && sheet ? (
                <FigureView saved={saved} sheet={sheet} reveal={reveal} lang={lang} />
              ) : (
                <p className="waiting">
                  {step === "error" ? "Stopped." : "Gemini is reading the page…"}
                  {step === "reading" && <small>{elapsed}s</small>}
                </p>
              )}
            </div>
            {error && <p className="add-error" role="alert">{error}</p>}
            <div className="add-foot">
              {sheet && step === "done" ? <Checks checks={sheet.checks} /> : <span />}
              <div className="actions">
                {(step === "error" || step === "done") && (
                  <button className="btn ghost" type="button" onClick={() => { setStep("pick"); setPhoto(null); setSaved(null); }}>Add another page</button>
                )}
                {step === "done" && saved && <a className="btn" href={`#/figure/${saved.id}`}>Explore this figure</a>}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
