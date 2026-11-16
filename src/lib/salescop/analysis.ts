import { and, asc, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { differenceInHours, differenceInDays, differenceInBusinessDays, endOfDay, endOfMonth, getDate, getDaysInMonth, startOfDay, startOfMonth, subDays, addHours } from "date-fns";
import { db, t } from "@/db";
import { num } from "@/lib/format";
import { getSetting } from "@/lib/bootstrap";
import { getSalesCopSettings, HEALTH_CRITERIA, type SalesCopSettings, type HealthCriterionKey } from "./settings";

// ───────────── Tipos ─────────────
export type Severity = "CRITICO" | "ALTO" | "MEDIO" | "BAIXO";
export type Finding = {
  kind: "IRREGULARIDADE" | "ALERTA" | "RECOMENDACAO" | "GARGALO";
  ruleKey: string; severity: Severity; title: string; detail: string; recommendation: string; dedupeKey: string;
  leadId?: string | null; clientId?: string | null; appointmentId?: string | null; userId?: string | null;
  data?: Record<string, unknown>;
};
export type SellerPerf = {
  id: string; name: string; avatarUrl: string | null; role: string;
  leadsReceived: number; openLeads: number; contacts: number; avgFirstResponseHours: number | null; qualified: number;
  meetingsScheduled: number; meetingsDone: number; proposals: number; sales: number; revenue: number; ticket: number; conversion: number;
  followUps: number; lateActivities: number; stalledLeads: number; noContactLeads: number; goal: number; goalPct: number;
  productivityScore: number; resultScore: number; score: number; position: number;
  flags: string[]; // ex.: "abaixo da meta", "muitos leads parados"
};
export type HealthCriterion = { key: HealthCriterionKey; label: string; score: number; weight: number; detail: string };
export type Health = { score: number; state: "VERDE" | "AMARELO" | "VERMELHO"; criteria: HealthCriterion[] };
export type Bottleneck = { key: string; title: string; problem: string; facts: string[]; hypotheses: string[]; recommendations: string[]; severity: Severity; needsData?: string };
export type Snapshot = {
  generatedAt: string; period: { from: string; to: string }; scopeUserId: string | null;
  kpis: {
    activeLeads: number; newLeads: number; noFirstContact: number; stalledLeads: number; lateFollowUps: number; noNextActivity: number; pendingTasks: number; lateTasks: number;
    meetingsScheduled: number; meetingsDone: number; meetingsUnconfirmed: number; proposals: number; proposalsNoFollowUp: number; sales: number; revenue: number; goal: number; goalPct: number; remaining: number;
    conversion: number; productivity: number; contactsToday: number; sellersActive: number; sellersInactive: number; unassignedLeads: number;
  };
  health: Health;
  findings: Finding[];
  sellers: SellerPerf[];
  bottlenecks: Bottleneck[];
  funnel: { stage: string; color: string; reached: number; current: number; conversionFromPrev: number | null }[];
  intelligence: { working: string[]; wrong: string[]; sellersAttention: string[]; riskOpportunities: string[]; bottlenecks: string[]; immediateActions: string[] };
  settings: SalesCopSettings;
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const pctOf = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);
const first = (name: string) => name.split(" ")[0];

/**
 * Analisa a operação comercial inteira a partir dos registros reais do CRM.
 * scopeUserId restringe a análise ao vendedor (perfil Comercial vê apenas o próprio recorte).
 */
export async function analyzeOperation(opts: { from?: Date; to?: Date; scopeUserId?: string | null } = {}): Promise<Snapshot> {
  const now = new Date();
  const from = opts.from ?? startOfMonth(now), to = opts.to ?? endOfMonth(now);
  const scopeUserId = opts.scopeUserId ?? null;
  const settings = await getSalesCopSettings();
  const R = settings.rules;

  const stages = await db.select().from(t.pipelineStages).orderBy(asc(t.pipelineStages.order));
  const stageById = new Map(stages.map((s) => [s.id, s]));
  const openStageIds = stages.filter((s) => !s.isWon && !s.isLost).map((s) => s.id);
  const defaultStage = stages.find((s) => s.isDefault) ?? stages[0];
  const wonStage = stages.find((s) => s.isWon);
  const leadScope = scopeUserId ? eq(t.leads.ownerId, scopeUserId) : undefined;

  const [openLeads, periodLeads, wonPeriod, sellers, appts, tasksOpen, interactions90, goalCfg, lostPeriod] = await Promise.all([
    db.query.leads.findMany({ where: and(eq(t.leads.archived, false), inArray(t.leads.stageId, openStageIds.length ? openStageIds : ["-"]), leadScope), with: { owner: { columns: { id: true, name: true, active: true } }, interactions: { columns: { id: true, type: true, createdAt: true, userId: true } }, appointments: { columns: { id: true, startAt: true, status: true, confirmedAt: true } } } }),
    db.query.leads.findMany({ where: and(eq(t.leads.archived, false), gte(t.leads.enteredAt, subDays(now, 90)), leadScope), with: { interactions: { columns: { type: true, createdAt: true } } } }),
    db.query.leads.findMany({ where: and(eq(t.leads.archived, false), gte(t.leads.wonAt, from), lte(t.leads.wonAt, to), leadScope) }),
    db.select({ id: t.users.id, name: t.users.name, avatarUrl: t.users.avatarUrl, role: t.users.role, monthlyGoal: t.users.monthlyGoal, active: t.users.active, phone: t.users.phone }).from(t.users).where(and(eq(t.users.active, true), inArray(t.users.role, ["COMERCIAL", "GESTOR", "ADMIN"]), scopeUserId ? eq(t.users.id, scopeUserId) : undefined)),
    db.query.appointments.findMany({ where: and(gte(t.appointments.startAt, from), lte(t.appointments.startAt, addHours(endOfDay(to), 72)), scopeUserId ? eq(t.appointments.ownerId, scopeUserId) : undefined), with: { type: true, lead: { columns: { id: true, name: true } } } }),
    db.query.tasks.findMany({ where: and(inArray(t.tasks.status, ["PENDENTE", "EM_ANDAMENTO"]), scopeUserId ? eq(t.tasks.assigneeId, scopeUserId) : undefined), columns: { id: true, dueAt: true, assigneeId: true, leadId: true, source: true } }),
    db.select({ userId: t.interactions.userId, type: t.interactions.type, createdAt: t.interactions.createdAt, leadId: t.interactions.leadId }).from(t.interactions).where(and(gte(t.interactions.createdAt, subDays(startOfDay(now), 60)), ne(t.interactions.type, "sistema"), scopeUserId ? eq(t.interactions.userId, scopeUserId) : undefined)),
    getSetting<{ monthly: number }>("goals", { monthly: 0 }),
    db.select({ c: sql<number>`count(*)::int` }).from(t.leads).where(and(eq(t.leads.archived, false), gte(t.leads.lostAt, from), lte(t.leads.lostAt, to), leadScope)),
  ]);

  const stageMaxDays = (stageId: string) => R.stageMaxDaysByStage[stageId] ?? R.stageMaxDays;
  const isProposal = (l: { stageId: string }) => l.stageId === settings.stageMap.proposal;
  const isNegotiation = (l: { stageId: string }) => l.stageId === settings.stageMap.negotiation || isProposal(l);
  const isNew = (l: { stageId: string }) => l.stageId === defaultStage?.id;
  const humanInteractions = (l: { interactions: { type: string }[] }) => l.interactions.filter((i) => i.type !== "sistema").length;

  // ───────────── Fiscalização (regras) ─────────────
  const findings: Finding[] = [];
  const push = (f: Finding) => findings.push(f);
  const sevByValue = (v: number, base: Severity): Severity => (v >= 20000 && base !== "CRITICO" ? (base === "ALTO" ? "CRITICO" : "ALTO") : base);

  for (const l of openLeads) {
    const val = num(l.value);
    const ageH = differenceInHours(now, l.enteredAt);
    const stageDays = differenceInDays(now, l.stageEnteredAt);
    const lastH = l.lastContactAt ? differenceInHours(now, l.lastContactAt) : null;
    const futureAppt = l.appointments.some((a) => a.status === "AGENDADO" && a.startAt > now);
    // REGRA 6 — responsabilidade
    if (!l.ownerId || !l.owner?.active) push({ kind: "IRREGULARIDADE", ruleKey: "RESPONSAVEL", severity: "ALTO", title: `Lead sem vendedor responsável: ${l.name}`, detail: `${l.name}${l.company ? ` (${l.company})` : ""} está em "${stageById.get(l.stageId)?.name}" sem responsável ativo.`, recommendation: "Atribuir um vendedor responsável imediatamente.", dedupeKey: `RESPONSAVEL:${l.id}`, leadId: l.id, data: { value: val } });
    // REGRA 1 — primeiro contato
    if (!l.lastContactAt && humanInteractions(l) === 0 && ageH >= R.firstContactHours) push({ kind: "IRREGULARIDADE", ruleKey: "PRIMEIRO_CONTATO", severity: sevByValue(val, ageH >= R.firstContactHours * 12 ? "ALTO" : "MEDIO"), title: `Lead sem primeiro contato há ${ageH < 48 ? `${ageH}h` : `${Math.floor(ageH / 24)} dias`}: ${l.name}`, detail: `Entrou em ${l.enteredAt.toLocaleDateString("pt-BR")} e não há nenhum contato registrado. Limite configurado: ${R.firstContactHours}h.`, recommendation: "Realizar a primeira tentativa de contato e registrar no histórico do lead.", dedupeKey: `PRIMEIRO_CONTATO:${l.id}`, leadId: l.id, userId: l.ownerId, data: { value: val, hours: ageH } });
    // Sem histórico (já teve contato por mudança de etapa, mas nada registrado)
    else if (humanInteractions(l) === 0 && !isNew(l) && stageDays >= 1) push({ kind: "ALERTA", ruleKey: "SEM_HISTORICO", severity: "BAIXO", title: `Lead sem histórico de atendimento: ${l.name}`, detail: `Está em "${stageById.get(l.stageId)?.name}" mas nenhuma interação (ligação, WhatsApp, e-mail, nota) foi registrada.`, recommendation: "Registrar o histórico de atendimento para rastreabilidade.", dedupeKey: `SEM_HISTORICO:${l.id}`, leadId: l.id, userId: l.ownerId });
    // REGRA 2 — follow-up (lead fora de "novo" precisa de próxima atividade)
    if (!isNew(l) && !l.nextActivityAt && !futureAppt && stageDays >= R.followUpMaxDays) push({ kind: "IRREGULARIDADE", ruleKey: "FOLLOW_UP", severity: sevByValue(val, isNegotiation(l) ? "ALTO" : "MEDIO"), title: `Lead sem próxima atividade: ${l.name}`, detail: `Em "${stageById.get(l.stageId)?.name}" há ${stageDays} dias sem próxima atividade agendada nem justificativa registrada.`, recommendation: "Agendar o próximo passo (ligação, reunião ou follow-up) ou registrar justificativa.", dedupeKey: `FOLLOW_UP:${l.id}`, leadId: l.id, userId: l.ownerId, data: { value: val } });
    if (l.nextActivityAt && l.nextActivityAt < now) { const lateH = differenceInHours(now, l.nextActivityAt); push({ kind: "IRREGULARIDADE", ruleKey: "FOLLOW_UP_ATRASADO", severity: sevByValue(val, lateH >= 72 ? "ALTO" : "MEDIO"), title: `Follow-up atrasado ${lateH < 1 ? "há menos de 1h" : lateH < 48 ? `há ${lateH}h` : `há ${Math.floor(lateH / 24)} dias`}: ${l.name}`, detail: `Atividade prevista para ${l.nextActivityAt.toLocaleString("pt-BR")} não foi realizada.`, recommendation: "Executar o follow-up hoje e reagendar a próxima atividade.", dedupeKey: `FOLLOW_UP_ATRASADO:${l.id}`, leadId: l.id, userId: l.ownerId, data: { value: val, hours: lateH } }); }
    // REGRA 3 — lead parado na etapa
    if (stageDays > stageMaxDays(l.stageId)) push({ kind: "IRREGULARIDADE", ruleKey: "LEAD_PARADO", severity: sevByValue(val, stageDays > stageMaxDays(l.stageId) * 2 ? "ALTO" : "MEDIO"), title: `Lead parado há ${stageDays} dias em "${stageById.get(l.stageId)?.name}": ${l.name}`, detail: `Limite da etapa: ${stageMaxDays(l.stageId)} dias.`, recommendation: "Avançar o lead, reativar a negociação ou marcar como perdido com motivo.", dedupeKey: `LEAD_PARADO:${l.id}`, leadId: l.id, userId: l.ownerId, data: { value: val, days: stageDays } });
    // Sem movimentação
    if (lastH !== null && lastH >= R.stalledLeadDays * 24 && !isNew(l)) push({ kind: "ALERTA", ruleKey: "SEM_MOVIMENTACAO", severity: sevByValue(val, "MEDIO"), title: `Sem movimentação há ${Math.floor(lastH / 24)} dias: ${l.name}`, detail: `Último contato em ${l.lastContactAt?.toLocaleDateString("pt-BR")}.`, recommendation: "Retomar contato e atualizar a situação do lead.", dedupeKey: `SEM_MOVIMENTACAO:${l.id}`, leadId: l.id, userId: l.ownerId, data: { value: val } });
    // REGRA 5 — proposta sem acompanhamento
    if (isProposal(l) && stageDays >= R.proposalMaxDays && (lastH === null || lastH >= R.proposalMaxDays * 24)) push({ kind: "IRREGULARIDADE", ruleKey: "PROPOSTA", severity: sevByValue(val, "ALTO"), title: `Proposta sem retorno há ${stageDays} dias: ${l.name}`, detail: `Proposta de ${brl(val)} enviada e sem acompanhamento registrado nos últimos ${R.proposalMaxDays} dias.`, recommendation: "Fazer follow-up da proposta, tratar objeções e definir prazo de decisão.", dedupeKey: `PROPOSTA:${l.id}`, leadId: l.id, userId: l.ownerId, data: { value: val } });
    // Risco de perda (oportunidade relevante em negociação com sinal de abandono)
    if (isNegotiation(l) && val >= R.riskValueMin && (stageDays > stageMaxDays(l.stageId) || (l.nextActivityAt && l.nextActivityAt < subDays(now, 2)) || (lastH !== null && lastH >= R.stalledLeadDays * 24))) push({ kind: "ALERTA", ruleKey: "RISCO_PERDA", severity: val >= 20000 ? "CRITICO" : "ALTO", title: `Oportunidade em risco (${brl(val)}): ${l.name}`, detail: `Em "${stageById.get(l.stageId)?.name}" há ${stageDays} dias; sinais de abandono na negociação.`, recommendation: "Priorizar contato hoje; envolver o gestor se necessário.", dedupeKey: `RISCO_PERDA:${l.id}`, leadId: l.id, userId: l.ownerId, data: { value: val, days: stageDays } });
  }
  // REGRA 4 — reuniões sem confirmação
  const upcoming = appts.filter((a) => a.status === "AGENDADO" && a.startAt > now && a.startAt <= addHours(now, R.meetingConfirmHours) && !a.confirmedAt && (a.type?.isCommercial || a.leadId));
  for (const a of upcoming) push({ kind: "IRREGULARIDADE", ruleKey: "REUNIAO", severity: differenceInHours(a.startAt, now) <= 4 ? "ALTO" : "MEDIO", title: `Reunião sem confirmação: ${a.title}`, detail: `${a.startAt.toLocaleString("pt-BR")}${a.lead ? ` · ${a.lead.name}` : ""} — ainda não confirmada.`, recommendation: "Confirmar presença com o lead/cliente e registrar a confirmação.", dedupeKey: `REUNIAO:${a.id}`, appointmentId: a.id, leadId: a.leadId, userId: a.ownerId });

  // Vendedores sem atividade registrada
  const todayStart = startOfDay(now);
  const since = subDays(todayStart, R.sellerInactivityDays);
  const sellerIds = sellers.map((s) => s.id);
  const recentActivityBySeller = new Map<string, number>();
  interactions90.filter((i) => i.createdAt >= since).forEach((i) => i.userId && recentActivityBySeller.set(i.userId, (recentActivityBySeller.get(i.userId) ?? 0) + 1));
  appts.filter((a) => a.status === "REALIZADO" && a.startAt >= since).forEach((a) => a.ownerId && recentActivityBySeller.set(a.ownerId, (recentActivityBySeller.get(a.ownerId) ?? 0) + 1));
  for (const s of sellers.filter((s) => s.role === "COMERCIAL")) {
    if (!recentActivityBySeller.get(s.id) && differenceInBusinessDays(now, since) >= 1) push({ kind: "ALERTA", ruleKey: "VENDEDOR_INATIVO", severity: "MEDIO", title: `${s.name} sem atividades registradas`, detail: `Nenhuma interação ou reunião registrada desde ${since.toLocaleDateString("pt-BR")}.`, recommendation: "Verificar a agenda do vendedor e cobrar o registro das atividades no CRM.", dedupeKey: `VENDEDOR_INATIVO:${s.id}:${todayStart.toISOString().slice(0, 10)}`, userId: s.id });
  }

  // ───────────── Desempenho por vendedor ─────────────
  const monthFrom = from, monthTo = to;
  const stageOrder = (id: string) => stageById.get(id)?.order ?? 0;
  const qualOrder = settings.stageMap.qualified ? stageOrder(settings.stageMap.qualified) : 3;
  const sellersPerf: SellerPerf[] = sellers.map((u) => {
    const mine = periodLeads.filter((l) => l.ownerId === u.id);
    const received = mine.filter((l) => l.enteredAt >= monthFrom && l.enteredAt <= monthTo);
    const mineOpen = openLeads.filter((l) => l.ownerId === u.id);
    const won = wonPeriod.filter((l) => l.ownerId === u.id);
    const revenue = won.reduce((s, l) => s + num(l.value), 0);
    const myInter = interactions90.filter((i) => i.userId === u.id && i.createdAt >= monthFrom && i.createdAt <= monthTo);
    const firstResp = received.map((l) => { const f = l.interactions.filter((i) => i.type !== "sistema").map((i) => i.createdAt).sort((a, b) => +a - +b)[0]; return f ? differenceInHours(f, l.enteredAt) : null; }).filter((x): x is number => x !== null);
    const myAppts = appts.filter((a) => a.ownerId === u.id && (a.type?.isCommercial || a.leadId) && a.startAt >= monthFrom && a.startAt <= monthTo);
    const goal = num(u.monthlyGoal) > 0 ? num(u.monthlyGoal) : goalCfg.monthly;
    const lateActivities = mineOpen.filter((l) => l.nextActivityAt && l.nextActivityAt < now).length + tasksOpen.filter((x) => x.assigneeId === u.id && x.dueAt && x.dueAt < now).length;
    const stalled = mineOpen.filter((l) => differenceInDays(now, l.stageEnteredAt) > stageMaxDays(l.stageId)).length;
    const noContact = mineOpen.filter((l) => !l.lastContactAt && humanInteractions(l) === 0).length;
    const conversion = pctOf(won.length, received.length);
    const followUps = myInter.filter((i) => { const l = i.leadId ? periodLeads.find((p) => p.id === i.leadId) ?? openLeads.find((p) => p.id === i.leadId) : null; return l ? !isNew(l) : false; }).length;
    const proposals = mineOpen.filter((l) => isNegotiation(l)).length + won.length;
    const qualified = received.filter((l) => stageOrder(l.stageId) >= qualOrder || l.wonAt).length;
    const flags: string[] = [];
    const goalPct = pctOf(revenue, goal);
    const dayPct = (getDate(now) / getDaysInMonth(now)) * 100;
    if (goal > 0 && goalPct < dayPct * 0.7) flags.push("abaixo da meta");
    if (stalled >= 3 || (mineOpen.length && stalled / mineOpen.length > 0.4)) flags.push("muitos leads parados");
    if (received.length >= 5 && conversion < settings.health.conversionGoalPct / 2) flags.push("baixa conversão");
    if (lateActivities >= 3) flags.push("atividades atrasadas");
    if (noContact >= 2) flags.push("leads sem contato");
    if (firstResp.length && firstResp.reduce((a, b) => a + b, 0) / firstResp.length > R.firstContactHours * 2) flags.push("lento no primeiro contato");
    if (myAppts.filter((a) => a.status === "AGENDADO" && a.startAt < now).length + myAppts.filter((a) => a.status === "NAO_COMPARECEU").length >= 2) flags.push("reuniões sem desfecho");
    const productivityScore = clamp((Math.min(1, myInter.length / Math.max(1, settings.goals.dailyContacts * Math.max(1, differenceInBusinessDays(now, monthFrom)))) * 50) + (Math.min(1, myAppts.filter((a) => a.status === "REALIZADO").length / Math.max(1, received.length * 0.4)) * 30) + (lateActivities === 0 ? 20 : clamp(20 - lateActivities * 4)));
    const resultScore = clamp((Math.min(1, goal ? revenue / goal : 0) * 60) + (Math.min(1, conversion / Math.max(1, settings.health.conversionGoalPct)) * 40));
    return { id: u.id, name: u.name, avatarUrl: u.avatarUrl, role: u.role, leadsReceived: received.length, openLeads: mineOpen.length, contacts: myInter.length, avgFirstResponseHours: firstResp.length ? Math.round((firstResp.reduce((a, b) => a + b, 0) / firstResp.length) * 10) / 10 : null, qualified, meetingsScheduled: myAppts.filter((a) => a.status === "AGENDADO").length, meetingsDone: myAppts.filter((a) => a.status === "REALIZADO").length, proposals, sales: won.length, revenue, ticket: won.length ? revenue / won.length : 0, conversion, followUps, lateActivities, stalledLeads: stalled, noContactLeads: noContact, goal, goalPct, productivityScore: Math.round(productivityScore), resultScore: Math.round(resultScore), score: Math.round(productivityScore * 0.4 + resultScore * 0.6), position: 0, flags };
  }).filter((s) => s.role !== "ADMIN" || s.leadsReceived || s.sales || s.openLeads || s.contacts);
  sellersPerf.sort((a, b) => b.score - a.score || b.revenue - a.revenue).forEach((s, i) => (s.position = i + 1));

  // ───────────── KPIs ─────────────
  const won = wonPeriod;
  const revenue = won.reduce((s, l) => s + num(l.value), 0);
  const goal = scopeUserId ? (sellersPerf[0]?.goal ?? goalCfg.monthly) : goalCfg.monthly;
  const periodReceived = periodLeads.filter((l) => l.enteredAt >= from && l.enteredAt <= to);
  const contactsToday = interactions90.filter((i) => i.createdAt >= todayStart).length;
  const commercialAppts = appts.filter((a) => (a.type?.isCommercial || a.leadId) && a.startAt >= from && a.startAt <= to);
  const kpis: Snapshot["kpis"] = {
    activeLeads: openLeads.length,
    newLeads: openLeads.filter((l) => isNew(l)).length,
    noFirstContact: findings.filter((f) => f.ruleKey === "PRIMEIRO_CONTATO").length,
    stalledLeads: findings.filter((f) => f.ruleKey === "LEAD_PARADO" || f.ruleKey === "SEM_MOVIMENTACAO").map((f) => f.leadId).filter((v, i, a) => a.indexOf(v) === i).length,
    lateFollowUps: findings.filter((f) => f.ruleKey === "FOLLOW_UP_ATRASADO").length,
    noNextActivity: findings.filter((f) => f.ruleKey === "FOLLOW_UP").length,
    pendingTasks: tasksOpen.length, lateTasks: tasksOpen.filter((x) => x.dueAt && x.dueAt < now).length,
    meetingsScheduled: commercialAppts.filter((a) => a.status === "AGENDADO").length, meetingsDone: commercialAppts.filter((a) => a.status === "REALIZADO").length, meetingsUnconfirmed: upcoming.length,
    proposals: openLeads.filter((l) => isNegotiation(l)).length, proposalsNoFollowUp: findings.filter((f) => f.ruleKey === "PROPOSTA").length,
    sales: won.length, revenue, goal, goalPct: pctOf(revenue, goal), remaining: Math.max(0, goal - revenue),
    conversion: pctOf(won.length, periodReceived.length),
    productivity: sellersPerf.length ? Math.round(sellersPerf.reduce((s, x) => s + x.productivityScore, 0) / sellersPerf.length) : 0,
    contactsToday, sellersActive: sellers.filter((s) => s.role === "COMERCIAL").length, sellersInactive: findings.filter((f) => f.ruleKey === "VENDEDOR_INATIVO").length,
    unassignedLeads: findings.filter((f) => f.ruleKey === "RESPONSAVEL").length,
  };

  // ───────────── Índice de Saúde Comercial (regras transparentes) ─────────────
  const activeNonNew = openLeads.filter((l) => !isNew(l));
  const recentNew = periodLeads.filter((l) => l.enteredAt >= subDays(now, 14));
  const answeredInTime = recentNew.filter((l) => { const f = l.interactions.filter((i) => i.type !== "sistema").map((i) => i.createdAt).sort((a, b) => +a - +b)[0]; return f ? differenceInHours(f, l.enteredAt) <= R.firstContactHours : differenceInHours(now, l.enteredAt) <= R.firstContactHours; }).length;
  const dueActivities = openLeads.filter((l) => l.nextActivityAt && l.nextActivityAt < now).length + tasksOpen.filter((x) => x.dueAt && x.dueAt < now).length;
  const doneActivities = interactions90.filter((i) => i.createdAt >= subDays(now, 7)).length;
  const dayPct = (getDate(now) / getDaysInMonth(now)) * 100;
  const crit: Record<HealthCriterionKey, { score: number; detail: string }> = {
    atividades: { score: clamp(pctOf(doneActivities, doneActivities + dueActivities)), detail: `${doneActivities} atividades registradas nos últimos 7 dias · ${dueActivities} atrasadas` },
    velocidade: { score: recentNew.length ? clamp(pctOf(answeredInTime, recentNew.length)) : 100, detail: `${answeredInTime} de ${recentNew.length} leads (14 dias) atendidos em até ${R.firstContactHours}h` },
    semContato: { score: openLeads.length ? clamp(100 - pctOf(kpis.noFirstContact, openLeads.length) * 2) : 100, detail: `${kpis.noFirstContact} de ${openLeads.length} leads ativos sem contato` },
    followUps: { score: activeNonNew.length ? clamp(pctOf(activeNonNew.filter((l) => (l.nextActivityAt && l.nextActivityAt >= now) || l.appointments.some((a) => a.status === "AGENDADO" && a.startAt > now)).length, activeNonNew.length)) : 100, detail: `${activeNonNew.filter((l) => (l.nextActivityAt && l.nextActivityAt >= now)).length} de ${activeNonNew.length} leads em atendimento com próxima atividade em dia` },
    evolucao: { score: openLeads.length ? clamp(100 - pctOf(openLeads.filter((l) => differenceInDays(now, l.stageEnteredAt) > stageMaxDays(l.stageId)).length, openLeads.length)) : 100, detail: `${openLeads.filter((l) => differenceInDays(now, l.stageEnteredAt) > stageMaxDays(l.stageId)).length} de ${openLeads.length} leads acima do tempo máximo da etapa` },
    metas: { score: goal ? clamp((kpis.goalPct / Math.max(1, dayPct)) * 100) : 100, detail: `${kpis.goalPct.toFixed(0)}% da meta realizada com ${dayPct.toFixed(0)}% do mês decorrido` },
    conversao: { score: periodReceived.length >= 3 ? clamp((kpis.conversion / Math.max(1, settings.health.conversionGoalPct)) * 100) : 100, detail: `Conversão de ${kpis.conversion.toFixed(1)}% (meta ${settings.health.conversionGoalPct}%) sobre ${periodReceived.length} leads` },
  };
  const totalW = HEALTH_CRITERIA.reduce((s, c) => s + (settings.health.weights[c.key] ?? 0), 0) || 1;
  const criteria: HealthCriterion[] = HEALTH_CRITERIA.map((c) => ({ key: c.key, label: c.label, weight: settings.health.weights[c.key] ?? 0, score: Math.round(crit[c.key].score), detail: crit[c.key].detail }));
  const healthScore = Math.round(criteria.reduce((s, c) => s + (c.score * c.weight) / totalW, 0));
  const health: Health = { score: healthScore, state: healthScore >= settings.health.greenFrom ? "VERDE" : healthScore >= settings.health.yellowFrom ? "AMARELO" : "VERMELHO", criteria };

  // ───────────── Funil e gargalos (últimos 90 dias) ─────────────
  const base = periodLeads; // entraram nos últimos 90 dias
  const funnelStages = stages.filter((s) => !s.isLost);
  const reachedCount = (st: typeof stages[number]) => base.filter((l) => l.wonAt || stageOrder(l.stageId) >= st.order || (l.lostAt && stageOrder(l.stageId) >= st.order)).length;
  const funnel = funnelStages.map((s, i) => { const reached = i === 0 ? base.length : reachedCount(s); const prev = i === 0 ? null : (funnelStages[i - 1] ? (i - 1 === 0 ? base.length : reachedCount(funnelStages[i - 1])) : null); return { stage: s.name, color: s.color, reached, current: base.filter((l) => l.stageId === s.id).length, conversionFromPrev: prev ? pctOf(reached, prev) : null }; });
  const bottlenecks: Bottleneck[] = [];
  const stepDrop = funnel.slice(1).map((f, i) => ({ ...f, prev: funnel[i], drop: f.conversionFromPrev ?? 100 })).filter((f) => f.prev.reached >= 5);
  const worst = [...stepDrop].sort((a, b) => a.drop - b.drop)[0];
  const avgResp = sellersPerf.map((s) => s.avgFirstResponseHours).filter((x): x is number => x !== null);
  const avgRespAll = avgResp.length ? avgResp.reduce((a, b) => a + b, 0) / avgResp.length : null;
  if (base.length < 5) bottlenecks.push({ key: "DADOS_INSUFICIENTES", title: "Dados insuficientes para diagnóstico de funil", problem: `Apenas ${base.length} leads entraram nos últimos 90 dias.`, facts: [`${base.length} leads no período.`], hypotheses: [], recommendations: ["Cadastrar todos os leads no CRM e registrar as interações para que o SALES COP consiga investigar o funil."], severity: "BAIXO", needsData: "Volume mínimo de 5 leads com histórico." });
  if (worst && worst.drop < 40) {
    const msIdx = settings.stageMap.meetingScheduled ? stageById.get(settings.stageMap.meetingScheduled)?.name : undefined;
    const isEarly = stageOrder(stages.find((s) => s.name === worst.stage)?.id ?? "") <= (settings.stageMap.meetingScheduled ? stageOrder(settings.stageMap.meetingScheduled) : 4);
    bottlenecks.push({
      key: `FUNIL:${worst.stage}`, title: `Queda acentuada em "${worst.prev.stage}" → "${worst.stage}"`, severity: worst.drop < 20 ? "ALTO" : "MEDIO",
      problem: `De ${worst.prev.reached} leads que chegaram em "${worst.prev.stage}", apenas ${worst.reached} (${worst.drop.toFixed(0)}%) avançaram para "${worst.stage}".`,
      facts: [`Conversão da etapa: ${worst.drop.toFixed(0)}% (últimos 90 dias).`, avgRespAll !== null ? `Tempo médio de primeiro contato: ${avgRespAll.toFixed(1)}h (limite ${R.firstContactHours}h).` : "Sem dados de tempo de primeiro contato (interações não registradas).", `${kpis.noFirstContact} leads ativos sem primeiro contato.`],
      hypotheses: isEarly ? ["Possível falha na velocidade de atendimento.", "Possível falha na abordagem ou no script de primeiro contato.", "Possível falha na qualificação dos leads (origem com baixa aderência)."] : ["Possível falha na apresentação de valor.", "Possível falha no tratamento de objeções.", "Possível falha no acompanhamento (follow-up) após a reunião/proposta."],
      recommendations: isEarly ? ["Analisar os primeiros contatos registrados.", "Verificar o tempo de resposta por vendedor.", "Revisar o script de abordagem.", "Avaliar a qualidade das perguntas de qualificação.", `Treinar os vendedores com menor conversão${msIdx ? ` até "${msIdx}"` : ""}.`] : ["Criar rotina de follow-up estruturado após proposta.", "Revisar as objeções mais frequentes nos motivos de perda.", "Definir prazo de decisão em toda proposta enviada.", "Acompanhar as negociações de maior valor com o gestor."],
    });
  }
  if (avgRespAll !== null && avgRespAll > R.firstContactHours) bottlenecks.push({ key: "VELOCIDADE", title: "Primeiro contato acima do limite", severity: avgRespAll > R.firstContactHours * 3 ? "ALTO" : "MEDIO", problem: `Tempo médio de primeiro contato de ${avgRespAll.toFixed(1)}h contra o limite de ${R.firstContactHours}h.`, facts: sellersPerf.filter((s) => s.avgFirstResponseHours !== null).map((s) => `${first(s.name)}: ${s.avgFirstResponseHours}h`), hypotheses: ["Leads chegando fora do horário comercial sem fila de atendimento.", "Vendedores sem alerta de novos leads.", "Sobrecarga de leads por vendedor."], recommendations: ["Definir SLA de primeiro contato e acompanhar diariamente.", "Redistribuir leads entre vendedores com capacidade.", "Ativar os alertas do SALES COP por WhatsApp para novos leads."] });
  const noShows = appts.filter((a) => a.status === "NAO_COMPARECEU").length, doneM = appts.filter((a) => a.status === "REALIZADO").length;
  if (noShows + doneM >= 5 && pctOf(noShows, noShows + doneM) > 30) bottlenecks.push({ key: "NO_SHOW", title: "Alto índice de não comparecimento em reuniões", severity: "MEDIO", problem: `${noShows} de ${noShows + doneM} reuniões (${pctOf(noShows, noShows + doneM).toFixed(0)}%) terminaram em não comparecimento.`, facts: [`${kpis.meetingsUnconfirmed} reuniões próximas ainda sem confirmação.`], hypotheses: ["Reuniões não confirmadas na véspera.", "Agendamento sem compromisso claro do lead."], recommendations: ["Confirmar toda reunião com antecedência (regra 4).", "Enviar lembrete e pauta antes da reunião."] });
  const lostCount = lostPeriod[0]?.c ?? 0;
  if (lostCount >= 3 && won.length && lostCount > won.length * 2) bottlenecks.push({ key: "PERDAS", title: "Perdas muito acima das vendas", severity: "MEDIO", problem: `${lostCount} leads perdidos contra ${won.length} vendas no período.`, facts: [`Conversão de ${kpis.conversion.toFixed(1)}%.`], hypotheses: ["Qualificação frouxa deixando leads sem perfil avançarem.", "Preço/valor mal apresentados."], recommendations: ["Analisar os motivos de perda no relatório 'Motivos de perda'.", "Ajustar os critérios de qualificação."] });

  // ───────────── Relatório de inteligência ─────────────
  const sev = (s: Severity) => ({ CRITICO: 0, ALTO: 1, MEDIO: 2, BAIXO: 3 }[s]);
  findings.sort((a, b) => sev(a.severity) - sev(b.severity) || num(b.data?.value) - num(a.data?.value));
  const working: string[] = [], wrong: string[] = [];
  if (health.criteria.find((c) => c.key === "velocidade")!.score >= 80 && recentNew.length) working.push(`Velocidade de atendimento em dia (${crit.velocidade.detail}).`);
  if (kpis.goalPct >= dayPct) working.push(`Meta no ritmo: ${kpis.goalPct.toFixed(0)}% realizada com ${dayPct.toFixed(0)}% do mês.`);
  if (kpis.conversion >= settings.health.conversionGoalPct && periodReceived.length >= 3) working.push(`Conversão de ${kpis.conversion.toFixed(1)}% acima da meta de ${settings.health.conversionGoalPct}%.`);
  if (kpis.meetingsDone > 0) working.push(`${kpis.meetingsDone} reuniões comerciais realizadas no período.`);
  if (kpis.lateFollowUps === 0 && kpis.noNextActivity === 0 && activeNonNew.length) working.push("Nenhum follow-up atrasado — todos os leads em atendimento têm próxima atividade.");
  if (contactsToday) working.push(`${contactsToday} contatos já registrados hoje.`);
  if (kpis.noFirstContact) wrong.push(`${kpis.noFirstContact} leads sem primeiro contato (limite ${R.firstContactHours}h).`);
  if (kpis.lateFollowUps) wrong.push(`${kpis.lateFollowUps} follow-ups atrasados.`);
  if (kpis.noNextActivity) wrong.push(`${kpis.noNextActivity} leads em atendimento sem próxima atividade.`);
  if (kpis.stalledLeads) wrong.push(`${kpis.stalledLeads} leads parados ou sem movimentação.`);
  if (kpis.proposalsNoFollowUp) wrong.push(`${kpis.proposalsNoFollowUp} propostas sem acompanhamento.`);
  if (kpis.meetingsUnconfirmed) wrong.push(`${kpis.meetingsUnconfirmed} reuniões próximas sem confirmação.`);
  if (kpis.unassignedLeads) wrong.push(`${kpis.unassignedLeads} leads sem vendedor responsável.`);
  if (goal && kpis.goalPct < dayPct * 0.7) wrong.push(`Meta atrasada: ${kpis.goalPct.toFixed(0)}% realizada com ${dayPct.toFixed(0)}% do mês (faltam ${brl(kpis.remaining)}).`);
  if (kpis.sellersInactive) wrong.push(`${kpis.sellersInactive} vendedor(es) sem atividades registradas.`);
  const sellersAttention = sellersPerf.filter((s) => s.flags.length).map((s) => `${s.name}: ${s.flags.join(", ")}.`);
  const riskOpportunities = findings.filter((f) => f.ruleKey === "RISCO_PERDA" || f.ruleKey === "PROPOSTA").slice(0, 8).map((f) => f.title);
  const bottleneckLines = bottlenecks.filter((b) => b.key !== "DADOS_INSUFICIENTES").map((b) => `${b.title}: ${b.problem}`);
  const immediateActions: string[] = [];
  if (kpis.unassignedLeads) immediateActions.push(`Atribuir responsável a ${kpis.unassignedLeads} lead(s).`);
  if (kpis.noFirstContact) immediateActions.push(`Recuperar ${kpis.noFirstContact} leads sem primeiro contato.`);
  if (kpis.meetingsUnconfirmed) immediateActions.push(`Confirmar ${kpis.meetingsUnconfirmed} reunião(ões) das próximas ${R.meetingConfirmHours}h.`);
  if (kpis.lateFollowUps) immediateActions.push(`Executar ${kpis.lateFollowUps} follow-ups atrasados.`);
  if (kpis.proposalsNoFollowUp) immediateActions.push(`Cobrar retorno de ${kpis.proposalsNoFollowUp} proposta(s).`);
  if (riskOpportunities.length) immediateActions.push(`Priorizar ${riskOpportunities.length} oportunidade(s) em risco.`);
  if (kpis.stalledLeads) immediateActions.push(`Reativar ou encerrar ${kpis.stalledLeads} leads parados.`);

  return {
    generatedAt: now.toISOString(), period: { from: from.toISOString(), to: to.toISOString() }, scopeUserId,
    kpis, health, findings, sellers: sellersPerf, bottlenecks, funnel,
    intelligence: { working, wrong, sellersAttention, riskOpportunities, bottlenecks: bottleneckLines, immediateActions },
    settings,
  };
}

/** Persiste as irregularidades detectadas (upsert por dedupeKey) e resolve automaticamente as que sumiram. */
export async function syncFindings(findings: Finding[]) {
  const keys = findings.map((f) => f.dedupeKey);
  const now = new Date();
  for (const f of findings) {
    await db.insert(t.aiFindings).values({ kind: f.kind, ruleKey: f.ruleKey, severity: f.severity, title: f.title, detail: f.detail, recommendation: f.recommendation, dedupeKey: f.dedupeKey, leadId: f.leadId ?? null, clientId: f.clientId ?? null, appointmentId: f.appointmentId ?? null, userId: f.userId ?? null, data: f.data ?? null, lastSeenAt: now })
      .onConflictDoUpdate({ target: t.aiFindings.dedupeKey, set: { severity: f.severity, title: f.title, detail: f.detail, recommendation: f.recommendation, userId: f.userId ?? null, data: f.data ?? null, lastSeenAt: now } });
  }
  // irregularidades abertas que não foram vistas nesta rodada → resolvidas (a situação foi regularizada)
  const open = await db.select({ id: t.aiFindings.id, dedupeKey: t.aiFindings.dedupeKey }).from(t.aiFindings).where(eq(t.aiFindings.status, "ABERTO"));
  const gone = open.filter((o) => !keys.includes(o.dedupeKey)).map((o) => o.id);
  if (gone.length) await db.update(t.aiFindings).set({ status: "RESOLVIDO", resolvedAt: now }).where(inArray(t.aiFindings.id, gone));
  return { upserted: findings.length, resolved: gone.length };
}

export async function openFindings(scopeUserId?: string | null) {
  return db.query.aiFindings.findMany({ where: and(eq(t.aiFindings.status, "ABERTO"), scopeUserId ? eq(t.aiFindings.userId, scopeUserId) : undefined), orderBy: [asc(t.aiFindings.severity), asc(t.aiFindings.createdAt)], with: { lead: { columns: { id: true, name: true, company: true, value: true } }, user: { columns: { id: true, name: true } }, appointment: { columns: { id: true, title: true, startAt: true } } } });
}
export { isNull };
