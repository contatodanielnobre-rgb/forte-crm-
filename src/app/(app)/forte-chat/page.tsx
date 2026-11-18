import { Suspense } from "react";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, t } from "@/db";
import { requirePage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { ensureChatDefaults } from "@/lib/chat/core";
import { cloudConfigured } from "@/lib/chat/cloud-api";
import { ChatApp } from "@/components/chat/chat-app";

export const metadata = { title: "FORTE CHAT" };
export const dynamic = "force-dynamic";

export default async function ForteChatPage() {
  const user = await requirePage("chat.view");
  await ensureChatDefaults();
  const [users, labels] = await Promise.all([
    db.select({ id: t.users.id, name: t.users.name }).from(t.users).where(and(eq(t.users.active, true), inArray(t.users.role, ["ADMIN", "GESTOR", "COMERCIAL", "OPERACIONAL"]))).orderBy(asc(t.users.name)),
    db.select({ id: t.chatLabels.id, name: t.chatLabels.name, color: t.chatLabels.color }).from(t.chatLabels).orderBy(asc(t.chatLabels.order), asc(t.chatLabels.name)),
  ]);
  return (
    <Suspense>
      <ChatApp me={{ id: user.id, name: user.name, role: user.role }} users={users} labels={labels} configured={cloudConfigured()} blobEnabled={!!process.env.BLOB_READ_WRITE_TOKEN}
        canViewAll={can(user.role, "chat.viewAll")} canManageLabels={can(user.role, "chat.manage")} canCreateLead={can(user.role, "pipeline.manage")} />
    </Suspense>
  );
}
