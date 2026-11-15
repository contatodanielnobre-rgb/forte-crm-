"use server";
import { eq } from "drizzle-orm";
import { db, t } from "@/db";
import { getSession } from "@/lib/auth";
import { markAllRead } from "@/lib/notify";

export async function setThemeAction(theme: string) {
  const s = await getSession();
  if (!s || !["light", "dark", "system"].includes(theme)) return;
  await db.update(t.users).set({ theme }).where(eq(t.users.id, s.id));
}
export async function markNotificationsRead() {
  const s = await getSession();
  if (s) await markAllRead(s.id);
}
