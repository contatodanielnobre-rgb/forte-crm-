import { eq, and, inArray } from "drizzle-orm";
import { db, t } from "@/db";
import { createJourneyForClient } from "./journey";
import { generateInstallments } from "./finance";
import { awardPoints, revokePoints, checkGoalBonuses } from "./ranking";
import { notify, notifyManagers } from "@/lib/notify";
import { audit } from "@/lib/audit";
import { num } from "@/lib/format";

/** Move o lead de etapa aplicando as automações (venda fechada → cliente, jornada, contrato, ranking). */
export async function moveLeadToStage(leadId: string, stageId: string, actorId: string, extra: { lossReasonId?: string | null; note?: string | null } = {}) {
  const lead = await db.query.leads.findFirst({ where: eq(t.leads.id, leadId), with: { stage: true } });
  const stage = await db.query.pipelineStages.findFirst({ where: eq(t.pipelineStages.id, stageId) });
  if (!lead || !stage) throw new Error("Lead ou etapa não encontrados.");
  if (lead.stageId === stageId) return { converted: false };

  const patch: Partial<typeof t.leads.$inferInsert> = { stageId, lastContactAt: new Date() };
  if (stage.isWon) { patch.wonAt = new Date(); patch.lostAt = null; patch.lossReasonId = null; }
  else if (stage.isLost) { patch.lostAt = new Date(); patch.wonAt = null; patch.lossReasonId = extra.lossReasonId ?? null; }
  else { patch.wonAt = null; patch.lostAt = null; patch.lossReasonId = null; }
  await db.update(t.leads).set(patch).where(eq(t.leads.id, leadId));
  await db.insert(t.interactions).values({ leadId, userId: actorId, type: "sistema", content: `Etapa alterada: ${lead.stage.name} → ${stage.name}${extra.note ? ` — ${extra.note}` : ""}` });
  await audit(actorId, "move", "lead", leadId, `${lead.name}: ${lead.stage.name} → ${stage.name}`);

  let converted = false;
  if (stage.isWon) {
    converted = await convertLeadToClient(leadId, actorId);
    await awardPoints(lead.ownerId, "VENDA_FECHADA", leadId, `Venda fechada: ${lead.name}`);
    await checkGoalBonuses(lead.ownerId);
    await notifyManagers("Venda fechada 🎉", `${lead.name}${lead.company ? ` (${lead.company})` : ""} — ${num(lead.value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`, `/pipeline`, "success");
  } else if (lead.stage.isWon) {
    // saiu de "Venda Fechada": remove pontos da venda
    await revokePoints(lead.ownerId, "VENDA_FECHADA", leadId);
  }
  if (stage.isLost) await notify([lead.ownerId], "Lead marcado como perdido", lead.name, `/pipeline`, "warning");
  return { converted };
}

/** Converte o lead em cliente (idempotente), cria jornada e contrato inicial. */
export async function convertLeadToClient(leadId: string, actorId: string) {
  const lead = await db.query.leads.findFirst({ where: eq(t.leads.id, leadId) });
  if (!lead) throw new Error("Lead não encontrado.");
  const existing = await db.query.clients.findFirst({ where: eq(t.clients.leadId, leadId) });
  if (existing) return false;
  const [client] = await db.insert(t.clients).values({
    name: lead.name, company: lead.company, phone: lead.phone, whatsapp: lead.phone, email: lead.email, segment: lead.segment,
    contractValue: lead.value, ownerId: lead.ownerId, leadId: lead.id, isDemo: lead.isDemo, closedAt: lead.wonAt ?? new Date(), status: "ONBOARDING",
  }).returning();
  await db.insert(t.contracts).values({ clientId: client.id, totalValue: lead.value, installments: 1, firstDueDate: new Date(), status: "PENDENTE" });
  await generateInstallments(client.id);
  await createJourneyForClient(client.id, lead.ownerId, client.closedAt);
  await db.insert(t.interactions).values({ clientId: client.id, userId: actorId, type: "sistema", content: "Cliente criado automaticamente a partir da venda fechada no pipeline." });
  await audit(actorId, "create", "client", client.id, `Cliente ${client.name} criado a partir do lead`);
  await notify([lead.ownerId], "Novo cliente criado", `${client.name} entrou em onboarding. Jornada de entrega gerada.`, `/clientes/${client.id}`, "success");
  return true;
}

export async function stageByFlag(flag: "isWon" | "isLost" | "isDefault") {
  return db.query.pipelineStages.findFirst({ where: eq(t.pipelineStages[flag], true) });
}

export async function leadsVisibleWhere(userId: string, viewAll: boolean) {
  return viewAll ? and(eq(t.leads.archived, false)) : and(eq(t.leads.archived, false), eq(t.leads.ownerId, userId));
}
export { inArray };
