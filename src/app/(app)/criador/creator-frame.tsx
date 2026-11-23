"use client";
import { useEffect, useRef, useState } from "react";

/** Mostra o Criador de Conteúdo (app em /creator) dentro do admin e entrega a ele a sessão do Supabase do usuário logado no CRM. */
export function CreatorFrame() {
  const ref = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const send = async () => {
      try {
        const r = await fetch("/api/creator/session", { cache: "no-store" });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Não foi possível abrir o Criador.");
        if (alive) ref.current?.contentWindow?.postMessage({ type: "creator-session", ...j }, window.location.origin);
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : "Erro ao abrir o Criador."); }
    };
    const onMsg = (ev: MessageEvent) => { if (ev.origin === window.location.origin && ev.data?.type === "creator-ready") void send(); };
    window.addEventListener("message", onMsg);
    return () => { alive = false; window.removeEventListener("message", onMsg); };
  }, []);

  return (
    <div className="-m-4 sm:-m-6">
      {error && <p className="m-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
      <iframe ref={ref} src="/creator/" title="Criador de Conteúdo" className="block w-full border-0 bg-zinc-50" style={{ height: "calc(100vh - 64px)" }} allow="microphone; clipboard-write" />
    </div>
  );
}
