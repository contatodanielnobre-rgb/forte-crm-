import { desc, eq, and, isNull, count } from "drizzle-orm";
import { db, t } from "@/db";
import { requireUser } from "@/lib/auth";
import { ensureDefaults, getSetting } from "@/lib/bootstrap";
import { AppShell } from "@/components/shell/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  await ensureDefaults();
  const [company, notifications, [{ c: unread }]] = await Promise.all([
    getSetting<{ name: string }>("company", { name: "Forte Company" }),
    db.select().from(t.notifications).where(eq(t.notifications.userId, user.id)).orderBy(desc(t.notifications.createdAt)).limit(15),
    db.select({ c: count() }).from(t.notifications).where(and(eq(t.notifications.userId, user.id), isNull(t.notifications.readAt))),
  ]);
  return <AppShell user={user} companyName={company.name} notifications={notifications} unread={unread}>{children}</AppShell>;
}
