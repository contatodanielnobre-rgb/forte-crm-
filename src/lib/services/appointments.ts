import { eq } from "drizzle-orm";
import { db, t } from "@/db";
import { awardPoints, revokePoints } from "./ranking";
import { audit } from "@/lib/audit";

/** Atualiza status de compromisso aplicando pontuação de reunião comercial realizada. */
export async function setAppointmentStatus(id: string, status: "AGENDADO" | "REALIZADO" | "CANCELADO" | "NAO_COMPARECEU", actorId: string) {
  const ap = await db.query.appointments.findFirst({ where: eq(t.appointments.id, id), with: { type: true } });
  if (!ap) throw new Error("Compromisso não encontrado.");
  await db.update(t.appointments).set({ status }).where(eq(t.appointments.id, id));
  if (ap.type?.isCommercial) {
    if (status === "REALIZADO") await awardPoints(ap.ownerId, "REUNIAO_COMERCIAL", id, `Reunião comercial realizada: ${ap.title}`, ap.startAt);
    else await revokePoints(ap.ownerId, "REUNIAO_COMERCIAL", id);
  }
  if (status === "REALIZADO") {
    // garante registro de reunião (ata) para preenchimento
    const m = await db.query.meetings.findFirst({ where: eq(t.meetings.appointmentId, id) });
    if (!m) await db.insert(t.meetings).values({ appointmentId: id, clientId: ap.clientId });
    if (ap.clientId) {
      // marca a etapa "Reuniões semanais" como em andamento quando houver reunião realizada do cliente
      await db.update(t.journeySteps).set({ status: "EM_ANDAMENTO" }).where((await import("drizzle-orm")).and(eq(t.journeySteps.clientId, ap.clientId), eq(t.journeySteps.key, "REUNIOES_SEMANAIS"), eq(t.journeySteps.status, "PENDENTE")));
    }
    if (ap.leadId) await db.update(t.leads).set({ lastContactAt: new Date() }).where(eq(t.leads.id, ap.leadId));
  }
  await audit(actorId, "update", "appointment", id, `${ap.title}: status ${status}`);
}
