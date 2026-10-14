import type { Lang } from "./types";

// Speaking uses the browser's own voices (free, instant, works offline); listening records the
// student's question as audio, which Gemini hears directly.

const LOCALES: Record<Lang, string[]> = { en: ["en-GB", "en-IN", "en-US", "en"], id: ["id-ID", "id", "ms-MY"] };

function pickVoice(lang: Lang): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  for (const loc of LOCALES[lang]) {
    const v = voices.find((v) => v.lang.toLowerCase().startsWith(loc.toLowerCase()));
    if (v) return v;
  }
  return undefined;
}

let current: SpeechSynthesisUtterance | null = null;

export function speak(text: string, lang: Lang, onEnd?: () => void) {
  const synth = window.speechSynthesis;
  if (!synth) {
    onEnd?.();
    return;
  }
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = LOCALES[lang][0];
  const voice = pickVoice(lang);
  if (voice) u.voice = voice;
  u.rate = 0.98;
  u.onend = u.onerror = () => {
    if (current === u) current = null;
    onEnd?.();
  };
  current = u;
  synth.speak(u);
}

export function stopSpeaking() {
  window.speechSynthesis?.cancel();
  current = null;
}

export function hasVoice(lang: Lang) {
  return Boolean(pickVoice(lang));
}

// Voices load asynchronously in some browsers.
if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.getVoices();

// ---------------------------------------------------------------- recording

export interface Recording {
  stop(): Promise<{ base64: string; mime: string; seconds: number }>;
  cancel(): void;
  level(): number;
}

/** Records the microphone as 16 kHz mono WAV, a format Gemini accepts in every browser. */
export async function startRecording(): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  let lastLevel = 0;
  proc.onaudioprocess = (e) => {
    const data = e.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(data));
    let sum = 0;
    for (let i = 0; i < data.length; i += 16) sum += data[i] * data[i];
    lastLevel = Math.min(1, Math.sqrt(sum / (data.length / 16)) * 4);
  };
  source.connect(proc);
  proc.connect(ctx.destination);
  const close = () => {
    proc.disconnect();
    source.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    ctx.close();
  };
  return {
    level: () => lastLevel,
    cancel: close,
    async stop() {
      close();
      const rate = ctx.sampleRate;
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const pcm = new Float32Array(total);
      let o = 0;
      for (const c of chunks) {
        pcm.set(c, o);
        o += c.length;
      }
      const wav = encodeWav(downsample(pcm, rate, 16000), 16000);
      return { base64: await toBase64(wav), mime: "audio/wav", seconds: total / rate };
    },
  };
}

function downsample(input: Float32Array, from: number, to: number) {
  if (from === to) return input;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio), end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    out[i] = sum / Math.max(1, end - start);
  }
  return out;
}

function encodeWav(samples: Float32Array, rate: number) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
  return new Blob([buf], { type: "audio/wav" });
}

export function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
