import bcrypt from "bcryptjs";
import { addDays, subDays, setHours as _setHours, startOfMonth, setMinutes } from "date-fns";
const setHours = (d: Date, h: number) => setMinutes(_setHours(d, h), 0);
import { eq, inArray, asc } from "drizzle-orm";
import { db, t } from "@/db";
import { ensureDefaults } from "./bootstrap";
import { moveLeadToStage } from "./services/leads";
import { setAppointmentStatus } from "./services/appointments";
import { generateInstallments } from "./services/finance";
import { setStepStatus } from "./services/journey";

/**
 * DADOS DE DEMONSTRAÇÃO — todos os registros criados aqui são marcados com isDemo = true
 * (usuários, leads, clientes e compromissos) e podem ser removidos em Configurações → Dados de demonstração.
 * Senha de todos os usuários demo: demo1234
 */
export const DEMO_PASSWORD = "demo1234";

const DEMO_USERS = [
  { name: "Marina Alves", email: "marina.demo@fortecompany.com.br", role: "GESTOR" as const, goal: 60000 },
  { name: "Rafael Costa", email: "rafael.demo@fortecompany.com.br", role: "COMERCIAL" as const, goal: 40000 },
  { name: "Juliana Prado", email: "juliana.demo@fortecompany.com.br", role: "COMERCIAL" as const, goal: 40000 },
  { name: "Thiago Mendes", email: "thiago.demo@fortecompany.com.br", role: "COMERCIAL" as const, goal: 35000 },
  { name: "Camila Rocha", email: "camila.demo@fortecompany.com.br", role: "OPERACIONAL" as const, goal: 0 },
];

const SEGMENTS = ["Academia", "Clínica de estética", "Restaurante", "Imobiliária", "Escola de idiomas", "Loja de roupas", "Clínica odontológica", "Pet shop", "Studio de pilates", "Barbearia"];
const FIRST = ["Ana", "Bruno", "Carla", "Diego", "Eduarda", "Felipe", "Gabriela", "Henrique", "Isabela", "João", "Larissa", "Marcos", "Natália", "Otávio", "Patrícia", "Ricardo", "Sofia", "Tiago", "Vanessa", "Wagner", "Yasmin", "Lucas", "Beatriz", "Caio", "Fernanda", "Gustavo"];
const LAST = ["Silva", "Souza", "Oliveira", "Lima", "Pereira", "Ferreira", "Almeida", "Nascimento", "Araújo", "Barbosa", "Cardoso", "Dias", "Freitas", "Gomes", "Martins", "Ribeiro"];
const COMPANY = ["Fit Center", "Bella Vita", "Sabor da Serra", "Mar Azul Imóveis", "Speak Up", "Urban Style", "Sorriso Perfeito", "Patas & Cia", "Corpo em Movimento", "Barba Nobre", "Vida Leve", "Potiguar Fitness", "Casa do Pão", "Nova Era", "Vitta Clinic"];

const rnd = (n: number) => Math.floor(Math.random() * n);
const pick = <T,>(arr: T[]) => arr[rnd(arr.length)];
const seeded = (seed: number) => { let s = seed; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; };

