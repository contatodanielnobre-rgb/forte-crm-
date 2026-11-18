"use client";
import * as React from "react";
import Link from "next/link";
import { X, ExternalLink, Phone, Mail, Building2, User, Loader2, CalendarClock, History, Wallet, Video, Send, CheckCircle2, Ban, AlertTriangle, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { brl, fmtDate, fmtDateTime, fmtRelative } from "@/lib/format";
import { Badge, Tabs } from "@/components/ui";
import { useToast } from "@/components/toast";
import { cancelScheduledTask, completeScheduledTask, getContactPanel, moveConversationLead, sendScheduledTaskNow } from "@/app/(app)/forte-chat/actions";
import { TASK_TYPE_OPTS } from "./task-form";

type Panel = Awaited<ReturnType<typeof getContactPanel>>;
export const TASK_STATUS: Record<string, { label: string; tone: "gray" | "blue" | "green" | "red" | "amber" | "gold" }> = {
  AGENDADA: { label: "Agendada", tone: "blue" }, EM_PROCESSAMENTO: { label: "Em processamento", tone: "gold" }, ENVIADA: { label: "Enviada", tone: "green" },
  FALHOU: { label: "Falhou", tone: "red" }, CANCELADA: { label: "Cancelada", tone: "gray" }, CONCLUIDA: { label: "Concluída", tone: "green" }, AGUARDANDO_ENVIO_MANUAL: { label: "Aguardando envio manual", tone: "amber" },
};
export const typeLabel = (k: string) => TASK_TYPE_OPTS.find((x) => x.key === k)?.label ?? k;

export function ContactPanel({ conversationId, tab: initialTab, onClose, refreshKey, onChanged }: { conversationId: string; tab?: string; onClose: () => void; refreshKey: number; onChanged: () => void }) {
  const toast = useToast(); const push = toast.push;
  const [data, setData] = React.useState<Panel | null>(null);
  const [tab, setTab] = React.useState(initialTab ?? "dados");
  const [loss, setLoss] = React.useState<string | null>(null);
  const load = React.useCallback(async () => { try { setData(await getContactPanel(conversationId)); } catch (e) { push((e as Error).message, "error"); } }, [conversationId, push]);
  React.useEffect(() => { void load(); }, [load, refreshKey]);
  React.useEffect(() => { if (initialTab) setTab(initialTab); }, [initialTab]);

  const act = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast.push(ok); await load(); onChanged(); } catch (e) { toast.push((e as Error).message, "error"); } };
  const move = async (stageId: string, lossReasonId?: string) => {
    const st = data?.stages.find((s: { id: string }) => s.id === stageId) as { isLost?: boolean } | undefined;
    if (st?.isLost && !lossReasonId) { setLoss(stageId); return; }
    setLoss(null);
    await act(() => moveConversationLead(conversationId, stageId, lossReasonId), "Etapa do pipeline atualizada.");
  };

  return (
    <aside className="h-full flex flex-col bg-surface border-l border-line w-full">
      <div className="h-14 flex items-center justify-between px-4 border-b border-line shrink-0"><p className="font-semibold text-sm">Informações do contato</p><button onClick={onClose} className="btn-ghost btn-icon h-8 w-8"><X size={16} /></button></div>
      {!data ? <div className="flex-1 grid place-items-center"><Loader2 className="animate-spin text-muted" /></div> : (
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 pt-2"><Tabs value={tab} onChange={setTab} tabs={[{ key: "dados", label: "Dados" }, { key: "tarefas", label: "Tarefas", count: data.chatTasks.length + data.nextAppts.length }, { key: "historico", label: "Histórico" }, ...(data.finance ? [{ key: "financeiro", label: "Financeiro" }] : [])]} /></div>
          {tab === "dados" && (
            <div className="p-4 space-y-4 text-sm">
              {!data.lead && !data.client && <p className="text-muted text-xs">Número ainda não vinculado a um cadastro do CRM.</p>}
              {(data.client || data.lead) && (
                <div className="space-y-2">
                  <Row icon={User} label="Nome">{data.client?.name ?? data.lead?.name}</Row>
                  <Row icon={Building2} label="Empresa">{data.client?.company ?? data.lead?.company ?? "—"}</Row>
                  <Row icon={Phone} label="Telefone">{data.client?.phone ?? data.lead?.phone ?? `+${data.conv.waId}`}</Row>
                  <Row icon={Mail} label="E-mail">{data.client?.email ?? data.lead?.email ?? "—"}</Row>
                  <Row icon={User} label="Responsável">{data.client?.owner?.name ?? data.lead?.owner?.name ?? "—"}</Row>
                </div>
              )}
              {data.lead && (
                <div className="card p-3 space-y-2">
                  <div className="flex items-center justify-between"><p className="text-xs font-medium text-muted">Pipeline</p>{data.lead.source && <span className="text-[11px] text-muted">Origem: {data.lead.source}</span>}</div>
                  {data.canMove ? (
                    <select className="input h-9" value={data.lead.stage.id} onChange={(e) => move(e.target.value)}>{data.stages.map((s: { id: string; name: string }) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                  ) : <Badge className="!text-xs" tone="gray"><span className="w-2 h-2 rounded-full" style={{ background: data.lead.stage.color }} /> {data.lead.stage.name}</Badge>}
                  {loss && <div className="space-y-1.5"><p className="text-xs text-muted">Motivo da perda:</p><select className="input h-9" defaultValue="" onChange={(e) => e.target.value && move(loss, e.target.value)}><option value="">Selecione...</option>{data.lossReasons.map((r: { id: string; name: string }) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>}
                  <div className="flex justify-between text-xs"><span className="text-muted">Valor potencial</span><span className="font-semibold">{brl(data.lead.value)}</span></div>
                  {data.lead.nextActivityAt && <div className="flex justify-between text-xs"><span className="text-muted">Próxima atividade</span><span>{fmtDateTime(data.lead.nextActivityAt)}</span></div>}
                </div>
              )}
              {data.client && <div className="card p-3 space-y-1.5"><p className="text-xs font-medium text-muted">Cliente</p><div className="flex justify-between text-xs"><span className="text-muted">Status</span><Badge tone="green">{data.client.status}</Badge></div><div className="flex justify-between text-xs"><span className="text-muted">Contrato</span><span className="font-semibold">{brl(data.client.contractValue)}</span></div>{data.client.service && <div className="flex justify-between text-xs"><span className="text-muted">Serviço</span><span>{data.client.service}</span></div>}</div>}
              <div className="flex flex-col gap-2">
                {data.client && data.canOpenClient && <Link href={`/clientes/${data.client.id}`} className="btn-secondary btn-sm justify-start"><ExternalLink size={14} /> Abrir ficha do cliente</Link>}
                {data.lead && data.canOpenLead && <Link href={`/pipeline?lead=${data.lead.id}`} className="btn-secondary btn-sm justify-start"><ExternalLink size={14} /> Abrir lead no pipeline</Link>}
              </div>
              {data.meetings.length > 0 && <div><p className="text-xs font-medium text-muted mb-2 flex items-center gap-1.5"><Video size={13} /> Últimas reuniões</p><ul className="space-y-1.5">{data.meetings.map((m: { id: string; title: string; startAt: string; status: string; type: { color: string } | null }) => <li key={m.id} className="flex items-center gap-2 text-xs"><span className="w-1.5 h-1.5 rounded-full" style={{ background: m.type?.color ?? "#999" }} /><span className="flex-1 truncate">{m.title}</span><span className="text-muted">{fmtDate(m.startAt)}</span></li>)}</ul></div>}
            </div>
          )}
          {tab === "tarefas" && (
            <div className="p-4 space-y-2">
              {data.chatTasks.length === 0 && data.nextAppts.length === 0 && <p className="text-sm text-muted text-center py-8">Nenhuma tarefa pendente.</p>}
              {data.chatTasks.map((tk: TaskRowData) => <TaskRow key={tk.id} t={tk} onAct={act} />)}
              {data.nextAppts.map((a: { id: string; title: string; startAt: string; type: { name: string; color: string } | null }) => <div key={a.id} className="card p-3 text-sm"><p className="font-medium flex items-center gap-1.5"><Video size={14} className="text-muted" /> {a.title}</p><p className="text-xs text-muted mt-0.5">{a.type?.name} · {fmtDateTime(a.startAt)}</p></div>)}
            </div>
          )}
          {tab === "historico" && (
            <ul className="p-4 space-y-3">
              {data.interactions.length === 0 && <p className="text-sm text-muted text-center py-8">Sem interações registradas.</p>}
              {data.interactions.map((i: { id: string; type: string; content: string; createdAt: string; user: string | null }) => <li key={i.id} className="flex gap-2.5 text-sm"><History size={14} className="text-muted mt-0.5 shrink-0" /><div className="min-w-0"><p className="leading-snug">{i.content}</p><p className="text-[11px] text-muted mt-0.5">{i.user ?? "Sistema"} · {fmtRelative(i.createdAt)} · {i.type}</p></div></li>)}
            </ul>
          )}
          {tab === "financeiro" && data.finance && (
            <div className="p-4 space-y-2 text-sm">
              <p className="text-xs font-medium text-muted flex items-center gap-1.5"><Wallet size={13} /> Resumo financeiro (somente leitura)</p>
              <Fin label="Valor do contrato" value={brl(data.finance.contractValue)} />
              <Fin label="Recebido" value={brl(data.finance.paid)} />
              <Fin label="Em aberto" value={brl(data.finance.openAmount)} />
              <Fin label="Parcelas em atraso" value={String(data.finance.overdue)} danger={data.finance.overdue > 0} />
              <Fin label="Próximo vencimento" value={fmtDate(data.finance.nextDue)} />
              {data.client && <Link href={`/clientes/${data.client.id}?aba=financeiro`} className="btn-secondary btn-sm mt-2"><ExternalLink size={14} /> Ver financeiro completo</Link>}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

type TaskRowData = { id: string; title: string; type: string; status: string; runAt: string; lastError: string | null; assignee: { name: string } | null; description: string | null };
export function TaskRow({ t: tk, onAct, compact }: { t: TaskRowData; onAct: (fn: () => Promise<unknown>, ok: string) => Promise<void>; compact?: boolean }) {
  const st = TASK_STATUS[tk.status] ?? { label: tk.status, tone: "gray" as const };
  const send = tk.type.startsWith("ENVIAR_");
  const open = ["AGENDADA", "AGUARDANDO_ENVIO_MANUAL", "FALHOU"].includes(tk.status);
  const late = open && new Date(tk.runAt) < new Date();
  return (
    <div className={cn("card p-3 text-sm", late && !send && "border-amber-500/40")}>
      <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="font-medium truncate">{tk.title}</p><p className="text-xs text-muted">{typeLabel(tk.type)} · {fmtDateTime(tk.runAt)}{tk.assignee ? ` · ${tk.assignee.name}` : ""}</p></div><Badge tone={st.tone}>{st.label}</Badge></div>
      {tk.lastError && open && <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5 flex gap-1"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> {tk.lastError}</p>}
      {open && !compact && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {send && <button className="btn-secondary btn-sm" onClick={() => onAct(() => sendScheduledTaskNow(tk.id), "Enviado pelo WhatsApp.")}>{tk.status === "FALHOU" ? <RotateCw size={13} /> : <Send size={13} />} {tk.status === "FALHOU" ? "Tentar novamente" : "Enviar agora"}</button>}
          {!send && <button className="btn-secondary btn-sm" onClick={() => onAct(() => completeScheduledTask(tk.id), "Tarefa concluída e registrada no histórico.")}><CheckCircle2 size={13} /> Concluir</button>}
          {send && tk.status !== "AGENDADA" && <button className="btn-ghost btn-sm" onClick={() => { const note = prompt("Registrar como concluída fora do sistema (ex.: enviado pelo celular). Observação:"); if (note !== null) void onAct(() => completeScheduledTask(tk.id, note || "Concluída manualmente"), "Registrada como concluída (não enviada pelo CRM)."); }}><CheckCircle2 size={13} /> Concluí por fora</button>}
          <button className="btn-ghost btn-sm text-red-500" onClick={() => confirm("Cancelar esta tarefa?") && onAct(() => cancelScheduledTask(tk.id), "Tarefa cancelada.")}><Ban size={13} /> Cancelar</button>
        </div>
      )}
      {tk.status === "AGENDADA" && send && <p className="text-[11px] text-muted mt-1.5 flex items-center gap-1"><CalendarClock size={11} /> Envio automático pelo servidor no horário marcado.</p>}
    </div>
  );
}

function Row({ icon: Icon, label, children }: { icon: typeof User; label: string; children: React.ReactNode }) { return <div className="flex items-start gap-2.5"><Icon size={14} className="text-muted mt-0.5 shrink-0" /><div className="min-w-0"><p className="text-[11px] text-muted leading-none mb-0.5">{label}</p><p className="truncate">{children}</p></div></div>; }
function Fin({ label, value, danger }: { label: string; value: string; danger?: boolean }) { return <div className="flex justify-between border-b border-line/60 pb-1.5"><span className="text-muted">{label}</span><span className={cn("font-medium", danger && "text-red-500")}>{value}</span></div>; }
