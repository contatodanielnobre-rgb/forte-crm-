import "server-only";
import { and, eq, gte } from "drizzle-orm";
import { format, isFriday, isLastDayOfMonth, isWeekend, startOfDay } from "date-fns";
import { db, t } from "@/db";
import { notify, notifyManagers } from "@/lib/notify";
import { brl, pct } from "@/lib/format";
import { analyzeOperation, syncFindings } from "./analysis";
import { generateDailyPlan, approvePlan, closePlan, getPlan } from "./plan";
import { saveAiReport } from "./reports";
import { getSalesCopSettings, ROUTINE_STEPS, type RoutineStepKey, type SalesCopSettings } from "./settings";
import { sendWhatsAppText, whatsappReady, normalizePhone } from "./whatsapp";
import { narrate } from "./ai";
import { logExecution } from "./log";

const stepDone = async (key: RoutineStepKey, day = new Date()) => {
  const [row] = await db.select({ id: t.aiExecutionLogs.id }).from(t.aiExecutionLogs).where(and(eq(t.aiExecutionLogs.kind, "rotina"), eq(t.aiExecutionLogs.action, `step:${key}`), gte(t.aiExecutionLogs.createdAt, startOfDay(day)))).limit(1);
  return !!row;
};
const timeToMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + (m || 0); };

/** Executa a rotina: sem `step`, roda todos os passos habilitados cujo horário já passou e que ainda não rodaram hoje. */
export async function runRoutine(opts: { step?: RoutineStepKey; force?: boolean; actorId?: string | null } = {}) {
  const settings = await getSalesCopSettings();
  const now = new Date();
  const results: { step: RoutineStepKey; status: string; summary: string }[] = [];
  if (!opts.step && !settings.routine.enabled) return { ran: [], skipped: "Rotina desativada nas Configurações do Agente." };
  if (!opts.step && settings.routine.weekdaysOnly && isWeekend(now)) return { ran: [], skipped: "Fim de semana (rotina configurada para dias úteis)." };
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const due = ROUTINE_STEPS.filter((s) => (opts.step ? s.key === opts.step : settings.routine.steps[s.key]?.enabled && timeToMin(settings.routine.steps[s.key].time) <= nowMin));
  for (const s of due) {
    if (!opts.force && !opts.step && (await stepDone(s.key))) continue;
    const started = Date.now();
    try {
      const summary = await runStep(s.key, settings, opts.actorId ?? null);
      await logExecution({ kind: "rotina", action: `step:${s.key}`, summary, durationMs: Date.now() - started, actorId: opts.actorId ?? null });
      results.push({ step: s.key, status: "OK", summary });
    } catch (e) {
      await logExecution({ kind: "rotina", action: `step:${s.key}`, status: "ERRO", summary: (e as Error).message, durationMs: Date.now() - started, actorId: opts.actorId ?? null });
      results.push({ step: s.key, status: "ERRO", summary: (e as Error).message });
    }
  }
  return { ran: results };
}

async function adminsWhatsApp(settings: SalesCopSettings, text: string, kind: string) {
  if (!whatsappReady(settings) || !settings.whatsapp.notifyAdmins || settings.mode === "OBSERVADOR") return;
  const phones = settings.whatsapp.adminPhones.split(/[,;\n]/).map(normalizePhone).filter(Boolean);
  if (!phones.length) { const admins = await db.select({ phone: t.users.phone }).from(t.users).where(and(eq(t.users.role, "ADMIN"), eq(t.users.active, true))); admins.forEach((a) => a.phone && phones.push(normalizePhone(a.phone))); }
  for (const p of [...new Set(phones)]) await sendWhatsAppText({ phone: p, text, kind });
}
async function sellersWhatsApp(settings: SalesCopSettings, messages: { userId: string; text: string }[], kind: string) {
  if (!whatsappReady(settings) || !settings.whatsapp.notifySellers || settings.mode === "OBSERVADOR") return;
  for (const m of messages) await sendWhatsAppText({ userId: m.userId, text: m.text, kind });
}
const firstName = (n: string) => n.split(" ")[0];

