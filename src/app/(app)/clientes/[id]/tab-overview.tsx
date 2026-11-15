import Link from "next/link";
import { Kpi, Badge } from "@/components/ui";
import { Wallet, CalendarCheck, ListTodo, FileBarChart, AlertTriangle } from "lucide-react";
import { brl, fmtDate, fmtDateTime } from "@/lib/format";
import { isStepLate, JOURNEY_STEPS } from "@/lib/services/journey";
import type { ClientBundle } from "./data";

export function TabOverview({ b }: { b: ClientBundle }) {
  const { client: c, finance } = b;
  const now = new Date();
  const nextAppt = [...c.appointments].filter((a) => a.status === "AGENDADO" && a.startAt >= now).sort((x, y) => +x.startAt - +y.startAt)[0];
  const openTasks = c.tasks.filter((t) => t.status !== "CONCLUIDA");
  const lateTasks = openTasks.filter((t) => t.dueAt && t.dueAt < now);
  const pendingReports = c.reports.filter((r) => r.status === "PENDENTE");
  const lateSteps = c.journeySteps.filter((s) => isStepLate(s));
  const alerts: { tone: "red" | "amber"; text: string; href: string }[] = [];
  lateSteps.forEach((s) => alerts.push({ tone: "red", text: `Etapa "${JOURNEY_STEPS.find((d) => d.key === s.key)?.label}" atrasada desde ${fmtDate(s.dueAt)}`, href: `?aba=jornada&etapa=${s.key}` }));
  if (finance.overdue > 0) alerts.push({ tone: "red", text: `${brl(finance.overdue)} em parcelas atrasadas`, href: "?aba=financeiro" });
  lateTasks.forEach((t) => alerts.push({ tone: "amber", text: `Tarefa atrasada: ${t.title}`, href: "?aba=tarefas" }));
  pendingReports.filter((r) => r.dueAt && r.dueAt < now).forEach((r) => alerts.push({ tone: "amber", text: `Relatório pendente: ${r.title}`, href: "?aba=relatorios" }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Contrato" value={brl(finance.contracted)} hint={`${brl(finance.received)} recebido · ${brl(finance.pending)} a receber`} icon={Wallet} tone={finance.overdue > 0 ? "red" : "green"} />
        <Kpi label="Próxima reunião" value={nextAppt ? fmtDateTime(nextAppt.startAt) : "—"} hint={nextAppt?.title ?? "Nenhuma agendada"} icon={CalendarCheck} tone="blue" />
        <Kpi label="Tarefas abertas" value={openTasks.length} hint={lateTasks.length ? `${lateTasks.length} atrasadas` : "Nenhuma atrasada"} icon={ListTodo} tone={lateTasks.length ? "amber" : "gray"} />
        <Kpi label="Relatórios pendentes" value={pendingReports.length} hint={`${c.reports.length - pendingReports.length} entregues`} icon={FileBarChart} tone={pendingReports.length ? "amber" : "gray"} />
      </div>
      {alerts.length > 0 && (
        <div className="card p-4"><p className="text-sm font-medium flex items-center gap-2 mb-2"><AlertTriangle size={16} className="text-amber-500" /> Pendências e alertas</p>
          <ul className="space-y-1.5">{alerts.map((a, i) => <li key={i}><Link href={a.href} className="text-sm flex items-center gap-2 hover:text-brand"><span className={a.tone === "red" ? "w-1.5 h-1.5 rounded-full bg-red-500" : "w-1.5 h-1.5 rounded-full bg-amber-500"} />{a.text}</Link></li>)}</ul>
        </div>
      )}
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="card p-4">
          <p className="text-sm font-medium mb-3">Informações cadastrais</p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            {[["Empresa", c.company], ["CNPJ", c.cnpj], ["Telefone", c.phone], ["WhatsApp", c.whatsapp], ["E-mail", c.email], ["Segmento", c.segment], ["Endereço", c.address], ["Serviço contratado", c.service], ["Responsável interno", c.owner?.name], ["Data de fechamento", fmtDate(c.closedAt)], ["Valor do contrato", brl(c.contractValue)], ["Origem", c.lead?.source?.name]].map(([k, v]) => <div key={k as string}><dt className="text-xs text-muted">{k}</dt><dd className="font-medium break-words">{v || "—"}</dd></div>)}
          </dl>
          {c.notes && <p className="text-sm mt-3 pt-3 border-t border-line whitespace-pre-wrap text-muted">{c.notes}</p>}
        </div>
        <div className="card p-4">
          <p className="text-sm font-medium mb-3">Linha do tempo</p>
          <ol className="relative border-l border-line ml-1.5 space-y-3 max-h-[420px] overflow-y-auto pr-1">
            {c.interactions.slice(0, 30).map((i) => (
              <li key={i.id} className="ml-4"><span className="absolute -left-[5px] w-2.5 h-2.5 rounded-full bg-brand/70 mt-1.5" /><p className="text-xs text-muted">{fmtDateTime(i.createdAt)}{i.user ? ` · ${i.user.name}` : ""} <Badge className="ml-1">{i.type}</Badge></p><p className="text-sm">{i.content}</p></li>
            ))}
            {c.interactions.length === 0 && <li className="ml-4 text-sm text-muted">Nenhuma movimentação ainda.</li>}
          </ol>
        </div>
      </div>
    </div>
  );
}
