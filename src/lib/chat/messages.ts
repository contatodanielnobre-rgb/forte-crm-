import "server-only";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, t } from "@/db";
import { cloudConfigured, cloudSend, cloudUploadMedia, WhatsAppApiError, WhatsAppNotConfigured, waKindFor, WA_LIMITS, type SendPayload } from "./cloud-api";
import { readChatFile, storeChatFile } from "./storage";
import { getChatSettings, logInteraction, previewFor, windowOpen } from "./core";

export class WindowClosedError extends Error {
  constructor() { super("Fora da janela de 24h: o contato não escreve há mais de 24 horas. Pela regra do WhatsApp, só é possível enviar um modelo (template) aprovado."); }
}

type Conv = typeof t.chatConversations.$inferSelect;
export type SendInput = {
  conv: Conv; actorId: string | null;
  text?: string | null; mediaId?: string | null; replyToId?: string | null; forwardedFromId?: string | null;
  template?: { name: string; language: string; params: string[] } | null;
  idempotencyKey?: string | null; scheduledTaskId?: string | null;
};

export async function createMediaFromBuffer(data: Buffer, fileName: string, mimeType: string, uploadedById: string | null, extra: { durationSec?: number | null; waMediaId?: string | null; sha256?: string | null } = {}) {
  const stored = await storeChatFile(data, fileName, mimeType);
  const kind = mimeType.startsWith("image/webp") ? "sticker" : waKindFor(mimeType);
  const [m] = await db.insert(t.chatMedia).values({ ...stored, fileName, mimeType, size: data.length, kind, durationSec: extra.durationSec ?? null, waMediaId: extra.waMediaId ?? null, sha256: extra.sha256 ?? null, uploadedById }).returning();
  return m;
}

export function validateForWhatsApp(mime: string, size: number) {
  const kind = waKindFor(mime);
  const lim = WA_LIMITS[kind];
  if (size > lim.max) throw new Error(`Arquivo grande demais para o WhatsApp (${kind}: máx. ${Math.round(lim.max / 1048576)} MB).`);
  return kind;
}

/** Envia de verdade pela Cloud API. Só marca ENVIADA quando a Meta devolve o wamid. */
export async function sendChatMessage(i: SendInput) {
  if (!cloudConfigured()) throw new WhatsAppNotConfigured();
  if (!i.template && !windowOpen(i.conv.lastInboundAt)) throw new WindowClosedError();
  if (!i.template && !i.mediaId && !i.text?.trim()) throw new Error("Mensagem vazia.");

  // idempotência: a mesma chave nunca gera dois envios
  if (i.idempotencyKey) {
    const dup = await db.query.chatMessages.findFirst({ where: eq(t.chatMessages.idempotencyKey, i.idempotencyKey) });
    if (dup && dup.status !== "FALHA") return { message: dup, duplicate: true };
    if (dup) await db.update(t.chatMessages).set({ idempotencyKey: `${i.idempotencyKey}:falha:${dup.id}` }).where(eq(t.chatMessages.id, dup.id));
  }

  const media = i.mediaId ? await db.query.chatMedia.findFirst({ where: eq(t.chatMedia.id, i.mediaId) }) : null;
  if (i.mediaId && !media) throw new Error("Arquivo não encontrado.");
  const kind = media ? validateForWhatsApp(media.mimeType, media.size) : null;
  const type = i.template ? "template" : kind ?? "text";
  const body = i.template ? `[Modelo ${i.template.name}] ${i.template.params.join(" · ")}` : i.text?.trim() || null;
  const reply = i.replyToId ? await db.query.chatMessages.findFirst({ where: and(eq(t.chatMessages.id, i.replyToId), eq(t.chatMessages.conversationId, i.conv.id)) }) : null;

  const [row] = await db.insert(t.chatMessages).values({
    conversationId: i.conv.id, direction: "OUT", type, body, mediaId: media?.id ?? null, replyToId: reply?.id ?? null, forwardedFromId: i.forwardedFromId ?? null,
    senderId: i.actorId, idempotencyKey: i.idempotencyKey ?? null, status: "PENDENTE", template: i.template?.name ?? null, scheduledTaskId: i.scheduledTaskId ?? null,
  }).returning();

  try {
    let payload: SendPayload;
    if (i.template) payload = { kind: "template", ...i.template };
    else if (media && kind) {
      const data = await readChatFile(media);
      const waMediaId = await cloudUploadMedia(data, media.mimeType.split(";")[0], media.fileName);
      payload = { kind, waMediaId, caption: body, filename: media.fileName };
    } else payload = { kind: "text", text: body! };
    const res = await cloudSend(i.conv.waId, payload, reply?.waMessageId);
    const [sent] = await db.update(t.chatMessages).set({ status: "ENVIADA", waMessageId: res.waMessageId, sentAt: new Date(), payload: res.request as never }).where(eq(t.chatMessages.id, row.id)).returning();
    await db.update(t.chatConversations).set({ lastMessageAt: sent.createdAt, lastMessagePreview: previewFor(type, body), lastMessageDirection: "OUT", status: i.conv.status === "RESOLVIDA" ? "ABERTA" : i.conv.status }).where(eq(t.chatConversations.id, i.conv.id));
    await historyForOutbound(i.conv, i.actorId, type, body, media?.fileName);
    return { message: sent, duplicate: false };
  } catch (e) {
    const msg = (e as Error).message;
    await db.update(t.chatMessages).set({ status: "FALHA", error: msg }).where(eq(t.chatMessages.id, row.id));
    if (e instanceof WhatsAppApiError && e.code === 131047) throw new WindowClosedError();
    throw e;
  }
}

/** Histórico do lead: áudio/documento/imagem sempre; texto agrupado (1 registro a cada 30 min por vendedor) para não poluir a ficha. */
async function historyForOutbound(conv: Conv, actorId: string | null, type: string, body: string | null, fileName?: string) {
  if (!conv.leadId && !conv.clientId) return;
  const s = await getChatSettings();
  if (!s.logMessagesInHistory) { if (conv.leadId) await db.update(t.leads).set({ lastContactAt: new Date() }).where(eq(t.leads.id, conv.leadId)); return; }
  const label: Record<string, string> = { audio: "Áudio enviado pelo WhatsApp", document: `Documento enviado pelo WhatsApp${fileName ? `: ${fileName}` : ""}`, image: "Imagem enviada pelo WhatsApp", video: "Vídeo enviado pelo WhatsApp", template: `Modelo enviado pelo WhatsApp${body ? ` — ${body.slice(0, 160)}` : ""}` };
  if (type !== "text") return logInteraction(conv, actorId, label[type] ?? "Mensagem enviada pelo WhatsApp");
  const since = new Date(Date.now() - 30 * 60 * 1000);
  const ref = conv.leadId ? eq(t.interactions.leadId, conv.leadId) : eq(t.interactions.clientId, conv.clientId!);
  const [recent] = await db.select({ id: t.interactions.id }).from(t.interactions).where(and(ref, eq(t.interactions.type, "whatsapp"), gte(t.interactions.createdAt, since), actorId ? eq(t.interactions.userId, actorId) : sql`true`, sql`${t.interactions.content} like 'Mensagem enviada pelo WhatsApp%'`)).orderBy(desc(t.interactions.createdAt)).limit(1);
  if (recent) { if (conv.leadId) await db.update(t.leads).set({ lastContactAt: new Date() }).where(eq(t.leads.id, conv.leadId)); return; }
  await logInteraction(conv, actorId, `Mensagem enviada pelo WhatsApp: ${(body ?? "").slice(0, 200)}`);
}

export { WhatsAppNotConfigured, WhatsAppApiError };
