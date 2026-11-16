import { and, desc, eq, gte, lte } from "drizzle-orm";
import { endOfDay, endOfMonth, endOfWeek, format, startOfDay, startOfMonth, startOfWeek, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { db, t } from "@/db";
import { brl, pct } from "@/lib/format";
import { analyzeOperation, type Snapshot } from "./analysis";
import { logExecution } from "./log";

import { AI_REPORT_TYPES, type AiReportKind, type ReportContent } from "./report-types";
export { AI_REPORT_TYPES, type AiReportKind, type ReportContent };

export function periodFor(kind: AiReportKind, now = new Date()) {
  switch (kind) {
    case "diario": return { from: startOfDay(now), to: endOfDay(now) };
    case "semanal": return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
    case "gargalos": return { from: subDays(startOfDay(now), 89), to: endOfDay(now) };
    default: return { from: startOfMonth(now), to: endOfMonth(now) };
  }
}

/** Monta o conteúdo estruturado do relatório a partir da análise real (sem IA). */
export async function buildAiReport(kind: AiReportKind, opts: { from?: Date; to?: Date; userId?: string | null } = {}): Promise<{ title: string; content: ReportContent; snap: Snapshot; from: Date; to: Date }> {
  const p = periodFor(kind);
  const from = opts.from ?? p.from, to = opts.to ?? p.to;
  const snap = await analyzeOperation({ from, to, scopeUserId: kind === "vendedor" ? opts.userId ?? null : null });
  const k = snap.kpis;
  const plans = await db.query.aiActionPlans.findMany({ where: and(gte(t.aiActionPlans.date, format(from, "yyyy-MM-dd")), lte(t.aiActionPlans.date, format(to, "yyyy-MM-dd"))), with: { items: { columns: { status: true, assigneeId: true } } } });
  const planned = plans.reduce((s, pl) => s + pl.items.filter((i) => i.status !== "REJEITADO" && (!opts.userId || i.assigneeId === opts.userId)).length, 0);
  const done = plans.reduce((s, pl) => s + pl.items.filter((i) => i.status === "CONCLUIDO" && (!opts.userId || i.assigneeId === opts.userId)).length, 0);
  const label = AI_REPORT_TYPES.find((r) => r.key === kind)!.label;
  const seller = kind === "vendedor" && opts.userId ? snap.sellers.find((s) => s.id === opts.userId) : undefined;
  const title = `${label}${seller ? ` — ${seller.name}` : ""} · ${format(from, "dd/MM", { locale: ptBR })} a ${format(to, "dd/MM/yyyy", { locale: ptBR })}`;

  const indicadores = [
    { label: "Leads ativos", value: String(k.activeLeads) }, { label: "Leads novos", value: String(k.newLeads) }, { label: "Sem primeiro contato", value: String(k.noFirstContact) },
    { label: "Follow-ups atrasados", value: String(k.lateFollowUps) }, { label: "Leads parados", value: String(k.stalledLeads) }, { label: "Reuniões agendadas", value: String(k.meetingsScheduled) },
    { label: "Reuniões realizadas", value: String(k.meetingsDone) }, { label: "Propostas/negociações", value: String(k.proposals) }, { label: "Vendas", value: String(k.sales) },
    { label: "Faturamento", value: brl(k.revenue) }, { label: "Conversão", value: pct(k.conversion) }, { label: "Índice de Saúde", value: `${snap.health.score} (${snap.health.state})` },
  ];
  const metas = [{ label: "Meta do mês", value: brl(k.goal) }, { label: "Realizado", value: `${brl(k.revenue)} (${pct(k.goalPct, 0)})` }, { label: "Restante", value: brl(k.remaining) }, { label: "Meta de conversão", value: pct(snap.settings.health.conversionGoalPct, 0) }, { label: "Contatos/dia por vendedor", value: String(snap.settings.goals.dailyContacts) }];
  const resultados = [...snap.intelligence.working];
  const comparacao = [{ planejado: planned, realizado: done, pct: planned ? Math.round((done / planned) * 100) : 100, detalhe: `${done} de ${planned} atividades do plano concluídas (${plans.length} plano(s) no período).` }];
  const problemas = [...snap.intelligence.wrong, ...snap.intelligence.sellersAttention];
  const oportunidades = [...snap.intelligence.riskOpportunities, ...snap.bottlenecks.flatMap((b) => b.hypotheses.slice(0, 1).map((h) => `${b.title}: ${h}`))];
  const recomendacoes = [...snap.intelligence.immediateActions, ...snap.bottlenecks.flatMap((b) => b.recommendations.slice(0, 2))];
  let tabela: ReportContent["tabela"];
  if (kind === "produtividade" || kind === "conversao" || kind === "mensal" || kind === "semanal") {
    tabela = kind === "conversao"
      ? { columns: ["Etapa", "Alcançaram", "Conversão da etapa"], rows: snap.funnel.map((f) => [f.stage, f.reached, f.conversionFromPrev === null ? "—" : pct(f.conversionFromPrev, 0)]) }
      : { columns: ["#", "Vendedor", "Leads", "Contatos", "1º contato (h)", "Reuniões", "Propostas", "Vendas", "Faturamento", "Conversão", "% Meta", "Atrasos", "Score"], rows: snap.sellers.map((s) => [s.position, s.name, s.leadsReceived, s.contacts, s.avgFirstResponseHours ?? "—", `${s.meetingsDone}/${s.meetingsScheduled + s.meetingsDone}`, s.proposals, s.sales, brl(s.revenue), pct(s.conversion), pct(s.goalPct, 0), s.lateActivities, s.score]) };
  }
  if (kind === "gargalos") tabela = { columns: ["Gargalo", "Gravidade", "Problema", "Fatos", "Hipóteses"], rows: snap.bottlenecks.map((b) => [b.title, b.severity, b.problem, b.facts.join(" · "), b.hypotheses.join(" · ") || "—"]) };
  if (seller) {
    indicadores.push({ label: "Tempo médio 1º contato", value: seller.avgFirstResponseHours === null ? "—" : `${seller.avgFirstResponseHours}h` }, { label: "Ticket médio", value: brl(seller.ticket) }, { label: "Follow-ups", value: String(seller.followUps) }, { label: "Atividades atrasadas", value: String(seller.lateActivities) });
    if (seller.flags.length) problemas.push(`Pontos de atenção: ${seller.flags.join(", ")}.`);
  }
  return { title, content: { indicadores, metas, resultados, comparacao, problemas, oportunidades, recomendacoes, tabela }, snap, from, to };
}

export async function saveAiReport(kind: AiReportKind, opts: { userId?: string | null; narrative?: string | null; generatedBy?: string; actorId?: string | null } = {}) {
  const r = await buildAiReport(kind, { userId: opts.userId });
  const [row] = await db.insert(t.aiReports).values({ kind, title: r.title, periodFrom: r.from, periodTo: r.to, userId: opts.userId ?? null, content: r.content as never, narrative: opts.narrative ?? null, generatedBy: opts.generatedBy ?? "regras" }).returning();
  await logExecution({ kind: "acao", action: "generate_report", summary: `Relatório "${r.title}" gerado.`, output: { id: row.id, kind }, actorId: opts.actorId ?? null });
  return row;
}

export async function listAiReports(limit = 30) {
  return db.query.aiReports.findMany({ orderBy: [desc(t.aiReports.createdAt)], limit, with: { user: { columns: { name: true } } } });
}
export async function getAiReport(id: string) {
  return db.query.aiReports.findFirst({ where: eq(t.aiReports.id, id), with: { user: { columns: { name: true } } } });
}
