import { useEffect, useMemo, useRef, useState } from "react";
import type { Lang, SavedFigure } from "../lib/types";
import { listFigures, currentClass, setClass, deleteFigure } from "../lib/store";
import { SAMPLES } from "../samples";
import { buildSheet } from "../lib/tactile";
import { FigureView } from "../components/FigureView";
import { MicIcon, TopBar, TrashIcon } from "../components/Bits";
import { hearSheet, ApiError } from "../lib/api";
import { speak, startRecording, type Recording } from "../lib/speech";

function Card({ saved, lang, onDelete }: { saved: SavedFigure; lang: Lang; onDelete?: () => void }) {
  const sheet = useMemo(() => buildSheet(saved), [saved]);
  const passed = sheet.checks.filter((c) => c.pass).length;
  return (
    <li>
      <a className="sheet-card" href={`#/figure/${saved.id}`}>
        <span className="thumb"><FigureView saved={saved} sheet={sheet} ink={false} lang={lang} /></span>
        <span className="end">
          <b>
            {lang === "id" ? saved.figure.title_id : saved.figure.title_en}
            {saved.sample && <span className="tag">{lang === "id" ? "Contoh" : "Sample"}</span>}
          </b>
          <span>
            {lang === "id"
              ? `Lembar ${saved.number} · ${saved.figure.subject} · ${sheet.parts.length} bagian · ${passed} dari 4 pemeriksaan lolos`
              : `Sheet ${saved.number} · ${saved.figure.subject} · ${sheet.parts.length} parts · ${passed} of 4 checks passed`}
          </span>
        </span>
      </a>
      {/* beside the link, not inside it, so the card still opens the sheet and the button only deletes */}
      {onDelete && (
        <span className="card-delete-slot">
          <button type="button" className="card-delete" onClick={onDelete} aria-label={lang === "id" ? `Hapus lembar ${saved.number}` : `Delete sheet ${saved.number}`} title={lang === "id" ? "Hapus" : "Delete"}>
            <TrashIcon />
          </button>
        </span>
      )}
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
      const msg = lang === "id"
        ? heard ? `Saya mendengar "${heard}", tetapi tidak ada lembar ${n || "dengan nomor itu"}.` : `Tidak ada lembar ${n}.`
        : heard ? `I heard "${heard}", but there is no sheet ${n || "with that number"}.` : `There is no sheet ${n}.`;
      setStatus(msg);
      speak(msg, lang);
      return;
    }
    try { sessionStorage.setItem("timbul:announce", f.id); } catch { /* private mode */ }
    location.hash = `#/figure/${f.id}`;
  };

  /** Removes a sheet the class made from the class library, after the teacher confirms. Samples stay. */
  const remove = async (f: SavedFigure) => {
    const title = lang === "id" ? f.figure.title_id : f.figure.title_en;
    if (!confirm(lang === "id" ? `Hapus lembar ${f.number}, "${title}"? Lembar ini hilang untuk semua orang di kelas ini.` : `Delete sheet ${f.number}, "${title}"? It is removed for everyone in this class.`)) return;
    try {
      await deleteFigure(f.id);
      setFigures((all) => all.filter((x) => x.id !== f.id));
      setStatus(lang === "id" ? `Lembar ${f.number} dihapus.` : `Sheet ${f.number} deleted.`);
    } catch {
      setStatus(lang === "id" ? `Lembar ${f.number} tidak dapat dihapus. Coba lagi.` : `Could not delete sheet ${f.number}. Try again.`);
    }
  };

  const voice = async () => {
    if (listening && rec.current) {
      const r = rec.current;
      rec.current = null;
      setListening(false);
      setStatus(lang === "id" ? "Membuka…" : "Opening…");
      const { base64, mime } = await r.stop();
      try {
        const a = await hearSheet({ audio: base64, audioMime: mime });
        open(a.number, a.heard);
      } catch (e) {
        setStatus(e instanceof ApiError ? e.message : lang === "id" ? "Terjadi kesalahan. Coba lagi." : "Something went wrong. Try again.");
      }
      return;
    }
    try {
      rec.current = await startRecording();
      setListening(true);
      setStatus(lang === "id" ? "Mendengarkan. Sebutkan nomor lembar, lalu tekan lagi." : "Listening. Say the sheet number, then press again.");
    } catch {
      setStatus(lang === "id" ? "Mikrofon diblokir. Ketik nomor lembar saja." : "The microphone is blocked. Type the sheet number instead.");
    }
  };

  return (
    <div className="feed">
      <TopBar title="" lang={lang} setLang={setLang} />
      <div className="perf" aria-hidden="true" />
      <main className="library">
        <div className="lib-head">
          <div>
            <h2>{lang === "id" ? "Setiap gambar, untuk setiap siswa." : "Every figure, for every student."}</h2>
            <p>
              {lang === "id"
                ? "Potret satu halaman buku pelajaran. Timbul menggambar gambarnya dengan titik timbul dan label braille, siap dicetak, dan membiarkan siswa tunanetra menjelajahinya dengan suara."
                : "Photograph a textbook page. Timbul draws its figure in raised dots with braille labels, ready to print, and lets a blind student explore it by voice."}
            </p>
          </div>
          <a className="btn" href="#/add">{lang === "id" ? "Tambah halaman" : "Add a page"}</a>
        </div>
        <section className="open-sheet" aria-label={lang === "id" ? "Buka lembar" : "Open a sheet"}>
          <button type="button" className={`open-voice ${listening ? "on" : ""}`} aria-pressed={listening} onClick={voice}>
            <MicIcon />
            <span>
              <b>{listening ? (lang === "id" ? "Mendengarkan…" : "Listening…") : (lang === "id" ? "Buka lembar dengan suara" : "Open a sheet by voice")}</b>
              <small>{lang === "id" ? "Sebutkan nomor pada lembar, misalnya “lembar dua”" : "Say the number on the sheet, like “sheet two”"}</small>
            </span>
          </button>
          <form className="open-typed" onSubmit={(e) => { e.preventDefault(); const n = parseInt(typed, 10); if (n) open(n); }}>
            <label htmlFor="sheet-no">{lang === "id" ? "Atau ketik nomor lembar" : "Or type the sheet number"}</label>
            <input id="sheet-no" inputMode="numeric" value={typed} onChange={(e) => setTyped(e.target.value.replace(/\D/g, ""))} />
            <button className="btn" type="submit" disabled={!typed}>{lang === "id" ? "Buka" : "Open"}</button>
          </form>
          <p className="open-status" aria-live="assertive">{status}</p>
          <form className="class-code" onSubmit={(e) => { e.preventDefault(); changeClass(clsDraft); }}>
            <label htmlFor="class-code">{lang === "id" ? "Perpustakaan kelas" : "Class library"}</label>
            <input id="class-code" value={clsDraft} onChange={(e) => setClsDraft(e.target.value)} autoCapitalize="none" spellCheck={false} />
            {clsDraft !== cls && <button className="btn ghost" type="submit">{lang === "id" ? "Ganti" : "Switch"}</button>}
            <small>{lang === "id" ? "Semua orang dengan kode ini berbagi lembar bernomor yang sama." : "Everyone with this code shares the same numbered sheets."}</small>
          </form>
        </section>
        <ul className="sheets" aria-label={lang === "id" ? "Gambar" : "Figures"}>
          {figures.map((f) => <Card key={f.id} saved={f} lang={lang} onDelete={f.sample ? undefined : () => remove(f)} />)}
        </ul>
        <section className="about" aria-label={lang === "id" ? "Cara kerja Timbul" : "How Timbul works"}>
          <div>
            <h3>{lang === "id" ? "Cara kerjanya" : "How it works"}</h3>
            <p>
              {lang === "id"
                ? "Gemini membaca halaman dan mengembalikan gambarnya sebagai data: bagian-bagiannya, letaknya, dan apa yang menghubungkannya, dalam bahasa Inggris dan Bahasa Indonesia. Kode Timbul sendiri lalu menggambar setiap garis sebagai titik timbul, sehingga gambarnya tepat dan dapat diulang."
                : "Gemini reads the page and returns the figure as data: its parts, where they sit and what joins them, in English and Bahasa Indonesia. Timbul's own code then draws every line as raised dots, so the drawing is exact and repeatable."}
            </p>
          </div>
          <div>
            <h3>{lang === "id" ? "Apa yang diperiksa" : "What is checked"}</h3>
            <p>
              {lang === "id"
                ? "Setiap lembar diperiksa terhadap aturan umum grafik taktil: garis berjarak minimal 3 mm, sel braille standar bebas dari garis, tidak lebih dari 12 bagian, dan setiap label ditulis dalam braille. Garis tepi yang terlalu dekat untuk dibedakan dengan sentuhan digabungkan."
                : "Every sheet is checked against common tactile-graphics rules: lines at least 3 mm apart, standard braille cells clear of the lines, no more than 12 parts, and every label written in braille. Outlines too close to feel apart are merged."}
            </p>
          </div>
          <div>
            <h3>{lang === "id" ? "Apa yang belum diuji" : "What has not been tested"}</h3>
            <p>
              {lang === "id"
                ? "Belum ada siswa tunanetra atau guru siswa tunanetra yang memakai Timbul, dan belum ada lembar yang dicetak di kertas swell. Pemeriksaan ini mengikuti aturan yang diterbitkan; ini bukan persetujuan dari pembaca."
                : "No blind student or teacher of the blind has used Timbul yet, and no sheet has been printed on swell paper. The checks follow published rules; they are not a reader's approval."}
            </p>
          </div>
        </section>
        <p className="hint" style={{ marginTop: 20 }}>{lang === "id" ? "Gambar contoh: halaman rangkaian seri yang digambar oleh tim Timbul." : "Sample figure: a series circuit page drawn by the Timbul team."}</p>
      </main>
    </div>
  );
}
