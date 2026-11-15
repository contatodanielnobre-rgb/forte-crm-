import { FileText, Paperclip } from "lucide-react";
import { Field, SubmitButton, Badge } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { toInputDate, fmtDate, brl } from "@/lib/format";
import { can } from "@/lib/permissions";
import { saveContract, uploadDocument } from "../actions";
import type { ClientBundle } from "./data";

export function TabContract({ b }: { b: ClientBundle }) {
  const { client: c, finance, user } = b; const k = finance.contract;
  const canEdit = can(user.role, "finance.manage");
  const docs = c.documents.filter((d) => d.category === "contrato");
  const step = c.journeySteps.find((s) => s.key === "CONTRATO");
  return (
    <div className="grid lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 card p-5">
        <div className="flex items-center justify-between mb-4"><p className="font-medium flex items-center gap-2"><FileText size={16} /> Dados do contrato</p><Badge tone={k?.status === "ASSINADO" ? "green" : k?.status === "ENVIADO" ? "blue" : k?.status === "CANCELADO" ? "red" : "amber"}>{k?.status ?? "PENDENTE"}</Badge></div>
        <ActionForm action={saveContract.bind(null, c.id)} success="Contrato salvo. Parcelas atualizadas." className="grid sm:grid-cols-3 gap-4">
          <fieldset disabled={!canEdit} className="contents">
            <Field label="Valor total (R$)"><input name="totalValue" type="number" step="0.01" className="input" defaultValue={k ? Number(k.totalValue) : Number(c.contractValue)} /></Field>
            <Field label="Desconto (R$)"><input name="discount" type="number" step="0.01" className="input" defaultValue={k ? Number(k.discount) : 0} /></Field>
            <Field label="Valor de entrada (R$)"><input name="downPayment" type="number" step="0.01" className="input" defaultValue={k ? Number(k.downPayment) : 0} /></Field>
            <Field label="Quantidade de parcelas"><input name="installments" type="number" min={1} max={60} className="input" defaultValue={k?.installments ?? 1} /></Field>
            <Field label="1º vencimento"><input name="firstDueDate" type="date" className="input" defaultValue={toInputDate(k?.firstDueDate ?? new Date())} /></Field>
            <Field label="Forma de pagamento"><select name="paymentMethod" className="input" defaultValue={k?.paymentMethod ?? ""}><option value="">Selecione...</option>{["Pix", "Boleto", "Cartão de crédito", "Transferência", "Dinheiro"].map((m) => <option key={m}>{m}</option>)}</select></Field>
            <Field label="Status do contrato"><select name="status" className="input" defaultValue={k?.status ?? "PENDENTE"}><option value="PENDENTE">Pendente</option><option value="ENVIADO">Enviado</option><option value="ASSINADO">Assinado</option><option value="CANCELADO">Cancelado</option></select></Field>
            <Field label="Data de envio"><input name="sentAt" type="date" className="input" defaultValue={toInputDate(k?.sentAt)} /></Field>
            <Field label="Data de assinatura"><input name="signedAt" type="date" className="input" defaultValue={toInputDate(k?.signedAt)} /></Field>
            <Field label="Início da vigência"><input name="startDate" type="date" className="input" defaultValue={toInputDate(k?.startDate)} /></Field>
            <Field label="Fim da vigência"><input name="endDate" type="date" className="input" defaultValue={toInputDate(k?.endDate)} /></Field>
            <Field label="Observações" className="sm:col-span-3"><textarea name="notes" className="input" rows={2} defaultValue={k?.notes ?? ""} /></Field>
          </fieldset>
          {canEdit && <div className="sm:col-span-3 flex items-center justify-between"><p className="text-xs text-muted">Alterar valor, entrada, parcelas ou 1º vencimento regenera as parcelas ainda não pagas. Marcar como <b>Assinado</b> conclui a etapa “Contrato” da jornada.</p><SubmitButton>Salvar contrato</SubmitButton></div>}
        </ActionForm>
      </div>
      <div className="space-y-5">
        <div className="card p-4">
          <p className="text-sm font-medium mb-2">Resumo</p>
          <dl className="text-sm space-y-1.5">
            <div className="flex justify-between"><dt className="text-muted">Contratado</dt><dd className="font-medium tabular-nums">{brl(finance.contracted)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Recebido</dt><dd className="font-medium tabular-nums text-emerald-600">{brl(finance.received)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Saldo devedor</dt><dd className="font-medium tabular-nums">{brl(finance.pending)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Etapa na jornada</dt><dd><Badge tone={step?.status === "CONCLUIDO" ? "green" : "amber"}>{step?.status.replace("_", " ") ?? "—"}</Badge></dd></div>
          </dl>
        </div>
        <div className="card p-4">
          <p className="text-sm font-medium mb-2 flex items-center gap-2"><Paperclip size={14} /> Contrato anexado</p>
          <ul className="space-y-1 mb-3">{docs.map((d) => <li key={d.id} className="text-sm"><a href={d.url} target="_blank" className="hover:text-brand underline-offset-2 hover:underline">{d.name}</a><span className="text-xs text-muted"> · {fmtDate(d.createdAt)}</span></li>)}{docs.length === 0 && <li className="text-sm text-muted">Nenhum arquivo.</li>}</ul>
          <ActionForm action={uploadDocument.bind(null, c.id)} success="Contrato anexado." reset className="flex gap-2 items-center"><input type="hidden" name="category" value="contrato" /><input type="file" name="file" className="text-xs flex-1" required accept=".pdf,.doc,.docx,.png,.jpg" /><SubmitButton className="btn-secondary btn-sm" pendingText="Enviando...">Anexar</SubmitButton></ActionForm>
        </div>
      </div>
    </div>
  );
}