export async function loadDemoData(actorId: string) {
  await ensureDefaults(true);
  const r = seeded(42);
  const R = (n: number) => Math.floor(r() * n);
  const P = <T,>(arr: T[]) => arr[R(arr.length)];
  void rnd; void pick;

  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const users: { id: string; role: string }[] = [];
  for (const u of DEMO_USERS) {
    const existing = await db.query.users.findFirst({ where: eq(t.users.email, u.email) });
    if (existing) { users.push(existing); continue; }
    const [row] = await db.insert(t.users).values({ name: u.name, email: u.email, passwordHash: hash, role: u.role, monthlyGoal: u.goal.toFixed(2), isDemo: true }).returning();
    users.push(row);
  }
  const sellers = users.filter((u) => u.role === "COMERCIAL" || u.role === "GESTOR");
  const stages = await db.select().from(t.pipelineStages).orderBy(asc(t.pipelineStages.order));
  const sources = await db.select().from(t.leadSources);
  const lossReasons = await db.select().from(t.lossReasons);
  const types = await db.select().from(t.appointmentTypes);
  const commercialType = types.find((x) => x.isCommercial)!;
  const weeklyType = types.find((x) => x.name.includes("semanal"))!;
  const onboardingType = types.find((x) => x.name.includes("onboarding"))!;
  const won = stages.find((s) => s.isWon)!; const lost = stages.find((s) => s.isLost)!;
  const open = stages.filter((s) => !s.isWon && !s.isLost);
  const now = new Date();

  // ── Leads (últimos 90 dias) ──
  const leadRows: { id: string; ownerId: string | null; enteredAt: Date; target: "won" | "lost" | "open"; value: number; name: string }[] = [];
  for (let i = 0; i < 48; i++) {
    const owner = P(sellers); const enteredAt = subDays(now, R(90)); const value = [1500, 2500, 3500, 4800, 6000, 8000, 12000][R(7)];
    const roll = r(); const target = roll < 0.3 ? "won" : roll < 0.5 ? "lost" : "open";
    const name = `${P(FIRST)} ${P(LAST)}`;
    const [lead] = await db.insert(t.leads).values({
      name, company: P(COMPANY), phone: `(84) 9${8000 + R(1999)}-${1000 + R(8999)}`, email: `${name.toLowerCase().replace(/\s/g, ".")}@exemplo.com`,
      segment: P(SEGMENTS), value: value.toFixed(2), sourceId: P(sources).id, ownerId: owner.id, stageId: target === "open" ? P(open).id : open[Math.min(open.length - 1, 2 + R(4))].id,
      enteredAt, lastContactAt: subDays(now, R(8)), nextActivityAt: target === "open" ? addDays(now, R(7) - 2) : null, isDemo: true,
      notes: "Registro de demonstração.",
    }).returning();
    leadRows.push({ id: lead.id, ownerId: owner.id, enteredAt, target, value, name });
  }
  // interações e reuniões comerciais
  for (const l of leadRows) {
    await db.insert(t.interactions).values([
      { leadId: l.id, userId: actorId, type: "sistema", content: "Lead cadastrado (demo)." },
      { leadId: l.id, userId: l.ownerId, type: "whatsapp", content: "Primeiro contato realizado pelo WhatsApp. Cliente demonstrou interesse." },
    ]);
    if (r() < 0.6) {
      const startAt = setHours(addDays(l.enteredAt, 2 + R(5)), 10 + R(7));
      const [ap] = await db.insert(t.appointments).values({ title: `Reunião comercial — ${l.name}`, startAt, durationMin: 45, typeId: commercialType.id, ownerId: l.ownerId, leadId: l.id, isDemo: true, link: "https://meet.google.com/demo" }).returning();
      if (startAt < now) await setAppointmentStatus(ap.id, r() < 0.85 ? "REALIZADO" : "NAO_COMPARECEU", actorId);
    }
  }
  // fechamentos e perdas (com datas distribuídas)
  for (const l of leadRows) {
    if (l.target === "won") {
      await moveLeadToStage(l.id, won.id, actorId);
      const wonAt = addDays(l.enteredAt, 5 + R(20)); const safeWon = wonAt > now ? subDays(now, R(5)) : wonAt;
      await db.update(t.leads).set({ wonAt: safeWon }).where(eq(t.leads.id, l.id));
      await db.update(t.pointEntries).set({ earnedAt: safeWon }).where((await import("drizzle-orm")).and(eq(t.pointEntries.referenceId, l.id), eq(t.pointEntries.ruleKey, "VENDA_FECHADA")));
      const client = await db.query.clients.findFirst({ where: eq(t.clients.leadId, l.id) });
      if (client) {
        await db.update(t.clients).set({ closedAt: safeWon, service: P(["Gestão de tráfego", "Social media", "Consultoria comercial", "Tráfego + Social"]), cnpj: `${10 + R(89)}.${100 + R(899)}.${100 + R(899)}/0001-${10 + R(89)}`, address: "Natal/RN", status: r() < 0.6 ? "ATIVO" : "ONBOARDING" }).where(eq(t.clients.id, client.id));
        const inst = [1, 3, 6, 12][R(4)]; const down = r() < 0.5 ? Math.round(l.value * 0.3) : 0;
        await db.update(t.contracts).set({ totalValue: l.value.toFixed(2), downPayment: down.toFixed(2), installments: inst, paymentMethod: P(["Pix", "Boleto", "Cartão de crédito"]), firstDueDate: addDays(safeWon, 3), status: r() < 0.75 ? "ASSINADO" : "ENVIADO", sentAt: addDays(safeWon, 1), signedAt: r() < 0.75 ? addDays(safeWon, 2) : null, startDate: safeWon, endDate: addDays(safeWon, 30 * inst) }).where(eq(t.contracts.clientId, client.id));
        await generateInstallments(client.id);
        // pagamentos: parcelas vencidas pagas em ~70% dos casos
        const insts = await db.select().from(t.installments).where(eq(t.installments.clientId, client.id));
        for (const i of insts) if (i.dueDate < now && r() < 0.7) await db.insert(t.payments).values({ clientId: client.id, installmentId: i.id, amount: i.amount, paidAt: addDays(i.dueDate, R(3) - 1), method: "Pix", userId: actorId });
        await (await import("./services/finance")).recalcInstallmentStatuses(client.id);
        // jornada
        const daysSince = Math.max(0, Math.round((+now - +safeWon) / 864e5));
        await setStepStatus(client.id, "GRUPO_CRIADO", "CONCLUIDO", { data: { participants: `${l.name}, ${DEMO_USERS[0].name}, Camila Rocha`, createdOn: safeWon.toISOString() } });
        if (daysSince > 3) await setStepStatus(client.id, "CONTRATO", "CONCLUIDO");
        if (daysSince > 8) await setStepStatus(client.id, "FORMULARIO", r() < 0.8 ? "CONCLUIDO" : "EM_ANDAMENTO");
        if (daysSince > 12) {
          const [ob] = await db.insert(t.appointments).values({ title: `Onboarding — ${client.name}`, startAt: setHours(addDays(safeWon, 10), 14), durationMin: 60, typeId: onboardingType.id, ownerId: users.find((u) => u.role === "OPERACIONAL")?.id, clientId: client.id, isDemo: true }).returning();
          await setAppointmentStatus(ob.id, "REALIZADO", actorId);
          await setStepStatus(client.id, "ONBOARDING", "CONCLUIDO", { data: { objectives: "Aumentar leads qualificados em 40% em 90 dias", kpis: "CPL, taxa de agendamento, vendas", plan: "Campanhas Meta Ads + conteúdo semanal + CRM" } });
          // reuniões semanais (passadas e futuras)
          for (let w = 2; w < 10; w++) {
            const startAt = setHours(addDays(safeWon, 7 * w), 15);
            if (startAt > addDays(now, 21)) break;
            const [wk] = await db.insert(t.appointments).values({ title: `Reunião semanal — ${client.name}`, startAt, durationMin: 45, typeId: weeklyType.id, ownerId: users.find((u) => u.role === "OPERACIONAL")?.id, clientId: client.id, isDemo: true, link: "https://meet.google.com/demo" }).returning();
            if (startAt < now) await setAppointmentStatus(wk.id, "REALIZADO", actorId);
          }
          // relatórios mensais
          let m = 1;
          while (addDays(safeWon, 30 * m) < addDays(now, 10) && m <= 6) {
            const due = addDays(safeWon, 30 * m); const delivered = due < now && r() < 0.75;
            await db.insert(t.reports).values({ clientId: client.id, title: `Relatório mensal ${m}`, periodLabel: `Mês ${m}`, dueAt: due, status: delivered ? "ENTREGUE" : "PENDENTE", deliveredAt: delivered ? due : null, indicators: delivered ? { "Leads": String(40 + R(80)), "CPL": `R$ ${(8 + R(20)).toFixed(2)}`, "Vendas": String(3 + R(12)) } : null });
            m++;
          }
          if (m > 1) await setStepStatus(client.id, "RELATORIOS", "EM_ANDAMENTO");
          await db.insert(t.tasks).values([
            { title: "Aprovar criativos da campanha", clientId: client.id, assigneeId: users.find((u) => u.role === "OPERACIONAL")?.id, dueAt: addDays(now, R(6) - 3), status: r() < 0.5 ? "PENDENTE" : "CONCLUIDA" },
            { title: "Enviar acessos do gerenciador de anúncios", clientId: client.id, assigneeId: client.ownerId, dueAt: addDays(now, R(6) - 3), status: "PENDENTE" },
          ]);
        }
      }
    } else if (l.target === "lost") {
      await moveLeadToStage(l.id, lost.id, actorId, { lossReasonId: P(lossReasons).id });
      await db.update(t.leads).set({ lostAt: addDays(l.enteredAt, 3 + R(15)) }).where(eq(t.leads.id, l.id));
    }
  }
  // Pontos do mês para dar vida ao ranking + premiação do mês anterior
  const [award] = await db.insert(t.awards).values({ name: "Vendedor do mês", kind: "vendedor_mes", icon: "trophy", value: "Bônus R$ 500", description: "Maior pontuação do mês" }).returning();
  const prev = startOfMonth(subDays(startOfMonth(now), 1));
  await db.insert(t.awardGrants).values({ awardId: award.id, userId: sellers[1].id, period: `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`, notes: "Premiação de demonstração" });
  await db.insert(t.notifications).values({ userId: actorId, title: "Dados de demonstração carregados", body: "Usuários demo usam a senha demo1234. Remova tudo em Configurações quando quiser.", href: "/configuracoes", kind: "info" });
}

