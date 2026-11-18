import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, t } from "@/db";
import { logExecution } from "./log";
import type { SalesCopSettings } from "./settings";

/**
 * Integração com a WhatsApp Business Cloud API (Meta).
 * Variáveis: WHATSAPP_TOKEN (token permanente do System User), WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN (webhook),
 *            WHATSAPP_API_VERSION (opcional, padrão v25.0), WHATSAPP_TEMPLATE_DAILY (opcional: template aprovado p/ iniciar conversa).
 * Nada é simulado: sem credenciais, o envio é bloqueado e registrado como BLOQUEADO.
 */
const API = () => `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION || "v25.0"}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
export const normalizePhone = (p?: string | null) => { const d = (p ?? "").replace(/\D/g, ""); if (!d) return ""; return d.length <= 11 ? `55${d}` : d; };

export function whatsappConfigured() { return !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID); }
export function whatsappReady(settings: SalesCopSettings) { return whatsappConfigured() && settings.whatsapp.enabled; }

export async function userByPhone(waId: string) {
  const users = await db.select({ id: t.users.id, name: t.users.name, role: t.users.role, phone: t.users.phone, active: t.users.active }).from(t.users).where(eq(t.users.active, true));
  const n = normalizePhone(waId);
  return users.find((u) => normalizePhone(u.phone) === n || (u.phone && n.endsWith(normalizePhone(u.phone).slice(-8)))) ?? null;
}

/** Janela de 24h: só é possível enviar texto livre se o usuário escreveu nas últimas 24h; fora disso exige template aprovado. */
async function inServiceWindow(waId: string) {
  const [last] = await db.select({ createdAt: t.whatsappMessages.createdAt }).from(t.whatsappMessages).where(and(eq(t.whatsappMessages.waId, waId), eq(t.whatsappMessages.direction, "IN"))).orderBy(desc(t.whatsappMessages.createdAt)).limit(1);
  return !!last && Date.now() - +last.createdAt < 24 * 3600 * 1000;
}

async function post(payload: Record<string, unknown>) {
  const r = await fetch(API(), { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` }, body: JSON.stringify(payload) });
  const json = (await r.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message: string } };
  if (!r.ok) throw new Error(json.error?.message || `WhatsApp API ${r.status}`);
  return json.messages?.[0]?.id ?? null;
}

