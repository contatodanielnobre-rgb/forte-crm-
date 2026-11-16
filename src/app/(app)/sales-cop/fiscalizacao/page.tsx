import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Search, ShieldCheck } from "lucide-react";
import { db, t } from "@/db";
import { requirePage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { Empty, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/action-form";
import { RULE_LABEL } from "@/components/salescop/brand";
import { analyzeOperation, syncFindings } from "@/lib/salescop/analysis";
import { getSalesCopSettings } from "@/lib/salescop/settings";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { runInspection } from "../actions";
import { FindingRow, type FindingRowData } from "./finding-row";

export const dynamic = "force-dynamic";

const MONITORS: { key: string; label: string; rules: string[] }[] = [
  { key: "RESPONSAVEL", label: "Leads sem responsável", rules: ["RESPONSAVEL"] },
  { key: "PRIMEIRO_CONTATO", label: "Leads sem primeiro contato", rules: ["PRIMEIRO_CONTATO"] },
  { key: "SEM_HISTORICO", label: "Leads sem histórico de atendimento", rules: ["SEM_HISTORICO"] },
  { key: "FOLLOW_UP", label: "Leads sem próxima atividade", rules: ["FOLLOW_UP"] },
  { key: "LEAD_PARADO", label: "Leads parados em uma etapa", rules: ["LEAD_PARADO", "SEM_MOVIMENTACAO"] },
  { key: "FOLLOW_UP_ATRASADO", label: "Follow-ups atrasados", rules: ["FOLLOW_UP_ATRASADO"] },
  { key: "REUNIAO", label: "Reuniões sem confirmação", rules: ["REUNIAO"] },
  { key: "PROPOSTA", label: "Propostas sem acompanhamento", rules: ["PROPOSTA"] },
  { key: "RISCO_PERDA", label: "Oportunidades com risco de perda", rules: ["RISCO_PERDA"] },
  { key: "VENDEDOR_INATIVO", label: "Vendedores sem atividades registradas", rules: ["VENDEDOR_INATIVO"] },
];

export default async function InspectionPage({ searchParams }: { searchParams: Promise<{ regra?: string; vendedor?: string; status?: string }> }) {
  const user = await requirePage("salescop.view");
  const manage = can(user.role, "salescop.manage");
  const sp = await searchParams;
  // Comercial: sincroniza a fiscalização na abertura da aba (dados sempre atuais); gestor usa o botão/rotina
  if (manage) { const snap = await analyzeOperation(); await syncFindings(snap.findings); }
  const settings = await getSalesCopSettings();
  const status = sp.status === "historico" ? ["RESOLVIDO", "IGNORADO"] : ["ABERTO"];
  const rules = MONITORS.find((m) => m.key === sp.regra)?.rules;
  const rows = (await db.query.aiFindings.findMany({ where: and(inArray(t.aiFindings.status, status as ("ABERTO" | "RESOLVIDO" | "IGNORADO")[]), manage ? (sp.vendedor ? eq(t.aiFindings.userId, sp.vendedor) : undefined) : eq(t.aiFindings.userId, user.id), rules ? inArray(t.aiFindings.ruleKey, rules) : undefined), orderBy: [desc(t.aiFindings.updatedAt)], limit: 300, with: { lead: { columns: { id: true, name: true, company: true, value: true } }, user: { columns: { id: true, name: true } }, appointment: { columns: { id: true, title: true, startAt: true } } } })) as unknown as FindingRowData[];
  const allOpen = await db.select({ ruleKey: t.aiFindings.ruleKey, severity: t.aiFindings.severity, userId: t.aiFindings.userId }).from(t.aiFindings).where(and(eq(t.aiFindings.status, "ABERTO"), manage ? undefined : eq(t.aiFindings.userId, user.id)));
  const sellers = manage ? await db.select({ id: t.users.id, name: t.users.name }).from(t.users).where(and(eq(t.users.active, true), inArray(t.users.role, ["COMERCIAL", "GESTOR", "ADMIN"]))) : [];
  const sevOrder = { CRITICO: 0, ALTO: 1, MEDIO: 2, BAIXO: 3 } as Record<string, number>;
  rows.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);
  const q = (patch: Record<string, string | undefined>) => { const p = new URLSearchParams(); const all = { regra: sp.regra, vendedor: sp.vendedor, status: sp.status, ...patch }; Object.entries(all).forEach(([k, v]) => v && p.set(k, v)); return `?${p}`; };
  const R = settings.rules;
  const RULES_DOC = [
    { n: 1, t: "Primeiro contato", d: `Todo lead novo deve receber uma tentativa de contato em até ${R.firstContactHours}h.` },
    { n: 2, t: "Follow-up", d: `Todo lead em atendimento deve ter próxima atividade agendada (tolerância ${R.followUpMaxDays} dias) ou justificativa registrada.` },
    { n: 3, t: "Leads parados", d: `Tempo máximo de permanência por etapa: ${R.stageMaxDays} dias (ajustável por etapa).` },
    { n: 4, t: "Reuniões", d: `Reuniões nas próximas ${R.meetingConfirmHours}h precisam estar confirmadas.` },
    { n: 5, t: "Propostas", d: `Propostas enviadas sem retorno há mais de ${R.proposalMaxDays} dias são sinalizadas.` },
    { n: 6, t: "Responsabilidade", d: "Todo lead ativo deve ter um vendedor responsável ativo." },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Fiscalização Comercial" subtitle={`${allOpen.length} irregularidade(s) aberta(s) · ${allOpen.filter((f) => f.severity === "CRITICO").length} críticas · ${allOpen.filter((f) => f.severity === "ALTO").length} altas`} actions={manage ? <><ActionButton action={runInspection} className="btn-primary btn-sm" success="Fiscalização atualizada."><Search size={14} /> Fiscalizar agora</ActionButton>{can(user.role, "salescop.settings") && <Link href="/sales-cop/configuracoes#regras" className="btn-secondary btn-sm">Configurar regras</Link>}</> : undefined} />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {MONITORS.map((m) => { const c = allOpen.filter((f) => m.rules.includes(f.ruleKey)).length; const active = sp.regra === m.key; return <Link key={m.key} href={q({ regra: active ? undefined : m.key, status: undefined })} className={cn("card p-3 hover:border-brand transition", active && "border-brand bg-brand/5")}><p className={cn("text-2xl font-semibold tabular-nums", c ? "text-brand" : "text-muted")}>{c}</p><p className="text-[11px] text-muted leading-snug mt-0.5">{m.label}</p></Link>; })}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href={q({ status: undefined })} className={cn("btn-sm btn", !sp.status ? "btn-primary" : "btn-secondary")}>Abertas</Link>
        <Link href={q({ status: "historico" })} className={cn("btn-sm btn", sp.status === "historico" ? "btn-primary" : "btn-secondary")}>Histórico (resolvidas/ignoradas)</Link>
      </div>
      {manage && sellers.length > 1 && <div className="flex flex-wrap gap-1.5 -mt-3">{sellers.map((s) => { const c = allOpen.filter((f) => f.userId === s.id).length; return <Link key={s.id} href={q({ vendedor: sp.vendedor === s.id ? undefined : s.id })} className={cn("text-[11px] px-2 py-1 rounded-lg border", sp.vendedor === s.id ? "border-brand text-brand bg-brand/5" : "border-line text-muted hover:text-fg")}>{s.name.split(" ")[0]} <span className="tabular-nums">{c}</span></Link>; })}</div>}

      {rows.length === 0 ? <div className="card"><Empty icon={ShieldCheck} title={sp.status === "historico" ? "Nenhum registro no histórico" : "Nenhuma irregularidade aberta"} hint={sp.status !== "historico" ? "A operação está em conformidade com as regras configuradas." : undefined} /></div> : <ul className="space-y-2">{rows.map((f) => <FindingRow key={f.id} f={f} canAct={manage || f.user?.id === user.id} />)}</ul>}

      <section className="card p-4">
        <p className="font-medium mb-2">Regras de fiscalização em vigor</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">{RULES_DOC.map((r) => <div key={r.n} className="rounded-lg bg-surface-2 p-2.5"><p className="font-semibold text-brand">REGRA {r.n} — {r.t.toUpperCase()}</p><p className="text-muted mt-0.5">{r.d}</p></div>)}</div>
        <p className="text-[11px] text-muted mt-2">Monitoramento adicional: leads sem movimentação há {R.stalledLeadDays}+ dias, oportunidades em risco (valor ≥ R$ {R.riskValueMin.toLocaleString("pt-BR")}), vendedores sem atividade há {R.sellerInactivityDays}+ dia(s). Última análise: {fmtDateTime(new Date())}. {Object.keys(RULE_LABEL).length} tipos de verificação ativos.</p>
      </section>
    </div>
  );
}
