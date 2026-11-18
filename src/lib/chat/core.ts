import "server-only";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { db, t } from "@/db";
import { getSetting } from "@/lib/bootstrap";
import { can } from "@/lib/permissions";
import type { SessionUser } from "@/lib/auth";

export type ChatSettings = { autoCreateLead: boolean; unassignedVisibleToAll: boolean; logMessagesInHistory: boolean };
export const DEFAULT_CHAT_SETTINGS: ChatSettings = { autoCreateLead: false, unassignedVisibleToAll: true, logMessagesInHistory: true };
export async function getChatSettings(): Promise<ChatSettings> { return { ...DEFAULT_CHAT_SETTINGS, ...(await getSetting<Partial<ChatSettings>>("chat", {})) }; }

export const DEFAULT_LABELS = [
  { name: "Novo Lead", color: "#6B7280" }, { name: "Em Atendimento", color: "#3B82F6" }, { name: "Qualificado", color: "#8B5CF6" },
  { name: "Proposta Enviada", color: "#06B6D4" }, { name: "Aguardando Resposta", color: "#F59E0B" }, { name: "Follow-up", color: "#F97316" },
  { name: "Cliente Ativo", color: "#10B981" }, { name: "Cliente Inativo", color: "#374151" }, { name: "Prioridade", color: "#D4A017" }, { name: "Urgente", color: "#D91E3A" },
];
let labelsReady = false;
export async function ensureChatDefaults() {
  if (labelsReady) return;
  const [{ c }] = await db.select({ c: sql<number>`count(*)::int` }).from(t.chatLabels);
  if (c === 0) await db.insert(t.chatLabels).values(DEFAULT_LABELS.map((l, i) => ({ ...l, order: i }))).onConflictDoNothing();
  labelsReady = true;
}

// ───────────── Telefones ─────────────
export const digits = (p?: string | null) => (p ?? "").replace(/\D/g, "");
/** Normaliza para E.164 sem "+" (Brasil por padrão quando vier sem DDI). */
export function toWaId(p?: string | null) { const d = digits(p).replace(/^0+/, ""); if (!d) return ""; return d.length <= 11 ? `55${d}` : d; }
/** Chave de comparação: DDD + 8 últimos dígitos para números do Brasil (tolera o "9" extra), senão os 10 últimos. */
export function phoneKey(p?: string | null) {
  const d = toWaId(p);
  if (!d) return "";
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return `55${d.slice(2, 4)}${d.slice(-8)}`;
  return d.slice(-10);
}
export const samePhone = (a?: string | null, b?: string | null) => !!a && !!b && phoneKey(a) === phoneKey(b);

/** Encontra o contato do CRM (cliente tem prioridade; depois lead) pelo telefone — evita duplicar contatos. */
export async function findContactByPhone(phone: string) {
  const last8 = digits(phone).slice(-8);
  if (last8.length < 8) return { lead: null, client: null };
  const clients = await db.select({ id: t.clients.id, name: t.clients.name, phone: t.clients.phone, whatsapp: t.clients.whatsapp, leadId: t.clients.leadId, ownerId: t.clients.ownerId })
    .from(t.clients).where(sql`right(regexp_replace(coalesce(${t.clients.whatsapp}, ''), '\\D', '', 'g'), 8) = ${last8} or right(regexp_replace(coalesce(${t.clients.phone}, ''), '\\D', '', 'g'), 8) = ${last8}`);
  const client = clients.find((c) => samePhone(c.whatsapp, phone) || samePhone(c.phone, phone)) ?? null;
  const leads = await db.select({ id: t.leads.id, name: t.leads.name, phone: t.leads.phone, ownerId: t.leads.ownerId, archived: t.leads.archived, createdAt: t.leads.createdAt })
    .from(t.leads).where(sql`right(regexp_replace(coalesce(${t.leads.phone}, ''), '\\D', '', 'g'), 8) = ${last8}`).orderBy(desc(t.leads.createdAt));
  const matches = leads.filter((l) => samePhone(l.phone, phone));
  const lead = (client?.leadId ? matches.find((l) => l.id === client.leadId) : null) ?? matches.find((l) => !l.archived) ?? matches[0] ?? null;
  return { lead, client };
}

export async function findConversationByPhone(phone: string) {
  const last8 = digits(phone).slice(-8);
  if (last8.length < 8) return null;
  const rows = await db.select().from(t.chatConversations).where(sql`right(${t.chatConversations.waId}, 8) = ${last8}`);
  return rows.find((c) => samePhone(c.waId, phone)) ?? null;
}

