import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, t } from "@/db";
import { chatRoute, HttpError } from "@/lib/chat/api";
import { assertConversationAccess } from "@/lib/chat/core";
import { sendChatMessage } from "@/lib/chat/messages";
import { serializeMessage, MSG_WITH } from "@/lib/chat/queries";
import { canUseMedia } from "@/lib/chat/media-access";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.object({
  conversationId: z.string().optional(), conversationIds: z.array(z.string()).max(10).optional(),
  text: z.string().max(4096).optional().nullable(), mediaId: z.string().optional().nullable(), replyToId: z.string().optional().nullable(),
  forwardMessageId: z.string().optional().nullable(),
  template: z.object({ name: z.string().min(1), language: z.string().min(2), params: z.array(z.string().max(1000)).max(20) }).optional().nullable(),
});

/** Envio real pela Cloud API. Responde só depois que a Meta confirma (wamid); em caso de erro, a mensagem fica como FALHA com o motivo. */
export const POST = chatRoute(async (user, req) => {
  const p = schema.safeParse(await req.json().catch(() => ({})));
  if (!p.success) throw new HttpError(400, "Dados inválidos.");
  const d = p.data;
  let text = d.text ?? null, mediaId = d.mediaId ?? null;
  if (d.forwardMessageId) {
    const src = await db.query.chatMessages.findFirst({ where: eq(t.chatMessages.id, d.forwardMessageId) });
    if (!src || src.deletedAt) throw new HttpError(404, "Mensagem original não encontrada.");
    await assertConversationAccess(user, src.conversationId);
    text = src.body; mediaId = src.mediaId;
  } else if (mediaId && !(await canUseMedia(user, mediaId))) throw new HttpError(403, "Arquivo sem permissão de uso.");

  const targets = d.conversationIds?.length ? d.conversationIds : d.conversationId ? [d.conversationId] : [];
  if (!targets.length) throw new HttpError(400, "Selecione a conversa.");
  const results: { conversationId: string; ok: boolean; error?: string; message?: unknown }[] = [];
  for (const cid of targets) {
    try {
      const conv = await assertConversationAccess(user, cid);
      const r = await sendChatMessage({ conv, actorId: user.id, text, mediaId, replyToId: d.forwardMessageId ? null : d.replyToId, forwardedFromId: d.forwardMessageId ?? null, template: d.template ?? null });
      await db.update(t.chatConversations).set({ unreadCount: 0 }).where(eq(t.chatConversations.id, cid));
      const full = await db.query.chatMessages.findFirst({ where: eq(t.chatMessages.id, r.message.id), with: MSG_WITH });
      results.push({ conversationId: cid, ok: true, message: full ? serializeMessage(full, null) : null });
    } catch (e) { results.push({ conversationId: cid, ok: false, error: (e as Error).message }); }
  }
  if (targets.length === 1 && !results[0].ok) throw new HttpError(422, results[0].error!);
  return { results };
});
