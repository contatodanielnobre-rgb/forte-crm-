"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isToday } from "date-fns";
import { Plus, Pencil, MessageCircle, ListChecks, CheckCircle2 } from "lucide-react";
import { Modal, Badge } from "@/components/ui";
import { useToast } from "@/components/toast";
import { fmtDateTime, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TaskForm, TASK_TYPE_OPTS, type TaskEdit } from "@/components/chat/task-form";
import { TaskRow, TASK_STATUS } from "@/components/chat/contact-panel";
import type { MediaInfo, UserOpt } from "@/components/chat/client-api";
import { setTaskStatus } from "@/app/(app)/agenda/actions";

type T = { id: string; title: string; type: string; status: string; runAt: string; description: string | null; recurrence: string; lastError: string | null; assigneeId: string | null; conversationId: string | null; leadId: string | null; clientId: string | null; executedAt: string | null; attempts: number;
  assignee: { id: string; name: string } | null; lead: { id: string; name: string } | null; client: { id: string; name: string } | null; conversation: { id: string; waId: string; profileName: string | null } | null; media: MediaInfo | null; attemptsLog: { id: string; status: string; detail: string | null; startedAt: string }[] };
type O = { id: string; title: string; dueAt: string | null; status: string; client: { id: string; name: string } | null; lead: { id: string; name: string } | null };
type F = { responsavel: string; tipo: string; status: string; de: string; ate: string; cliente: string };

