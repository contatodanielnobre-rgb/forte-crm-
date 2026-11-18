import { and, asc, desc, eq, gte, ilike, inArray, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { endOfDay, startOfDay } from "date-fns";
import { db, t } from "@/db";
import { requirePage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { MyTasks } from "./my-tasks";

export const metadata = { title: "Minhas Tarefas" };
export const dynamic = "force-dynamic";

export default async function MinhasTarefasPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePage("chat.view");
  const sp = await searchParams;
  const viewAll = can(user.role, "chat.viewAll");
  const S = t.chatScheduledTasks;
  const conds: (SQL | undefined)[] = [];
  const who = viewAll ? sp.responsavel ?? user.id : user.id;
  if (who !== "todos") conds.push(or(eq(S.assigneeId, who), eq(S.createdById, who)));
  if (sp.tipo) conds.push(eq(S.type, sp.tipo as never));
  if (sp.status) conds.push(eq(S.status, sp.status as never));
  if (sp.de) conds.push(gte(S.runAt, startOfDay(new Date(`${sp.de}T12:00:00`))));
  if (sp.ate) conds.push(lte(S.runAt, endOfDay(new Date(`${sp.ate}T12:00:00`))));
  if (sp.cliente?.trim()) { const q = `%${sp.cliente.trim()}%`; conds.push(or(ilike(S.title, q), sql`exists (select 1 from leads l where l.id = ${S.leadId} and l.name ilike ${q})`, sql`exists (select 1 from clients c where c.id = ${S.clientId} and c.name ilike ${q})`)); }
  const tasks = await db.query.chatScheduledTasks.findMany({
    where: and(...conds.filter(Boolean)), orderBy: [asc(S.runAt)], limit: 500,
    with: { assignee: { columns: { id: true, name: true } }, lead: { columns: { id: true, name: true } }, client: { columns: { id: true, name: true } }, conversation: { columns: { id: true, waId: true, profileName: true } }, media: { columns: { id: true, fileName: true, mimeType: true, size: true, durationSec: true, kind: true } }, attemptsLog: { orderBy: (a, { desc }) => [desc(a.startedAt)], limit: 5 } },
  });
  const other = await db.query.tasks.findMany({ where: and(eq(t.tasks.assigneeId, user.id), inArray(t.tasks.status, ["PENDENTE", "EM_ANDAMENTO"]), ne(t.tasks.source, "chat")), orderBy: [asc(t.tasks.dueAt), desc(t.tasks.createdAt)], limit: 30, with: { client: { columns: { id: true, name: true } }, lead: { columns: { id: true, name: true } } } });
  const users = await db.select({ id: t.users.id, name: t.users.name }).from(t.users).where(eq(t.users.active, true)).orderBy(asc(t.users.name));
  return <MyTasks tasks={JSON.parse(JSON.stringify(tasks))} other={JSON.parse(JSON.stringify(other))} users={users} me={user.id} canAssign={viewAll} blobEnabled={!!process.env.BLOB_READ_WRITE_TOKEN} filters={{ responsavel: viewAll ? sp.responsavel ?? user.id : user.id, tipo: sp.tipo ?? "", status: sp.status ?? "", de: sp.de ?? "", ate: sp.ate ?? "", cliente: sp.cliente ?? "" }} />;
}
