import { and, asc, desc, eq, gte, lt } from "drizzle-orm";
import { subDays } from "date-fns";
import { Video, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { db, t } from "@/db";
import { requirePage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PageHeader, Kpi, Empty } from "@/components/ui";
import { MeetingRow } from "@/components/meeting-row";

export const metadata = { title: "Reuniões" };
export const dynamic = "force-dynamic";

export default async function MeetingsPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const user = await requirePage("meetings.view");
  const { f = "proximas" } = await searchParams;
  const now = new Date();
  const own = can(user.role, "clients.viewAll") ? undefined : eq(t.appointments.ownerId, user.id);
  const w = { with: { type: true, owner: { columns: { id: true, name: true } }, client: { columns: { id: true, name: true } }, lead: { columns: { id: true, name: true } }, meeting: { with: { tasks: true } } } } as const;
  const [upcoming, late, done, users] = await Promise.all([
    db.query.appointments.findMany({ where: and(own, eq(t.appointments.status, "AGENDADO"), gte(t.appointments.startAt, now)), orderBy: [asc(t.appointments.startAt)], limit: 60, ...w }),
    db.query.appointments.findMany({ where: and(own, eq(t.appointments.status, "AGENDADO"), lt(t.appointments.startAt, now)), orderBy: [desc(t.appointments.startAt)], limit: 60, ...w }),
    db.query.appointments.findMany({ where: and(own, eq(t.appointments.status, "REALIZADO"), gte(t.appointments.startAt, subDays(now, 60))), orderBy: [desc(t.appointments.startAt)], limit: 80, ...w }),
    db.select({ id: t.users.id, name: t.users.name }).from(t.users).where(eq(t.users.active, true)).orderBy(asc(t.users.name)),
  ]);
  const noMinutes = done.filter((a) => !a.meeting?.decisions && !a.meeting?.agenda);
  const lists = { proximas: upcoming, atrasadas: late, realizadas: done, sem_ata: noMinutes }[f] ?? upcoming;
  const tabs = [["proximas", "Próximas", upcoming.length], ["atrasadas", "Sem status (passadas)", late.length], ["realizadas", "Realizadas (60d)", done.length], ["sem_ata", "Sem ata", noMinutes.length]] as const;
  return (
    <div className="space-y-5">
      <PageHeader title="Reuniões" subtitle="Reuniões comerciais, de onboarding, semanais e estratégicas — com registro de ata, decisões e tarefas." />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Agendadas" value={upcoming.length} icon={Clock} tone="blue" />
        <Kpi label="Passadas sem status" value={late.length} icon={AlertTriangle} tone={late.length ? "amber" : "gray"} hint="Marque como realizada ou cancelada" />
        <Kpi label="Realizadas (60 dias)" value={done.length} icon={CheckCircle2} tone="green" />
        <Kpi label="Realizadas sem ata" value={noMinutes.length} icon={Video} tone={noMinutes.length ? "amber" : "gray"} />
      </div>
      <div className="flex gap-1 border-b border-line overflow-x-auto">{tabs.map(([k, l, n]) => <a key={k} href={`?f=${k}`} className={`px-3 py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px ${f === k ? "border-brand font-medium" : "border-transparent text-muted hover:text-fg"}`}>{l} <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-surface-2 text-muted">{n}</span></a>)}</div>
      <div className="card">{lists.length === 0 ? <Empty icon={Video} title="Nada por aqui" /> : <ul className="divide-y divide-line">{lists.map((a) => <MeetingRow key={a.id} a={a} users={users} showClient />)}</ul>}</div>
    </div>
  );
}
