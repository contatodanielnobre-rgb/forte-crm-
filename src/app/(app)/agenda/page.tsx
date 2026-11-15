import { and, asc, eq, gte, lte, inArray } from "drizzle-orm";
import { addDays, addMonths, endOfDay, endOfMonth, endOfWeek, startOfDay, startOfMonth, startOfWeek, subDays, subMonths, subWeeks, addWeeks } from "date-fns";
import { db, t } from "@/db";
import { requirePage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";
import { Calendar } from "./calendar";

export const metadata = { title: "Agenda" };
export const dynamic = "force-dynamic";

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ v?: string; d?: string; u?: string }> }) {
  const user = await requirePage("agenda.view");
  const sp = await searchParams;
  const view = (sp.v as "dia" | "semana" | "mes") || "semana";
  const date = sp.d ? new Date(sp.d + "T12:00:00") : new Date();
  const viewAll = can(user.role, "clients.viewAll");
  const range = view === "dia" ? [startOfDay(date), endOfDay(date)] : view === "semana" ? [startOfWeek(date, { weekStartsOn: 0 }), endOfWeek(date, { weekStartsOn: 0 })] : [startOfWeek(startOfMonth(date), { weekStartsOn: 0 }), endOfWeek(endOfMonth(date), { weekStartsOn: 0 })];
  const conds = [gte(t.appointments.startAt, range[0]), lte(t.appointments.startAt, range[1])];
  if (!viewAll) conds.push(eq(t.appointments.ownerId, user.id)); else if (sp.u) conds.push(eq(t.appointments.ownerId, sp.u));
  const [appts, users, types, clients, leads] = await Promise.all([
    db.query.appointments.findMany({ where: and(...conds), orderBy: [asc(t.appointments.startAt)], with: { type: true, owner: { columns: { id: true, name: true } }, client: { columns: { id: true, name: true } }, lead: { columns: { id: true, name: true } }, meeting: { with: { tasks: true } } } }),
    db.select({ id: t.users.id, name: t.users.name }).from(t.users).where(eq(t.users.active, true)).orderBy(asc(t.users.name)),
    db.select().from(t.appointmentTypes).orderBy(asc(t.appointmentTypes.name)),
    db.select({ id: t.clients.id, name: t.clients.name }).from(t.clients).where(inArray(t.clients.status, ["ONBOARDING", "ATIVO", "PAUSADO"])).orderBy(asc(t.clients.name)),
    db.select({ id: t.leads.id, name: t.leads.name }).from(t.leads).where(eq(t.leads.archived, false)).orderBy(asc(t.leads.name)),
  ]);
  const prev = view === "dia" ? subDays(date, 1) : view === "semana" ? subWeeks(date, 1) : subMonths(date, 1);
  const next = view === "dia" ? addDays(date, 1) : view === "semana" ? addWeeks(date, 1) : addMonths(date, 1);
  const now = new Date();
  const soon = appts.filter((a) => a.status === "AGENDADO" && a.startAt >= now && +a.startAt - +now < 2 * 3600e3).length;
  const late = appts.filter((a) => a.status === "AGENDADO" && a.startAt < now).length;
  return (
    <div>
      <PageHeader title="Agenda" subtitle={`${appts.length} compromissos no período${soon ? ` · ${soon} nas próximas 2h` : ""}${late ? ` · ${late} atrasados sem status` : ""}`} />
      <Calendar view={view} date={date.toISOString()} prev={prev.toISOString()} next={next.toISOString()} appts={JSON.parse(JSON.stringify(appts))} users={users} types={types} clients={clients} leads={leads} canAssign={viewAll} currentUserId={user.id} selectedUser={sp.u ?? ""} />
    </div>
  );
}
