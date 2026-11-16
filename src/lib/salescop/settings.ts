import { db, t } from "@/db";
import { getSetting } from "@/lib/bootstrap";

/** Níveis de autonomia do SALES COP AI. */
export type AutonomyMode = "OBSERVADOR" | "OPERACIONAL" | "AUTONOMO";
export const MODE_LABEL: Record<AutonomyMode, string> = { OBSERVADOR: "Modo 1 — Observador", OPERACIONAL: "Modo 2 — Operacional", AUTONOMO: "Modo 3 — Gerente autônomo" };
export const MODE_HINT: Record<AutonomyMode, string> = {
  OBSERVADOR: "Monitora, analisa e recomenda. Não cria tarefas nem envia mensagens.",
  OPERACIONAL: "Monitora, cria tarefas do plano aprovado, envia alertas e acompanha os vendedores.",
  AUTONOMO: "Gera e aprova o plano diário sozinho, distribui tarefas, cobra atividades e acompanha resultados.",
};

export type RoutineStepKey = "investigacao" | "plano" | "fiscalizacao1" | "parcial" | "oportunidades" | "fiscalizacao2" | "encerramento";
export const ROUTINE_STEPS: { key: RoutineStepKey; label: string; description: string; defaultTime: string }[] = [
  { key: "investigacao", label: "Investigação matinal", description: "Analisa indicadores, leads, vendedores e pendências; atualiza a fiscalização.", defaultTime: "08:00" },
  { key: "plano", label: "Plano de operação", description: "Gera o plano diário e distribui prioridades (aprova automaticamente no modo autônomo).", defaultTime: "08:15" },
  { key: "fiscalizacao1", label: "Primeira fiscalização", description: "Verifica a execução das tarefas e identifica pendências.", defaultTime: "10:00" },
  { key: "parcial", label: "Relatório parcial", description: "Analisa a evolução das metas e atividades do dia.", defaultTime: "12:00" },
  { key: "oportunidades", label: "Investigação de oportunidades", description: "Identifica leads parados, follow-ups e oportunidades em risco.", defaultTime: "14:00" },
  { key: "fiscalizacao2", label: "Segunda fiscalização", description: "Acompanha a produtividade e cobra atividades pendentes.", defaultTime: "16:00" },
  { key: "encerramento", label: "Encerramento operacional", description: "Compara planejado × realizado, registra resultados e gera o relatório do dia.", defaultTime: "17:30" },
];

export type HealthCriterionKey = "atividades" | "velocidade" | "semContato" | "followUps" | "evolucao" | "metas" | "conversao";
export const HEALTH_CRITERIA: { key: HealthCriterionKey; label: string; description: string }[] = [
  { key: "atividades", label: "Cumprimento das atividades", description: "% das tarefas/atividades com prazo vencido que foram concluídas." },
  { key: "velocidade", label: "Velocidade de atendimento", description: "% dos leads novos atendidos dentro do tempo máximo de primeiro contato." },
  { key: "semContato", label: "Leads sem contato", description: "Proporção de leads ativos sem nenhum contato registrado (quanto menos, melhor)." },
  { key: "followUps", label: "Follow-ups em dia", description: "% dos leads em negociação com próxima atividade agendada e não atrasada." },
  { key: "evolucao", label: "Evolução no pipeline", description: "% dos leads ativos dentro do tempo máximo de permanência da etapa." },
  { key: "metas", label: "Cumprimento das metas", description: "% da meta mensal já realizada, proporcional ao dia do mês." },
  { key: "conversao", label: "Conversão comercial", description: "Taxa de conversão do mês comparada à meta de conversão configurada." },
];

export type SalesCopSettings = {
  mode: AutonomyMode;
  rules: {
    firstContactHours: number;     // REGRA 1 — tempo máximo para o primeiro contato
    followUpMaxDays: number;       // REGRA 2 — lead em negociação sem próxima atividade há mais de X dias
    stageMaxDays: number;          // REGRA 3 — tempo máximo padrão em cada etapa
    stageMaxDaysByStage: Record<string, number>; // por etapa (stageId → dias)
    meetingConfirmHours: number;   // REGRA 4 — reunião nas próximas X horas sem confirmação
    proposalMaxDays: number;       // REGRA 5 — proposta enviada sem retorno há mais de X dias
    sellerInactivityDays: number;  // vendedor sem atividade registrada há X dias úteis
    stalledLeadDays: number;       // lead sem movimentação (nenhum contato) há X dias
    riskValueMin: number;          // valor mínimo para destacar oportunidade em risco
  };
  stageMap: { qualified: string | null; meetingScheduled: string | null; meetingDone: string | null; proposal: string | null; negotiation: string | null };
  health: { weights: Record<HealthCriterionKey, number>; greenFrom: number; yellowFrom: number; conversionGoalPct: number };
  goals: { dailyContacts: number; dailyFollowUps: number };
  routine: { enabled: boolean; weekdaysOnly: boolean; steps: Record<RoutineStepKey, { time: string; enabled: boolean }> };
  ai: { enabled: boolean; model: string; maxDailyCalls: number; temperature: number };
  whatsapp: { enabled: boolean; notifyAdmins: boolean; notifySellers: boolean; adminPhones: string; dailyPlanTime: string };
};

