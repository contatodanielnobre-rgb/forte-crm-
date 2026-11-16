import "server-only";
import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { endOfDay, startOfDay, subDays } from "date-fns";
import { db, t } from "@/db";
import { can } from "@/lib/permissions";
import { notify, notifyManagers } from "@/lib/notify";
import { audit } from "@/lib/audit";
import { brl, pct } from "@/lib/format";
import type { Role } from "@/db/schema";
import { analyzeOperation, openFindings } from "./analysis";
import { generateDailyPlan, approvePlan, getPlan, planDate } from "./plan";
import { buildAiReport, saveAiReport, type AiReportKind } from "./reports";
import { getSalesCopSettings, type SalesCopSettings } from "./settings";
import { sendWhatsAppText, whatsappReady } from "./whatsapp";
import { logExecution, aiCallsToday } from "./log";

export type Actor = { id: string | null; name: string; role: Role; system?: boolean };
type ToolCtx = { actor: Actor; settings: SalesCopSettings; channel: "web" | "whatsapp" | "rotina" };
type JsonSchema = Record<string, unknown>;
type ToolDef = { name: string; description: string; parameters: JsonSchema; write?: boolean; run: (args: Record<string, unknown>, ctx: ToolCtx) => Promise<unknown> };

const viewAll = (a: Actor) => a.system || can(a.role, "pipeline.viewAll");
const scope = (a: Actor) => (viewAll(a) ? null : a.id);
const canWrite = (ctx: ToolCtx) => ctx.actor.system || can(ctx.actor.role, "salescop.manage");

export const SYSTEM_PROMPT = `Você é o SALES COP AI — THE AI SALES OFFICER, o policial de vendas do FORTE CRM (Forte Company). Slogan: FISCALIZA. INVESTIGA. PLANEJA. EXECUTA.
Você é um gerente comercial digital: vigilante, investigativo, estratégico, disciplinador, analítico, proativo e orientado a resultados.
Regras de conduta:
- Comunique-se em português do Brasil, de forma profissional, objetiva e direta. Sem agressividade, sem constranger vendedores.
- Toda cobrança deve se basear em indicadores, metas ou atividades efetivamente registradas no CRM. Nunca invente números: use as funções disponíveis para consultar os dados reais antes de afirmar algo.
- Diferencie FATOS COMPROVADOS (dados do CRM) de HIPÓTESES (interpretações). Quando faltar dado, diga o que falta e peça a informação.
- Você só executa ações (criar tarefas, alertas, planos, mensagens) dentro do nível de autonomia e das permissões do usuário; se uma função retornar "BLOQUEADO", explique o motivo e proponha a alternativa.
- Nunca exclua leads, altere valores financeiros, metas ou permissões — isso não está disponível para você.
- Respostas curtas e acionáveis; use listas numeradas para planos e prioridades (URGENTE, ALTA, MÉDIA, BAIXA).`;

