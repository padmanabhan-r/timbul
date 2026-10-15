import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Lang, SavedFigure } from "../lib/types";
import { buildSheet, sheetSvg, type Sheet } from "../lib/tactile";
import { ask, ApiError } from "../lib/api";
import { saveFigure } from "../lib/store";
import { speak, stopSpeaking, startRecording, type Recording } from "../lib/speech";
import { FigureView } from "../components/FigureView";
import { Checks, MicIcon, TopBar, Wave, Who } from "../components/Bits";

interface Slip {
  who: "student" | "timbul";
  text: string;
  heard?: string;
  thinking?: boolean;
}

type Mode = "idle" | "listening" | "thinking" | "speaking";

export function Explore({ saved, lang, setLang }: { saved: SavedFigure; lang: Lang; setLang: (l: Lang) => void }) {
  const sheet = useMemo(() => buildSheet(saved), [saved]);
  const fig = saved.figure;
  const [focusId, setFocusId] = useState<string | null>(null);
  const [slips, setSlips] = useState<Slip[]>([]);
  const [mode, setMode] = useState<Mode>("idle");
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [showOriginal, setShowOriginal] = useState(false);
  // A sheet the teacher made is printed only once they have approved it beside the original.
  const [approved, setApproved] = useState(Boolean(saved.sample || saved.approved));
  const [level, setLevel] = useState(0);
  const [announce, setAnnounce] = useState("");
  const rec = useRef<Recording | null>(null);
  const slipsEnd = useRef<HTMLDivElement>(null);
  const figureRef = useRef<HTMLDivElement>(null);

  const name = (id: string) => {
    const p = fig.parts.find((p) => p.id === id);
    return p ? (lang === "id" ? p.name_id : p.name_en) : id;
  };

  const say = useCallback(
    (text: string) => {
      setAnnounce(text);
      setMode("speaking");
      speak(text, lang, () => setMode((m) => (m === "speaking" ? "idle" : m)));
    },
    [lang],
  );

  useEffect(() => {
    slipsEnd.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [slips]);
  useEffect(() => () => {
    stopSpeaking();
    rec.current?.cancel();
  }, []);
  useEffect(() => { figureRef.current?.focus(); }, [saved.id]);
  // Opened by saying the sheet number: say which sheet this is, so the student knows they have the right one.
  useEffect(() => {
    let flag: string | null = null;
    try { flag = sessionStorage.getItem("timbul:announce"); } catch { /* private mode */ }
    if (flag !== saved.id) return;
    // Deferred, so a remount (React runs effects twice in development) does not cancel it.
    const t = setTimeout(() => {
      try { sessionStorage.removeItem("timbul:announce"); } catch { /* private mode */ }
      const title = lang === "id" ? fig.title_id : fig.title_en;
      say(lang === "id" ? `Lembar ${saved.number}. ${title}. Sentuh bagian mana pun, atau ajukan pertanyaan.` : `Sheet ${saved.number}. ${title}. Touch any part, or ask a question.`);
    }, 250);
    return () => clearTimeout(t);
  }, [saved.id]);

  const overview = () => {
    setFocusId(null);
    say(lang === "id" ? fig.overview_id : fig.overview_en);
  };

  const describe = (id: string) => {
    const p = fig.parts.find((p) => p.id === id);
    if (!p) return;
    setFocusId(id);
    say(`${lang === "id" ? p.name_id : p.name_en}. ${lang === "id" ? p.detail_id : p.detail_en}`);
  };

  /** Where a part sits on the sheet, in words: "upper left", "kiri atas". */
  const whereOn = (box: number[]) => {
    const cx = ((box[0] + box[2]) / 2 - sheet.draw.x) / sheet.draw.w, cy = ((box[1] + box[3]) / 2 - sheet.draw.y) / sheet.draw.h;
    const v = cy < 0.36 ? 0 : cy > 0.64 ? 2 : 1, h = cx < 0.36 ? 0 : cx > 0.64 ? 2 : 1;
    if (lang === "id") return [["kiri atas", "atas tengah", "kanan atas"], ["kiri", "tengah", "kanan"], ["kiri bawah", "bawah tengah", "kanan bawah"]][v][h];
    return [["upper left", "top middle", "upper right"], ["left", "middle", "right"], ["lower left", "bottom middle", "lower right"]][v][h];
  };

  /** Arrow keys move to the nearest part in that direction, like moving a finger across the sheet. */
  const move = (dx: number, dy: number) => {
    const centre = (b: number[]) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
    const parts = sheet.parts;
    if (!parts.length) return;
    const from = parts.find((p) => p.part.id === focusId);
    if (!from) {
      const start = [...parts].sort((a, b) => centre(a.box)[0] - centre(b.box)[0] || centre(a.box)[1] - centre(b.box)[1]);
      return describe((dx < 0 ? start[start.length - 1] : start[0]).part.id);
    }
    const [fx, fy] = centre(from.box);
    let best: { id: string; score: number } | null = null;
    for (const p of parts) {
      if (p === from) continue;
      const [x, y] = centre(p.box);
      const vx = x - fx, vy = y - fy;
      const dist = Math.hypot(vx, vy);
      if (dist < 0.5) continue;
      const cos = (vx * dx + vy * dy) / dist;
      if (cos < 0.35) continue;
      const score = dist * (2 - cos);
      if (!best || score < best.score) best = { id: p.part.id, score };
    }
    if (best) describe(best.id);
    else say(lang === "id" ? "Tidak ada bagian lain ke arah itu." : "Nothing further that way.");
  };

  const send = async (input: { question?: string; audio?: string; audioMime?: string }) => {
    setError(null);
    stopSpeaking();
    setMode("thinking");
    setSlips((s) => [...s, { who: "student", text: input.question || (lang === "id" ? "(pertanyaan suara)" : "(spoken question)") }, { who: "timbul", text: lang === "id" ? "Sebentar…" : "Thinking…", thinking: true }]);
    try {
      const a = await ask(fig, lang, input, focusId || undefined);
      setSlips((s) => {
        const out = s.slice(0, -1);
        if (input.audio && a.heard) out[out.length - 1] = { who: "student", text: a.heard };
        return [...out, { who: "timbul", text: a.answer }];
      });
      const onSheet = (id: string) => sheet.parts.some((p) => p.part.id === id);
      const target = a.focus.find((id) => id !== focusId && onSheet(id)) ?? a.focus.find(onSheet);
      if (target) setFocusId(target);
      say(a.answer);
    } catch (e) {
      setSlips((s) => s.slice(0, -1));
      setMode("idle");
      setError(e instanceof ApiError ? e.message : "Something went wrong. Try again.");
    }
  };

  const toggleMic = async () => {
    if (mode === "listening" && rec.current) {
      const r = rec.current;
      rec.current = null;
      const { base64, mime, seconds } = await r.stop();
      if (seconds < 0.6) {
        setMode("idle");
        setError("That was too short. Hold the button, or press M, and ask your question.");
        return;
      }
      return send({ audio: base64, audioMime: mime });
    }
    try {
      stopSpeaking();
      setError(null);
      rec.current = await startRecording();
      setMode("listening");
      const tick = () => {
        if (!rec.current) return setLevel(0);
        setLevel(rec.current.level());
        requestAnimationFrame(tick);
      };
      tick();
    } catch {
      setError("The microphone is blocked. Allow it in the browser's address bar, or type your question below.");
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    const k = e.key.toLowerCase();
    const dir: Record<string, [number, number]> = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] };
    if (dir[k]) { e.preventDefault(); move(...dir[k]); }
    else if (k === "enter" && focusId) { e.preventDefault(); describe(focusId); }
    else if (k === "o") overview();
    else if (k === "m") toggleMic();
    else if (k === "escape") { stopSpeaking(); setMode("idle"); }
  };

  const download = () => {
    const blob = new Blob([sheetSvg(sheet, { ink: true })], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `timbul-${(fig.title_en || "figure").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-A4.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const status = mode === "listening" ? (lang === "id" ? "Mendengarkan" : "Listening") : mode === "thinking" ? (lang === "id" ? "Berpikir" : "Thinking") : mode === "speaking" ? (lang === "id" ? "Berbicara" : "Speaking") : (lang === "id" ? "Tanya saya" : "Ask me");

  return (
    <div className={`feed ${mode === "speaking" ? "speaking" : ""}`} onKeyDown={onKey}>
      <TopBar fig={figLabel(saved, lang)} title={lang === "id" ? fig.title_id : fig.title_en} lang={lang} setLang={setLang} />
      <div className="perf" aria-hidden="true" />
      <main className="explore">
        <section className="stage" aria-label="Figure">
          <div
            className="figure-wrap"
            ref={figureRef}
            tabIndex={0}
            role="application"
            aria-roledescription="tactile figure"
            aria-label={`${lang === "id" ? fig.title_id : fig.title_en}. Use the arrow keys to move between parts, Enter to hear a part again, O for the overview, M to ask a question.`}
          >
            <FigureView saved={saved} sheet={sheet} focusId={focusId} onPick={describe} showOriginal={showOriginal} lang={lang} />
          </div>
          {/* Every part as a button, so a screen reader on a phone can swipe through the figure and tap to hear it */}
          <ul className="parts-list" aria-label={lang === "id" ? "Bagian-bagian gambar" : "Parts of the figure"}>
            {sheet.parts.map((sp) => (
              <li key={sp.part.id}>
                <button type="button" aria-pressed={focusId === sp.part.id} onClick={() => describe(sp.part.id)}>
                  {lang === "id" ? sp.part.name_id : sp.part.name_en}
                  <span>, {whereOn(sp.box)}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="hint" aria-hidden="true">
            <span><kbd>← ↑ → ↓</kbd>{lang === "id" ? "pindah antarbagian" : "move between parts"}</span>
            <span><kbd>O</kbd>{lang === "id" ? "gambaran umum" : "overview"}</span>
            <span><kbd>M</kbd>{lang === "id" ? "tanya dengan suara" : "ask by voice"}</span>
            <span><kbd>Esc</kbd>{lang === "id" ? "berhenti bicara" : "stop speaking"}</span>
          </p>
        </section>

        <aside className="panel" aria-label="Conversation">
          <div className="slips" aria-live="polite">
            {slips.length === 0 && (
              <div className="slip">
                <Who who="timbul" />
                <p>
                  {lang === "id" ? "Ketuk bagian mana pun, gunakan tombol panah, atau tanyakan apa saja tentang gambar ini." : "Touch any part, use the arrow keys, or ask me anything about this figure."}
                  <button className="linklike" type="button" onClick={overview} style={{ display: "block", marginTop: 8, color: "inherit" }}>
                    {lang === "id" ? "Dengarkan gambaran umum" : "Hear the overview"}
                  </button>
                </p>
              </div>
            )}
            {slips.map((s, i) => (
              <div key={i} className={`slip ${s.thinking ? "thinking" : ""}`}>
                <Who who={s.who} />
                <p>
                  <span className="sr-only">{s.who === "student" ? "You: " : "Timbul: "}</span>
                  {s.text}
                </p>
              </div>
            ))}
            <div ref={slipsEnd} />
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="voice">
            <Wave live={mode === "listening" || mode === "speaking"} level={mode === "listening" ? level : 0.5} />
            <div className="voice-state" aria-live="polite">{status}</div>
            <button type="button" className="mic" aria-pressed={mode === "listening"} onClick={toggleMic} disabled={mode === "thinking"} aria-label={mode === "listening" ? "Stop and send question" : "Ask by voice"}>
              <MicIcon />
            </button>
            <form className="ask-form" onSubmit={(e) => { e.preventDefault(); if (question.trim()) { send({ question: question.trim() }); setQuestion(""); } }}>
              <label className="sr-only" htmlFor="ask-input">Type a question</label>
              <input id="ask-input" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={lang === "id" ? "Atau ketik pertanyaan…" : "Or type a question…"} autoComplete="off" />
              <button className="btn on-ink-btn" type="submit" disabled={!question.trim() || mode === "thinking"}>{lang === "id" ? "Tanya" : "Ask"}</button>
            </form>
          </div>
        </aside>

        <footer className="strip">
          <Checks checks={sheet.checks} lang={lang} />
          <div className="actions">
            <button className="btn ghost" type="button" aria-pressed={showOriginal} onClick={() => setShowOriginal((v) => !v)}>
              {showOriginal ? (lang === "id" ? "Sembunyikan asli" : "Hide original") : (lang === "id" ? "Tampilkan asli" : "Show original")}
            </button>
            {approved ? (
              <button className="btn" type="button" onClick={download}>{lang === "id" ? "Cetak lembar timbul" : "Print tactile sheet"}</button>
            ) : (
              <button className="btn" type="button" onClick={async () => { await saveFigure({ ...saved, approved: true }); setApproved(true); }}>{lang === "id" ? "Setujui untuk dicetak" : "Approve for printing"}</button>
            )}
          </div>
        </footer>
      </main>
      <div className="sr-only" aria-live="assertive">{announce}</div>
      {sheet.notes.length > 0 && <p className="sr-only">{sheet.notes.join(" ")}</p>}
    </div>
  );
}

export function figLabel(saved: SavedFigure, lang: Lang = "en") {
  if (lang === "id") return saved.sample ? "Contoh" : "Gbr.";
  return saved.sample ? "Sample" : "Fig.";
}

export type { Sheet };
