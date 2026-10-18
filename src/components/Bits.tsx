import type { Lang } from "../lib/types";
import type { Check } from "../lib/tactile";

/** A circle of dots with a tick or an exclamation inside, drawn in dots like everything else. */
export function DotMark({ ok, size = 34, active = false }: { ok: boolean | null; size?: number; active?: boolean }) {
  const ring = Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2;
    return [17 + 14 * Math.cos(a), 17 + 14 * Math.sin(a)];
  });
  return (
    <svg viewBox="0 0 34 34" width={size} height={size} aria-hidden="true">
      {ring.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={1.9} fill="currentColor" />)}
      {ok === true && [[10, 17.5], [13, 20.5], [16, 23.5], [19.5, 19.5], [22.5, 15.5], [25.5, 11.5]].map(([x, y], i) => <circle key={"t" + i} cx={x} cy={y} r={2.1} fill="currentColor" />)}
      {ok === false && [[17, 9], [17, 13], [17, 17], [17, 25]].map(([x, y], i) => <circle key={"e" + i} cx={x} cy={y} r={2.1} fill="currentColor" />)}
      {ok === null && <circle className={active ? "pulse" : ""} cx={17} cy={17} r={6} fill="currentColor" />}
    </svg>
  );
}

export function TopBar({ title, fig, lang, setLang }: { title?: string; fig?: string; lang: Lang; setLang: (l: Lang) => void }) {
  return (
    <header className="topbar">
      <a className="wordmark" href="#/">Timbul</a>
      <h1>{fig && <span className="fig">{fig}</span>}{title}</h1>
      <div className="lang" role="group" aria-label="Spoken language">
        <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")} title="English">EN</button>
        <span aria-hidden="true">/</span>
        <button type="button" aria-pressed={lang === "id"} onClick={() => setLang("id")} title="Bahasa Indonesia">ID</button>
      </div>
    </header>
  );
}

const CHECK_ID: Record<string, string> = { spacing: "Jarak garis", labels: "Ukuran label", clutter: "Kepadatan", braille: "Braille" };
const VALUE_ID: [RegExp, string][] = [
  [/closest lines ([\d.]+) mm apart/, "garis terdekat berjarak $1 mm"],
  [/some lines touch or cross/, "ada garis yang bersentuhan"],
  [/some touch a line/, "ada yang menyentuh garis"],
  [/(\d+) labels?/, "$1 label"],
  [/(\d+) in the key/, "$1 di kunci"],
  [/([\d.]+) mm clear/, "bebas $1 mm"],
  [/(\d+) parts?/, "$1 bagian"],
  [/(\d+)% raised/, "$1% timbul"],
  [/(\d+) cells/, "$1 sel"],
  [/no lines/, "tanpa garis"],
];

/** The four tactile checks, in the language the student or teacher has chosen. */
export function Checks({ checks, lang = "en" }: { checks: Check[]; lang?: Lang }) {
  const value = (v: string) => (lang === "id" ? VALUE_ID.reduce((s, [re, to]) => s.replace(re, to), v) : v);
  return (
    <ul className="checks" aria-label={lang === "id" ? "Pemeriksaan taktil" : "Tactile checks"}>
      {checks.map((c) => (
        <li className="check" key={c.id} title={c.rule}>
          <DotMark ok={c.pass} />
          <span>
            <b>{lang === "id" ? CHECK_ID[c.id] : c.name}</b>
            <small>{c.pass ? value(c.value) : `${lang === "id" ? "Periksa" : "Check"}: ${value(c.value)}`}</small>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function MicIcon() {
  const dots = [[20, 6], [20, 11], [20, 16], [20, 21], [14, 9], [14, 14], [14, 19], [26, 9], [26, 14], [26, 19], [9, 19], [31, 19], [11, 25], [29, 25], [15, 29], [25, 29], [20, 30], [20, 35]];
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">{dots.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={2.3} fill="currentColor" />)}</svg>
  );
}

/** A trash can, the usual sign for delete. */
export function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10.5 11v5.5M13.5 11v5.5" />
    </svg>
  );
}

/** Speaker marks for the conversation: a braille-like cell for the student, a full cell for Timbul. */
export function Who({ who }: { who: "student" | "timbul" }) {
  const cells = who === "student" ? [[8, 6], [8, 14], [16, 22]] : [[8, 6], [16, 6], [8, 14], [16, 14], [8, 22], [16, 22]];
  return (
    <svg className="who" viewBox="0 0 24 28" aria-hidden="true">{cells.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={3} fill="currentColor" />)}</svg>
  );
}

export function Wave({ live, level = 0 }: { live: boolean; level?: number }) {
  const heights = [2, 3, 5, 4, 7, 9, 6, 8, 10, 7, 5, 8, 6, 9, 4, 6, 3, 5, 2];
  return (
    <div className={`wave ${live ? "live" : ""}`} aria-hidden="true">
      {heights.map((h, i) => {
        const n = live ? Math.max(1, Math.round(h * (0.5 + level))) : Math.max(1, Math.round(h / 3));
        return (
          <span key={i} style={{ animationDelay: `${(i % 5) * 0.09}s` }}>
            {Array.from({ length: Math.min(n, 10) }, (_, j) => <i key={j} />)}
          </span>
        );
      })}
    </div>
  );
}