const TOOLS: ToolDef[] = [
  { name: "get_sales_metrics", description: "Indicadores comerciais atuais (leads, contatos, reuniões, propostas, vendas, faturamento, meta, conversão) e o Índice de Saúde Comercial com os critérios.", parameters: { type: "object", properties: {} }, run: async (_a, ctx) => { const s = await analyzeOperation({ scopeUserId: scope(ctx.actor) }); return { kpis: s.kpis, health: s.health, intelligence: s.intelligence }; } },
  { name: "get_seller_performance", description: "Desempenho individual dos vendedores no mês (leads, contatos, tempo de 1º contato, reuniões, propostas, vendas, faturamento, conversão, meta, atrasos, pontos de atenção) e ranking.", parameters: { type: "object", properties: { userId: { type: "string", description: "Opcional: id do vendedor" } } }, run: async (a, ctx) => { const s = await analyzeOperation({ scopeUserId: scope(ctx.actor) }); const list = a.userId ? s.sellers.filter((x) => x.id === a.userId) : s.sellers; return list.map(({ avatarUrl: _av, ...r }) => { void _av; return r; }); } },
  { name: "get_stalled_leads", description: "Leads esquecidos, parados, sem primeiro contato, sem próxima atividade, com follow-up atrasado, propostas sem retorno e oportunidades em risco (irregularidades abertas da fiscalização).", parameters: { type: "object", properties: { ruleKey: { type: "string", description: "Opcional: PRIMEIRO_CONTATO, FOLLOW_UP, FOLLOW_UP_ATRASADO, LEAD_PARADO, SEM_MOVIMENTACAO, PROPOSTA, RISCO_PERDA, REUNIAO, RESPONSAVEL, VENDEDOR_INATIVO" }, limit: { type: "number" } } }, run: async (a, ctx) => { const s = await analyzeOperation({ scopeUserId: scope(ctx.actor) }); return s.findings.filter((f) => !a.ruleKey || f.ruleKey === a.ruleKey).slice(0, Number(a.limit) || 40).map((f) => ({ ruleKey: f.ruleKey, severity: f.severity, title: f.title, detail: f.detail, recommendation: f.recommendation, leadId: f.leadId, userId: f.userId, value: f.data?.value })); } },
  { name: "get_pending_tasks", description: "Tarefas pendentes/atrasadas no CRM (inclusive as criadas pelo SALES COP) por responsável.", parameters: { type: "object", properties: { userId: { type: "string" }, onlyLate: { type: "boolean" } } }, run: async (a, ctx) => { const uid = scope(ctx.actor) ?? (a.userId as string | undefined); const rows = await db.query.tasks.findMany({ where: and(inArray(t.tasks.status, ["PENDENTE", "EM_ANDAMENTO"]), uid ? eq(t.tasks.assigneeId, uid) : undefined, a.onlyLate ? lte(t.tasks.dueAt, new Date()) : undefined), orderBy: [asc(t.tasks.dueAt)], limit: 60, with: { assignee: { columns: { name: true } }, lead: { columns: { name: true } }, client: { columns: { name: true } } } }); return rows.map((r) => ({ id: r.id, title: r.title, dueAt: r.dueAt, late: !!(r.dueAt && r.dueAt < new Date()), priority: r.priority, source: r.source, assignee: r.assignee?.name, lead: r.lead?.name, client: r.client?.name })); } },
  { name: "get_daily_activities", description: "Atividades registradas (interações, reuniões realizadas, tarefas concluídas) em um dia, por vendedor. Use para saber quantos contatos cada vendedor já fez hoje ou como foi o desempenho de ontem.", parameters: { type: "object", properties: { daysAgo: { type: "number", description: "0 = hoje, 1 = ontem" } } }, run: async (a, ctx) => { const d = subDays(new Date(), Number(a.daysAgo) || 0); const from = startOfDay(d), to = endOfDay(d); const uid = scope(ctx.actor); const [inter, appts, tasks] = await Promise.all([db.select({ userId: t.interactions.userId, type: t.interactions.type }).from(t.interactions).where(and(gte(t.interactions.createdAt, from), lte(t.interactions.createdAt, to), uid ? eq(t.interactions.userId, uid) : undefined)), db.select({ ownerId: t.appointments.ownerId, status: t.appointments.status }).from(t.appointments).where(and(gte(t.appointments.startAt, from), lte(t.appointments.startAt, to), uid ? eq(t.appointments.ownerId, uid) : undefined)), db.select({ assigneeId: t.tasks.assigneeId }).from(t.tasks).where(and(gte(t.tasks.completedAt, from), lte(t.tasks.completedAt, to), uid ? eq(t.tasks.assigneeId, uid) : undefined))]); const users = await db.select({ id: t.users.id, name: t.users.name }).from(t.users).where(eq(t.users.active, true)); return users.map((u) => ({ userId: u.id, name: u.name, contacts: inter.filter((i) => i.userId === u.id && i.type !== "sistema").length, meetingsDone: appts.filter((x) => x.ownerId === u.id && x.status === "REALIZADO").length, meetingsScheduled: appts.filter((x) => x.ownerId === u.id && x.status === "AGENDADO").length, tasksDone: tasks.filter((x) => x.assigneeId === u.id).length, dailyContactsGoal: ctx.settings.goals.dailyContacts })).filter((u) => u.contacts || u.meetingsDone || u.meetingsScheduled || u.tasksDone || !uid); } },
  { name: "get_sales_goals", description: "Metas comerciais (meta mensal da empresa e por vendedor) e quanto falta para alcançá-las.", parameters: { type: "object", properties: {} }, run: async (_a, ctx) => { const s = await analyzeOperation({ scopeUserId: scope(ctx.actor) }); return { company: { goal: s.kpis.goal, realized: s.kpis.revenue, remaining: s.kpis.remaining, pct: s.kpis.goalPct }, sellers: s.sellers.map((x) => ({ name: x.name, goal: x.goal, revenue: x.revenue, goalPct: x.goalPct, remaining: Math.max(0, x.goal - x.revenue) })), dailyContacts: ctx.settings.goals.dailyContacts }; } },
  { name: "get_pipeline_history", description: "Funil dos últimos 90 dias (quantos leads alcançaram cada etapa e a conversão entre etapas) e os gargalos identificados com fatos, hipóteses e recomendações.", parameters: { type: "object", properties: {} }, run: async (_a, ctx) => { const s = await analyzeOperation({ scopeUserId: scope(ctx.actor) }); return { funnel: s.funnel, bottlenecks: s.bottlenecks }; } },
  { name: "get_daily_plan", description: "Plano de operação do dia (status, resumo e atividades com responsável, prioridade e status de execução).", parameters: { type: "object", properties: { date: { type: "string", description: "yyyy-MM-dd (padrão: hoje)" } } }, run: async (a) => { const p = await getPlan((a.date as string) || planDate()); if (!p) return { exists: false }; return { exists: true, date: p.date, status: p.status, summary: p.summary, items: p.items.map((i) => ({ id: i.id, title: i.title, priority: i.priority, status: i.status, assignee: i.assignee?.name, lead: i.lead?.name, recommendedTime: i.recommendedTime })) }; } },
  { name: "create_daily_plan", description: "Gera (ou regenera, se ainda rascunho) o plano de operação de hoje com base nas regras. No modo Gerente Autônomo pode aprovar automaticamente (approve=true), criando as tarefas reais.", parameters: { type: "object", properties: { approve: { type: "boolean" } }, required: [] }, write: true, run: async (a, ctx) => { if (!canWrite(ctx)) return { status: "BLOQUEADO", reason: "Usuário sem permissão para gerar planos." }; const p = await generateDailyPlan({ actorId: ctx.actor.id, via: ctx.channel === "rotina" ? "rotina" : "manual" }); if (a.approve) { if (ctx.settings.mode !== "AUTONOMO" && !ctx.actor.system) return { status: "PARCIAL", plan: p?.date, items: p?.items.length, reason: "Plano gerado como rascunho; aprovação automática só no modo Gerente Autônomo. Peça ao gestor para aprovar." }; if (p && p.status === "RASCUNHO") await approvePlan(p.id, ctx.actor.id, { via: ctx.channel === "rotina" ? "rotina" : "manual" }); } return { status: "OK", plan: p?.date, planStatus: p?.status, items: p?.items.length, summary: p?.summary }; } },
  { name: "create_crm_task", description: "Cria uma tarefa real no CRM vinculada a um lead e a um responsável. Vendedores só podem criar tarefas para si mesmos.", parameters: { type: "object", properties: { title: { type: "string" }, description: { type: "string" }, leadId: { type: "string" }, assigneeId: { type: "string" }, priority: { type: "string", enum: ["URGENTE", "ALTA", "MEDIA", "BAIXA"] }, dueAt: { type: "string", description: "ISO 8601" } }, required: ["title"] }, write: true, run: async (a, ctx) => { if (ctx.settings.mode === "OBSERVADOR") return { status: "BLOQUEADO", reason: "Modo Observador: o agente não cria tarefas." }; const assigneeId = (viewAll(ctx.actor) ? (a.assigneeId as string | undefined) : undefined) ?? ctx.actor.id; if (!assigneeId) return { status: "BLOQUEADO", reason: "Responsável não informado." }; const [task] = await db.insert(t.tasks).values({ title: String(a.title).slice(0, 200), description: a.description ? String(a.description) : null, leadId: (a.leadId as string) || null, assigneeId, priority: (a.priority as "URGENTE" | "ALTA" | "MEDIA" | "BAIXA") || "MEDIA", dueAt: a.dueAt ? new Date(String(a.dueAt)) : endOfDay(new Date()), source: "salescop" }).returning(); await notify([assigneeId], "SALES COP AI: nova tarefa", task.title, "/sales-cop/plano"); await audit(ctx.actor.id, "create", "task", task.id, `Tarefa criada pelo SALES COP: ${task.title}`); return { status: "OK", taskId: task.id }; } },
  { name: "create_ai_alert", description: "Registra um alerta/recomendação do SALES COP e notifica os gestores (e o vendedor, se informado).", parameters: { type: "object", properties: { title: { type: "string" }, detail: { type: "string" }, severity: { type: "string", enum: ["CRITICO", "ALTO", "MEDIO", "BAIXO"] }, userId: { type: "string" }, leadId: { type: "string" } }, required: ["title"] }, write: true, run: async (a, ctx) => { if (ctx.settings.mode === "OBSERVADOR" && !ctx.actor.system) return { status: "BLOQUEADO", reason: "Modo Observador: o agente apenas recomenda." }; const key = `IA:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`; const [f] = await db.insert(t.aiFindings).values({ kind: "ALERTA", ruleKey: "IA", severity: (a.severity as "CRITICO" | "ALTO" | "MEDIO" | "BAIXO") || "MEDIO", title: String(a.title).slice(0, 200), detail: a.detail ? String(a.detail) : null, dedupeKey: key, userId: (a.userId as string) || null, leadId: (a.leadId as string) || null }).returning(); await notifyManagers(`SALES COP AI: ${f.title}`, f.detail ?? undefined, "/sales-cop/fiscalizacao", "warning"); if (a.userId) await notify([String(a.userId)], `SALES COP AI: ${f.title}`, f.detail ?? undefined, "/sales-cop/fiscalizacao", "warning"); return { status: "OK", id: f.id }; } },
  { name: "generate_sales_report", description: "Gera e salva um relatório inteligente (diario, semanal, mensal, vendedor, conversao, produtividade, gargalos).", parameters: { type: "object", properties: { kind: { type: "string", enum: ["diario", "semanal", "mensal", "vendedor", "conversao", "produtividade", "gargalos"] }, userId: { type: "string" } }, required: ["kind"] }, write: true, run: async (a, ctx) => { if (!canWrite(ctx) && a.kind !== "vendedor") return { status: "BLOQUEADO", reason: "Sem permissão para gerar relatórios da equipe." }; const r = await buildAiReport(a.kind as AiReportKind, { userId: a.kind === "vendedor" ? (scope(ctx.actor) ?? (a.userId as string)) : null }); const saved = await saveAiReport(a.kind as AiReportKind, { userId: a.kind === "vendedor" ? (scope(ctx.actor) ?? (a.userId as string)) : null, actorId: ctx.actor.id }); return { status: "OK", id: saved.id, title: r.title, content: r.content }; } },
  { name: "send_whatsapp_message", description: "Envia uma mensagem de WhatsApp (Cloud API oficial) para um usuário do CRM pelo id. Só funciona com a integração configurada e ativa.", parameters: { type: "object", properties: { userId: { type: "string" }, text: { type: "string" } }, required: ["userId", "text"] }, write: true, run: async (a, ctx) => { if (!canWrite(ctx)) return { status: "BLOQUEADO", reason: "Sem permissão." }; if (ctx.settings.mode === "OBSERVADOR") return { status: "BLOQUEADO", reason: "Modo Observador." }; if (!whatsappReady(ctx.settings)) return { status: "BLOQUEADO", reason: "Integração WhatsApp não configurada/ativa." }; const r = await sendWhatsAppText({ userId: String(a.userId), text: String(a.text), actorId: ctx.actor.id }); return r; } },
];

