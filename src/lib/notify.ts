import { db, t } from "@/db";
import { eq, inArray } from "drizzle-orm";

type Kind = "info" | "warning" | "success" | "danger";
export async function notify(userIds: (string | null | undefined)[], title: string, body?: string, href?: string, kind: Kind = "info") {
  const ids = [...new Set(userIds.filter((x): x is string => !!x))];
  if (!ids.length) return;
  await db.insert(t.notifications).values(ids.map((userId) => ({ userId, title, body, href, kind })));
}
export async function notifyManagers(title: string, body?: string, href?: string, kind: Kind = "info") {
  const mgrs = await db.select({ id: t.users.id }).from(t.users).where(inArray(t.users.role, ["ADMIN", "GESTOR"]));
  await notify(mgrs.map((m) => m.id), title, body, href, kind);
}
export async function markAllRead(userId: string) {
  await db.update(t.notifications).set({ readAt: new Date() }).where(eq(t.notifications.userId, userId));
}
