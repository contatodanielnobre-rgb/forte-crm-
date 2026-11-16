import { asc, desc } from "drizzle-orm";
import { Bot, Clock, Gauge, MessageCircle, ShieldCheck, Workflow, Send, Play } from "lucide-react";
import { db, t } from "@/db";
import { requirePage } from "@/lib/auth";
import { Badge, Field, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/ui";
import { ActionForm, ActionButton } from "@/components/action-form";
import { getSalesCopSettings, integrationStatus, HEALTH_CRITERIA, ROUTINE_STEPS, MODE_LABEL, MODE_HINT, type AutonomyMode } from "@/lib/salescop/settings";
import { recentWhatsApp } from "@/lib/salescop/whatsapp";
import { fmtDateTime } from "@/lib/format";
import { runRoutineStep, saveAgentSettings, sendTestWhatsApp } from "../actions";

export const dynamic = "force-dynamic";

export default async function AgentSettingsPage() {
  await requirePage("salescop.settings");
  const [s, stages, logs, wa] = await Promise.all([getSalesCopSettings(), db.select().from(t.pipelineStages).orderBy(asc(t.pipelineStages.order)), db.query.aiExecutionLogs.findMany({ orderBy: [desc(t.aiExecutionLogs.createdAt)], limit: 40, with: { actor: { columns: { name: true } } } }), recentWhatsApp(20)]);
  const integ = integrationStatus();
  const Section = ({ id, icon: Icon, title, hint, children }: { id?: string; icon: typeof Bot; title: string; hint?: string; children: React.ReactNode }) => <section id={id} className="card p-5 space-y-3 scroll-mt-24"><div><p className="font-medium flex items-center gap-2"><Icon size={16} className="text-brand" /> {title}</p>{hint && <p className="text-xs text-muted mt-0.5">{hint}</p>}</div>{children}</section>;
  const Check = ({ name, label, defaultChecked }: { name: string; label: string; defaultChecked: boolean }) => <label className="flex items-center gap-2 text-sm"><input type="checkbox" name={name} defaultChecked={defaultChecked} className="accent-brand" /> {label}</label>;

  return (
    <div className="space-y-5">
      <PageHeader title="Configurações do Agente" subtitle="Nível de autonomia, regras de fiscalização, Índice de Saúde, rotina automática, IA e WhatsApp" />
      <ActionForm action={saveAgentSettings} success="Configurações do SALES COP salvas." className="space-y-5">
        <Section icon={ShieldCheck} title="Nível de autonomia" hint="Ações sensíveis (financeiro, exclusões, metas, permissões) nunca são executadas pelo agente, em nenhum modo.">
          <div className="grid md:grid-cols-3 gap-3">{(["OBSERVADOR", "OPERACIONAL", "AUTONOMO"] as AutonomyMode[]).map((m) => <label key={m} className="rounded-xl border border-line p-3 has-[:checked]:border-brand has-[:checked]:bg-brand/5 cursor-pointer"><div className="flex items-center gap-2"><input type="radio" name="mode" value={m} defaultChecked={s.mode === m} className="accent-brand" /><span className="font-medium text-sm">{MODE_LABEL[m]}</span></div><p className="text-xs text-muted mt-1.5">{MODE_HINT[m]}</p></label>)}</div>
        </Section>

        <Section id="regras" icon={Gauge} title="Regras de fiscalização" hint="Parâmetros usados pelo policial de vendas para identificar irregularidades.">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Field label="Regra 1 · Primeiro contato (horas)"><input name="firstContactHours" type="number" min={1} className="input" defaultValue={s.rules.firstContactHours} /></Field>
            <Field label="Regra 2 · Dias sem próxima atividade"><input name="followUpMaxDays" type="number" min={0} className="input" defaultValue={s.rules.followUpMaxDays} /></Field>
            <Field label="Regra 3 · Dias máx. por etapa (padrão)"><input name="stageMaxDays" type="number" min={1} className="input" defaultValue={s.rules.stageMaxDays} /></Field>
            <Field label="Regra 4 · Confirmar reunião (horas antes)"><input name="meetingConfirmHours" type="number" min={1} className="input" defaultValue={s.rules.meetingConfirmHours} /></Field>
            <Field label="Regra 5 · Proposta sem retorno (dias)"><input name="proposalMaxDays" type="number" min={1} className="input" defaultValue={s.rules.proposalMaxDays} /></Field>
            <Field label="Lead sem movimentação (dias)"><input name="stalledLeadDays" type="number" min={1} className="input" defaultValue={s.rules.stalledLeadDays} /></Field>
            <Field label="Vendedor sem atividade (dias)"><input name="sellerInactivityDays" type="number" min={1} className="input" defaultValue={s.rules.sellerInactivityDays} /></Field>
            <Field label="Valor mín. p/ oportunidade em risco (R$)"><input name="riskValueMin" type="number" min={0} className="input" defaultValue={s.rules.riskValueMin} /></Field>
          </div>
          <div>
            <p className="label">Tempo máximo por etapa (dias) — em branco usa o padrão</p>
            <div className="grid sm:grid-cols-3 lg:grid-cols-5 gap-2">{stages.filter((st) => !st.isWon && !st.isLost).map((st) => <div key={st.id} className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: st.color }} /><input name={`stage_days_${st.id}`} type="number" min={1} placeholder={String(s.rules.stageMaxDays)} className="input h-9 text-sm" defaultValue={s.rules.stageMaxDaysByStage[st.id] ?? ""} /><span className="text-xs text-muted truncate">{st.name}</span></div>)}</div>
          </div>
          <div>
            <p className="label">Mapeamento das etapas do pipeline (para reuniões, propostas e negociação)</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2">{([["qualified", "Qualificado"], ["meetingScheduled", "Reunião agendada"], ["meetingDone", "Reunião realizada"], ["proposal", "Proposta enviada"], ["negotiation", "Em negociação"]] as const).map(([k, label]) => <Field key={k} label={label}><select name={`stage_${k}`} className="input h-9 text-sm" defaultValue={s.stageMap[k] ?? ""}><option value="">—</option>{stages.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}</select></Field>)}</div>
          </div>
        </Section>

        <Section icon={Gauge} title="Índice de Saúde Comercial" hint="Pesos de cada critério (a pontuação é a média ponderada, 0–100) e limites dos estados.">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">{HEALTH_CRITERIA.map((c) => <Field key={c.key} label={`${c.label} · peso`} hint={c.description}><input name={`w_${c.key}`} type="number" min={0} max={100} className="input" defaultValue={s.health.weights[c.key]} /></Field>)}</div>
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Verde a partir de"><input name="greenFrom" type="number" min={0} max={100} className="input" defaultValue={s.health.greenFrom} /></Field>
            <Field label="Amarelo a partir de"><input name="yellowFrom" type="number" min={0} max={100} className="input" defaultValue={s.health.yellowFrom} /></Field>
            <Field label="Meta de conversão (%)"><input name="conversionGoalPct" type="number" min={1} max={100} className="input" defaultValue={s.health.conversionGoalPct} /></Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Meta diária de contatos por vendedor"><input name="dailyContacts" type="number" min={1} className="input" defaultValue={s.goals.dailyContacts} /></Field>
            <Field label="Meta diária de follow-ups por vendedor"><input name="dailyFollowUps" type="number" min={0} className="input" defaultValue={s.goals.dailyFollowUps} /></Field>
          </div>
        </Section>

        <Section icon={Clock} title="Rotina automática" hint={`Executada por Vercel Cron (vercel.json) ou n8n chamando /api/salescop/routine com o CRON_SECRET. ${integ.cron ? "CRON_SECRET configurado." : "CRON_SECRET ainda não configurado — a rotina só roda manualmente."}`}>
          <div className="flex flex-wrap gap-4"><Check name="routineEnabled" label="Rotina ativa" defaultChecked={s.routine.enabled} /><Check name="weekdaysOnly" label="Somente dias úteis" defaultChecked={s.routine.weekdaysOnly} /></div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">{ROUTINE_STEPS.map((st) => <div key={st.key} className="rounded-xl border border-line p-3"><div className="flex items-center justify-between gap-2"><Check name={`step_${st.key}`} label={st.label} defaultChecked={s.routine.steps[st.key].enabled} /><input name={`time_${st.key}`} type="time" className="input h-8 w-24 text-xs" defaultValue={s.routine.steps[st.key].time} /></div><p className="text-[11px] text-muted mt-1.5">{st.description}</p></div>)}</div>
        </Section>

        <Section icon={Bot} title="Inteligência artificial" hint={integ.openai ? "OPENAI_API_KEY configurada no servidor. Chamadas ocorrem apenas no backend." : "OPENAI_API_KEY não configurada: o agente opera somente com as regras (sem narrativa e sem chat inteligente)."}>
          <div className="grid sm:grid-cols-4 gap-3">
            <div className="flex items-end pb-2"><Check name="aiEnabled" label="IA ativa" defaultChecked={s.ai.enabled} /></div>
            <Field label="Modelo"><input name="aiModel" className="input" defaultValue={s.ai.model} /></Field>
            <Field label="Limite de chamadas/dia"><input name="maxDailyCalls" type="number" min={1} className="input" defaultValue={s.ai.maxDailyCalls} /></Field>
            <Field label="Temperatura (0–1)"><input name="temperature" type="number" step="0.1" min={0} max={1} className="input" defaultValue={s.ai.temperature} /></Field>
          </div>
        </Section>

        <Section icon={MessageCircle} title="WhatsApp Business Cloud API" hint={integ.whatsapp ? `Credenciais configuradas (WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID). Webhook: /api/salescop/whatsapp${integ.whatsappVerify ? "" : " — defina WHATSAPP_VERIFY_TOKEN para validar o webhook na Meta"}.` : "Credenciais ausentes: defina WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID e WHATSAPP_VERIFY_TOKEN no servidor. Nada é simulado sem credenciais."}>
          <div className="flex flex-wrap gap-4"><Check name="waEnabled" label="Integração ativa" defaultChecked={s.whatsapp.enabled} /><Check name="waNotifyAdmins" label="Enviar planos, alertas e relatórios ao administrador" defaultChecked={s.whatsapp.notifyAdmins} /><Check name="waNotifySellers" label="Cobrar vendedores e enviar o plano individual" defaultChecked={s.whatsapp.notifySellers} /></div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Telefones dos administradores (separados por vírgula)" hint="Em branco usa o telefone cadastrado dos usuários ADMIN. Vendedores recebem no telefone do próprio perfil."><input name="adminPhones" className="input" defaultValue={s.whatsapp.adminPhones} placeholder="5584999990000, 5584988880000" /></Field>
            <Field label="Horário do envio do plano diário"><input name="dailyPlanTime" type="time" className="input" defaultValue={s.whatsapp.dailyPlanTime} /></Field>
          </div>
          <p className="text-[11px] text-muted">Fora da janela de 24h desde a última mensagem do usuário, a Meta exige template aprovado: defina WHATSAPP_TEMPLATE_DAILY com o nome do template (1 parâmetro de texto). Respeite consentimento e políticas do WhatsApp.</p>
        </Section>

        <div className="flex justify-end"><SubmitButton className="btn-primary" pendingText="Salvando…">Salvar configurações</SubmitButton></div>
      </ActionForm>

      <section className="card p-5 space-y-3">
        <p className="font-medium flex items-center gap-2"><Workflow size={16} className="text-brand" /> Executar agora</p>
        <div className="flex flex-wrap gap-2">
          <ActionButton action={runRoutineStep} className="btn-primary btn-sm" success="Rotina executada."><Play size={14} /> Rodar passos pendentes de hoje</ActionButton>
          {ROUTINE_STEPS.map((st) => <ActionButton key={st.key} action={runRoutineStep.bind(null, st.key)} className="btn-secondary btn-sm" success={`${st.label} executado.`}>{st.label}</ActionButton>)}
          <ActionButton action={sendTestWhatsApp} className="btn-secondary btn-sm" success="Mensagem de teste enviada."><Send size={14} /> Testar WhatsApp (meu número)</ActionButton>
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="card overflow-hidden"><div className="p-4 border-b border-line"><p className="font-medium">Log de execução do agente</p><p className="text-xs text-muted">Rotinas, chamadas de IA, ações e mensagens — auditoria própria do SALES COP.</p></div>
          <div className="max-h-[420px] overflow-y-auto"><table className="table"><thead><tr><th>Quando</th><th>Tipo</th><th>Ação</th><th>Resumo</th></tr></thead><tbody>{logs.map((l) => <tr key={l.id}><td className="whitespace-nowrap text-xs">{fmtDateTime(l.createdAt)}</td><td><Badge tone={l.status === "OK" ? "green" : l.status === "ERRO" ? "red" : "amber"}>{l.kind}</Badge></td><td className="text-xs font-mono">{l.action}</td><td className="text-xs">{l.summary}{l.tokensIn ? <span className="text-muted"> · {l.tokensIn}/{l.tokensOut} tokens</span> : ""}{l.actor ? <span className="text-muted"> · {l.actor.name.split(" ")[0]}</span> : ""}</td></tr>)}{logs.length === 0 && <tr><td colSpan={4} className="text-sm text-muted">Nenhuma execução registrada.</td></tr>}</tbody></table></div>
        </section>
        <section className="card overflow-hidden"><div className="p-4 border-b border-line"><p className="font-medium">Mensagens de WhatsApp</p><p className="text-xs text-muted">Últimas interações registradas.</p></div>
          <div className="max-h-[420px] overflow-y-auto"><table className="table"><thead><tr><th>Quando</th><th>Direção</th><th>Usuário</th><th>Mensagem</th><th>Status</th></tr></thead><tbody>{wa.map((m) => <tr key={m.id}><td className="whitespace-nowrap text-xs">{fmtDateTime(m.createdAt)}</td><td><Badge tone={m.direction === "IN" ? "blue" : "brand"}>{m.direction === "IN" ? "Recebida" : "Enviada"}</Badge></td><td className="text-xs">{m.user?.name ?? m.waId}</td><td className="text-xs max-w-[260px] truncate" title={m.body ?? ""}>{m.body}</td><td><Badge tone={m.status === "FALHA" ? "red" : m.status === "PENDENTE" ? "amber" : "green"}>{m.status}</Badge>{m.error && <p className="text-[10px] text-red-500">{m.error}</p>}</td></tr>)}{wa.length === 0 && <tr><td colSpan={5} className="text-sm text-muted">Nenhuma mensagem.</td></tr>}</tbody></table></div>
        </section>
      </div>
    </div>
  );
}
