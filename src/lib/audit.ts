import { db, t } from "@/db";

export async function audit(userId: string | null, action: string, entity: string, entityId: string | null, summary: string, diff?: unknown) {
  try { await db.insert(t.auditLogs).values({ userId, action, entity, entityId, summary, diff: diff as never }); } catch (e) { console.error("audit", e); }
}
