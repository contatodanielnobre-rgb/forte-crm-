"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Phone, Mail, MessageCircle, StickyNote, Video, Archive, Trash2, UserCheck, ExternalLink, Pencil, CalendarPlus, ShieldCheck, Check } from "lucide-react";
import { Drawer, Tabs, Badge, Avatar, Field, SubmitButton, ConfirmButton, Empty } from "@/components/ui";
import { useToast } from "@/components/toast";
import { brl, fmtDateTime, fmtDate, toInputDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { listLeadDetail, updateLead, addInteraction, scheduleActivity, archiveLead, deleteLead, moveLead } from "./actions";
import { setTaskStatus } from "@/app/(app)/agenda/actions";
import { LeadForm } from "./lead-form";
import type { Stage, Option, UserOption, ApptType } from "./types";

type Detail = NonNullable<Awaited<ReturnType<typeof listLeadDetail>>>;
const TYPE_ICON: Record<string, React.ReactNode> = { ligacao: <Phone size={13} />, whatsapp: <MessageCircle size={13} />, email: <Mail size={13} />, reuniao: <Video size={13} />, nota: <StickyNote size={13} />, sistema: <UserCheck size={13} /> };
const TYPE_LABEL: Record<string, string> = { ligacao: "Ligação", whatsapp: "WhatsApp", email: "E-mail", reuniao: "Reunião", nota: "Nota", sistema: "Sistema" };

export function LeadDrawer({ leadId, onClose, stages, users, sources, apptTypes, canAssign, currentUserId }: { leadId: string | null; onClose: () => void; stages: Stage[]; users: UserOption[]; sources: Option[]; lossReasons: Option[]; apptTypes: ApptType[]; canAssign: boolean; currentUserId: string }) {
  const [lead, setLead] = React.useState<Detail | null>(null);
  const [tab, setTab] = React.useState("resumo");
  const [editing, setEditing] = React.useState(false);
  const router = useRouter(); const toast = useToast();
  const load = React.useCallback(async () => { if (leadId) setLead(await listLeadDetail(leadId)); }, [leadId]);
  React.useEffect(() => { setLead(null); setEditing(false); setTab("resumo"); load(); }, [load]);
  const refresh = async () => { await load(); router.refresh(); };
  const stage = stages.find((s) => s.id === lead?.stageId);

  return (
    <Drawer open={!!leadId} onClose={onClose} title={lead ? <div className="flex items-center gap-2"><span>{lead.name}</span>{stage && <Badge tone="gray"><span className="w-1.5 h-1.5 rounded-full" style={{ background: stage.color }} />{stage.name}</Badge>}{lead.isDemo && <Badge tone="amber">demo</Badge>}</div> : "Carregando..."}>
      {!lead ? <div className="p-6 text-sm text-muted">Carregando ficha...</div> : (
        <div className="p-5 space-y-5">
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="card p-3"><p className="text-xs text-muted">Valor potencial</p><p className="text-lg font-semibold tabular-nums">{brl(lead.value)}</p></div>
            <div className="card p-3"><p className="text-xs text-muted">Responsável</p><p className="text-sm font-medium flex items-center gap-2 mt-1">{lead.owner ? <><Avatar name={lead.owner.name} src={lead.owner.avatarUrl} size={20} />{lead.owner.name}</> : "—"}</p></div>
            <div className="card p-3"><p className="text-xs text-muted">Entrada</p><p className="text-sm font-medium mt-1">{fmtDate(lead.enteredAt)}</p></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <select data-testid="lead-stage" className="input h-9 w-auto" value={lead.stageId} onChange={async (e) => { try { const r = await moveLead(lead.id, e.target.value); if (r.converted) toast.push("Venda fechada! Cliente criado."); await refresh(); } catch (err) { toast.push((err as Error).message, "error"); } }}>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            <button className="btn-secondary btn-sm" onClick={() => setEditing((v) => !v)}><Pencil size={14} /> {editing ? "Cancelar edição" : "Editar"}</button>
            {lead.client ? <Link href={`/clientes/${lead.client.id}`} className="btn-primary btn-sm"><ExternalLink size={14} /> Abrir ficha do cliente</Link>
              : stage?.isWon && <button className="btn-primary btn-sm" onClick={async () => { try { await moveLead(lead.id, lead.stageId); } finally { await refresh(); } }}>Converter em cliente</button>}
            {lead.phone && <a className="btn-secondary btn-sm" target="_blank" href={`https://wa.me/55${lead.phone.replace(/\D/g, "")}`}><MessageCircle size={14} /> WhatsApp</a>}
            <ConfirmButton className="btn-ghost btn-sm" message="Arquivar este lead? Ele some do pipeline mas o histórico é mantido." action={async () => { await archiveLead(lead.id); onClose(); router.refresh(); }}><Archive size={14} /> Arquivar</ConfirmButton>
            <ConfirmButton className="btn-ghost btn-sm text-red-600" message="Excluir definitivamente este lead e seu histórico?" action={async () => { await deleteLead(lead.id); onClose(); router.refresh(); }}><Trash2 size={14} /> Excluir</ConfirmButton>
          </div>

          {editing ? (
            <div className="card p-4"><LeadForm lead={lead as never} stages={stages} users={users} sources={sources} canAssign={canAssign} currentUserId={currentUserId} action={async (fd) => { await updateLead(lead.id, fd); toast.push("Lead atualizado."); setEditing(false); await refresh(); }} /></div>
          ) : (
            <>
              <Tabs value={tab} onChange={setTab} tabs={[{ key: "resumo", label: "Resumo" }, { key: "historico", label: "Histórico", count: lead.interactions.length }, { key: "atividades", label: "Atividades", count: lead.appointments.length + lead.tasks.filter((x) => x.status !== "CONCLUIDA").length }]} />
              {tab === "resumo" && (
                <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  {[["Empresa", lead.company], ["Segmento", lead.segment], ["Telefone", lead.phone], ["E-mail", lead.email], ["Origem", lead.source?.name], ["Próxima atividade", lead.nextActivityAt ? fmtDateTime(lead.nextActivityAt) : null], ["Última interação", lead.lastContactAt ? fmtDateTime(lead.lastContactAt) : null], ["Motivo da perda", lead.lossReason?.name]].map(([k, v]) => (
                    <div key={k as string}><dt className="text-xs text-muted">{k}</dt><dd className="font-medium">{v || "—"}</dd></div>
                  ))}
                  <div className="sm:col-span-2"><dt className="text-xs text-muted">Observações</dt><dd className="whitespace-pre-wrap">{lead.notes || "—"}</dd></div>
                </dl>
              )}
              {tab === "historico" && (
                <div className="space-y-4">
                  <form action={async (fd) => { try { await addInteraction(lead.id, fd); (document.getElementById("int-content") as HTMLTextAreaElement).value = ""; await refresh(); } catch (e) { toast.push((e as Error).message, "error"); } }} className="card p-3 space-y-2">
                    <div className="flex gap-2"><select name="type" className="input h-9 w-36"><option value="nota">Nota</option><option value="ligacao">Ligação</option><option value="whatsapp">WhatsApp</option><option value="email">E-mail</option><option value="reuniao">Reunião</option></select><textarea id="int-content" name="content" className="input min-h-[40px] h-10 py-2" rows={1} placeholder="Registrar contato ou observação..." required /></div>
                    <div className="flex justify-end"><SubmitButton className="btn-primary btn-sm" pendingText="Registrando...">Registrar</SubmitButton></div>
                  </form>
                  <ol className="relative border-l border-line ml-2 space-y-4">
                    {lead.interactions.map((i) => (
                      <li key={i.id} className="ml-4">
                        <span className={cn("absolute -left-[9px] w-4 h-4 rounded-full grid place-items-center text-white", i.type === "sistema" ? "bg-gray-400" : "bg-brand")}>{TYPE_ICON[i.type]}</span>
                        <p className="text-xs text-muted">{TYPE_LABEL[i.type] ?? i.type} · {fmtDateTime(i.createdAt)}{i.user ? ` · ${i.user.name}` : ""}</p>
                        <p className="text-sm whitespace-pre-wrap">{i.content}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {tab === "atividades" && (
                <div className="space-y-4">
                  <form action={async (fd) => { try { await scheduleActivity(lead.id, fd); toast.push("Atividade agendada."); await refresh(); } catch (e) { toast.push((e as Error).message, "error"); } }} className="card p-3 grid sm:grid-cols-2 gap-3">
                    <Field label="Título" className="sm:col-span-2"><input name="title" className="input" placeholder="Ex.: Reunião de apresentação" required /></Field>
                    <Field label="Data e hora"><input name="startAt" type="datetime-local" className="input" defaultValue={toInputDateTime(new Date(Date.now() + 864e5))} required /></Field>
                    <Field label="Tipo"><select name="typeId" className="input">{apptTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
                    <Field label="Duração (min)"><input name="durationMin" type="number" className="input" defaultValue={45} /></Field>
                    <Field label="Link da reunião"><input name="link" className="input" placeholder="https://meet.google.com/..." /></Field>
                    <div className="sm:col-span-2 flex justify-end"><SubmitButton className="btn-primary btn-sm" pendingText="Agendando..."><CalendarPlus size={14} /> Agendar</SubmitButton></div>
                  </form>
                  {lead.tasks.length > 0 && (
                    <div className="card divide-y divide-line">
                      <p className="p-3 text-xs font-semibold uppercase tracking-wide text-muted flex items-center gap-1.5"><ShieldCheck size={13} className="text-brand" /> Tarefas do SALES COP AI</p>
                      {lead.tasks.map((x) => (
                        <div key={x.id} className="p-3 flex items-center gap-3">
                          <button type="button" aria-label="Concluir" className={cn("w-5 h-5 rounded-md border grid place-items-center shrink-0", x.status === "CONCLUIDA" ? "bg-emerald-500 border-emerald-500 text-white" : "border-line hover:border-brand")} onClick={async () => { try { await setTaskStatus(x.id, x.status === "CONCLUIDA" ? "PENDENTE" : "CONCLUIDA"); await refresh(); } catch (e) { toast.push((e as Error).message, "error"); } }}>{x.status === "CONCLUIDA" && <Check size={12} />}</button>
                          <div className="flex-1 min-w-0"><p className={cn("text-sm font-medium truncate", x.status === "CONCLUIDA" && "line-through text-muted")}>{x.title}</p><p className="text-xs text-muted">{x.priority} · {x.dueAt ? `prazo ${fmtDateTime(x.dueAt)}` : "sem prazo"}{x.assignee ? ` · ${x.assignee.name}` : ""}</p></div>
                        </div>
                      ))}
                    </div>
                  )}
                  {lead.appointments.length === 0 ? <Empty title="Nenhuma atividade agendada" /> : (
                    <ul className="divide-y divide-line card">{lead.appointments.map((a) => (
                      <li key={a.id} className="p-3 flex items-center gap-3"><span className="w-2 h-2 rounded-full" style={{ background: a.type?.color ?? "#999" }} /><div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{a.title}</p><p className="text-xs text-muted">{fmtDateTime(a.startAt)} · {a.type?.name ?? "—"}</p></div><Badge tone={a.status === "REALIZADO" ? "green" : a.status === "CANCELADO" ? "red" : "blue"}>{a.status.replace("_", " ").toLowerCase()}</Badge></li>
                    ))}</ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Drawer>
  );
}
