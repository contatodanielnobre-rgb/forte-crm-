import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, t } from "@/db";
import { cloudConfigured, cloudDownloadMedia } from "./cloud-api";
import { createMediaFromBuffer } from "./messages";
import { getChatSettings, previewFor, toWaId, upsertConversation } from "./core";
import { notify } from "@/lib/notify";
import { stageByFlag } from "@/lib/services/leads";
import { audit } from "@/lib/audit";

type WaMedia = { id: string; mime_type?: string; sha256?: string; caption?: string; filename?: string; voice?: boolean };
type WaMessage = {
  id: string; from: string; timestamp?: string; type: string;
  text?: { body: string }; image?: WaMedia; audio?: WaMedia; video?: WaMedia; document?: WaMedia; sticker?: WaMedia;
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  contacts?: { name?: { formatted_name?: string }; phones?: { phone?: string }[] }[];
  button?: { text: string }; interactive?: { button_reply?: { title: string }; list_reply?: { title: string } };
  reaction?: { message_id: string; emoji?: string };
  context?: { id?: string; forwarded?: boolean };
};
type WaStatus = { id: string; status: string; timestamp?: string; recipient_id?: string; errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[] };
type WaValue = { contacts?: { wa_id: string; profile?: { name?: string } }[]; messages?: WaMessage[]; statuses?: WaStatus[] };

/** Números de membros da equipe vão para o SALES COP (fluxo existente) e não viram conversa de cliente. */
async function teamKeys() {
  const { phoneKey } = await import("./core");
  const users = await db.select({ phone: t.users.phone }).from(t.users).where(eq(t.users.active, true));
  return new Set(users.map((u) => phoneKey(u.phone)).filter(Boolean));
}

const STATUS_MAP: Record<string, string> = { sent: "ENVIADA", delivered: "ENTREGUE", read: "LIDA", failed: "FALHA" };
const RANK: Record<string, number> = { PENDENTE: 0, ENVIADA: 1, ENTREGUE: 2, LIDA: 3, FALHA: 4 };

/** Processa o payload do webhook da Meta para o FORTE CHAT (mensagens de contatos + status de entrega/leitura). Idempotente. */
export async function ingestChatWebhook(body: unknown) {
  const { phoneKey } = await import("./core");
  const team = await teamKeys();
  const settings = await getChatSettings();
  const result = { messages: 0, statuses: 0, skippedTeam: 0 };
  const entries = ((body as { entry?: { changes?: { field?: string; value?: WaValue }[] }[] })?.entry ?? []);
  for (const e of entries) for (const ch of e.changes ?? []) {
    const v = ch.value ?? {};
    for (const st of v.statuses ?? []) {
      const status = STATUS_MAP[st.status];
      if (!status) continue;
      const msg = await db.query.chatMessages.findFirst({ where: eq(t.chatMessages.waMessageId, st.id), columns: { id: true, status: true } });
      if (!msg) continue;
      const at = st.timestamp ? new Date(Number(st.timestamp) * 1000) : new Date();
      // status só avança (a Meta pode entregar fora de ordem); falha sempre registra
      if (status !== "FALHA" && RANK[status] <= RANK[msg.status]) continue;
      const err = st.errors?.[0];
      await db.update(t.chatMessages).set({
        status, ...(status === "ENTREGUE" ? { deliveredAt: at } : {}), ...(status === "LIDA" ? { readAt: at } : {}),
        ...(status === "FALHA" ? { error: err?.error_data?.details || err?.message || err?.title || "Falha na entrega" } : {}),
      }).where(eq(t.chatMessages.id, msg.id));
      result.statuses++;
    }
    for (const m of v.messages ?? []) {
      if (team.has(phoneKey(m.from))) { result.skippedTeam++; continue; }
      const exists = await db.query.chatMessages.findFirst({ where: eq(t.chatMessages.waMessageId, m.id), columns: { id: true } });
      if (exists) continue; // a Meta reenvia webhooks
      const waId = toWaId(m.from);
      const profileName = v.contacts?.find((c) => c.wa_id === m.from)?.profile?.name ?? null;
      let conv = await upsertConversation(waId, { profileName, canonical: true });
      if (!conv.leadId && !conv.clientId && settings.autoCreateLead) conv = await autoCreateLead(conv, profileName);

      const { type, body, media } = parseContent(m);
      let mediaId: string | null = null, error: string | null = null;
      if (media) {
        try {
          if (!cloudConfigured()) throw new Error("WhatsApp não configurado para baixar a mídia.");
          const dl = await cloudDownloadMedia(media.id);
          const ext = (dl.mimeType.split("/")[1] ?? "bin").split(";")[0].replace("mpeg", "mp3");
          const saved = await createMediaFromBuffer(dl.data, media.filename || `${type}-${m.id.slice(-8)}.${ext}`, dl.mimeType, null, { waMediaId: media.id, sha256: dl.sha256 });
          mediaId = saved.id;
        } catch (err) { error = `Mídia não baixada: ${(err as Error).message}`; }
      }
      const replyTo = m.context?.id ? await db.query.chatMessages.findFirst({ where: eq(t.chatMessages.waMessageId, m.context.id), columns: { id: true } }) : null;
      const createdAt = m.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date();
      const inserted = await db.insert(t.chatMessages).values({
        conversationId: conv.id, direction: "IN", type, body, mediaId, replyToId: replyTo?.id ?? null, waMessageId: m.id, status: "RECEBIDA", error,
        payload: { ...m, forwarded: m.context?.forwarded ?? false, waMediaId: media?.id ?? null } as never, createdAt,
      }).onConflictDoNothing().returning({ id: t.chatMessages.id });
      if (!inserted.length) continue;
      if (type === "reaction") continue; // reação não muda a lista nem conta como não lida
      await db.update(t.chatConversations).set({
        lastMessageAt: createdAt, lastMessagePreview: previewFor(type, body), lastMessageDirection: "IN", lastInboundAt: createdAt,
        unreadCount: sql`${t.chatConversations.unreadCount} + 1`, archived: false, status: conv.status === "RESOLVIDA" ? "ABERTA" : conv.status,
      }).where(eq(t.chatConversations.id, conv.id));
      result.messages++;
      const owner = conv.assigneeId;
      if (owner) await notify([owner], `Nova mensagem de ${profileName ?? waId}`, previewFor(type, body), `/forte-chat?c=${conv.id}`);
    }
  }
  return result;
}

