import { Field, SubmitButton, Badge, Empty } from "@/components/ui";
import { ActionForm, ActionButton } from "@/components/action-form";
import { ModalButton, CloseOnDone } from "@/components/modal-button";
import { FileBarChart, Trash2, Upload, Paperclip } from "lucide-react";
import { fmtDate, toInputDate } from "@/lib/format";
import { can } from "@/lib/permissions";
import { createReport, deliverReport, deleteReport } from "../actions";
import type { ClientBundle } from "./data";

export function TabReports({ b, embedded }: { b: ClientBundle; embedded?: boolean }) {
  const { client: c, user } = b; const canEdit = can(user.role, "journey.manage"); const now = new Date();
  const delivered = c.reports.filter((r) => r.status === "ENTREGUE").sort((x, y) => +(y.deliveredAt ?? 0) - +(x.deliveredAt ?? 0));
  const prevInd = (idx: number) => delivered[idx + 1]?.indicators ?? null;
  return (
    <div className="grid lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 space-y-5">
        <div className="card">
          <div className="flex items-center justify-between p-4 border-b border-line"><p className="font-medium">Relatórios</p><div className="flex gap-2 text-xs"><Badge tone="amber">{c.reports.filter((r) => r.status === "PENDENTE").length} pendentes</Badge><Badge tone="green">{delivered.length} entregues</Badge></div></div>
          {c.reports.length === 0 ? <Empty icon={FileBarChart} title="Nenhum relatório planejado" hint="Planeje as entregas recorrentes (mensal, quinzenal...) e registre cada entrega com indicadores e anexos." /> : (
            <ul className="divide-y divide-line">{c.reports.map((r) => {
              const late = r.status === "PENDENTE" && r.dueAt && r.dueAt < now;
              const idx = delivered.findIndex((d) => d.id === r.id); const prev = idx >= 0 ? prevInd(idx) : null;
              return (
                <li key={r.id} className="p-4 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex-1 min-w-[180px]"><p className="font-medium text-sm">{r.title} {r.periodLabel && <span className="text-muted font-normal">· {r.periodLabel}</span>}</p><p className="text-xs text-muted">{r.status === "ENTREGUE" ? `Entregue em ${fmtDate(r.deliveredAt)}` : `Previsto para ${fmtDate(r.dueAt)}`}</p></div>
                    {late && <Badge tone="red">atrasado</Badge>}<Badge tone={r.status === "ENTREGUE" ? "green" : "amber"}>{r.status === "ENTREGUE" ? "Entregue" : "Pendente"}</Badge>
                    {canEdit && <ModalButton label={r.status === "ENTREGUE" ? "Editar entrega" : "Registrar entrega"} title={`Entrega — ${r.title}`} className={r.status === "ENTREGUE" ? "btn-secondary btn-sm" : "btn-primary btn-sm"} icon={<Upload size={13} />}>
                      <CloseOnDone action={deliverReport.bind(null, c.id, r.id)} success="Entrega registrada." className="space-y-3">
                        <Field label="Data da entrega"><input name="deliveredAt" type="date" className="input" defaultValue={toInputDate(r.deliveredAt ?? new Date())} /></Field>
                        <div><p className="label">Indicadores (nome / valor)</p><div className="grid grid-cols-2 gap-2">{[0, 1, 2, 3, 4, 5].map((i) => { const e = Object.entries(r.indicators ?? {})[i]; return <div key={i} className="contents"><input name={`k${i}`} className="input h-9" placeholder={["Leads", "CPL", "Vendas", "ROAS", "Alcance", "Engajamento"][i]} defaultValue={e?.[0] ?? ""} /><input name={`v${i}`} className="input h-9" placeholder="valor" defaultValue={e?.[1] ?? ""} /></div>; })}</div></div>
                        <Field label="Observações estratégicas"><textarea name="observations" className="input" rows={3} defaultValue={r.observations ?? ""} /></Field>
                        <Field label="Anexar arquivo"><input type="file" name="file" className="text-xs" /></Field>
                        <div className="flex justify-end"><SubmitButton>Salvar entrega</SubmitButton></div>
                      </CloseOnDone>
                    </ModalButton>}
                    {canEdit && <ActionButton className="btn-ghost btn-icon h-8 w-8 text-muted" confirm="Excluir relatório?" action={deleteReport.bind(null, c.id, r.id)}><Trash2 size={13} /></ActionButton>}
                  </div>
                  {r.indicators && Object.keys(r.indicators).length > 0 && (
                    <div className="flex flex-wrap gap-2">{Object.entries(r.indicators).map(([k, v]) => <div key={k} className="rounded-xl bg-surface-2 px-3 py-1.5 text-xs"><span className="text-muted">{k}: </span><b>{v}</b>{prev?.[k] && <span className="text-muted"> (ant. {prev[k]})</span>}</div>)}</div>
                  )}
                  {r.observations && <p className="text-sm text-muted whitespace-pre-wrap">{r.observations}</p>}
                  {r.documents.length > 0 && <p className="text-xs flex flex-wrap gap-2">{r.documents.map((d) => <a key={d.id} href={d.url} target="_blank" className="inline-flex items-center gap-1 hover:text-brand"><Paperclip size={11} />{d.name}</a>)}</p>}
                </li>
              );
            })}</ul>
          )}
        </div>
      </div>
      {canEdit && <div className="card p-4 h-fit"><p className="font-medium mb-3">Planejar relatório</p>
        <ActionForm action={createReport.bind(null, c.id)} success="Relatório planejado." reset className="space-y-3">
          <Field label="Título"><input name="title" className="input" defaultValue={`Relatório mensal ${c.reports.length + 1}`} required /></Field>
          <Field label="Período"><input name="periodLabel" className="input" placeholder="Ex.: Novembro/2026" /></Field>
          <Field label="Data prevista"><input name="dueAt" type="date" className="input" defaultValue={toInputDate(new Date(Date.now() + 30 * 864e5))} /></Field>
          <SubmitButton className="btn-primary w-full">Adicionar</SubmitButton>
        </ActionForm>
        {!embedded && <p className="text-xs text-muted mt-3">Relatórios são uma atividade recorrente: a etapa da jornada permanece “em andamento” enquanto o contrato estiver ativo.</p>}
      </div>}
    </div>
  );
}
