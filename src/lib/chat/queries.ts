import "server-only";
import { and, asc, desc, eq, gt, ilike, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { db, t } from "@/db";
import type { SessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { visibleConversationsWhere, windowOpen } from "./core";

export type ConvFilters = { q?: string; label?: string; assignee?: string; unread?: boolean; kind?: "lead" | "cliente" | "novo" | ""; view?: "todas" | "arquivadas" | "favoritas" };

const fmtPhone = (w: string) => (w.startsWith("55") && w.length >= 12 ? `+55 (${w.slice(2, 4)}) ${w.slice(4, w.length - 4)}-${w.slice(-4)}` : `+${w}`);

export async function listConversations(user: SessionUser, f: ConvFilters, limit = 150) {
  const conds: (SQL | undefined)[] = [await visibleConversationsWhere(user)];
  const C = t.chatConversations;
  if (f.view === "arquivadas") conds.push(eq(C.archived, true));
  else if (f.view === "favoritas") conds.push(sql`exists (select 1 from chat_favorites f where f.conversation_id = ${C.id} and f.user_id = ${user.id})`);
  else conds.push(eq(C.archived, false));
  if (f.unread) conds.push(gt(C.unreadCount, 0));
  if (f.kind === "cliente") conds.push(sql`${C.clientId} is not null`);
  if (f.kind === "lead") conds.push(and(sql`${C.leadId} is not null`, isNull(C.clientId)));
  if (f.kind === "novo") conds.push(and(isNull(C.leadId), isNull(C.clientId)));
  if (f.assignee === "none") conds.push(isNull(C.assigneeId)); else if (f.assignee) conds.push(eq(C.assigneeId, f.assignee));
  if (f.label) conds.push(sql`exists (select 1 from chat_contact_labels cl where cl.label_id = ${f.label} and (cl.conversation_id = ${C.id} or (cl.lead_id is not null and cl.lead_id = ${C.leadId}) or (cl.client_id is not null and cl.client_id = ${C.clientId})))`);
  if (f.q?.trim()) {
    const q = `%${f.q.trim()}%`, d = f.q.replace(/\D/g, "");
    conds.push(or(ilike(C.profileName, q), ilike(C.lastMessagePreview, q), d.length >= 4 ? ilike(C.waId, `%${d}%`) : undefined,
      sql`exists (select 1 from leads l where l.id = ${C.leadId} and (l.name ilike ${q} or l.company ilike ${q}))`,
      sql`exists (select 1 from clients c where c.id = ${C.clientId} and (c.name ilike ${q} or c.company ilike ${q}))`,
      sql`exists (select 1 from chat_messages m where m.conversation_id = ${C.id} and m.deleted_at is null and m.body ilike ${q})`));
  }
  const rows = await db.query.chatConversations.findMany({
    where: and(...conds.filter(Boolean)), orderBy: [sql`${C.lastMessageAt} desc nulls last`, desc(C.createdAt)], limit,
    with: { lead: { columns: { id: true, name: true, company: true, phone: true, ownerId: true }, with: { stage: { columns: { id: true, name: true, color: true } } } }, client: { columns: { id: true, name: true, company: true, ownerId: true, status: true } }, assignee: { columns: { id: true, name: true, avatarUrl: true } } },
  });
  return decorate(rows, user);
}

type ConvRow = Awaited<ReturnType<typeof db.query.chatConversations.findMany<{ with: { lead: { columns: { id: true; name: true; company: true; phone: true; ownerId: true }; with: { stage: { columns: { id: true; name: true; color: true } } } }; client: { columns: { id: true; name: true; company: true; ownerId: true; status: true } }; assignee: { columns: { id: true; name: true; avatarUrl: true } } } }>>>[number];

async function decorate(rows: ConvRow[], user: SessionUser) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id), leadIds = rows.map((r) => r.leadId).filter(Boolean) as string[], clientIds = rows.map((r) => r.clientId).filter(Boolean) as string[];
  const [labels, favs] = await Promise.all([
    db.select({ labelId: t.chatContactLabels.labelId, leadId: t.chatContactLabels.leadId, clientId: t.chatContactLabels.clientId, conversationId: t.chatContactLabels.conversationId, name: t.chatLabels.name, color: t.chatLabels.color, order: t.chatLabels.order })
      .from(t.chatContactLabels).innerJoin(t.chatLabels, eq(t.chatLabels.id, t.chatContactLabels.labelId))
      .where(or(inArray(t.chatContactLabels.conversationId, ids), leadIds.length ? inArray(t.chatContactLabels.leadId, leadIds) : undefined, clientIds.length ? inArray(t.chatContactLabels.clientId, clientIds) : undefined)),
    db.select({ id: t.chatFavorites.conversationId }).from(t.chatFavorites).where(and(eq(t.chatFavorites.userId, user.id), inArray(t.chatFavorites.conversationId, ids))),
  ]);
  const favSet = new Set(favs.map((f) => f.id));
  return rows.map((r) => {
    const mine = labels.filter((l) => l.conversationId === r.id || (l.leadId && l.leadId === r.leadId) || (l.clientId && l.clientId === r.clientId));
    const uniq = [...new Map(mine.map((l) => [l.labelId, { id: l.labelId, name: l.name, color: l.color, order: l.order }])).values()].sort((a, b) => a.order - b.order);
    return {
      id: r.id, waId: r.waId, phone: fmtPhone(r.waId), name: r.client?.name ?? r.lead?.name ?? r.profileName ?? fmtPhone(r.waId), profileName: r.profileName,
      company: r.client?.company ?? r.lead?.company ?? null, kind: r.clientId ? "cliente" : r.leadId ? "lead" : "novo",
      leadId: r.leadId, clientId: r.clientId, stage: r.lead?.stage ?? null, clientStatus: r.client?.status ?? null,
      assignee: r.assignee, status: r.status, archived: r.archived, favorite: favSet.has(r.id), unread: r.unreadCount,
      lastMessageAt: r.lastMessageAt, lastMessagePreview: r.lastMessagePreview, lastMessageDirection: r.lastMessageDirection,
      windowOpen: windowOpen(r.lastInboundAt), lastInboundAt: r.lastInboundAt, labels: uniq, updatedAt: r.updatedAt,
      canManage: can(user.role, "chat.viewAll") || r.assigneeId === user.id || r.lead?.ownerId === user.id || r.client?.ownerId === user.id,
    };
  });
}
export type ConversationItem = Awaited<ReturnType<typeof listConversations>>[number];