export function aiAvailable() { return !!process.env.OPENAI_API_KEY; }

type Msg = { role: "system" | "user" | "assistant" | "tool"; content: string | null; tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[]; tool_call_id?: string; name?: string };

/** Pergunta ao SALES COP (chat/WhatsApp). Usa function calling sobre os dados reais do CRM. */
export async function askSalesCop(opts: { question: string; actor: Actor; channel?: "web" | "whatsapp" | "rotina"; history?: { role: "user" | "assistant"; content: string }[] }): Promise<{ answer: string; toolCalls: string[]; usage?: { in: number; out: number }; mode: "ia" | "regras" }> {
  const settings = await getSalesCopSettings();
  const ctx: ToolCtx = { actor: opts.actor, settings, channel: opts.channel ?? "web" };
  if (!aiAvailable() || !settings.ai.enabled) return { answer: await fallbackAnswer(opts.question, ctx), toolCalls: [], mode: "regras" };
  if ((await aiCallsToday()) >= settings.ai.maxDailyCalls) { await logExecution({ kind: "ia", action: "ask", status: "BLOQUEADO", summary: "Limite diário de chamadas de IA atingido.", actorId: opts.actor.id }); return { answer: `Limite diário de ${settings.ai.maxDailyCalls} consultas à IA atingido. Resposta pelas regras:\n\n${await fallbackAnswer(opts.question, ctx)}`, toolCalls: [], mode: "regras" }; }
  const started = Date.now();
  const messages: Msg[] = [
    { role: "system", content: `${SYSTEM_PROMPT}\nUsuário atual: ${opts.actor.name} (${opts.actor.role}). Nível de autonomia: ${settings.mode}. Data/hora: ${new Date().toLocaleString("pt-BR")}. Canal: ${ctx.channel}.` },
    ...(opts.history ?? []).slice(-8).map((h) => ({ role: h.role, content: h.content }) as Msg),
    { role: "user", content: opts.question },
  ];
  const toolCalls: string[] = [];
  let usage = { in: 0, out: 0 };
  try {
    for (let round = 0; round < 6; round++) {
      const res = await openai({ model: settings.ai.model, temperature: settings.ai.temperature, messages, tools: TOOLS.map((tl) => ({ type: "function", function: { name: tl.name, description: tl.description, parameters: tl.parameters } })) });
      usage = { in: usage.in + (res.usage?.prompt_tokens ?? 0), out: usage.out + (res.usage?.completion_tokens ?? 0) };
      const msg = res.choices[0].message;
      messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls });
      if (!msg.tool_calls?.length) {
        const answer = msg.content?.trim() || "Não consegui formular uma resposta.";
        await logExecution({ kind: "ia", action: "ask", summary: `${opts.channel ?? "web"}: ${opts.question.slice(0, 160)}`, input: { question: opts.question }, output: { answer: answer.slice(0, 1500), toolCalls }, tokensIn: usage.in, tokensOut: usage.out, durationMs: Date.now() - started, actorId: opts.actor.id });
        return { answer, toolCalls, usage, mode: "ia" };
      }
      for (const call of msg.tool_calls) {
        const tool = TOOLS.find((tl) => tl.name === call.function.name);
        let result: unknown;
        try { result = tool ? await tool.run(safeJson(call.function.arguments), ctx) : { status: "ERRO", reason: "Função desconhecida." }; } catch (e) { result = { status: "ERRO", reason: (e as Error).message }; }
        toolCalls.push(call.function.name);
        if (tool?.write) await logExecution({ kind: "ia", action: `tool:${tool.name}`, status: (result as { status?: string })?.status === "BLOQUEADO" ? "BLOQUEADO" : "OK", summary: `IA executou ${tool.name}`, input: safeJson(call.function.arguments), output: result, actorId: opts.actor.id });
        messages.push({ role: "tool", tool_call_id: call.id, name: call.function.name, content: JSON.stringify(result).slice(0, 60000) });
      }
    }
    return { answer: "A análise ficou longa demais. Tente uma pergunta mais específica.", toolCalls, usage, mode: "ia" };
  } catch (e) {
    await logExecution({ kind: "ia", action: "ask", status: "ERRO", summary: `Falha na IA: ${(e as Error).message}`, input: { question: opts.question }, durationMs: Date.now() - started, actorId: opts.actor.id });
    return { answer: `A IA está indisponível no momento (${(e as Error).message}). Resposta pelas regras:\n\n${await fallbackAnswer(opts.question, ctx)}`, toolCalls, usage, mode: "regras" };
  }
}

