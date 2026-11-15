import { Field, SubmitButton, Badge, Avatar, Empty } from "@/components/ui";
import { ActionForm, ActionButton } from "@/components/action-form";
import { ListTodo, Check, Trash2, RotateCcw } from "lucide-react";
import { fmtDate, toInputDate } from "@/lib/format";
import { createTask, toggleTask, deleteTask } from "../actions";
import type { ClientBundle } from "./data";
import { cn } from "@/lib/utils";

export function TabTasks({ b }: { b: ClientBundle }) {
  const { client: c } = b; const now = new Date();
  const open = c.tasks.filter((t) => t.status !== "CONCLUIDA"); const done = c.tasks.filter((t) => t.status === "CONCLUIDA");
  const Row = ({ t }: { t: (typeof c.tasks)[number] }) => {
    const late = t.status !== "CONCLUIDA" && t.dueAt && t.dueAt < now;
    return (
      <li className="p-3 flex items-center gap-3">
        <ActionButton className={cn("w-6 h-6 rounded-md border grid place-items-center shrink-0", t.status === "CONCLUIDA" ? "bg-emerald-500 border-emerald-500 text-white" : "border-line hover:border-brand")} action={toggleTask.bind(null, c.id, t.id, t.status === "CONCLUIDA" ? "PENDENTE" : "CONCLUIDA")}>{t.status === "CONCLUIDA" ? <Check size={14} /> : <RotateCcw size={0} />}</ActionButton>
        <div className="flex-1 min-w-0"><p className={cn("text-sm font-medium", t.status === "CONCLUIDA" && "line-through text-muted")}>{t.title}</p><p className="text-xs text-muted">{t.description}{t.dueAt && <span className={cn(late && "text-red-500 font-medium")}>{t.description ? " · " : ""}Prazo {fmtDate(t.dueAt)}</span>}</p></div>
        {t.assignee && <span className="flex items-center gap-1.5 text-xs text-muted"><Avatar name={t.assignee.name} src={t.assignee.avatarUrl} size={20} />{t.assignee.name.split(" ")[0]}</span>}
        {late && <Badge tone="red">atrasada</Badge>}
        {t.status !== "CONCLUIDA" && <ActionButton className="btn-ghost btn-sm" action={toggleTask.bind(null, c.id, t.id, t.status === "EM_ANDAMENTO" ? "PENDENTE" : "EM_ANDAMENTO")}>{t.status === "EM_ANDAMENTO" ? "Em andamento" : "Iniciar"}</ActionButton>}
        <ActionButton className="btn-ghost btn-icon h-7 w-7 text-muted" confirm="Excluir tarefa?" action={deleteTask.bind(null, c.id, t.id)}><Trash2 size={13} /></ActionButton>
      </li>
    );
  };
  return (
    <div className="grid lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 space-y-5">
        <div className="card"><p className="p-4 border-b border-line font-medium">Pendentes <span className="text-muted font-normal text-sm">({open.length})</span></p>{open.length === 0 ? <Empty icon={ListTodo} title="Sem tarefas pendentes" /> : <ul className="divide-y divide-line">{open.map((t) => <Row key={t.id} t={t} />)}</ul>}</div>
        {done.length > 0 && <div className="card"><p className="p-4 border-b border-line font-medium text-muted">Concluídas ({done.length})</p><ul className="divide-y divide-line">{done.slice(0, 20).map((t) => <Row key={t.id} t={t} />)}</ul></div>}
      </div>
      <div className="card p-4 h-fit"><p className="font-medium mb-3">Nova tarefa</p>
        <ActionForm action={createTask.bind(null, c.id)} success="Tarefa criada." reset className="space-y-3">
          <Field label="Título"><input name="title" className="input" required /></Field>
          <Field label="Descrição"><textarea name="description" className="input" rows={2} /></Field>
          <Field label="Prazo"><input name="dueAt" type="date" className="input" defaultValue={toInputDate(new Date(Date.now() + 3 * 864e5))} /></Field>
          <Field label="Responsável"><select name="assigneeId" className="input" defaultValue={c.ownerId ?? ""}>{b.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
          <SubmitButton className="btn-primary w-full">Adicionar tarefa</SubmitButton>
        </ActionForm>
      </div>
    </div>
  );
}