function parseContent(m: WaMessage): { type: string; body: string | null; media: WaMedia | null } {
  switch (m.type) {
    case "text": return { type: "text", body: m.text?.body ?? "", media: null };
    case "image": case "audio": case "video": case "document": case "sticker": {
      const media = m[m.type as "image"] ?? null;
      return { type: m.type, body: media?.caption ?? (m.type === "document" ? media?.filename ?? null : null), media };
    }
    case "location": return { type: "location", body: [m.location?.name, m.location?.address, `${m.location?.latitude},${m.location?.longitude}`].filter(Boolean).join(" — "), media: null };
    case "contacts": return { type: "contacts", body: (m.contacts ?? []).map((c) => `${c.name?.formatted_name ?? ""} ${c.phones?.map((p) => p.phone).join(", ") ?? ""}`.trim()).join("; "), media: null };
    case "button": return { type: "text", body: m.button?.text ?? "", media: null };
    case "interactive": return { type: "text", body: m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "", media: null };
    case "reaction": return { type: "reaction", body: m.reaction?.emoji ?? "", media: null };
    default: return { type: "unsupported", body: `Tipo de mensagem não suportado pela Cloud API (${m.type}).`, media: null };
  }
}

/** Opcional (Configurações do chat): número desconhecido vira lead em "Novo Lead", origem WhatsApp. */
async function autoCreateLead(conv: typeof t.chatConversations.$inferSelect, profileName: string | null) {
  const stage = await stageByFlag("isDefault");
  if (!stage) return conv;
  const source = await db.query.leadSources.findFirst({ where: eq(t.leadSources.name, "WhatsApp") });
  const [lead] = await db.insert(t.leads).values({ name: profileName || `WhatsApp ${conv.waId}`, phone: conv.waId, stageId: stage.id, sourceId: source?.id ?? null, ownerId: conv.assigneeId }).returning();
  await db.insert(t.interactions).values({ leadId: lead.id, type: "sistema", content: "Lead criado automaticamente a partir de mensagem recebida no FORTE CHAT." });
  await audit(null, "create", "lead", lead.id, `Lead ${lead.name} criado pelo FORTE CHAT (WhatsApp)`);
  const [u] = await db.update(t.chatConversations).set({ leadId: lead.id }).where(eq(t.chatConversations.id, conv.id)).returning();
  return u;
}