/** Texto curto gerado pela IA (narrativa de relatório/plano). Retorna null sem IA. */
export async function narrate(instruction: string, data: unknown, actorId: string | null = null): Promise<string | null> {
  const settings = await getSalesCopSettings();
  if (!aiAvailable() || !settings.ai.enabled || (await aiCallsToday()) >= settings.ai.maxDailyCalls) return null;
  const started = Date.now();
  try {
    const res = await openai({ model: settings.ai.model, temperature: settings.ai.temperature, messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: `${instruction}\n\nDADOS (JSON):\n${JSON.stringify(data).slice(0, 40000)}` }] });
    const text = res.choices[0].message.content?.trim() ?? null;
    await logExecution({ kind: "ia", action: "narrate", summary: instruction.slice(0, 160), tokensIn: res.usage?.prompt_tokens, tokensOut: res.usage?.completion_tokens, durationMs: Date.now() - started, actorId });
    return text;
  } catch (e) { await logExecution({ kind: "ia", action: "narrate", status: "ERRO", summary: (e as Error).message, actorId }); return null; }
}

async function openai(body: Record<string, unknown>) {
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: JSON.stringify(body), signal: ctrl.signal });
    if (!r.ok) { const txt = await r.text(); throw new Error(`OpenAI ${r.status}: ${txt.slice(0, 200)}`); }
    return (await r.json()) as { choices: { message: { content: string | null; tool_calls?: Msg["tool_calls"] } }[]; usage?: { prompt_tokens: number; completion_tokens: number } };
  } finally { clearTimeout(timer); }
}
const safeJson = (s: string): Record<string, unknown> => { try { return JSON.parse(s || "{}"); } catch { return {}; } };

