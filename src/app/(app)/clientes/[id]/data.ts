import { eq, asc, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, t } from "@/db";
import { assertClientAccess } from "../actions";
import { clientFinanceSummary, recalcInstallmentStatuses } from "@/lib/services/finance";

export async function loadClient(id: string) {
  let access; try { access = await assertClientAccess(id, "clients.view"); } catch { notFound(); }
  await recalcInstallmentStatuses(id);
  const client = await db.query.clients.findFirst({
    where: eq(t.clients.id, id),
    with: {
      owner: { columns: { id: true, name: true, avatarUrl: true } },
      lead: { with: { source: true } },
      journeySteps: { orderBy: [asc(t.journeySteps.order)], with: { owner: { columns: { name: true } } } },
      appointments: { orderBy: [desc(t.appointments.startAt)], with: { type: true, owner: { columns: { name: true } }, meeting: { with: { tasks: true } } } },
      tasks: { orderBy: [asc(t.tasks.status), asc(t.tasks.dueAt)], with: { assignee: { columns: { name: true, avatarUrl: true } } } },
      reports: { orderBy: [desc(t.reports.dueAt)], with: { documents: true } },
      documents: { orderBy: [desc(t.documents.createdAt)], with: { user: { columns: { name: true } } } },
      interactions: { orderBy: [desc(t.interactions.createdAt)], with: { user: { columns: { name: true } } } },
    },
  });
  if (!client) notFound();
  const finance = await clientFinanceSummary(id);
  const users = await db.select({ id: t.users.id, name: t.users.name, role: t.users.role }).from(t.users).where(eq(t.users.active, true)).orderBy(asc(t.users.name));
  const apptTypes = await db.select().from(t.appointmentTypes).orderBy(asc(t.appointmentTypes.name));
  const services = (await db.select().from(t.financeCategories)).map((c) => c.name);
  const audits = await db.query.auditLogs.findMany({ where: eq(t.auditLogs.entityId, id), orderBy: [desc(t.auditLogs.createdAt)], limit: 50, with: { user: { columns: { name: true } } } });
  return { client, finance, users, apptTypes, services, audits, user: access.user };
}
export type ClientBundle = Awaited<ReturnType<typeof loadClient>>;
