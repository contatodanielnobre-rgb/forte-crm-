import { and, eq, gte, ilike, or, asc, desc, inArray } from "drizzle-orm";
import { subDays } from "date-fns";
import { db, t } from "@/db";
import { requirePage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";
import { Board } from "./board";
import { Filters } from "./filters";

export const metadata = { title: "Pipeline de Vendas" };
export const dynamic = "force-dynamic";

export default async function PipelinePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePage("pipeline.view");
  const sp = await searchParams;
  const viewAll = can(user.role, "pipeline.viewAll");
  const conds = [eq(t.leads.archived, false)];
  if (!viewAll) conds.push(eq(t.leads.ownerId, user.id));
  else if (sp.vendedor) conds.push(eq(t.leads.ownerId, sp.vendedor));
  if (sp.periodo && sp.periodo !== "todos") conds.push(gte(t.leads.enteredAt, subDays(new Date(), Number(sp.periodo))));
  if (sp.etapa) conds.push(eq(t.leads.stageId, sp.etapa));
  if (sp.q) conds.push(or(ilike(t.leads.name, `%${sp.q}%`), ilike(t.leads.company, `%${sp.q}%`), ilike(t.leads.email, `%${sp.q}%`))!);

  const [stages, leads, users, sources, lossReasons, apptTypes] = await Promise.all([
    db.select().from(t.pipelineStages).orderBy(asc(t.pipelineStages.order)),
    db.query.leads.findMany({ where: and(...conds), orderBy: [asc(t.leads.position), desc(t.leads.updatedAt)], with: { owner: { columns: { id: true, name: true, avatarUrl: true } }, source: { columns: { name: true } }, lossReason: { columns: { name: true } }, client: { columns: { id: true } } } }),
    db.select({ id: t.users.id, name: t.users.name, avatarUrl: t.users.avatarUrl }).from(t.users).where(and(eq(t.users.active, true), inArray(t.users.role, ["ADMIN", "GESTOR", "COMERCIAL"]))).orderBy(asc(t.users.name)),
    db.select().from(t.leadSources).orderBy(asc(t.leadSources.name)),
    db.select().from(t.lossReasons).orderBy(asc(t.lossReasons.name)),
    db.select().from(t.appointmentTypes).orderBy(asc(t.appointmentTypes.name)),
  ]);

  const total = leads.filter((l) => !l.wonAt && !l.lostAt).reduce((s, l) => s + Number(l.value), 0);
  return (
    <div className="h-[calc(100vh-7.5rem)] flex flex-col">
      <PageHeader title="Pipeline de Vendas" subtitle={`${leads.length} leads · ${total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} em aberto`} actions={<Filters users={users} stages={stages} canFilterSeller={viewAll} />} />
      <Board stages={stages} leads={leads} users={users} sources={sources} lossReasons={lossReasons} apptTypes={apptTypes} canAssign={viewAll} openNew={sp.novo === "1"} currentUserId={user.id} />
    </div>
  );
}
