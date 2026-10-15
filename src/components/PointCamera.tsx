import { useEffect, useMemo, useRef, useState } from "react";
import type { Lang } from "../lib/types";
import { checkSvg, type Sheet } from "../lib/tactile";
import { svgToPng } from "../lib/render";
import { pointAt, ApiError } from "../lib/api";

interface Props {
  sheet: Sheet;
  lang: Lang;
  /** A part was found under the fingertip. */
  onFound: (partId: string) => void;
  /** Something to tell the student instead (no sheet in view, no finger on it, an error). */
  onSay: (text: string) => void;
  onClose: () => void;
}

/**
 * Point and ask: the phone's camera looks down at the printed sheet; the student touches a raised shape and asks
 * "what is this?". Gemini lines the photo up with Timbul's own drawing of the sheet and says which part the
 * fingertip is on, so the paper under the finger and the voice stay one figure.
 */
export function PointCamera({ sheet, lang, onFound, onSay, onClose }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"starting" | "ready" | "looking" | "blocked">("starting");
  const id = lang === "id";
  // the sheet as printed, with part ids, which Gemini matches the photo against
  const reference = useMemo(() => svgToPng(checkSvg(sheet)), [sheet]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1600 }, height: { ideal: 1200 } }, audio: false })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (video.current) video.current.srcObject = s;
        setState("ready");
      })
      .catch(() => setState("blocked"));
    if (!navigator.mediaDevices) setState("blocked");
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const look = async () => {
    const v = video.current;
    if (!v || !v.videoWidth || state === "looking") return;
    setState("looking");
    onSay(id ? "Sebentar, saya lihat." : "Let me look.");
    const scale = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    canvas.getContext("2d")!.drawImage(v, 0, 0, canvas.width, canvas.height);
    const photo = canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
    try {
      const out = await pointAt(photo, await reference, sheet.parts.map((sp) => sp.part.id));
      if (out.part) onFound(out.part);
      else onSay(id ? out.note_id : out.note_en);
    } catch (e) {
      onSay(e instanceof ApiError ? e.message : id ? "Ada yang salah. Coba lagi." : "Something went wrong. Try again.");
    }
    setState("ready");
  };

  return (
    <div className="point" role="dialog" aria-label={id ? "Tunjuk dan tanya" : "Point and ask"} onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <video ref={video} autoPlay playsInline muted aria-hidden="true" />
      <p className="point-help" aria-live="polite">
        {state === "blocked"
          ? id ? "Kamera diblokir. Izinkan kamera di peramban." : "The camera is blocked. Allow it in the browser."
          : id ? "Pegang ponsel di atas lembar, sentuh satu bagian, lalu tekan Apa ini?" : "Hold the phone above the sheet, touch one part, then press What is this?"}
      </p>
      <div className="point-actions">
        <button className="btn" type="button" onClick={look} disabled={state !== "ready"} autoFocus>
          {state === "looking" ? (id ? "Melihat…" : "Looking…") : id ? "Apa ini?" : "What is this?"}
        </button>
        <button className="btn ghost" type="button" onClick={onClose}>{id ? "Tutup" : "Close"}</button>
      </div>
    </div>
  );
}
