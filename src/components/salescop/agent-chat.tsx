"use client";
import * as React from "react";
import { Send, Loader2, Sparkles } from "lucide-react";
import { CopShield } from "./brand";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string; mode?: "ia" | "regras" };
const SUGGESTIONS = ["Sales Cop, como está nossa operação?", "Quais leads estão esquecidos?", "Qual vendedor precisa de atenção?", "Quanto falta para alcançar a meta?", "Quais oportunidades devemos priorizar?", "Gere meu plano de ação.", "Como foi o desempenho de ontem?"];

export function AgentChat({ ask, greeting, aiOn }: { ask: (q: string, history: { role: "user" | "assistant"; content: string }[]) => Promise<{ answer: string; mode: "ia" | "regras" }>; greeting: string; aiOn: boolean }) {
  const [msgs, setMsgs] = React.useState<Msg[]>([{ role: "assistant", content: greeting }]);
  const [q, setQ] = React.useState("");
  const [pending, start] = React.useTransition();
  const box = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" }); }, [msgs, pending]);
  const send = (text: string) => {
    const question = text.trim(); if (!question || pending) return;
    const history = msgs.filter((m, i) => i > 0).map(({ role, content }) => ({ role, content }));
    setMsgs((m) => [...m, { role: "user", content: question }]); setQ("");
    start(async () => { try { const r = await ask(question, history); setMsgs((m) => [...m, { role: "assistant", content: r.answer, mode: r.mode }]); } catch (e) { setMsgs((m) => [...m, { role: "assistant", content: `Erro: ${(e as Error).message}` }]); } });
  };
  return (
    <div className="card overflow-hidden flex flex-col h-[520px]">
      <div className="px-4 py-3 border-b border-line flex items-center gap-3 bg-[#0a0a0c] text-white">
        <CopShield size={28} />
        <div className="leading-tight"><p className="text-sm font-semibold tracking-wide">Fale com o SALES COP</p><p className="text-[11px] text-white/50">{aiOn ? "IA conectada aos dados reais do CRM" : "IA desativada — respostas pelas regras de fiscalização"}</p></div>
        {aiOn && <Sparkles size={14} className="ml-auto text-brand" />}
      </div>
      <div ref={box} className="flex-1 overflow-y-auto p-4 space-y-3 bg-surface-2/40">
        {msgs.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed", m.role === "user" ? "bg-brand text-white rounded-br-md" : "bg-surface border border-line rounded-bl-md")}>
              {m.content}
              {m.mode === "regras" && i > 0 && <p className="text-[10px] text-muted mt-1.5">resposta pelas regras (sem IA)</p>}
            </div>
          </div>
        ))}
        {pending && <div className="flex justify-start"><div className="bg-surface border border-line rounded-2xl rounded-bl-md px-3.5 py-2.5 text-sm text-muted flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Investigando os dados do CRM…</div></div>}
      </div>
      <div className="p-3 border-t border-line space-y-2">
        <div className="flex gap-1.5 overflow-x-auto pb-1">{SUGGESTIONS.map((s) => <button key={s} type="button" onClick={() => send(s)} disabled={pending} className="text-[11px] whitespace-nowrap px-2.5 py-1 rounded-lg border border-line bg-surface hover:border-brand hover:text-brand transition">{s}</button>)}</div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); send(q); }}>
          <input className="input" placeholder="Pergunte ao SALES COP…" value={q} onChange={(e) => setQ(e.target.value)} disabled={pending} />
          <button type="submit" className="btn-primary btn-icon shrink-0" disabled={pending || !q.trim()} aria-label="Enviar">{pending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}</button>
        </form>
      </div>
    </div>
  );
}
