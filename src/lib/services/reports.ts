import { and, asc, eq, gte, lte, isNotNull, inArray } from "drizzle-orm";
import { db, t } from "@/db";
import { brl, fmtDate, num, pct } from "@/lib/format";
import { computeRanking } from "./ranking";
import { isStepLate, journeyProgress, JOURNEY_STEPS } from "./journey";
import { recalcInstallmentStatuses } from "./finance";

export const REPORT_TYPES = [
  { key: "vendas_vendedor", label: "Vendas por vendedor" }, { key: "faturamento_periodo", label: "Faturamento por período" }, { key: "conversao", label: "Conversão comercial" },
  { key: "leads_origem", label: "Leads por origem" }, { key: "motivos_perda", label: "Motivos de perda" }, { key: "clientes_ativos", label: "Clientes ativos" },
  { key: "clientes_onboarding", label: "Clientes em onboarding" }, { key: "entregas_pendentes", label: "Entregas pendentes" }, { key: "reunioes", label: "Reuniões realizadas" },
  { key: "inadimplencia", label: "Inadimplência" }, { key: "equipe", label: "Desempenho da equipe" },
] as const;
export type ReportKey = (typeof REPORT_TYPES)[number]["key"];
export type ReportData = { key: ReportKey; title: string; subtitle: string; columns: string[]; rows: (string | number)[][]; totals?: (string | number)[] };

