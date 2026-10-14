import { useEffect, useState } from "react";
import type { Lang, SavedFigure } from "./lib/types";
import { getFigure } from "./lib/store";
import { Library } from "./screens/Library";
import { AddPage } from "./screens/AddPage";
import { Explore } from "./screens/Explore";

function useHash() {
  const [hash, setHash] = useState(location.hash || "#/");
  useEffect(() => {
    const on = () => setHash(location.hash || "#/");
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return hash;
}

function readLang(): Lang {
  try {
    return localStorage.getItem("timbul:lang") === "id" ? "id" : "en";
  } catch {
    return "en";
  }
}

export function App() {
  const hash = useHash();
  const [lang, setLangState] = useState<Lang>(readLang);
  const setLang = (l: Lang) => {
    setLangState(l);
    try { localStorage.setItem("timbul:lang", l); } catch { /* private mode */ }
  };
  const [figure, setFigure] = useState<SavedFigure | null | undefined>(undefined);
  const match = hash.match(/^#\/figure\/([\w-]+)/);

  useEffect(() => {
    if (!match) return;
    setFigure(undefined);
    getFigure(match[1]).then((f) => setFigure(f ?? null));
  }, [match?.[1]]);

  useEffect(() => { window.scrollTo(0, 0); }, [hash]);

  if (match) {
    if (figure === undefined) return <div className="feed" />;
    if (figure === null) return <div className="feed"><p style={{ padding: 40, fontWeight: 800 }}>That figure is not in this browser. <a href="#/">Back to the library</a></p></div>;
    return <Explore saved={figure} lang={lang} setLang={setLang} />;
  }
  if (hash.startsWith("#/add")) return <AddPage lang={lang} setLang={setLang} />;
  return <Library lang={lang} setLang={setLang} />;
}
