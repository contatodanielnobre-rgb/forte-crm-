import Link from "next/link";
import { desc, eq, inArray, and } from "drizzle-orm";
import { Route, AlertTriangle } from "lucide-react";
import { db, t } from "@/db";
import { requirePage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PageHeader, Kpi, Badge, Avatar, Empty } from "@/components/ui";
import { JourneyBar } from "@/components/journey/journey-bar";
import { JOURNEY_STEPS, isStepLate, journeyProgress } from "@/lib/services/journey";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "Jornada do Cliente" };
export const dynamic = "force-dynamic";

export default async function JourneyPage({ searchParams }: { searchParams: Promise<{ filtro?: string }> }) {
  const user = await requirePage("clients.view");
  const { filtro = "ativos" } = await searchParams;
  const where = [inArray(t.clients.status, ["ONBOARDING", "ATIVO"])];
  if (!can(user.role, "clients.viewAll")) {
    const ids = new Set<string>();
    (await db.select({ id: t.clients.id }).from(t.clients).where(eq(t.clients.ownerId, user.id))).forEach((r) => ids.add(r.id));
    (await db.select({ id: t.journeySteps.clientId }).from(t.journeySteps).where(eq(t.journeySteps.ownerId, user.id))).forEach((r) => ids.add(r.id));
    (await db.select({ id: t.appointments.clientId }).from(t.appointments).where(eq(t.appointments.ownerId, user.id))).forEach((r) => r.id && ids.add(r.id));
    where.push(ids.size ? inArray(t.clients.id, [...ids]) : eq(t.clients.id, "__none__"));
  }
  const clients = await db.query.clients.findMany({ where: and(...where), orderBy: [desc(t.clients.closedAt)], with: { owner: { columns: { name: true, avatarUrl: true } }, journeySteps: { orderBy: (s, { asc }) => [asc(s.order)], with: { owner: { columns: { name: true } } } }, tasks: { columns: { status: true, dueAt: true } }, reports: { columns: { status: true, dueAt: true } } } });
  const now = new Date();
  const enriched = clients.map((c) => { const late = c.journeySteps.filter((s) => isStepLate(s)); const lateTasks = c.tasks.filter((x) => x.status !== "CONCLUIDA" && x.dueAt && x.dueAt < now).length; const lateReports = c.reports.filter((r) => r.status === "PENDENTE" && r.dueAt && r.dueAt < now).length; return { ...c, progress: journeyProgress(c.journeySteps), late, lateTasks, lateReports, pend: late.length + lateTasks + lateReports }; });
  const shown = filtro === "atrasados" ? enriched.filter((c) => c.pend > 0) : filtro === "onboarding" ? enriched.filter((c) => c.status === "ONBOARDING") : filtro === "concluidos" ? enriched.filter((c) => c.progress === 100) : enriched;
  const stepCounts = JOURNEY_STEPS.map((d) => ({ ...d, done: enriched.filter((c) => { const s = c.journeySteps.find((x) => x.key === d.key); return s && (d.recurring ? s.status !== "PENDENTE" : s.status === "CONCLUIDO"); }).length, late: enriched.filter((c) => c.late.some((x) => x.key === d.key)).length }));

  return (
    <div className="space-y-5">
      <PageHeader title="Jornada do Cliente" subtitle="Grupo criado → Contrato → Formulário → Onboarding → Reuniões semanais → Relatórios" actions={
        <div className="flex gap-1 bg-surface border border-line rounded-xl p-1">{[["ativos", "Todos"], ["onboarding", "Em onboarding"], ["atrasados", "Com pendências"], ["concluidos", "100%"]].map(([k, l]) => <Link key={k} href={`?filtro=${k}`} className={`px-3 h-8 grid place-items-center rounded-lg text-sm ${filtro === k ? "bg-brand text-white" : "text-muted hover:text-fg"}`}>{l}</Link>)}</div>} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Clientes em acompanhamento" value={enriched.length} icon={Route} tone="brand" />
        <Kpi label="Em onboarding" value={enriched.filter((c) => c.status === "ONBOARDING").length} tone="blue" />
        <Kpi label="Com etapas atrasadas" value={enriched.filter((c) => c.late.length > 0).length} icon={AlertTriangle} tone="red" />
        <Kpi label="Progresso médio" value={`${enriched.length ? Math.round(enriched.reduce((s, c) => s + c.progress, 0) / enriched.length) : 0}%`} tone="green" />
      </div>
      <div className="card p-4"><p className="text-sm font-medium mb-3">Funil de entrega</p><div className="grid grid-cols-3 sm:grid-cols-6 gap-2">{stepCounts.map((s) => <div key={s.key} className="rounded-xl bg-surface-2 p-3"><p className="text-xs text-muted">{s.label}</p><p className="text-lg font-semibold">{s.done}<span className="text-xs text-muted font-normal">/{enriched.length}</span></p>{s.late > 0 && <Badge tone="red">{s.late} atrasados</Badge>}</div>)}</div></div>
      {shown.length === 0 ? <div className="card"><Empty icon={Route} title="Nenhum cliente neste filtro" /></div> : (
        <div className="grid gap-4">{shown.map((c) => (
          <div key={c.id} className="card p-4">
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <div className="flex-1 min-w-[200px]"><Link href={`/clientes/${c.id}`} className="font-medium hover:text-brand">{c.name}</Link><p className="text-xs text-muted">{c.company || c.segment || "—"} · fechado em {fmtDate(c.closedAt)}{c.service ? ` · ${c.service}` : ""}</p></div>
              {c.owner && <span className="flex items-center gap-1.5 text-xs text-muted"><Avatar name={c.owner.name} src={c.owner.avatarUrl} size={20} />{c.owner.name}</span>}
              <Badge tone={c.status === "ATIVO" ? "green" : "blue"}>{c.status}</Badge>
              {c.late.length > 0 && <Badge tone="red"><AlertTriangle size={11} /> {c.late.length} etapa(s) atrasada(s)</Badge>}
              {c.lateTasks > 0 && <Badge tone="amber">{c.lateTasks} tarefa(s) atrasada(s)</Badge>}
              {c.lateReports > 0 && <Badge tone="amber">{c.lateReports} relatório(s) pendente(s)</Badge>}
            </div>
            <JourneyBar steps={c.journeySteps} hrefBase={`/clientes/${c.id}?aba=jornada&etapa=`} />
          </div>
        ))}</div>
      )}
    </div>
  );
}