/** Resposta determinística (sem IA) para as perguntas mais comuns. */
export async function fallbackAnswer(question: string, ctx: ToolCtx): Promise<string> {
  const q = question.toLowerCase();
  const s = await analyzeOperation({ scopeUserId: scope(ctx.actor) });
  const k = s.kpis;
  const findings = await openFindings(scope(ctx.actor));
  if (/plano/.test(q)) { const p = await getPlan(); if (!p) return "Ainda não há plano para hoje. Gere o plano na aba Plano de Ação (ou peça ao gestor)."; return `Plano de ${p.date.split("-").reverse().join("/")} (${p.status}):\n${p.summary}\n\nAtividades: ${p.items.length} · concluídas: ${p.items.filter((i) => i.status === "CONCLUIDO").length}.`; }
  if (/esquecid|parad|sem contato|sem primeiro/.test(q)) { const list = s.findings.filter((f) => ["PRIMEIRO_CONTATO", "LEAD_PARADO", "SEM_MOVIMENTACAO", "FOLLOW_UP_ATRASADO"].includes(f.ruleKey)).slice(0, 10); return list.length ? `Leads que precisam de atenção (${list.length} de ${s.findings.length} pendências):\n${list.map((f, i) => `${i + 1}. [${f.severity}] ${f.title}`).join("\n")}` : "Nenhum lead esquecido ou parado segundo as regras atuais. 👏"; }
  if (/vendedor|equipe|atenç/.test(q)) { const a = s.sellers.filter((x) => x.flags.length); return a.length ? `Vendedores que precisam de atenção:\n${a.map((x) => `• ${x.name}: ${x.flags.join(", ")} (meta ${pct(x.goalPct, 0)}, conversão ${pct(x.conversion)})`).join("\n")}` : "Nenhum vendedor com sinal de alerta neste momento."; }
  if (/meta|falta/.test(q)) return `Meta do mês: ${brl(k.goal)} · realizado ${brl(k.revenue)} (${pct(k.goalPct, 0)}) · faltam ${brl(k.remaining)}.${s.sellers.length > 1 ? `\n${s.sellers.map((x) => `• ${x.name}: ${pct(x.goalPct, 0)} (faltam ${brl(Math.max(0, x.goal - x.revenue))})`).join("\n")}` : ""}`;
  if (/priori|oportunidad/.test(q)) { const list = s.findings.filter((f) => ["RISCO_PERDA", "PROPOSTA"].includes(f.ruleKey)).slice(0, 8); return list.length ? `Oportunidades a priorizar:\n${list.map((f, i) => `${i + 1}. [${f.severity}] ${f.title}`).join("\n")}` : "Nenhuma oportunidade em risco detectada. Priorize os leads novos sem contato e os follow-ups do dia."; }
  if (/ontem|desempenho/.test(q)) { const d = await TOOLS.find((x) => x.name === "get_daily_activities")!.run({ daysAgo: /ontem/.test(q) ? 1 : 0 }, ctx) as { name: string; contacts: number; meetingsDone: number; tasksDone: number }[]; return `Atividades ${/ontem/.test(q) ? "de ontem" : "de hoje"}:\n${d.map((x) => `• ${x.name}: ${x.contacts} contatos, ${x.meetingsDone} reuniões realizadas, ${x.tasksDone} tarefas concluídas`).join("\n") || "Nenhuma atividade registrada."}`; }
  return `Situação da operação — Índice de Saúde Comercial ${s.health.score} (${s.health.state}).\n• ${k.activeLeads} leads ativos · ${k.noFirstContact} sem primeiro contato · ${k.lateFollowUps} follow-ups atrasados · ${k.stalledLeads} parados\n• ${k.meetingsScheduled} reuniões agendadas · ${k.meetingsDone} realizadas · ${k.proposals} propostas/negociações\n• ${k.sales} vendas · ${brl(k.revenue)} (${pct(k.goalPct, 0)} da meta)\n• ${findings.length} irregularidades abertas na fiscalização\n${s.intelligence.immediateActions.length ? `\nAções imediatas:\n${s.intelligence.immediateActions.map((a, i) => `${i + 1}. ${a}`).join("\n")}` : ""}`;
}
export { desc };