async function runStep(key: RoutineStepKey, settings: SalesCopSettings, actorId: string | null): Promise<string> {
  const now = new Date();
  switch (key) {
    case "investigacao": {
      const snap = await analyzeOperation();
      const r = await syncFindings(snap.findings);
      const k = snap.kpis;
      const critical = snap.findings.filter((f) => f.severity === "CRITICO").length;
      const text = `Bom dia! Fiz a análise da operação comercial (${format(now, "dd/MM")}).\n\nÍndice de Saúde Comercial: ${snap.health.score} (${snap.health.state}).\n\nIdentifiquei:\n- ${k.noFirstContact} leads sem primeiro contato.\n- ${k.lateFollowUps} follow-ups atrasados.\n- ${k.stalledLeads} oportunidades paradas.\n- ${k.proposalsNoFollowUp} propostas sem retorno.\n- ${k.sellersInactive} vendedor(es) sem atividades registradas.\n\nMeta do mês: ${pct(k.goalPct, 0)} realizada (faltam ${brl(k.remaining)}).\n\nVou preparar o plano de ação de hoje.`;
      await notifyManagers(`SALES COP · Investigação matinal: saúde ${snap.health.score} (${snap.health.state})`, `${snap.findings.length} pendências · ${critical} críticas`, "/sales-cop", snap.health.state === "VERMELHO" ? "danger" : snap.health.state === "AMARELO" ? "warning" : "info");
      await adminsWhatsApp(settings, text, "investigacao");
      return `Investigação: ${snap.findings.length} pendências (${r.upserted} atualizadas, ${r.resolved} resolvidas); saúde ${snap.health.score}.`;
    }
    case "plano": {
      const plan = await generateDailyPlan({ actorId, via: "rotina" });
      if (!plan) return "Plano não gerado.";
      let created = 0;
      if (settings.mode === "AUTONOMO" && plan.status === "RASCUNHO") created = await approvePlan(plan.id, actorId, { via: "rotina" });
      const fresh = await getPlan(plan.date);
      const adminText = `SALES COP AI — PLANO DE OPERAÇÃO ${plan.date.split("-").reverse().join("/")}\n\n${plan.summary}\n\n${settings.mode === "AUTONOMO" ? `Plano aprovado automaticamente: ${created} tarefas criadas no CRM.` : "Posso apresentar as prioridades da equipe? Aprove o plano no FORTE CRM › SALES COP AI › Plano de Ação."}`;
      await adminsWhatsApp(settings, adminText, "plano");
      if (fresh && fresh.status === "APROVADO") {
        const bySeller = new Map<string, typeof fresh.items>();
        fresh.items.forEach((i) => { if (i.assigneeId) bySeller.set(i.assigneeId, [...(bySeller.get(i.assigneeId) ?? []), i]); });
        await sellersWhatsApp(settings, [...bySeller.entries()].map(([userId, items]) => ({ userId, text: `Olá, ${firstName(items[0].assignee?.name ?? "")}! Aqui é o SALES COP AI. Seu plano de hoje tem ${items.length} atividade(s):\n${items.slice(0, 10).map((i, n) => `${n + 1}. [${i.priority}] ${i.title}${i.recommendedTime ? ` · ${i.recommendedTime}` : ""}`).join("\n")}${items.length > 10 ? `\n… e mais ${items.length - 10}.` : ""}\n\nMeta de contatos do dia: ${settings.goals.dailyContacts}. Vamos executar?` })), "plano");
      }
      return `Plano ${plan.date}: ${plan.items.length} atividades${settings.mode === "AUTONOMO" ? ` · aprovado automaticamente (${created} tarefas)` : " · aguardando aprovação"}.`;
    }
    case "fiscalizacao1": case "fiscalizacao2": case "oportunidades": {
      const snap = await analyzeOperation();
      await syncFindings(snap.findings);
      const plan = await getPlan();
      const msgs: { userId: string; text: string }[] = [];
      const inApp: { userId: string; title: string; body: string }[] = [];
      for (const s of snap.sellers.filter((x) => x.role === "COMERCIAL")) {
        const today = snap.findings.filter((f) => f.userId === s.id);
        const items = plan?.items.filter((i) => i.assigneeId === s.id && i.status === "APROVADO") ?? [];
        const contacts = (await db.select({ c: t.interactions.id }).from(t.interactions).where(and(eq(t.interactions.userId, s.id), gte(t.interactions.createdAt, startOfDay(now))))).length;
        if (key === "oportunidades") {
          const risk = today.filter((f) => f.ruleKey === "RISCO_PERDA" || f.ruleKey === "PROPOSTA" || f.ruleKey === "LEAD_PARADO");
          if (!risk.length) continue;
          const text = `Olá, ${firstName(s.name)}! Investiguei suas oportunidades e encontrei ${risk.length} que precisam de atenção:\n${risk.slice(0, 6).map((f, i) => `${i + 1}. ${f.title}`).join("\n")}\n\nRecomendo retomar contato hoje e registrar o próximo passo no CRM.`;
          msgs.push({ userId: s.id, text }); inApp.push({ userId: s.id, title: "SALES COP · Oportunidades em risco", body: `${risk.length} oportunidade(s) precisam de ação hoje.` });
          continue;
        }
        const late = today.filter((f) => f.ruleKey === "FOLLOW_UP_ATRASADO").length, noNext = today.filter((f) => f.ruleKey === "FOLLOW_UP").length, pendingItems = items.length;
        const remaining = Math.max(0, settings.goals.dailyContacts - contacts);
        if (!late && !noNext && !pendingItems && remaining === 0) continue;
        const text = `Olá, ${firstName(s.name)}! Estou acompanhando seu desempenho de hoje.\n\nSua meta é realizar ${settings.goals.dailyContacts} contatos. Você já realizou ${contacts}.${pendingItems ? `\n\nAtividades do plano ainda pendentes: ${pendingItems}.` : ""}${late || noNext ? `\n\nTambém identifiquei:\n${late ? `- ${late} follow-up(s) atrasado(s).\n` : ""}${noNext ? `- ${noNext} lead(s) sem próxima atividade.` : ""}` : ""}\n\n${remaining ? `Faltam ${remaining} contatos para alcançar sua meta. ` : "Meta de contatos atingida! "}Vamos regularizar as pendências?`;
        msgs.push({ userId: s.id, text }); inApp.push({ userId: s.id, title: key === "fiscalizacao1" ? "SALES COP · Primeira fiscalização" : "SALES COP · Segunda fiscalização", body: `${contacts}/${settings.goals.dailyContacts} contatos · ${pendingItems} atividades pendentes · ${late} follow-ups atrasados` });
      }
      if (settings.mode !== "OBSERVADOR") for (const n of inApp) await notify([n.userId], n.title, n.body, "/sales-cop/plano", "warning");
      await sellersWhatsApp(settings, msgs, key);
      const done = plan ? plan.items.filter((i) => i.status === "CONCLUIDO").length : 0;
      await notifyManagers(`SALES COP · ${ROUTINE_STEPS.find((x) => x.key === key)!.label}`, `${snap.findings.length} pendências abertas · plano: ${done}/${plan?.items.length ?? 0} concluídas · ${msgs.length} vendedor(es) cobrados`, "/sales-cop/fiscalizacao");
      return `${msgs.length} vendedor(es) cobrados; ${snap.findings.length} pendências; plano ${done}/${plan?.items.length ?? 0}.`;
    }
    case "parcial": {
      const snap = await analyzeOperation();
      const plan = await getPlan();
      const done = plan ? plan.items.filter((i) => i.status === "CONCLUIDO").length : 0;
      const text = `Relatório parcial (${format(now, "HH:mm")}):\n- Meta do mês: ${pct(snap.kpis.goalPct, 0)} (${brl(snap.kpis.revenue)} de ${brl(snap.kpis.goal)}).\n- Contatos hoje: ${snap.kpis.contactsToday}.\n- Plano do dia: ${done}/${plan?.items.length ?? 0} atividades concluídas.\n- Pendências abertas: ${snap.findings.length}.`;
      await notifyManagers("SALES COP · Relatório parcial", text.replace(/\n/g, " "), "/sales-cop");
      await adminsWhatsApp(settings, text, "parcial");
      return text.replace(/\n/g, " ");
    }
    case "encerramento": {
      const result = await closePlan();
      const narrative = await narrate("Escreva o relatório de encerramento do dia em até 8 linhas: o que foi planejado × realizado, o que está funcionando, o que está errado, quem precisa de atenção e as 3 ações prioritárias para amanhã. Use apenas os dados fornecidos.", { result, hint: "relatorio diario" }, actorId);
      const rep = await saveAiReport("diario", { narrative, generatedBy: narrative ? "ia" : "regras", actorId });
      if (isFriday(now)) await saveAiReport("semanal", { actorId });
      if (isLastDayOfMonth(now)) await saveAiReport("mensal", { actorId });
      const text = `Encerramento operacional ${format(now, "dd/MM")}:\n- Plano: ${result ? `${result.done}/${result.total} atividades concluídas (${result.pct}%)` : "sem plano hoje"}.\n${narrative ? `\n${narrative}` : ""}\n\nRelatório completo em FORTE CRM › SALES COP AI › Relatórios.`;
      await notifyManagers("SALES COP · Encerramento do dia", result ? `${result.done}/${result.total} atividades concluídas (${result.pct}%)` : "Relatório diário gerado", `/sales-cop/relatorios?id=${rep.id}`);
      await adminsWhatsApp(settings, text, "encerramento");
      return `Encerramento: ${result ? `${result.done}/${result.total} (${result.pct}%)` : "sem plano"}; relatório ${rep.id}.`;
    }
  }
}
