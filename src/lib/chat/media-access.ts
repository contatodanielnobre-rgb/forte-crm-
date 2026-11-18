import "server-only";
import { and, eq, or } from "drizzle-orm";
import { db, t } from "@/db";
import type { SessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { visibleConversationsWhere } from "./core";

/** Um arquivo pode ser acessado por quem o enviou, por quem vê a conversa onde ele aparece ou pelo responsável da tarefa agendada. */
export async function canUseMedia(user: SessionUser, mediaId: string) {
  const media = await db.query.chatMedia.findFirst({ where: eq(t.chatMedia.id, mediaId), columns: { id: true, uploadedById: true } });
  if (!media) return false;
  if (media.uploadedById === user.id || can(user.role, "chat.viewAll")) return true;
  const where = await visibleConversationsWhere(user);
  const [inConv] = await db.select({ id: t.chatMessages.id }).from(t.chatMessages).innerJoin(t.chatConversations, eq(t.chatConversations.id, t.chatMessages.conversationId)).where(and(eq(t.chatMessages.mediaId, mediaId), where)).limit(1);
  if (inConv) return true;
  const [inTask] = await db.select({ id: t.chatScheduledTasks.id }).from(t.chatScheduledTasks).where(and(eq(t.chatScheduledTasks.mediaId, mediaId), or(eq(t.chatScheduledTasks.assigneeId, user.id), eq(t.chatScheduledTasks.createdById, user.id)))).limit(1);
  return !!inTask;
}
