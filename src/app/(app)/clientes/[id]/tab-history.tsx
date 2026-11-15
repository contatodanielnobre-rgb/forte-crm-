import { Field, SubmitButton, Badge } from "@/components/ui";
import { ActionForm, ActionButton } from "@/components/action-form";
import { Paperclip, Trash2 } from "lucide-react";
import { fmtDateTime, fmtDate } from "@/lib/format";
import { can } from "@/lib/permissions";
import { addClientInteraction, uploadDocument, deleteDocument } from "../actions";
import type { ClientBundle } from "./data";

export function TabHistory({ b }: { b: ClientBundle }) {
  const { client: c, audits, user } = b;
  return (
    <div className="grid lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 space-y-5">
        <ActionForm action={addClientInteraction.bind(null, c.id)} success="Registro adicionado." reset className="card p-3 flex gap-2">
          <select name="type" className="input h-10 w-36"><option value="nota">Nota</option><option value="ligacao">Ligação</option><option value="whatsapp">WhatsApp</option><option value="email">E-mail</option><option value="reuniao">Reunião</option></select>
          <input name="content" className="input" placeholder="Registrar contato, decisão ou observação..." required /><SubmitButton className="btn-primary" pendingText="...">Registrar</SubmitButton>
        </ActionForm>
        <div className="card"><p className="p-4 border-b border-line font-medium">Linha do tempo completa</p>
          <ol className="divide-y divide-line">{c.interactions.map((i) => <li key={i.id} className="p-3 text-sm"><p className="text-xs text-muted">{fmtDateTime(i.createdAt)}{i.user ? ` · ${i.user.name}` : ""} <Badge className="ml-1">{i.type}</Badge></p><p className="mt-0.5">{i.content}</p></li>)}</ol>
        </div>
        {can(user.role, "clients.viewAll") && <div className="card"><p className="p-4 border-b border-line font-medium">Histórico de alterações (auditoria)</p>
          <ul className="divide-y divide-line text-sm">{audits.map((a) => <li key={a.id} className="p-3"><p className="text-xs text-muted">{fmtDateTime(a.createdAt)} · {a.user?.name ?? "sistema"} · {a.action} {a.entity}</p><p>{a.summary}</p></li>)}{audits.length === 0 && <li className="p-4 text-muted">Sem registros.</li>}</ul></div>}
      </div>
      <div className="card p-4 h-fit">
        <p className="font-medium flex items-center gap-2 mb-3"><Paperclip size={16} /> Documentos e anexos</p>
        <ul className="space-y-2 mb-4">{c.documents.map((d) => <li key={d.id} className="flex items-center gap-2 text-sm"><div className="flex-1 min-w-0"><a href={d.url} target="_blank" className="hover:text-brand truncate block">{d.name}</a><p className="text-xs text-muted">{d.category} · {fmtDate(d.createdAt)}{d.user ? ` · ${d.user.name}` : ""}</p></div>{can(user.role, "clients.manage") && <ActionButton className="btn-ghost btn-icon h-7 w-7 text-muted" confirm="Excluir documento?" action={deleteDocument.bind(null, c.id, d.id)}><Trash2 size={13} /></ActionButton>}</li>)}{c.documents.length === 0 && <li className="text-sm text-muted">Nenhum documento.</li>}</ul>
        <ActionForm action={uploadDocument.bind(null, c.id)} success="Documento anexado." reset className="space-y-2">
          <Field label="Categoria"><select name="category" className="input h-9"><option value="outro">Outro</option><option value="contrato">Contrato</option><option value="formulario">Formulário</option><option value="relatorio">Relatório</option><option value="comprovante">Comprovante</option></select></Field>
          <input type="file" name="file" className="text-xs w-full" required />
          <SubmitButton className="btn-secondary btn-sm w-full" pendingText="Enviando...">Anexar arquivo</SubmitButton>
        </ActionForm>
      </div>
    </div>
  );
}