export const DEFAULT_SALESCOP: SalesCopSettings = {
  mode: "OPERACIONAL",
  rules: { firstContactHours: 2, followUpMaxDays: 2, stageMaxDays: 7, stageMaxDaysByStage: {}, meetingConfirmHours: 24, proposalMaxDays: 3, sellerInactivityDays: 1, stalledLeadDays: 5, riskValueMin: 0 },
  stageMap: { qualified: null, meetingScheduled: null, meetingDone: null, proposal: null, negotiation: null },
  health: { weights: { atividades: 15, velocidade: 20, semContato: 15, followUps: 15, evolucao: 10, metas: 15, conversao: 10 }, greenFrom: 75, yellowFrom: 50, conversionGoalPct: 15 },
  goals: { dailyContacts: 20, dailyFollowUps: 10 },
  routine: { enabled: true, weekdaysOnly: true, steps: Object.fromEntries(ROUTINE_STEPS.map((s) => [s.key, { time: s.defaultTime, enabled: true }])) as SalesCopSettings["routine"]["steps"] },
  ai: { enabled: true, model: "gpt-4o-mini", maxDailyCalls: 200, temperature: 0.2 },
  whatsapp: { enabled: false, notifyAdmins: true, notifySellers: true, adminPhones: "", dailyPlanTime: "08:20" },
};

const deepMerge = <T extends Record<string, unknown>>(base: T, patch: Partial<T> | undefined): T => {
  if (!patch) return base;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    const b = base[k];
    out[k] = v && typeof v === "object" && !Array.isArray(v) && b && typeof b === "object" && !Array.isArray(b) ? deepMerge(b as Record<string, unknown>, v as Record<string, unknown>) : v;
  }
  return out as T;
};

/** Lê as configurações do agente (settings.key = "salescop"), com defaults para campos ausentes. */
export async function getSalesCopSettings(): Promise<SalesCopSettings> {
  const stored = await getSetting<Partial<SalesCopSettings>>("salescop", {});
  const merged = deepMerge(DEFAULT_SALESCOP as unknown as Record<string, unknown>, stored as Record<string, unknown>) as unknown as SalesCopSettings;
  // Mapeia etapas por nome quando o administrador ainda não configurou (mesma heurística do dashboard).
  const needsMap = Object.values(merged.stageMap).some((v) => !v);
  if (needsMap) {
    const stages = await db.select().from(t.pipelineStages);
    const find = (...words: string[]) => stages.find((s) => words.some((w) => s.name.toLowerCase().includes(w)))?.id ?? null;
    merged.stageMap = {
      qualified: merged.stageMap.qualified ?? find("qualific"),
      meetingScheduled: merged.stageMap.meetingScheduled ?? find("reunião agendada", "reuniao agendada", "agendad"),
      meetingDone: merged.stageMap.meetingDone ?? find("reunião realizada", "reuniao realizada", "realizad"),
      proposal: merged.stageMap.proposal ?? find("proposta"),
      negotiation: merged.stageMap.negotiation ?? find("negocia"),
    };
  }
  return merged;
}

export async function saveSalesCopSettings(patch: Partial<SalesCopSettings>) {
  const current = await getSetting<Partial<SalesCopSettings>>("salescop", {});
  const value = deepMerge(current as Record<string, unknown>, patch as Record<string, unknown>);
  await db.insert(t.settings).values({ key: "salescop", value: value as never }).onConflictDoUpdate({ target: t.settings.key, set: { value: value as never } });
  return value as unknown as SalesCopSettings;
}

/** Integrações externas: presença de credenciais (nunca expostas ao cliente). */
export function integrationStatus() {
  return {
    openai: !!process.env.OPENAI_API_KEY,
    whatsapp: !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
    whatsappVerify: !!process.env.WHATSAPP_VERIFY_TOKEN,
    cron: !!process.env.CRON_SECRET,
  };
}
