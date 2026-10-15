import { useEffect, useMemo, useRef, useState } from "react";
import type { Lang, SavedFigure } from "../lib/types";
import { listFigures, currentClass, setClass } from "../lib/store";
import { SAMPLES } from "../samples";
import { buildSheet } from "../lib/tactile";
import { FigureView } from "../components/FigureView";
import { MicIcon, TopBar } from "../components/Bits";
import { hearSheet, ApiError } from "../lib/api";
import { speak, startRecording, type Recording } from "../lib/speech";

function Card({ saved, lang }: { saved: SavedFigure; lang: Lang }) {
  const sheet = useMemo(() => buildSheet(saved), [saved]);
  const passed = sheet.checks.filter((c) => c.pass).length;
  return (
    <li>
      <a className="sheet-card" href={`#/figure/${saved.id}`}>
        <span className="thumb"><FigureView saved={saved} sheet={sheet} ink={false} lang={lang} /></span>
        <span className="end">
          <b>
            {lang === "id" ? saved.figure.title_id : saved.figure.title_en}
            {saved.sample && <span className="tag">Sample</span>}
          </b>
          <span>Sheet {saved.number} · {saved.figure.subject} · {sheet.parts.length} parts · {passed} of 4 checks passed</span>
        </span>
      </a>
    </li>
  );
}

export function Library({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  const [figures, setFigures] = useState<SavedFigure[]>(SAMPLES);
  useEffect(() => { listFigures().then(setFigures); }, []);
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState("");
  const [typed, setTyped] = useState("");
  const rec = useRef<Recording | null>(null);
  const [cls, setCls] = useState(currentClass());
  const [clsDraft, setClsDraft] = useState(cls);
  const changeClass = (code: string) => {
    const next = setClass(code);
    setCls(next);
    setClsDraft(next);
    listFigures().then(setFigures);
  };

  const open = (n: number, heard?: string) => {
    const f = figures.find((x) => x.number === n);
    if (!f) {
      const msg = heard ? `I heard "${heard}", but there is no sheet ${n || "with that number"}.` : `There is no sheet ${n}.`;
      setStatus(msg);
      speak(msg, lang);
      return;
    }
    try { sessionStorage.setItem("timbul:announce", f.id); } catch { /* private mode */ }
    location.hash = `#/figure/${f.id}`;
  };

  const voice = async () => {
    if (listening && rec.current) {
      const r = rec.current;
      rec.current = null;
      setListening(false);
      setStatus("Opening…");
      const { base64, mime } = await r.stop();
      try {
        const a = await hearSheet({ audio: base64, audioMime: mime });
        open(a.number, a.heard);
      } catch (e) {
        setStatus(e instanceof ApiError ? e.message : "Something went wrong. Try again.");
      }
      return;
    }
    try {
      rec.current = await startRecording();
      setListening(true);
      setStatus("Listening. Say the sheet number, then press again.");
    } catch {
      setStatus("The microphone is blocked. Type the sheet number instead.");
    }
  };

  return (
    <div className="feed">
      <TopBar title="" lang={lang} setLang={setLang} />
      <div className="perf" aria-hidden="true" />
      <main className="library">
        <div className="lib-head">
          <div>
            <h2>Every figure, for every student.</h2>
            <p>Photograph a textbook page. Timbul draws its figure in raised dots with braille labels, ready to print, and lets a blind student explore it by voice.</p>
          </div>
          <a className="btn" href="#/add">Add a page</a>
        </div>
        <section className="open-sheet" aria-label="Open a sheet">
          <button type="button" className={`open-voice ${listening ? "on" : ""}`} aria-pressed={listening} onClick={voice}>
            <MicIcon />
            <span><b>{listening ? "Listening…" : "Open a sheet by voice"}</b><small>Say the number on the sheet, like “sheet two”</small></span>
          </button>
          <form className="open-typed" onSubmit={(e) => { e.preventDefault(); const n = parseInt(typed, 10); if (n) open(n); }}>
            <label htmlFor="sheet-no">Or type the sheet number</label>
            <input id="sheet-no" inputMode="numeric" value={typed} onChange={(e) => setTyped(e.target.value.replace(/\D/g, ""))} />
            <button className="btn" type="submit" disabled={!typed}>Open</button>
          </form>
          <p className="open-status" aria-live="assertive">{status}</p>
          <form className="class-code" onSubmit={(e) => { e.preventDefault(); changeClass(clsDraft); }}>
            <label htmlFor="class-code">Class library</label>
            <input id="class-code" value={clsDraft} onChange={(e) => setClsDraft(e.target.value)} autoCapitalize="none" spellCheck={false} />
            {clsDraft !== cls && <button className="btn ghost" type="submit">Switch</button>}
            <small>Everyone with this code shares the same numbered sheets.</small>
          </form>
        </section>
        <ul className="sheets" aria-label="Figures">
          {figures.map((f) => <Card key={f.id} saved={f} lang={lang} />)}
        </ul>
        <section className="about" aria-label="How Timbul works">
          <div>
            <h3>How it works</h3>
            <p>Gemini reads the page and returns the figure as data: its parts, where they sit and what joins them, in English and Bahasa Indonesia. Timbul's own code then draws every line as raised dots, so the drawing is exact and repeatable.</p>
          </div>
          <div>
            <h3>What is checked</h3>
            <p>Every sheet is checked against common tactile-graphics rules: lines at least 3 mm apart, standard braille cells clear of the lines, no more than 12 parts, and every label written in braille. Outlines too close to feel apart are merged.</p>
          </div>
          <div>
            <h3>What has not been tested</h3>
            <p>No blind student or teacher of the blind has used Timbul yet, and no sheet has been printed on swell paper. The checks follow published rules; they are not a reader's approval.</p>
          </div>
        </section>
        <p className="hint" style={{ marginTop: 20 }}>Sample figure: “Basic series circuit”, Wikimedia Commons, CC BY 4.0</p>
      </main>
    </div>
  );
}
