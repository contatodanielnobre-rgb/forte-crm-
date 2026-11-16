import { cn } from "@/lib/utils";

/** Emblema do SALES COP AI — escudo com circuito (identidade própria, preto/vermelho). */
export function CopShield({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={cn("shrink-0", className)} aria-hidden>
      <defs>
        <linearGradient id="cop-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#F07C92" /><stop offset="100%" stopColor="#D91E3A" /></linearGradient>
      </defs>
      <path d="M32 4 8 13v17c0 14.5 10 26.5 24 30 14-3.5 24-15.5 24-30V13L32 4Z" fill="#111114" stroke="url(#cop-g)" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M32 11 14 17.6V30c0 11 7.3 20.4 18 23.6C42.7 50.4 50 41 50 30V17.6L32 11Z" fill="#16161b" stroke="#D91E3A" strokeOpacity=".35" strokeWidth="1" />
      {/* circuito */}
      <g stroke="url(#cop-g)" strokeWidth="2" strokeLinecap="round">
        <path d="M32 21v8M32 37v8M24 33h16M26 27l6 6M38 27l-6 6M26 39l6-6M38 39l-6-6" />
      </g>
      <g fill="#D91E3A"><circle cx="32" cy="21" r="2.2" /><circle cx="32" cy="45" r="2.2" /><circle cx="24" cy="33" r="2.2" /><circle cx="40" cy="33" r="2.2" /><circle cx="26" cy="27" r="1.6" /><circle cx="38" cy="27" r="1.6" /><circle cx="26" cy="39" r="1.6" /><circle cx="38" cy="39" r="1.6" /></g>
      <circle cx="32" cy="33" r="3.4" fill="#fff" />
      <circle cx="32" cy="33" r="1.6" fill="#D91E3A" />
    </svg>
  );
}

export function CopWordmark({ compact }: { compact?: boolean }) {
  return (
    <div className="leading-none">
      <p className={cn("font-bold tracking-[0.18em] text-white", compact ? "text-sm" : "text-lg sm:text-xl")}>SALES <span className="text-brand">COP</span> AI</p>
      {!compact && <p className="text-[10px] tracking-[0.3em] text-white/50 mt-1.5 uppercase">The AI Sales Officer</p>}
    </div>
  );
}

export const SLOGAN = "FISCALIZA. INVESTIGA. PLANEJA. EXECUTA.";

export function HealthRing({ score, state, size = 120 }: { score: number; state: "VERDE" | "AMARELO" | "VERMELHO"; size?: number }) {
  const color = state === "VERDE" ? "#10B981" : state === "AMARELO" ? "#F59E0B" : "#D91E3A";
  const r = (size - 14) / 2, c = 2 * Math.PI * r, off = c - (Math.max(0, Math.min(100, score)) / 100) * c;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.08)" strokeWidth="10" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth="10" fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} style={{ transition: "stroke-dashoffset .8s ease" }} />
      </svg>
      <div className="absolute text-center"><p className="text-3xl font-bold tabular-nums text-white">{score}</p><p className="text-[10px] tracking-widest font-semibold" style={{ color }}>{state}</p></div>
    </div>
  );
}

export const PRIORITY_TONE: Record<string, string> = { URGENTE: "bg-brand text-white border-brand", ALTA: "bg-brand/15 text-brand border-brand/30", MEDIA: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30", BAIXA: "bg-gray-500/10 text-gray-500 border-gray-500/20" };
export const SEVERITY_TONE: Record<string, string> = { CRITICO: "bg-brand text-white border-brand", ALTO: "bg-brand/15 text-brand border-brand/30", MEDIO: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30", BAIXO: "bg-gray-500/10 text-gray-500 border-gray-500/20" };
export const STATUS_LABEL: Record<string, string> = { PENDENTE: "Pendente", APROVADO: "Em execução", REJEITADO: "Rejeitado", CONCLUIDO: "Concluído", RASCUNHO: "Rascunho", ENCERRADO: "Encerrado", ABERTO: "Aberto", RESOLVIDO: "Resolvido", IGNORADO: "Ignorado" };
export const RULE_LABEL: Record<string, string> = { PRIMEIRO_CONTATO: "Regra 1 · Primeiro contato", FOLLOW_UP: "Regra 2 · Follow-up", FOLLOW_UP_ATRASADO: "Regra 2 · Follow-up atrasado", LEAD_PARADO: "Regra 3 · Lead parado", REUNIAO: "Regra 4 · Reunião", PROPOSTA: "Regra 5 · Proposta", RESPONSAVEL: "Regra 6 · Responsabilidade", SEM_HISTORICO: "Sem histórico", SEM_MOVIMENTACAO: "Sem movimentação", RISCO_PERDA: "Risco de perda", VENDEDOR_INATIVO: "Vendedor sem atividade", IA: "Alerta da IA" };
