import Link from "next/link";
import { ArrowLeft, Pencil, MessageCircle, Mail, Phone, CalendarPlus, Trash2 } from "lucide-react";
import { Badge, Avatar, Field, SubmitButton } from "@/components/ui";
import { ModalButton, CloseOnDone } from "@/components/modal-button";
import { ActionButton } from "@/components/action-form";
import { JourneyBar } from "@/components/journey/journey-bar";
import { brl, fmtDate, toInputDateTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { loadClient } from "./data";
import { ClientForm } from "../client-form";
import { updateClient, createClientAppointment, deleteClient } from "../actions";
import { TabOverview } from "./tab-overview";
import { TabContract } from "./tab-contract";
import { TabFinance } from "./tab-finance";
import { TabJourneyStep } from "./tab-journey-step";
import { TabMeetings } from "./tab-meetings";
import { TabTasks } from "./tab-tasks";
import { TabReports } from "./tab-reports";
import { TabHistory } from "./tab-history";

export const dynamic = "force-dynamic";
const TABS = [["visao", "Visão geral"], ["contrato", "Contrato"], ["financeiro", "Financeiro"], ["formulario", "Formulário"], ["onboarding", "Onboarding"], ["reunioes", "Reuniões"], ["tarefas", "Tarefas"], ["relatorios", "Relatórios"], ["historico", "Histórico"]] as const;
const STATUS: Record<string, { label: string; tone: "blue" | "green" | "amber" | "gray" }> = { ONBOARDING: { label: "Onboarding", tone: "blue" }, ATIVO: { label: "Ativo", tone: "green" }, PAUSADO: { label: "Pausado", tone: "amber" }, ENCERRADO: { label: "Encerrado", tone: "gray" } };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; const { db, t } = await import("@/db"); const { eq } = await import("drizzle-orm"); const c = await db.query.clients.findFirst({ where: eq(t.clients.id, id), columns: { name: true } }); return { title: c?.name ?? "Cliente" }; }

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string; etapa?: string }> }) {
  const { id } = await params; const { aba = "visao", etapa } = await searchParams;
  const b = await loadClient(id);
  const { client: c, user } = b;
  const canManage = can(user.role, "clients.manage"); const canFinance = can(user.role, "finance.view");
  const tabs = TABS.filter(([k]) => k !== "financeiro" || canFinance);
  const base = `/clientes/${c.id}?aba=`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Link href="/clientes" className="btn-ghost btn-icon mt-1"><ArrowLeft size={18} /></Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap"><h1 className="text-2xl font-semibold tracking-tight">{c.name}</h1><Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge>{c.isDemo && <Badge tone="amber">demo</Badge>}</div>
            <p className="text-sm text-muted">{[c.company, c.segment, c.service].filter(Boolean).join(" · ") || "Sem empresa informada"}</p>
            <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted">
              {c.whatsapp && <a className="flex items-center gap-1 hover:text-brand" target="_blank" href={`https://wa.me/55${c.whatsapp.replace(/\D/g, "")}`}><MessageCircle size={12} />{c.whatsapp}</a>}
              {c.phone && <span className="flex items-center gap-1"><Phone size={12} />{c.phone}</span>}
              {c.email && <a className="flex items-center gap-1 hover:text-brand" href={`mailto:${c.email}`}><Mail size={12} />{c.email}</a>}
              {c.owner && <span className="flex items-center gap-1"><Avatar name={c.owner.name} src={c.owner.avatarUrl} size={16} />{c.owner.name}</span>}
              <span>Fechado em {fmtDate(c.closedAt)}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ModalButton label="Agendar" title="Novo compromisso" className="btn-secondary btn-sm" icon={<CalendarPlus size={14} />}>
            <CloseOnDone action={createClientAppointment.bind(null, c.id)} success="Compromisso criado." className="grid sm:grid-cols-2 gap-3">
              <Field label="Título" className="sm:col-span-2"><input name="title" className="input" defaultValue={`Reunião — ${c.name}`} required /></Field>
              <Field label="Data e hora"><input name="startAt" type="datetime-local" className="input" defaultValue={toInputDateTime(new Date(Date.now() + 864e5))} required /></Field>
              <Field label="Tipo"><select name="typeId" className="input">{b.apptTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
              <Field label="Duração (min)"><input name="durationMin" type="number" className="input" defaultValue={45} /></Field>
              <Field label="Responsável"><select name="ownerId" className="input" defaultValue={c.ownerId ?? ""}>{b.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
              <Field label="Link" className="sm:col-span-2"><input name="link" className="input" placeholder="https://meet.google.com/..." /></Field>
              <Field label="Descrição" className="sm:col-span-2"><textarea name="description" className="input" rows={2} /></Field>
              <div className="sm:col-span-2 flex justify-end"><SubmitButton>Agendar</SubmitButton></div>
            </CloseOnDone>
          </ModalButton>
          {canManage && <ModalButton label="Editar" title="Editar cliente" className="btn-secondary btn-sm" icon={<Pencil size={14} />} size="lg"><ClientForm client={c} users={b.users} services={b.services} action={updateClient.bind(null, c.id)} /></ModalButton>}
          {user.role === "ADMIN" && <ActionButton className="btn-ghost btn-sm text-red-600" confirm="Excluir este cliente e TODOS os seus dados (financeiro, jornada, reuniões)? Esta ação não pode ser desfeita." action={async () => { "use server"; await deleteClient(c.id); const { redirect } = await import("next/navigation"); redirect("/clientes"); }}><Trash2 size={14} /></ActionButton>}
        </div>
      </div>

      <div className="card p-4"><p className="text-xs font-medium text-muted mb-2">Jornada do cliente</p><JourneyBar steps={c.journeySteps} hrefBase={`/clientes/${c.id}?aba=jornada&etapa=`} activeKey={etapa} /></div>

      <div className="flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map(([k, label]) => <Link key={k} href={`${base}${k}`} className={cn("px-3 py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px transition", (aba === k || (aba === "jornada" && k === "visao" && false)) ? "border-brand font-medium" : "border-transparent text-muted hover:text-fg")}>{label}</Link>)}
      </div>

      {aba === "visao" && <TabOverview b={b} />}
      {aba === "contrato" && <TabContract b={b} />}
      {aba === "financeiro" && canFinance && <TabFinance b={b} />}
      {aba === "formulario" && <TabJourneyStep b={b} stepKey="FORMULARIO" />}
      {aba === "onboarding" && <TabJourneyStep b={b} stepKey="ONBOARDING" />}
      {aba === "jornada" && <TabJourneyStep b={b} stepKey={(etapa as "GRUPO_CRIADO") || "GRUPO_CRIADO"} />}
      {aba === "reunioes" && <TabMeetings b={b} />}
      {aba === "tarefas" && <TabTasks b={b} />}
      {aba === "relatorios" && <TabReports b={b} />}
      {aba === "historico" && <TabHistory b={b} />}
    </div>
  );
}
