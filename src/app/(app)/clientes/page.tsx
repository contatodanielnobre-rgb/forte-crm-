import Link from "next/link";
import { and, asc, desc, eq, ilike, or, inArray } from "drizzle-orm";
import { Plus, Users } from "lucide-react";
import { db, t } from "@/db";
import { requirePage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PageHeader, Badge, Avatar, Progress, Empty } from "@/components/ui";
import { ModalButton } from "@/components/modal-button";
import { brl, fmtDate } from "@/lib/format";
import { journeyProgress, isStepLate } from "@/lib/services/journey";
import { recalcInstallmentStatuses } from "@/lib/services/finance";
import { ClientForm } from "./client-form";
import { createClient } from "./actions";
import { num } from "@/lib/format";

export const metadata = { title: "Clientes" };
export const dynamic = "force-dynamic";
const STATUS: Record<string, { label: string; tone: "blue" | "green" | "amber" | "gray" }> = { ONBOARDING: { label: "Onboarding", tone: "blue" }, ATIVO: { label: "Ativo", tone: "green" }, PAUSADO: { label: "Pausado", tone: "amber" }, ENCERRADO: { label: "Encerrado", tone: "gray" } };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePage("clients.view");
  const sp = await searchParams;
  await recalcInstallmentStatuses();
  const viewAll = can(user.role, "clients.viewAll");
  const conds = [];
  if (!viewAll) {
    // próprios + atribuídos (etapas/tarefas/compromissos)
    const ids = new Set<string>();
    (await db.select({ id: t.clients.id }).from(t.clients).where(eq(t.clients.ownerId, user.id))).forEach((r) => ids.add(r.id));
    (await db.select({ id: t.journeySteps.clientId }).from(t.journeySteps).where(eq(t.journeySteps.ownerId, user.id))).forEach((r) => ids.add(r.id));
    (await db.select({ id: t.tasks.clientId }).from(t.tasks).where(eq(t.tasks.assigneeId, user.id))).forEach((r) => r.id && ids.add(r.id));
    (await db.select({ id: t.appointments.clientId }).from(t.appointments).where(eq(t.appointments.ownerId, user.id))).forEach((r) => r.id && ids.add(r.id));
    conds.push(ids.size ? inArray(t.clients.id, [...ids]) : eq(t.clients.id, "__none__"));
  }
  if (sp.status) conds.push(eq(t.clients.status, sp.status as "ATIVO"));
  if (sp.q) conds.push(or(ilike(t.clients.name, `%${sp.q}%`), ilike(t.clients.company, `%${sp.q}%`), ilike(t.clients.email, `%${sp.q}%`), ilike(t.clients.cnpj, `%${sp.q}%`))!);
  const clients = await db.query.clients.findMany({ where: conds.length ? and(...conds) : undefined, orderBy: [desc(t.clients.createdAt)], with: { owner: { columns: { name: true, avatarUrl: true } }, journeySteps: true, contract: true, installments: true } });
  const users = await db.select({ id: t.users.id, name: t.users.name }).from(t.users).where(eq(t.users.active, true)).orderBy(asc(t.users.name));
  const services = (await db.select().from(t.financeCategories)).map((c) => c.name);
  const counts = { total: clients.length, ativos: clients.filter((c) => c.status === "ATIVO").length, onboarding: clients.filter((c) => c.status === "ONBOARDING").length, atrasados: clients.filter((c) => c.installments.some((i) => i.status === "ATRASADO")).length };

  return (
    <div>
      <PageHeader title="Clientes" subtitle={`${counts.total} clientes · ${counts.ativos} ativos · ${counts.onboarding} em onboarding · ${counts.atrasados} com pagamento em atraso`}
        actions={<>
          <form className="flex gap-2"><input name="q" defaultValue={sp.q} placeholder="Buscar..." className="input h-9 w-44" /><select name="status" defaultValue={sp.status ?? ""} className="input h-9 w-36"><option value="">Todos status</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select><button className="btn-secondary btn-sm h-9">Filtrar</button></form>
          {can(user.role, "clients.manage") && <ModalButton label="Novo cliente" title="Novo cliente" icon={<Plus size={14} />} size="lg"><ClientForm users={users} services={services} action={createClient} /></ModalButton>}
        </>} />
      {clients.length === 0 ? <div className="card"><Empty icon={Users} title="Nenhum cliente encontrado" hint="Clientes são criados automaticamente quando uma venda é fechada no pipeline, ou manualmente por aqui." /></div> : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Cliente</th><th>Serviço</th><th>Contrato</th><th>Jornada</th><th>Financeiro</th><th>Responsável</th><th>Fechamento</th><th>Status</th></tr></thead>
            <tbody>
              {clients.map((c) => {
                const prog = journeyProgress(c.journeySteps); const late = c.journeySteps.some((s) => isStepLate(s));
                const overdue = c.installments.filter((i) => i.status === "ATRASADO").reduce((s, i) => s + num(i.amount), 0);
                const paid = c.installments.filter((i) => i.status === "PAGO").length;
                return (
                  <tr key={c.id}>
                    <td><Link href={`/clientes/${c.id}`} className="font-medium hover:text-brand">{c.name}</Link><p className="text-xs text-muted">{c.company || c.segment || "—"}{c.isDemo && <Badge tone="amber" className="ml-2">demo</Badge>}</p></td>
                    <td className="text-muted">{c.service || "—"}</td>
                    <td><p className="font-medium tabular-nums">{brl(c.contractValue)}</p><p className="text-xs text-muted">{c.contract?.status === "ASSINADO" ? "Assinado" : c.contract?.status === "ENVIADO" ? "Enviado" : "Pendente"}</p></td>
                    <td className="min-w-[140px]"><div className="flex items-center gap-2"><Progress value={prog} className="w-20" tone={prog === 100 ? "green" : late ? "amber" : "brand"} /><span className="text-xs tabular-nums">{prog}%</span>{late && <Badge tone="red">atraso</Badge>}</div></td>
                    <td>{overdue > 0 ? <Badge tone="red">{brl(overdue)} em atraso</Badge> : <span className="text-xs text-muted">{paid}/{c.installments.length} parcelas pagas</span>}</td>
                    <td>{c.owner ? <span className="flex items-center gap-2 text-sm"><Avatar name={c.owner.name} src={c.owner.avatarUrl} size={22} />{c.owner.name.split(" ")[0]}</span> : "—"}</td>
                    <td className="text-muted">{fmtDate(c.closedAt)}</td>
                    <td><Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
