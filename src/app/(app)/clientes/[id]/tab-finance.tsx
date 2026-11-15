import { Kpi, Badge, Field, SubmitButton } from "@/components/ui";
import { ActionForm, ActionButton } from "@/components/action-form";
import { ModalButton, CloseOnDone } from "@/components/modal-button";
import { Wallet, CheckCircle2, Clock, AlertTriangle, Plus, Trash2, Receipt } from "lucide-react";
import { brl, fmtDate, toInputDate, num } from "@/lib/format";
import { can } from "@/lib/permissions";
import { addPayment, deletePayment, addInstallment, setInstallmentStatus } from "../actions";
import type { ClientBundle } from "./data";

const TONE: Record<string, "gray" | "green" | "amber" | "red" | "blue"> = { PENDENTE: "gray", PAGO: "green", PARCIAL: "blue", ATRASADO: "red", CANCELADO: "gray" };
const LABEL: Record<string, string> = { PENDENTE: "Pendente", PAGO: "Pago", PARCIAL: "Parcialmente pago", ATRASADO: "Em atraso", CANCELADO: "Cancelado" };

export function TabFinance({ b }: { b: ClientBundle }) {
  const { client: c, finance: f, user } = b;
  const canEdit = can(user.role, "finance.manage");
  const soon = f.installments.filter((i) => i.status === "PENDENTE" && (+i.dueDate - Date.now()) / 864e5 <= 7);
  const paidByInst = new Map<string, number>(); f.payments.forEach((p) => p.installmentId && paidByInst.set(p.installmentId, (paidByInst.get(p.installmentId) ?? 0) + num(p.amount)));
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Valor contratado" value={brl(f.contracted)} icon={Wallet} tone="gray" hint={f.contract ? `${f.contract.installments}x · ${f.contract.paymentMethod ?? "—"}` : undefined} />
        <Kpi label="Total recebido" value={brl(f.received)} icon={CheckCircle2} tone="green" hint={`${f.payments.length} pagamentos`} />
        <Kpi label="Saldo devedor" value={brl(f.pending)} icon={Clock} tone="blue" hint={soon.length ? `${soon.length} vencendo em 7 dias` : "Nada vence esta semana"} />
        <Kpi label="Em atraso" value={brl(f.overdue)} icon={AlertTriangle} tone={f.overdue > 0 ? "red" : "gray"} />
      </div>
      {(f.overdue > 0 || soon.length > 0) && (
        <div className={`rounded-2xl border p-3 text-sm flex flex-wrap gap-2 items-center ${f.overdue > 0 ? "border-red-500/30 bg-red-500/5 text-red-600" : "border-amber-500/30 bg-amber-500/5 text-amber-600"}`}>
          <AlertTriangle size={16} />{f.overdue > 0 ? <span><b>Inadimplência:</b> {brl(f.overdue)} em atraso.</span> : null}{soon.length > 0 && <span>{soon.length} parcela(s) vencem nos próximos 7 dias.</span>}
        </div>
      )}
      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 card">
          <div className="flex items-center justify-between p-4 border-b border-line"><p className="font-medium">Parcelas</p>
            {canEdit && <ModalButton label="Parcela avulsa" title="Adicionar parcela" className="btn-secondary btn-sm" icon={<Plus size={14} />} size="sm">
              <CloseOnDone action={addInstallment.bind(null, c.id)} success="Parcela adicionada." className="space-y-3">
                <Field label="Descrição"><input name="description" className="input" placeholder="Ex.: Serviço adicional" /></Field>
                <Field label="Valor (R$)"><input name="amount" type="number" step="0.01" className="input" required /></Field>
                <Field label="Vencimento"><input name="dueDate" type="date" className="input" required /></Field>
                <div className="flex justify-end"><SubmitButton>Adicionar</SubmitButton></div>
              </CloseOnDone>
            </ModalButton>}
          </div>
          <table className="table"><thead><tr><th>#</th><th>Descrição</th><th>Vencimento</th><th>Valor</th><th>Pago</th><th>Status</th><th></th></tr></thead>
            <tbody>{f.installments.map((i) => (
              <tr key={i.id}><td className="text-muted">{i.number === 0 ? "E" : i.number}</td><td>{i.description}</td><td>{fmtDate(i.dueDate)}</td><td className="tabular-nums font-medium">{brl(i.amount)}</td><td className="tabular-nums text-muted">{brl(paidByInst.get(i.id) ?? 0)}</td><td><Badge tone={TONE[i.status]}>{LABEL[i.status]}</Badge></td>
                <td className="text-right whitespace-nowrap">{canEdit && i.status !== "PAGO" && i.status !== "CANCELADO" && (
                  <ModalButton label="Receber" title={`Registrar pagamento — ${i.description}`} className="btn-primary btn-sm" size="sm">
                    <CloseOnDone action={addPayment.bind(null, c.id)} success="Pagamento registrado." className="space-y-3">
                      <input type="hidden" name="installmentId" value={i.id} />
                      <Field label="Valor recebido (R$)"><input name="amount" type="number" step="0.01" className="input" defaultValue={(num(i.amount) - (paidByInst.get(i.id) ?? 0)).toFixed(2)} required /></Field>
                      <div className="grid grid-cols-2 gap-3"><Field label="Data do pagamento"><input name="paidAt" type="date" className="input" defaultValue={toInputDate(new Date())} /></Field><Field label="Forma"><select name="method" className="input" defaultValue={f.contract?.paymentMethod ?? "Pix"}>{["Pix", "Boleto", "Cartão de crédito", "Transferência", "Dinheiro"].map((m) => <option key={m}>{m}</option>)}</select></Field></div>
                      <Field label="Comprovante (opcional)"><input type="file" name="receipt" className="text-xs" accept=".pdf,.png,.jpg,.jpeg" /></Field>
                      <Field label="Observações"><input name="notes" className="input" placeholder="Ex.: desconto por antecipação" /></Field>
                      <div className="flex justify-end"><SubmitButton>Confirmar recebimento</SubmitButton></div>
                    </CloseOnDone>
                  </ModalButton>)}
                  {canEdit && i.status !== "PAGO" && (i.status === "CANCELADO" ? <ActionButton className="btn-ghost btn-sm" action={setInstallmentStatus.bind(null, c.id, i.id, "PENDENTE")}>Reativar</ActionButton> : <ActionButton className="btn-ghost btn-sm text-muted" confirm="Cancelar esta parcela?" action={setInstallmentStatus.bind(null, c.id, i.id, "CANCELADO")}>Cancelar</ActionButton>)}
                </td></tr>
            ))}{f.installments.length === 0 && <tr><td colSpan={7} className="text-center text-muted py-8">Nenhuma parcela. Preencha o contrato para gerar.</td></tr>}</tbody>
          </table>
        </div>
        <div className="card">
          <div className="flex items-center justify-between p-4 border-b border-line"><p className="font-medium flex items-center gap-2"><Receipt size={16} /> Histórico de pagamentos</p>
            {canEdit && <ModalButton label="Avulso" title="Registrar pagamento avulso" className="btn-secondary btn-sm" size="sm">
              <CloseOnDone action={addPayment.bind(null, c.id)} success="Pagamento registrado." className="space-y-3">
                <Field label="Valor (R$)"><input name="amount" type="number" step="0.01" className="input" required /></Field>
                <Field label="Data"><input name="paidAt" type="date" className="input" defaultValue={toInputDate(new Date())} /></Field>
                <Field label="Forma"><input name="method" className="input" defaultValue="Pix" /></Field>
                <Field label="Comprovante"><input type="file" name="receipt" className="text-xs" /></Field>
                <Field label="Observações"><input name="notes" className="input" /></Field>
                <div className="flex justify-end"><SubmitButton>Registrar</SubmitButton></div>
              </CloseOnDone>
            </ModalButton>}
          </div>
          <ul className="divide-y divide-line">{f.payments.map((p) => (
            <li key={p.id} className="p-3 flex items-start gap-3 text-sm"><div className="flex-1"><p className="font-medium tabular-nums">{brl(p.amount)} <span className="text-xs text-muted font-normal">· {p.method ?? "—"}</span></p><p className="text-xs text-muted">{fmtDate(p.paidAt)}{p.notes ? ` · ${p.notes}` : ""}{p.receiptUrl && <> · <a href={p.receiptUrl} target="_blank" className="underline">comprovante</a></>}</p></div>{canEdit && <ActionButton className="btn-ghost btn-icon h-7 w-7 text-muted" confirm="Remover este pagamento?" action={deletePayment.bind(null, c.id, p.id)}><Trash2 size={13} /></ActionButton>}</li>
          ))}{f.payments.length === 0 && <li className="p-6 text-center text-sm text-muted">Nenhum pagamento registrado.</li>}</ul>
        </div>
      </div>
    </div>
  );
}