export async function buildReport(key: ReportKey, from: Date, to: Date): Promise<ReportData> {
  const title = REPORT_TYPES.find((r) => r.key === key)?.label ?? key;
  const subtitle = `Período: ${fmtDate(from)} a ${fmtDate(to)}`;
  const base = { key, title, subtitle };
  switch (key) {
    case "vendas_vendedor": case "equipe": {
      const r = await computeRanking(from, to);
      return { ...base, columns: ["Posição", "Vendedor", "Leads", "Vendas", "Valor vendido", "Recebido", "Reuniões", "Conversão", "Meta", "% Meta", "Pontos"], rows: r.map((x) => [x.position, x.user.name, x.leads, x.sales, brl(x.revenue), brl(x.received), x.meetings, pct(x.conversion), brl(x.goal), pct(x.goalPct, 0), x.points]), totals: ["", "Total", r.reduce((s, x) => s + x.leads, 0), r.reduce((s, x) => s + x.sales, 0), brl(r.reduce((s, x) => s + x.revenue, 0)), brl(r.reduce((s, x) => s + x.received, 0)), r.reduce((s, x) => s + x.meetings, 0), "", "", "", r.reduce((s, x) => s + x.points, 0)] };
    }
    case "faturamento_periodo": {
      const won = await db.query.leads.findMany({ where: and(eq(t.leads.archived, false), isNotNull(t.leads.wonAt), gte(t.leads.wonAt, from), lte(t.leads.wonAt, to)), orderBy: [asc(t.leads.wonAt)], with: { owner: { columns: { name: true } }, source: true } });
      const pays = await db.query.payments.findMany({ where: and(gte(t.payments.paidAt, from), lte(t.payments.paidAt, to)), with: { client: { columns: { name: true } } } });
      const rows: (string | number)[][] = won.map((l) => [fmtDate(l.wonAt), "Venda", l.name, l.company ?? "", l.owner?.name ?? "", brl(l.value)]);
      pays.forEach((p) => rows.push([fmtDate(p.paidAt), "Recebimento", p.client.name, p.method ?? "", "", brl(p.amount)]));
      return { ...base, columns: ["Data", "Tipo", "Cliente/Lead", "Empresa/Forma", "Vendedor", "Valor"], rows, totals: ["", "", "", "", `Vendido: ${brl(won.reduce((s, l) => s + num(l.value), 0))}`, `Recebido: ${brl(pays.reduce((s, p) => s + num(p.amount), 0))}`] };
    }
    case "conversao": {
      const leads = await db.query.leads.findMany({ where: and(eq(t.leads.archived, false), gte(t.leads.enteredAt, from), lte(t.leads.enteredAt, to)), with: { stage: true, owner: { columns: { name: true } } } });
      const stages = await db.select().from(t.pipelineStages).orderBy(asc(t.pipelineStages.order));
      const rows = stages.map((s) => { const n = leads.filter((l) => l.stageId === s.id).length; return [s.name, n, pct(leads.length ? (n / leads.length) * 100 : 0)]; });
      const won = leads.filter((l) => l.wonAt).length;
      rows.push(["— Conversão geral (vendas / leads do período)", `${won}/${leads.length}`, pct(leads.length ? (won / leads.length) * 100 : 0)]);
      return { ...base, columns: ["Etapa atual", "Leads", "% do total"], rows };
    }
    case "leads_origem": {
      const leads = await db.query.leads.findMany({ where: and(eq(t.leads.archived, false), gte(t.leads.enteredAt, from), lte(t.leads.enteredAt, to)), with: { source: true } });
      const map = new Map<string, { n: number; won: number; v: number }>();
      leads.forEach((l) => { const k = l.source?.name ?? "Sem origem"; const e = map.get(k) ?? { n: 0, won: 0, v: 0 }; e.n++; if (l.wonAt) { e.won++; e.v += num(l.value); } map.set(k, e); });
      return { ...base, columns: ["Origem", "Leads", "Vendas", "Conversão", "Valor vendido"], rows: [...map.entries()].sort((a, b) => b[1].n - a[1].n).map(([k, e]) => [k, e.n, e.won, pct(e.n ? (e.won / e.n) * 100 : 0), brl(e.v)]) };
    }
    case "motivos_perda": {
      const lost = await db.query.leads.findMany({ where: and(eq(t.leads.archived, false), isNotNull(t.leads.lostAt), gte(t.leads.lostAt, from), lte(t.leads.lostAt, to)), with: { lossReason: true } });
      const map = new Map<string, { n: number; v: number }>();
      lost.forEach((l) => { const k = l.lossReason?.name ?? "Não informado"; const e = map.get(k) ?? { n: 0, v: 0 }; e.n++; e.v += num(l.value); map.set(k, e); });
      return { ...base, columns: ["Motivo", "Leads perdidos", "% do total", "Valor potencial perdido"], rows: [...map.entries()].sort((a, b) => b[1].n - a[1].n).map(([k, e]) => [k, e.n, pct(lost.length ? (e.n / lost.length) * 100 : 0), brl(e.v)]) };
    }
    case "clientes_ativos": case "clientes_onboarding": {
      const status = key === "clientes_ativos" ? "ATIVO" : "ONBOARDING";
      const cs = await db.query.clients.findMany({ where: eq(t.clients.status, status), orderBy: [asc(t.clients.name)], with: { owner: { columns: { name: true } }, journeySteps: true, contract: true } });
      return { ...base, subtitle: "Situação atual", columns: ["Cliente", "Empresa", "Serviço", "Responsável", "Fechamento", "Contrato", "Status contrato", "Jornada"], rows: cs.map((c) => [c.name, c.company ?? "", c.service ?? "", c.owner?.name ?? "", fmtDate(c.closedAt), brl(c.contractValue), c.contract?.status ?? "", `${journeyProgress(c.journeySteps)}%`]) };
    }
    case "entregas_pendentes": {
      const cs = await db.query.clients.findMany({ where: inArray(t.clients.status, ["ATIVO", "ONBOARDING"]), with: { journeySteps: true, reports: true, tasks: true } });
      const now = new Date(); const rows: (string | number)[][] = [];
      cs.forEach((c) => {
        c.journeySteps.filter((s) => !s.recurring && s.status !== "CONCLUIDO").forEach((s) => rows.push([c.name, "Etapa da jornada", JOURNEY_STEPS.find((d) => d.key === s.key)?.label ?? s.key, fmtDate(s.dueAt), isStepLate(s) ? "ATRASADO" : s.status]));
        c.reports.filter((r) => r.status === "PENDENTE").forEach((r) => rows.push([c.name, "Relatório", r.title, fmtDate(r.dueAt), r.dueAt && r.dueAt < now ? "ATRASADO" : "PENDENTE"]));
        c.tasks.filter((x) => x.status !== "CONCLUIDA").forEach((x) => rows.push([c.name, "Tarefa", x.title, fmtDate(x.dueAt), x.dueAt && x.dueAt < now ? "ATRASADA" : x.status]));
      });
      return { ...base, subtitle: "Situação atual", columns: ["Cliente", "Tipo", "Item", "Prazo", "Status"], rows };
    }
    case "reunioes": {
      const aps = await db.query.appointments.findMany({ where: and(eq(t.appointments.status, "REALIZADO"), gte(t.appointments.startAt, from), lte(t.appointments.startAt, to)), orderBy: [asc(t.appointments.startAt)], with: { type: true, owner: { columns: { name: true } }, client: { columns: { name: true } }, lead: { columns: { name: true } }, meeting: true } });
      return { ...base, columns: ["Data", "Título", "Tipo", "Responsável", "Cliente/Lead", "Ata registrada"], rows: aps.map((a) => [fmtDate(a.startAt, "dd/MM/yyyy HH:mm"), a.title, a.type?.name ?? "", a.owner?.name ?? "", a.client?.name ?? a.lead?.name ?? "", a.meeting?.decisions || a.meeting?.agenda ? "Sim" : "Não"]), totals: ["Total", aps.length, "", "", "", ""] };
    }
    case "inadimplencia": {
      await recalcInstallmentStatuses();
      const insts = await db.query.installments.findMany({ where: eq(t.installments.status, "ATRASADO"), orderBy: [asc(t.installments.dueDate)], with: { client: { columns: { name: true, phone: true, whatsapp: true } } } });
      const now = new Date();
      return { ...base, subtitle: "Situação atual", columns: ["Cliente", "Contato", "Parcela", "Vencimento", "Dias em atraso", "Valor"], rows: insts.map((i) => [i.client.name, i.client.whatsapp ?? i.client.phone ?? "", i.description ?? String(i.number), fmtDate(i.dueDate), Math.floor((+now - +i.dueDate) / 864e5), brl(i.amount)]), totals: ["Total", "", "", "", insts.length, brl(insts.reduce((s, i) => s + num(i.amount), 0))] };
    }
  }
}