/** Remove TODOS os registros de demonstração (e o que foi gerado a partir deles). */
export async function clearDemoData() {
  const demoUsers = await db.select({ id: t.users.id }).from(t.users).where(eq(t.users.isDemo, true));
  const demoClients = await db.select({ id: t.clients.id }).from(t.clients).where(eq(t.clients.isDemo, true));
  const demoLeads = await db.select({ id: t.leads.id }).from(t.leads).where(eq(t.leads.isDemo, true));
  if (demoClients.length) await db.delete(t.clients).where(inArray(t.clients.id, demoClients.map((c) => c.id)));
  if (demoLeads.length) await db.delete(t.leads).where(inArray(t.leads.id, demoLeads.map((c) => c.id)));
  await db.delete(t.appointments).where(eq(t.appointments.isDemo, true));
  if (demoUsers.length) {
    const ids = demoUsers.map((u) => u.id);
    await db.delete(t.pointEntries).where(inArray(t.pointEntries.userId, ids));
    await db.delete(t.awardGrants).where(inArray(t.awardGrants.userId, ids));
    await db.delete(t.users).where(inArray(t.users.id, ids));
  }
  await db.delete(t.awardGrants).where(eq(t.awardGrants.notes, "Premiação de demonstração"));
  return { users: demoUsers.length, clients: demoClients.length, leads: demoLeads.length };
}

export async function demoStats() {
  const [u, l, c] = await Promise.all([
    db.select({ id: t.users.id }).from(t.users).where(eq(t.users.isDemo, true)),
    db.select({ id: t.leads.id }).from(t.leads).where(eq(t.leads.isDemo, true)),
    db.select({ id: t.clients.id }).from(t.clients).where(eq(t.clients.isDemo, true)),
  ]);
  return { users: u.length, leads: l.length, clients: c.length, hasDemo: u.length + l.length + c.length > 0 };
}