/** Retorna (ou cria) a conversa do número, vinculando lead/cliente existentes. Nunca cria lead aqui. */
export async function upsertConversation(waId: string, opts: { profileName?: string | null; leadId?: string | null; clientId?: string | null; assigneeId?: string | null; canonical?: boolean } = {}) {
  const existing = await findConversationByPhone(waId);
  if (existing) {
    const patch: Partial<typeof t.chatConversations.$inferInsert> = {};
    if (opts.canonical && existing.waId !== waId) patch.waId = waId; // o wa_id vindo da Meta é o oficial para envio
    if (opts.profileName && opts.profileName !== existing.profileName) patch.profileName = opts.profileName;
    if (!existing.leadId && opts.leadId) patch.leadId = opts.leadId;
    if (!existing.clientId && opts.clientId) patch.clientId = opts.clientId;
    if (!existing.assigneeId && opts.assigneeId) patch.assigneeId = opts.assigneeId;
    if (Object.keys(patch).length) { const [u] = await db.update(t.chatConversations).set(patch).where(eq(t.chatConversations.id, existing.id)).returning(); return u; }
    return existing;
  }
  let { leadId = null, clientId = null, assigneeId = null } = opts;
  if (!leadId && !clientId) {
    const found = await findContactByPhone(waId);
    leadId = found.lead?.id ?? found.client?.leadId ?? null; clientId = found.client?.id ?? null;
    assigneeId = assigneeId ?? found.client?.ownerId ?? found.lead?.ownerId ?? null;
  }
  if (leadId && !clientId) { const c = await db.query.clients.findFirst({ where: eq(t.clients.leadId, leadId), columns: { id: true, ownerId: true } }); if (c) clientId = c.id; }
  const [row] = await db.insert(t.chatConversations).values({ waId, profileName: opts.profileName ?? null, leadId, clientId, assigneeId }).onConflictDoNothing().returning();
  return row ?? (await db.query.chatConversations.findFirst({ where: eq(t.chatConversations.waId, waId) }))!;
}

// ───────────── Permissões ─────────────
/** Condição SQL das conversas que o usuário pode ver. */
export async function visibleConversationsWhere(user: SessionUser): Promise<SQL | undefined> {
  if (can(user.role, "chat.viewAll")) return undefined;
  const s = await getChatSettings();
  const mine = sql`(${t.chatConversations.assigneeId} = ${user.id}
    or exists (select 1 from ${t.leads} l where l.id = ${t.chatConversations.leadId} and l.owner_id = ${user.id})
    or exists (select 1 from ${t.clients} c where c.id = ${t.chatConversations.clientId} and c.owner_id = ${user.id}))`;
  if (!s.unassignedVisibleToAll) return mine;
  const unassigned = sql`(${t.chatConversations.assigneeId} is null
    and not exists (select 1 from ${t.leads} l where l.id = ${t.chatConversations.leadId} and l.owner_id is not null)
    and not exists (select 1 from ${t.clients} c where c.id = ${t.chatConversations.clientId} and c.owner_id is not null))`;
  return sql`(${mine} or ${unassigned})`;
}

export async function assertConversationAccess(user: SessionUser, conversationId: string) {
  if (!can(user.role, "chat.view")) throw new Error("Acesso negado ao FORTE CHAT.");
  const where = await visibleConversationsWhere(user);
  const [conv] = await db.select().from(t.chatConversations).where(where ? and(eq(t.chatConversations.id, conversationId), where) : eq(t.chatConversations.id, conversationId));
  if (!conv) throw new Error("Conversa não encontrada ou sem permissão de acesso.");
  return conv;
}

/** Janela de atendimento de 24h (regra da Meta para mensagens livres). */
export const windowOpen = (lastInboundAt?: Date | null) => !!lastInboundAt && Date.now() - +new Date(lastInboundAt) < 24 * 3600 * 1000;

export function previewFor(type: string, body?: string | null) {
  const label: Record<string, string> = { image: "📷 Imagem", audio: "🎤 Áudio", document: "📄 Documento", video: "🎬 Vídeo", sticker: "Figurinha", location: "📍 Localização", contacts: "👤 Contato", template: "Modelo", unsupported: "Mensagem não suportada" };
  if (type === "text" || type === "template") return (body ?? "").slice(0, 140);
  return body ? `${label[type] ?? type}: ${body.slice(0, 100)}` : label[type] ?? type;
}

/** Registra no histórico do lead/cliente (tabela interactions — a mesma da ficha). */
export async function logInteraction(conv: { leadId: string | null; clientId: string | null }, userId: string | null, content: string, type = "whatsapp") {
  const rows: (typeof t.interactions.$inferInsert)[] = [];
  if (conv.clientId) rows.push({ clientId: conv.clientId, userId, type, content });
  if (conv.leadId) rows.push({ leadId: conv.leadId, userId, type, content });
  if (rows.length) await db.insert(t.interactions).values(rows);
  if (conv.leadId) await db.update(t.leads).set({ lastContactAt: new Date() }).where(eq(t.leads.id, conv.leadId));
}