export function MyTasks({ tasks, other, users, me, canAssign, blobEnabled, filters }: { tasks: T[]; other: O[]; users: UserOpt[]; me: string; canAssign: boolean; blobEnabled: boolean; filters: F }) {
  const router = useRouter(); const toast = useToast();
  const [modal, setModal] = React.useState<null | "new" | T>(null);
  const [tab, setTab] = React.useState<"hoje" | "atrasadas" | "proximas" | "concluidas" | "canceladas">("hoje");
  const now = new Date();
  const open = (x: T) => ["AGENDADA", "EM_PROCESSAMENTO", "AGUARDANDO_ENVIO_MANUAL", "FALHOU"].includes(x.status);
  const groups = {
    hoje: tasks.filter((x) => open(x) && isToday(new Date(x.runAt)) && new Date(x.runAt) >= now),
    atrasadas: tasks.filter((x) => open(x) && new Date(x.runAt) < now),
    proximas: tasks.filter((x) => open(x) && new Date(x.runAt) >= now && !isToday(new Date(x.runAt))),
    concluidas: tasks.filter((x) => x.status === "ENVIADA" || x.status === "CONCLUIDA").reverse(),
    canceladas: tasks.filter((x) => x.status === "CANCELADA").reverse(),
  };
  const setF = (k: keyof F, v: string) => { const q = new URLSearchParams({ ...filters, [k]: v }); for (const [a, b] of [...q.entries()]) if (!b) q.delete(a); router.push(`/forte-chat/tarefas?${q}`); };
  const act = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast.push(ok); router.refresh(); } catch (e) { toast.push((e as Error).message, "error"); } };
  const list = groups[tab];
  const contact = (x: T) => x.client?.name ?? x.lead?.name ?? x.conversation?.profileName ?? (x.conversation ? `+${x.conversation.waId}` : "—");

  return (
    <div className="h-full overflow-y-auto space-y-4 pb-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-xl font-semibold tracking-tight flex items-center gap-2"><ListChecks className="text-gold" size={22} /> Minhas Tarefas</h1><p className="text-sm text-muted">Mensagens, áudios, documentos e atividades agendados no FORTE CHAT — também aparecem na Agenda.</p></div>
        <button onClick={() => setModal("new")} className="btn-primary btn-sm"><Plus size={14} /> Nova tarefa</button>
      </div>

      <div className="card p-3 grid grid-cols-2 md:grid-cols-6 gap-2">
        {canAssign ? <select className="input h-9" value={filters.responsavel} onChange={(e) => setF("responsavel", e.target.value)}><option value="todos">Toda a equipe</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select> : <div className="input h-9 bg-surface-2 flex items-center text-muted">Minhas</div>}
        <select className="input h-9" value={filters.tipo} onChange={(e) => setF("tipo", e.target.value)}><option value="">Todos os tipos</option>{TASK_TYPE_OPTS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select>
        <select className="input h-9" value={filters.status} onChange={(e) => setF("status", e.target.value)}><option value="">Todos os status</option>{Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <input className="input h-9" placeholder="Cliente / lead" defaultValue={filters.cliente} onKeyDown={(e) => e.key === "Enter" && setF("cliente", e.currentTarget.value)} onBlur={(e) => e.target.value !== filters.cliente && setF("cliente", e.target.value)} />
        <input type="date" className="input h-9" value={filters.de} onChange={(e) => setF("de", e.target.value)} title="De" />
        <input type="date" className="input h-9" value={filters.ate} onChange={(e) => setF("ate", e.target.value)} title="Até" />
      </div>

      <div className="flex gap-1.5 overflow-x-auto">
        {([["hoje", "Hoje"], ["atrasadas", "Atrasadas"], ["proximas", "Próximas"], ["concluidas", "Concluídas"], ["canceladas", "Canceladas"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("h-9 px-3 rounded-xl text-sm border whitespace-nowrap", tab === k ? "bg-[#0a0a0c] text-white border-gold/40" : "border-line text-muted bg-surface")}>{l} <span className={cn("ml-1 text-xs px-1.5 rounded-md", k === "atrasadas" && groups[k].length ? "bg-red-500/15 text-red-500" : tab === k ? "bg-white/15 text-gold" : "bg-surface-2")}>{groups[k].length}</span></button>
        ))}
      </div>

      {list.length === 0 ? <div className="card p-10 text-center text-sm text-muted">Nenhuma tarefa nesta lista.</div> : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {list.map((x) => (
            <div key={x.id} className="space-y-1">
              <div className="flex items-center justify-between px-1 text-xs text-muted"><span className="truncate">{contact(x)}{x.recurrence !== "NONE" && " · recorrente"}</span><span className="flex gap-2 shrink-0">{x.conversationId && <Link href={`/forte-chat?c=${x.conversationId}`} className="hover:text-gold flex items-center gap-1"><MessageCircle size={12} /> Conversa</Link>}{["AGENDADA", "AGUARDANDO_ENVIO_MANUAL", "FALHOU"].includes(x.status) && <button onClick={() => setModal(x)} className="hover:text-gold flex items-center gap-1"><Pencil size={12} /> Editar</button>}</span></div>
              <TaskRow t={x} onAct={act} />
              {x.attemptsLog.length > 0 && <details className="px-1 text-[11px] text-muted"><summary className="cursor-pointer">Histórico de tentativas ({x.attemptsLog.length})</summary><ul className="mt-1 space-y-0.5">{x.attemptsLog.map((a) => <li key={a.id}>{fmtDateTime(a.startedAt)} · <b>{a.status}</b>{a.detail ? ` — ${a.detail}` : ""}</li>)}</ul></details>}
              {x.executedAt && <p className="px-1 text-[11px] text-muted">Executada em {fmtDateTime(x.executedAt)}</p>}
            </div>
          ))}
        </div>
      )}

      {other.length > 0 && (
        <div className="card p-4">
          <p className="text-sm font-medium mb-2">Outras tarefas do CRM atribuídas a você</p>
          <ul className="divide-y divide-line">{other.map((o) => <li key={o.id} className="py-2 flex items-center gap-3 text-sm"><span className="flex-1 min-w-0 truncate">{o.title}{(o.client || o.lead) && <span className="text-muted"> · {(o.client ?? o.lead)!.name}</span>}</span><span className={cn("text-xs", o.dueAt && new Date(o.dueAt) < now ? "text-red-500" : "text-muted")}>{o.dueAt ? fmtDate(o.dueAt) : "sem prazo"}</span><Badge tone="gray">{o.status === "EM_ANDAMENTO" ? "Em andamento" : "Pendente"}</Badge><button className="btn-ghost btn-sm" onClick={() => act(() => setTaskStatus(o.id, "CONCLUIDA"), "Tarefa concluída.")}><CheckCircle2 size={14} /></button></li>)}</ul>
        </div>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal === "new" ? "Nova tarefa" : "Editar tarefa"} size="lg">
        {modal && <TaskForm users={users} me={me} canAssign={canAssign} blobEnabled={blobEnabled} onDone={() => setModal(null)}
          edit={modal === "new" ? null : ({ id: modal.id, title: modal.title, type: modal.type, runAt: modal.runAt, description: modal.description, recurrence: modal.recurrence, assigneeId: modal.assigneeId, conversationId: modal.conversationId, leadId: modal.leadId, clientId: modal.clientId, media: modal.media, contactName: contact(modal) } satisfies TaskEdit)} />}
      </Modal>
    </div>
  );
}
