import { db, t } from "@/db";
import { count } from "drizzle-orm";

export const DEFAULT_STAGES = [
  { name: "Novo Lead", color: "#6B7280", isDefault: true },
  { name: "Primeiro Contato", color: "#3B82F6" },
  { name: "Qualificação", color: "#8B5CF6" },
  { name: "Reunião Agendada", color: "#F59E0B" },
  { name: "Reunião Realizada", color: "#F97316" },
  { name: "Proposta Enviada", color: "#06B6D4" },
  { name: "Em Negociação", color: "#D91E3A" },
  { name: "Venda Fechada", color: "#10B981", isWon: true },
  { name: "Perdido", color: "#374151", isLost: true },
];
export const DEFAULT_SOURCES = ["Indicação", "Instagram", "Tráfego Pago", "Site", "WhatsApp", "Prospecção Ativa", "Evento", "Outro"];
export const DEFAULT_LOSS_REASONS = ["Preço", "Sem orçamento", "Fechou com concorrente", "Sem resposta", "Timing inadequado", "Não era o perfil", "Outro"];
export const DEFAULT_APPOINTMENT_TYPES = [
  { name: "Reunião comercial", color: "#D91E3A", isCommercial: true },
  { name: "Reunião de onboarding", color: "#8B5CF6" },
  { name: "Reunião semanal com cliente", color: "#3B82F6" },
  { name: "Reunião estratégica", color: "#F59E0B" },
  { name: "Follow-up", color: "#06B6D4" },
  { name: "Entrega de relatório", color: "#10B981" },
  { name: "Tarefa interna", color: "#6B7280" },
];
export const DEFAULT_SCORING = [
  { key: "VENDA_FECHADA", label: "Venda fechada", points: 100, description: "Lead movido para Venda Fechada" },
  { key: "REUNIAO_COMERCIAL", label: "Reunião comercial realizada", points: 10, description: "Reunião do tipo comercial marcada como realizada" },
  { key: "META_ATINGIDA", label: "Meta mensal atingida", points: 200, description: "Bônus ao atingir 100% da meta do mês" },
  { key: "META_120", label: "Meta superada em 120%", points: 300, description: "Bônus adicional ao superar 120% da meta do mês" },
];
export const DEFAULT_FINANCE_CATEGORIES = ["Consultoria", "Gestão de tráfego", "Social media", "Mentoria", "Produção de conteúdo", "Outro"];
export const DEFAULT_SETTINGS: Record<string, unknown> = {
  company: { name: "Forte Company", tagline: "Marketing e Vendas", cnpj: "", phone: "", email: "", address: "" },
  goals: { monthly: 100000 },
  journey: { stepDays: { GRUPO_CRIADO: 1, CONTRATO: 3, FORMULARIO: 7, ONBOARDING: 10 }, weeklyMeetingDay: 2, reportDay: 5 },
};

let bootstrapped = false;
export async function ensureDefaults(force = false) {
  if (bootstrapped && !force) return;
  const [{ c: stages }] = await db.select({ c: count() }).from(t.pipelineStages);
  if (stages === 0) await db.insert(t.pipelineStages).values(DEFAULT_STAGES.map((s, i) => ({ ...s, order: i + 1 })));
  const [{ c: sources }] = await db.select({ c: count() }).from(t.leadSources);
  if (sources === 0) await db.insert(t.leadSources).values(DEFAULT_SOURCES.map((name) => ({ name })));
  const [{ c: losses }] = await db.select({ c: count() }).from(t.lossReasons);
  if (losses === 0) await db.insert(t.lossReasons).values(DEFAULT_LOSS_REASONS.map((name) => ({ name })));
  const [{ c: types }] = await db.select({ c: count() }).from(t.appointmentTypes);
  if (types === 0) await db.insert(t.appointmentTypes).values(DEFAULT_APPOINTMENT_TYPES);
  const [{ c: rules }] = await db.select({ c: count() }).from(t.scoringRules);
  if (rules === 0) await db.insert(t.scoringRules).values(DEFAULT_SCORING);
  const [{ c: cats }] = await db.select({ c: count() }).from(t.financeCategories);
  if (cats === 0) await db.insert(t.financeCategories).values(DEFAULT_FINANCE_CATEGORIES.map((name) => ({ name })));
  const [{ c: sets }] = await db.select({ c: count() }).from(t.settings);
  if (sets === 0) await db.insert(t.settings).values(Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value: value as never })));
  bootstrapped = true;
}

export async function hasUsers() {
  const [{ c }] = await db.select({ c: count() }).from(t.users);
  return c > 0;
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const [row] = await db.select().from(t.settings).where((await import("drizzle-orm")).eq(t.settings.key, key));
  return (row?.value as T) ?? fallback;
}
