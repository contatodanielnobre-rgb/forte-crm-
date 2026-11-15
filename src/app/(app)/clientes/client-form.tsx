"use client";
import { Field, SubmitButton } from "@/components/ui";
import { CloseOnDone } from "@/components/modal-button";
import { toInputDate } from "@/lib/format";

export type ClientFormData = { id?: string; name: string; company: string | null; cnpj: string | null; phone: string | null; whatsapp: string | null; email: string | null; segment: string | null; address: string | null; service: string | null; contractValue: string; closedAt: Date; ownerId: string | null; status: string; notes: string | null };

export function ClientForm({ client, users, services, action }: { client?: ClientFormData; users: { id: string; name: string }[]; services: string[]; action: (fd: FormData) => Promise<unknown> }) {
  return (
    <CloseOnDone action={action} success={client ? "Cliente atualizado." : "Cliente cadastrado."} className="grid sm:grid-cols-2 gap-4">
      <Field label="Nome do cliente *" className="sm:col-span-2"><input name="name" className="input" defaultValue={client?.name} required /></Field>
      <Field label="Empresa"><input name="company" className="input" defaultValue={client?.company ?? ""} /></Field>
      <Field label="CNPJ"><input name="cnpj" className="input" defaultValue={client?.cnpj ?? ""} placeholder="00.000.000/0001-00" /></Field>
      <Field label="Telefone"><input name="phone" className="input" defaultValue={client?.phone ?? ""} /></Field>
      <Field label="WhatsApp"><input name="whatsapp" className="input" defaultValue={client?.whatsapp ?? ""} /></Field>
      <Field label="E-mail"><input name="email" type="email" className="input" defaultValue={client?.email ?? ""} /></Field>
      <Field label="Segmento"><input name="segment" className="input" defaultValue={client?.segment ?? ""} /></Field>
      <Field label="Endereço" className="sm:col-span-2"><input name="address" className="input" defaultValue={client?.address ?? ""} /></Field>
      <Field label="Serviço contratado"><input name="service" className="input" list="services" defaultValue={client?.service ?? ""} /><datalist id="services">{services.map((s) => <option key={s} value={s} />)}</datalist></Field>
      <Field label="Valor do contrato (R$)"><input name="contractValue" type="number" step="0.01" className="input" defaultValue={client ? Number(client.contractValue) : ""} /></Field>
      <Field label="Data de fechamento"><input name="closedAt" type="date" className="input" defaultValue={toInputDate(client?.closedAt ?? new Date())} /></Field>
      <Field label="Responsável interno"><select name="ownerId" className="input" defaultValue={client?.ownerId ?? ""}><option value="">Selecione...</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
      <Field label="Status"><select name="status" className="input" defaultValue={client?.status ?? "ONBOARDING"}><option value="ONBOARDING">Onboarding</option><option value="ATIVO">Ativo</option><option value="PAUSADO">Pausado</option><option value="ENCERRADO">Encerrado</option></select></Field>
      <Field label="Observações" className="sm:col-span-2"><textarea name="notes" className="input" rows={2} defaultValue={client?.notes ?? ""} /></Field>
      <div className="sm:col-span-2 flex justify-end"><SubmitButton>{client ? "Salvar alterações" : "Cadastrar cliente"}</SubmitButton></div>
    </CloseOnDone>
  );
}
