import { useEffect, useMemo, useState } from "react";
import type { Lang, SavedFigure } from "../lib/types";
import { listFigures } from "../lib/store";
import { SAMPLES } from "../samples";
import { buildSheet } from "../lib/tactile";
import { FigureView } from "../components/FigureView";
import { TopBar } from "../components/Bits";

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
          <span>{saved.figure.subject} · {sheet.parts.length} parts · {passed} of 4 checks passed</span>
        </span>
      </a>
    </li>
  );
}

export function Library({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  const [figures, setFigures] = useState<SavedFigure[]>(SAMPLES);
  useEffect(() => { listFigures().then(setFigures); }, []);

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
        <p className="hint" style={{ marginTop: 20 }}>Sample figures: {[
          "“Basic series circuit”, Wikimedia Commons, CC BY 4.0",
          "“Plant cell structure” by LadyofHats, public domain",
        ].join(" · ")}</p>
      </main>
    </div>
  );
}
