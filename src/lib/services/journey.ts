import { addDays, addWeeks, setDay, startOfDay } from "date-fns";
import { and, eq } from "drizzle-orm";
import { db, t } from "@/db";
import type { JourneyKey } from "@/db/schema";
import { getSetting } from "@/lib/bootstrap";

export const JOURNEY_STEPS: { key: JourneyKey; label: string; short: string; recurring?: boolean; description: string }[] = [
  { key: "GRUPO_CRIADO", label: "Grupo criado", short: "Grupo", description: "Criação do grupo de WhatsApp com o cliente" },
  { key: "CONTRATO", label: "Contrato", short: "Contrato", description: "Envio e assinatura do contrato" },
  { key: "FORMULARIO", label: "Formulário", short: "Formulário", description: "Formulário estratégico enviado e preenchido" },
  { key: "ONBOARDING", label: "Onboarding", short: "Onboarding", description: "Reunião de alinhamento, objetivos, metas e plano de ação" },
  { key: "REUNIOES_SEMANAIS", label: "Reuniões semanais", short: "Reuniões", recurring: true, description: "Atividade recorrente durante toda a execução do contrato" },
  { key: "RELATORIOS", label: "Relatórios", short: "Relatórios", recurring: true, description: "Entrega recorrente de relatórios de resultados" },
];
export const stepLabel = (k: JourneyKey) => JOURNEY_STEPS.find((s) => s.key === k)?.label ?? k;

/** Cria a jornada completa para um cliente novo (idempotente). */
export async function createJourneyForClient(clientId: string, ownerId?: string | null, closedAt = new Date()) {
  const cfg = await getSetting<{ stepDays: Record<string, number> }>("journey", { stepDays: { GRUPO_CRIADO: 1, CONTRATO: 3, FORMULARIO: 7, ONBOARDING: 10 } });
  const existing = await db.select({ key: t.journeySteps.key }).from(t.journeySteps).where(eq(t.journeySteps.clientId, clientId));
  const have = new Set(existing.map((e) => e.key));
  const rows = JOURNEY_STEPS.filter((s) => !have.has(s.key)).map((s, i) => ({
    clientId, key: s.key, order: i + 1, recurring: !!s.recurring, ownerId: ownerId ?? null,
    dueAt: s.recurring ? null : addDays(startOfDay(closedAt), cfg.stepDays[s.key] ?? 7),
    status: "PENDENTE" as const,
  }));
  if (rows.length) await db.insert(t.journeySteps).values(rows);
}

/** Percentual de conclusão: etapas fixas concluídas + etapas recorrentes "em andamento/concluído" contam. */
export function journeyProgress(steps: { key: JourneyKey; status: string; recurring: boolean }[]) {
  if (!steps.length) return 0;
  const done = steps.filter((s) => (s.recurring ? s.status !== "PENDENTE" : s.status === "CONCLUIDO")).length;
  return Math.round((done / steps.length) * 100);
}

export function isStepLate(step: { status: string; dueAt: Date | null; recurring: boolean }, now = new Date()) {
  return !step.recurring && step.status !== "CONCLUIDO" && !!step.dueAt && step.dueAt < now;
}

export async function setStepStatus(clientId: string, key: JourneyKey, status: "PENDENTE" | "EM_ANDAMENTO" | "CONCLUIDO", patch: { notes?: string | null; data?: Record<string, unknown>; ownerId?: string | null } = {}) {
  await db.update(t.journeySteps).set({ status, completedAt: status === "CONCLUIDO" ? new Date() : null, ...patch }).where(and(eq(t.journeySteps.clientId, clientId), eq(t.journeySteps.key, key)));
}

/** Gera o calendário de reuniões semanais (próximas N semanas) para um cliente. */
export function weeklyDates(from: Date, weekday: number, hour: number, weeks: number) {
  const first = setDay(startOfDay(from), weekday, { weekStartsOn: 0 });
  const start = first < from ? addWeeks(first, 1) : first;
  return Array.from({ length: weeks }, (_, i) => { const d = addWeeks(start, i); d.setHours(hour, 0, 0, 0); return d; });
}
