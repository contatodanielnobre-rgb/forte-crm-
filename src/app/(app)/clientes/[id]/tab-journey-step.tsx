import { Field, SubmitButton, Badge } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { JOURNEY_STEPS, isStepLate } from "@/lib/services/journey";
import { fmtDate, fmtDateTime, toInputDate } from "@/lib/format";
import { can } from "@/lib/permissions";
import { updateJourneyStep, generateWeeklyMeetings } from "../actions";
import type { ClientBundle } from "./data";
import type { JourneyKey } from "@/db/schema";
import { TabMeetings } from "./tab-meetings";
import { TabReports } from "./tab-reports";

export function TabJourneyStep({ b, stepKey }: { b: ClientBundle; stepKey: JourneyKey }) {
  const { client: c, user } = b;
  const def = JOURNEY_STEPS.find((s) => s.key === stepKey)!;
  const s = c.journeySteps.find((x) => x.key === stepKey);
  const canEdit = can(user.role, "journey.manage");
  const d = (s?.data ?? {}) as Record<string, string>;
  const late = s ? isStepLate(s) : false;
  const docs = c.documents.filter((x) => (stepKey === "CONTRATO" && x.category === "contrato") || (stepKey === "FORMULARIO" && x.category === "formulario"));

  const specific = {
    GRUPO_CRIADO: <>
      <Field label="Data de criação do grupo"><input name="createdOn" type="date" className="input" defaultValue={d.createdOn ? toInputDate(d.createdOn) : ""} /></Field>
      <Field label="Participantes" className="sm:col-span-2"><input name="participants" className="input" defaultValue={d.participants ?? ""} placeholder="Nome dos participantes do grupo de WhatsApp" /></Field>
    </>,
    CONTRATO: <>
      <Field label="Data de envio"><input name="sentAt" type="date" className="input" defaultValue={d.sentAt ? toInputDate(d.sentAt) : ""} /></Field>
      <Field label="Data de assinatura"><input name="signedAt" type="date" className="input" defaultValue={d.signedAt ? toInputDate(d.signedAt) : ""} /></Field>
      <Field label="Anexar contrato"><input type="file" name="file" className="text-xs" /></Field>
    </>,
    FORMULARIO: <>
      <Field label="Formulário enviado em"><input name="sentAt" type="date" className="input" defaultValue={d.sentAt ? toInputDate(d.sentAt) : ""} /></Field>
      <Field label="Preenchido em"><input name="filledAt" type="date" className="input" defaultValue={d.filledAt ? toInputDate(d.filledAt) : ""} /></Field>
      <Field label="Link do formulário"><input name="link" className="input" defaultValue={d.link ?? ""} placeholder="https://forms..." /></Field>
      <Field label="Anexar respostas / documentos" className="sm:col-span-3"><input type="file" name="file" className="text-xs" /></Field>
    </>,
    ONBOARDING: <>
      <Field label="Reunião de alinhamento realizada em"><input name="meetingAt" type="date" className="input" defaultValue={d.meetingAt ? toInputDate(d.meetingAt) : ""} /></Field>
      <Field label="Responsáveis (cliente e Forte)" className="sm:col-span-2"><input name="responsibles" className="input" defaultValue={d.responsibles ?? ""} /></Field>
      <Field label="Objetivos do projeto" className="sm:col-span-3"><textarea name="objectives" className="input" rows={2} defaultValue={d.objectives ?? ""} /></Field>
      <Field label="Metas e indicadores" className="sm:col-span-3"><textarea name="kpis" className="input" rows={2} defaultValue={d.kpis ?? ""} placeholder="Ex.: 60 leads/mês, CPL até R$ 15, 8 vendas/mês" /></Field>
      <Field label="Plano de ação" className="sm:col-span-3"><textarea name="plan" className="input" rows={3} defaultValue={d.plan ?? ""} /></Field>
    </>,
    REUNIOES_SEMANAIS: null, RELATORIOS: null,
  }[stepKey];

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div><p className="font-medium">{def.label}</p><p className="text-sm text-muted">{def.description}</p></div>
          <div className="flex items-center gap-2">{late && <Badge tone="red">Atrasada</Badge>}<Badge tone={s?.status === "CONCLUIDO" ? "green" : s?.status === "EM_ANDAMENTO" ? "brand" : "gray"}>{s?.status.replace("_", " ") ?? "PENDENTE"}</Badge>{s?.completedAt && <span className="text-xs text-muted">Concluído em {fmtDateTime(s.completedAt)}</span>}</div>
        </div>
        <ActionForm action={updateJourneyStep.bind(null, c.id, stepKey)} success="Etapa atualizada." className="grid sm:grid-cols-3 gap-4">
          <fieldset disabled={!canEdit} className="contents">
            <Field label="Status"><select name="status" className="input" defaultValue={s?.status ?? "PENDENTE"}><option value="PENDENTE">Pendente</option><option value="EM_ANDAMENTO">Em andamento</option><option value="CONCLUIDO">Concluído</option></select></Field>
            <Field label="Responsável"><select name="ownerId" className="input" defaultValue={s?.ownerId ?? ""}><option value="">—</option>{b.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
            {!def.recurring && <Field label="Prazo"><input name="dueAt" type="date" className="input" defaultValue={toInputDate(s?.dueAt)} /></Field>}
            {specific}
            <Field label="Observações" className="sm:col-span-3"><textarea name="notes" className="input" rows={2} defaultValue={s?.notes ?? ""} /></Field>
          </fieldset>
          {canEdit && <div className="sm:col-span-3 flex justify-end"><SubmitButton>Salvar etapa</SubmitButton></div>}
        </ActionForm>
        {docs.length > 0 && <div className="mt-4 pt-4 border-t border-line"><p className="text-xs font-medium text-muted mb-1">Arquivos</p><ul className="text-sm space-y-1">{docs.map((x) => <li key={x.id}><a href={x.url} target="_blank" className="hover:text-brand underline-offset-2 hover:underline">{x.name}</a> <span className="text-xs text-muted">· {fmtDate(x.createdAt)}</span></li>)}</ul></div>}
      </div>
      {stepKey === "REUNIOES_SEMANAIS" && (<>
        {canEdit && <div className="card p-5"><p className="font-medium mb-1">Criar calendário de reuniões semanais</p><p className="text-sm text-muted mb-3">Gera os compromissos recorrentes na agenda. A etapa fica “em andamento” durante toda a execução do contrato.</p>
          <ActionForm action={generateWeeklyMeetings.bind(null, c.id)} success="Calendário criado." className="grid sm:grid-cols-5 gap-3 items-end">
            <Field label="Dia da semana"><select name="weekday" className="input" defaultValue={d.weekday ?? "2"}>{["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"].map((w, i) => <option key={i} value={i}>{w}</option>)}</select></Field>
            <Field label="Horário"><select name="hour" className="input" defaultValue={d.hour ?? "15"}>{Array.from({ length: 12 }, (_, i) => 8 + i).map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}</select></Field>
            <Field label="Semanas"><input name="weeks" type="number" min={1} max={26} className="input" defaultValue={8} /></Field>
            <Field label="Responsável"><select name="ownerId" className="input" defaultValue={c.ownerId ?? ""}>{b.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
            <SubmitButton>Gerar reuniões</SubmitButton>
          </ActionForm></div>}
        <TabMeetings b={b} embedded />
      </>)}
      {stepKey === "RELATORIOS" && <TabReports b={b} embedded />}
    </div>
  );
}