/** Envia texto para um usuário do CRM (pelo id) ou telefone. Respeita a janela de 24h; fora dela usa o template informado. */
export async function sendWhatsAppText(opts: { userId?: string; phone?: string; text: string; template?: { name: string; params?: string[]; language?: string }; actorId?: string | null; kind?: string }) {
  let waId = normalizePhone(opts.phone), userId = opts.userId ?? null;
  if (opts.userId) { const [u] = await db.select({ phone: t.users.phone }).from(t.users).where(eq(t.users.id, opts.userId)); waId = normalizePhone(u?.phone); }
  if (!waId) { await logExecution({ kind: "whatsapp", action: "send", status: "BLOQUEADO", summary: "Usuário sem telefone cadastrado.", actorId: opts.actorId }); return { status: "BLOQUEADO" as const, reason: "Usuário sem telefone cadastrado." }; }
  if (!whatsappConfigured()) { await logExecution({ kind: "whatsapp", action: "send", status: "BLOQUEADO", summary: "WhatsApp não configurado (WHATSAPP_TOKEN/WHATSAPP_PHONE_NUMBER_ID).", actorId: opts.actorId }); return { status: "BLOQUEADO" as const, reason: "Integração WhatsApp não configurada." }; }
  // anti-duplicidade: mesma mensagem para o mesmo número nos últimos 10 min
  const [dup] = await db.select({ id: t.whatsappMessages.id, createdAt: t.whatsappMessages.createdAt }).from(t.whatsappMessages).where(and(eq(t.whatsappMessages.waId, waId), eq(t.whatsappMessages.direction, "OUT"), eq(t.whatsappMessages.body, opts.text))).orderBy(desc(t.whatsappMessages.createdAt)).limit(1);
  if (dup && Date.now() - +dup.createdAt < 10 * 60 * 1000) return { status: "IGNORADO" as const, reason: "Mensagem idêntica enviada há menos de 10 minutos." };
  const useTemplate = !(await inServiceWindow(waId)) ? opts.template ?? (process.env.WHATSAPP_TEMPLATE_DAILY ? { name: process.env.WHATSAPP_TEMPLATE_DAILY, params: [opts.text.slice(0, 1000)] } : null) : null;
  if (!(await inServiceWindow(waId)) && !useTemplate) { await logExecution({ kind: "whatsapp", action: "send", status: "BLOQUEADO", summary: `Fora da janela de 24h e sem template aprovado (${waId}).`, actorId: opts.actorId }); return { status: "BLOQUEADO" as const, reason: "Fora da janela de 24h: configure um template aprovado (WHATSAPP_TEMPLATE_DAILY) para iniciar conversas." }; }
  const [row] = await db.insert(t.whatsappMessages).values({ direction: "OUT", waId, userId, body: opts.text, template: useTemplate?.name ?? null, status: "PENDENTE" }).returning();
  try {
    const payload = useTemplate
      ? { messaging_product: "whatsapp", to: waId, type: "template", template: { name: useTemplate.name, language: { code: useTemplate.language ?? "pt_BR" }, components: useTemplate.params?.length ? [{ type: "body", parameters: useTemplate.params.map((p) => ({ type: "text", text: p })) }] : [] } }
      : { messaging_product: "whatsapp", to: waId, type: "text", text: { preview_url: false, body: opts.text.slice(0, 4000) } };
    const id = await post(payload);
    await db.update(t.whatsappMessages).set({ status: "ENVIADA", waMessageId: id, payload }).where(eq(t.whatsappMessages.id, row.id));
    await logExecution({ kind: "whatsapp", action: opts.kind ?? "send", summary: `Mensagem enviada para ${waId}${useTemplate ? ` (template ${useTemplate.name})` : ""}.`, actorId: opts.actorId });
    return { status: "OK" as const, id };
  } catch (e) {
    await db.update(t.whatsappMessages).set({ status: "FALHA", error: (e as Error).message }).where(eq(t.whatsappMessages.id, row.id));
    await logExecution({ kind: "whatsapp", action: "send", status: "ERRO", summary: (e as Error).message, actorId: opts.actorId });
    return { status: "ERRO" as const, reason: (e as Error).message };
  }
}

/** Processa o payload do webhook (mensagens recebidas e status). Retorna as mensagens de texto novas com o usuário identificado. */
export async function ingestWebhook(body: unknown) {
  const out: { messageId: string; waId: string; text: string; user: Awaited<ReturnType<typeof userByPhone>> }[] = [];
  const entries = ((body as { entry?: unknown[] })?.entry ?? []) as { changes?: { value?: { messages?: { id: string; from: string; type: string; text?: { body: string }; button?: { text: string }; interactive?: { button_reply?: { title: string }; list_reply?: { title: string } } }[]; statuses?: { id: string; status: string; errors?: { title: string }[] }[] } }[] }[];
  for (const e of entries) for (const ch of e.changes ?? []) {
    const v = ch.value ?? {};
    for (const st of v.statuses ?? []) {
      const map: Record<string, string> = { sent: "ENVIADA", delivered: "ENTREGUE", read: "LIDA", failed: "FALHA" };
      await db.update(t.whatsappMessages).set({ status: map[st.status] ?? st.status.toUpperCase(), error: st.errors?.[0]?.title ?? null }).where(eq(t.whatsappMessages.waMessageId, st.id));
    }
    for (const m of v.messages ?? []) {
      const text = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "";
      const user = await userByPhone(m.from);
      const inserted = await db.insert(t.whatsappMessages).values({ direction: "IN", waId: normalizePhone(m.from), userId: user?.id ?? null, body: text || `[${m.type}]`, waMessageId: m.id, status: "RECEBIDA", payload: m as never }).onConflictDoNothing().returning({ id: t.whatsappMessages.id });
      if (!inserted.length) continue; // duplicado (Meta reenvia webhooks)
      if (text) out.push({ messageId: m.id, waId: normalizePhone(m.from), text, user });
    }
  }
  return out;
}

export async function recentWhatsApp(limit = 40) {
  return db.query.whatsappMessages.findMany({ orderBy: [desc(t.whatsappMessages.createdAt)], limit, with: { user: { columns: { name: true } } } });
}
export { inArray };
