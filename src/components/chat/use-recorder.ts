"use client";
import * as React from "react";

export type RecState = "idle" | "requesting" | "recording" | "paused" | "ready" | "error";

/**
 * Gravação real do microfone em Ogg/Opus (formato de mensagem de voz aceito pelo WhatsApp) via opus-recorder (WebAssembly).
 * Funciona em Chrome, Edge, Firefox e Safari modernos. Nada é simulado.
 */
export function useRecorder() {
  const [state, setState] = React.useState<RecState>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [elapsed, setElapsed] = React.useState(0); // segundos gravados (sem pausas)
  const [level, setLevel] = React.useState(0);
  const [blob, setBlob] = React.useState<Blob | null>(null);
  const [url, setUrl] = React.useState<string | null>(null);
  const r = React.useRef<{ rec?: import("opus-recorder").default; ctx?: AudioContext; stream?: MediaStream; raf?: number; tick?: number; startedAt?: number; acc?: number; chunks?: Uint8Array[]; cancelled?: boolean }>({});

  const cleanup = React.useCallback(() => {
    const s = r.current;
    if (s.raf) cancelAnimationFrame(s.raf);
    if (s.tick) clearInterval(s.tick);
    s.stream?.getTracks().forEach((tr) => tr.stop());
    s.ctx?.close().catch(() => {});
    s.rec = undefined; s.ctx = undefined; s.stream = undefined; setLevel(0);
  }, []);

  React.useEffect(() => () => { cleanup(); }, [cleanup]);
  React.useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const start = React.useCallback(async () => {
    setError(null); setBlob(null); setUrl(null); setElapsed(0);
    if (!navigator.mediaDevices?.getUserMedia) { setState("error"); setError("Este navegador não permite gravar áudio (é necessário HTTPS e um navegador moderno)."); return; }
    setState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser(); analyser.fftSize = 512; source.connect(analyser);
      const { default: Recorder } = await import("opus-recorder");
      const rec = new Recorder({ encoderPath: "/chat/encoderWorker.min.js", sourceNode: source, numberOfChannels: 1, encoderSampleRate: 48000, encoderApplication: 2048, encoderBitRate: 32000, streamPages: true, maxFramesPerPage: 40 });
      const s = r.current;
      s.chunks = []; s.cancelled = false; s.rec = rec; s.ctx = ctx; s.stream = stream; s.acc = 0; s.startedAt = Date.now();
      rec.ondataavailable = (d) => { s.chunks?.push(d); };
      rec.onstop = () => {
        if (s.cancelled) return;
        const b = new Blob(s.chunks as BlobPart[], { type: "audio/ogg" });
        setBlob(b); setUrl(URL.createObjectURL(b)); setState("ready"); cleanup();
      };
      await rec.start();
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const loop = () => { analyser.getByteTimeDomainData(buf); let peak = 0; for (const v of buf) peak = Math.max(peak, Math.abs(v - 128)); setLevel(Math.min(1, peak / 64)); s.raf = requestAnimationFrame(loop); };
      loop();
      s.tick = window.setInterval(() => { if (s.startedAt) setElapsed(Math.floor(((s.acc ?? 0) + Date.now() - s.startedAt) / 1000)); }, 250);
      setState("recording");
    } catch (e) {
      cleanup();
      const name = (e as Error).name;
      setState("error");
      setError(name === "NotAllowedError" || name === "SecurityError" ? "Permissão do microfone negada. Libere o microfone no cadeado da barra de endereço e tente de novo." : name === "NotFoundError" ? "Nenhum microfone encontrado neste dispositivo." : `Não foi possível iniciar a gravação: ${(e as Error).message}`);
    }
  }, [cleanup]);

  const pause = React.useCallback(() => { const s = r.current; if (!s.rec) return; s.rec.pause(); s.acc = (s.acc ?? 0) + Date.now() - (s.startedAt ?? Date.now()); s.startedAt = undefined; setState("paused"); }, []);
  const resume = React.useCallback(() => { const s = r.current; if (!s.rec) return; s.rec.resume(); s.startedAt = Date.now(); setState("recording"); }, []);
  const stop = React.useCallback(() => { const s = r.current; if (!s.rec) return; if (s.startedAt) { s.acc = (s.acc ?? 0) + Date.now() - s.startedAt; s.startedAt = undefined; } setElapsed(Math.round((s.acc ?? 0) / 1000)); if (s.tick) clearInterval(s.tick); s.rec.stop(); }, []);
  const cancel = React.useCallback(() => { const s = r.current; s.cancelled = true; try { s.rec?.stop(); } catch { /* */ } cleanup(); setBlob(null); setUrl(null); setElapsed(0); setState("idle"); }, [cleanup]);
  const reset = React.useCallback(() => { setBlob(null); setUrl(null); setElapsed(0); setState("idle"); setError(null); }, []);

  return { state, error, elapsed, level, blob, url, start, pause, resume, stop, cancel, reset };
}

export const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