export async function getConversationItem(user: SessionUser, id: string) {
  const where = await visibleConversationsWhere(user);
  const rows = await db.query.chatConversations.findMany({
    where: where ? and(eq(t.chatConversations.id, id), where) : eq(t.chatConversations.id, id), limit: 1,
    with: { lead: { columns: { id: true, name: true, company: true, phone: true, ownerId: true }, with: { stage: { columns: { id: true, name: true, color: true } } } }, client: { columns: { id: true, name: true, company: true, ownerId: true, status: true } }, assignee: { columns: { id: true, name: true, avatarUrl: true } } },
  });
  return (await decorate(rows, user))[0] ?? null;
}

const MSG_WITH = { media: { columns: { id: true, fileName: true, mimeType: true, size: true, durationSec: true, kind: true } }, sender: { columns: { id: true, name: true } } } as const;

export async function listMessages(conversationId: string, opts: { before?: Date; after?: Date; q?: string; limit?: number } = {}) {
  const M = t.chatMessages;
  const conds = [eq(M.conversationId, conversationId)];
  if (opts.before) conds.push(lt(M.createdAt, opts.before));
  if (opts.after) conds.push(gt(M.updatedAt, opts.after));
  if (opts.q?.trim()) conds.push(ilike(M.body, `%${opts.q.trim()}%`), isNull(M.deletedAt));
  const rows = await db.query.chatMessages.findMany({ where: and(...conds), orderBy: opts.after ? [asc(M.updatedAt)] : [desc(M.createdAt)], limit: opts.limit ?? 60, with: MSG_WITH });
  const list = opts.after ? rows : rows.reverse();
  // citações (resposta a mensagem)
  const replyIds = [...new Set(list.map((m) => m.replyToId).filter(Boolean))] as string[];
  const replies = replyIds.length ? await db.select({ id: M.id, body: M.body, type: M.type, direction: M.direction, deletedAt: M.deletedAt }).from(M).where(inArray(M.id, replyIds)) : [];
  return list.map((m) => serializeMessage(m, replies.find((r) => r.id === m.replyToId) ?? null));
}

type MsgRow = typeof t.chatMessages.$inferSelect & { media: { id: string; fileName: string; mimeType: string; size: number; durationSec: number | null; kind: string } | null; sender: { id: string; name: string } | null };
export function serializeMessage(m: MsgRow, reply: { id: string; body: string | null; type: string; direction: string; deletedAt: Date | null } | null) {
  const deleted = !!m.deletedAt;
  const p = (m.payload ?? {}) as { forwarded?: boolean; reaction?: { message_id?: string } };
  return {
    id: m.id, conversationId: m.conversationId, direction: m.direction, type: m.type, body: deleted ? null : m.body, status: m.status, error: m.error,
    media: deleted ? null : m.media, sender: m.sender, createdAt: m.createdAt, updatedAt: m.updatedAt, deleted, template: m.template,
    forwarded: !!m.forwardedFromId || !!p.forwarded, scheduled: !!m.scheduledTaskId, waMessageId: m.waMessageId,
    reactionTo: m.type === "reaction" ? p.reaction?.message_id ?? null : null,
    reply: reply ? { id: reply.id, body: reply.deletedAt ? "Mensagem apagada" : reply.body, type: reply.type, direction: reply.direction } : null,
  };
}
export type ChatMessageItem = ReturnType<typeof serializeMessage>;
export { MSG_WITH };
