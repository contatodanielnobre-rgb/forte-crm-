import { Badge, Empty } from "@/components/ui";
import { Video } from "lucide-react";
import { fmtDateTime } from "@/lib/format";
import { MeetingRow } from "@/components/meeting-row";
import type { ClientBundle } from "./data";

export function TabMeetings({ b, embedded }: { b: ClientBundle; embedded?: boolean }) {
  const { client: c } = b;
  const now = new Date();
  const upcoming = c.appointments.filter((a) => a.status === "AGENDADO" && a.startAt >= now).sort((x, y) => +x.startAt - +y.startAt);
  const past = c.appointments.filter((a) => !(a.status === "AGENDADO" && a.startAt >= now));
  const done = c.appointments.filter((a) => a.status === "REALIZADO").length;
  return (
    <div className="space-y-5">
      {!embedded && <div className="flex flex-wrap gap-2 text-sm"><Badge tone="blue">{upcoming.length} agendadas</Badge><Badge tone="green">{done} realizadas</Badge><Badge tone="red">{c.appointments.filter((a) => a.status === "NAO_COMPARECEU").length} não compareceu</Badge></div>}
      <div className="card"><p className="p-4 border-b border-line font-medium">Próximas reuniões</p>
        {upcoming.length === 0 ? <Empty icon={Video} title="Nenhuma reunião agendada" hint="Use “Agendar” no topo da ficha ou gere o calendário semanal na jornada." /> : <ul className="divide-y divide-line">{upcoming.map((a) => <MeetingRow key={a.id} a={a} users={b.users} />)}</ul>}
      </div>
      <div className="card"><p className="p-4 border-b border-line font-medium">Histórico</p>
        {past.length === 0 ? <p className="p-6 text-sm text-muted text-center">Nenhuma reunião anterior.</p> : <ul className="divide-y divide-line">{past.slice(0, 40).map((a) => <MeetingRow key={a.id} a={a} users={b.users} />)}</ul>}
      </div>
      <p className="text-xs text-muted">Última reunião realizada: {fmtDateTime(c.appointments.filter((a) => a.status === "REALIZADO").sort((x, y) => +y.startAt - +x.startAt)[0]?.startAt)}</p>
    </div>
  );
}
