"use server";
import { z } from "zod";
import { and, asc, eq, ne, count } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, t } from "@/db";
import { requirePermission, requireUser, hashPassword, verifyPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { saveFile } from "@/lib/storage";
import { loadDemoData, clearDemoData } from "@/lib/demo";
import { optStr, money, intField, fd as toObj } from "@/lib/zod";

const reval = () => ["/configuracoes", "/pipeline", "/agenda", "/ranking", "/dashboard", "/perfil"].forEach((p) => revalidatePath(p));

// ── Empresa / metas ──
export async function saveCompany(fd: FormData) {
  const user = await requirePermission("settings.manage");
  const o = toObj(fd);
  await db.insert(t.settings).values({ key: "company", value: { name: o.name || "Forte Company", tagline: o.tagline || "", cnpj: o.cnpj || "", phone: o.phone || "", email: o.email || "", address: o.address || "" } }).onConflictDoUpdate({ target: t.settings.key, set: { value: { name: o.name || "Forte Company", tagline: o.tagline || "", cnpj: o.cnpj || "", phone: o.phone || "", email: o.email || "", address: o.address || "" } } });
  await audit(user.id, "update", "settings", "company", "Dados da empresa atualizados"); reval();
}
export async function saveGoals(fd: FormData) {
  const user = await requirePermission("goals.manage");
  const o = toObj(fd); const monthly = money.parse(o.monthly);
  await db.insert(t.settings).values({ key: "goals", value: { monthly } }).onConflictDoUpdate({ target: t.settings.key, set: { value: { monthly } } });
  const journey = { stepDays: { GRUPO_CRIADO: intField(1).parse(o.d_GRUPO_CRIADO), CONTRATO: intField(3).parse(o.d_CONTRATO), FORMULARIO: intField(7).parse(o.d_FORMULARIO), ONBOARDING: intField(10).parse(o.d_ONBOARDING) } };
  await db.insert(t.settings).values({ key: "journey", value: journey }).onConflictDoUpdate({ target: t.settings.key, set: { value: journey } });
  for (const [k, v] of Object.entries(o)) if (k.startsWith("goal_")) await db.update(t.users).set({ monthlyGoal: money.parse(v).toFixed(2) }).where(eq(t.users.id, k.slice(5)));
  await audit(user.id, "update", "settings", "goals", `Meta mensal: R$ ${monthly}`); reval();
}

// ── Usuários ──
const userSchema = z.object({ name: z.string().min(2, "Informe o nome"), email: z.email("E-mail inválido"), role: z.enum(["ADMIN", "GESTOR", "COMERCIAL", "OPERACIONAL"]), phone: optStr, monthlyGoal: money, password: optStr, active: z.string().optional().transform((v) => v !== "off" && v !== "false") });
export async function createUser(fd: FormData) {
  const actor = await requirePermission("users.manage");
  const p = userSchema.safeParse(toObj(fd)); if (!p.success) throw new Error(p.error.issues[0].message);
  if (!p.data.password || p.data.password.length < 6) throw new Error("Defina uma senha inicial com ao menos 6 caracteres.");
  const exists = await db.query.users.findFirst({ where: eq(t.users.email, p.data.email.toLowerCase()) }); if (exists) throw new Error("Já existe um usuário com este e-mail.");
  const [u] = await db.insert(t.users).values({ name: p.data.name, email: p.data.email.toLowerCase(), role: p.data.role, phone: p.data.phone, monthlyGoal: p.data.monthlyGoal.toFixed(2), passwordHash: await hashPassword(p.data.password) }).returning();
  await audit(actor.id, "create", "user", u.id, `Usuário ${u.name} (${u.role}) criado`); reval();
}
export async function updateUser(id: string, fd: FormData) {
  const actor = await requirePermission("users.manage");
  const p = userSchema.safeParse(toObj(fd)); if (!p.success) throw new Error(p.error.issues[0].message);
  const target = await db.query.users.findFirst({ where: eq(t.users.id, id) }); if (!target) throw new Error("Usuário não encontrado.");
  if (target.role === "ADMIN" && (p.data.role !== "ADMIN" || !p.data.active)) {
    const [{ c }] = await db.select({ c: count() }).from(t.users).where(and(eq(t.users.role, "ADMIN"), eq(t.users.active, true), ne(t.users.id, id)));
    if (c === 0) throw new Error("Deve existir ao menos um administrador ativo.");
  }
  const patch: Partial<typeof t.users.$inferInsert> = { name: p.data.name, email: p.data.email.toLowerCase(), role: p.data.role, phone: p.data.phone, monthlyGoal: p.data.monthlyGoal.toFixed(2), active: p.data.active };
  if (p.data.password) { if (p.data.password.length < 6) throw new Error("Senha com no mínimo 6 caracteres."); patch.passwordHash = await hashPassword(p.data.password); }
  await db.update(t.users).set(patch).where(eq(t.users.id, id));
  await audit(actor.id, "update", "user", id, `Usuário ${p.data.name} atualizado (${p.data.role}${p.data.active ? "" : ", inativo"})`); reval();
}

// ── Perfil próprio ──
export async function updateProfile(fd: FormData) {
  const user = await requireUser(); const o = toObj(fd);
  const patch: Partial<typeof t.users.$inferInsert> = { name: o.name?.trim() || user.name, phone: o.phone || null };
  const file = fd.get("avatar"); if (file instanceof File && file.size > 0) { if (file.size > 3 * 1024 * 1024) throw new Error("Imagem até 3 MB."); patch.avatarUrl = (await saveFile(file, "avatars")).url; }
  if (o.newPassword) {
    const [row] = await db.select().from(t.users).where(eq(t.users.id, user.id));
    if (!o.currentPassword || !(await verifyPassword(o.currentPassword, row.passwordHash))) throw new Error("Senha atual incorreta.");
    if (o.newPassword.length < 6) throw new Error("Nova senha com no mínimo 6 caracteres.");
    patch.passwordHash = await hashPassword(o.newPassword);
  }
  await db.update(t.users).set(patch).where(eq(t.users.id, user.id));
  await audit(user.id, "update", "user", user.id, "Perfil atualizado"); revalidatePath("/", "layout");
}

// ── Listas simples (origens, motivos, categorias, tipos de reunião) ──
type Simple = "sources" | "loss" | "categories" | "types";
const tables = { sources: t.leadSources, loss: t.lossReasons, categories: t.financeCategories, types: t.appointmentTypes } as const;
export async function addListItem(kind: Simple, fd: FormData) {
  const user = await requirePermission("settings.manage");
  const name = String(fd.get("name") || "").trim(); if (!name) throw new Error("Informe o nome.");
  if (kind === "types") await db.insert(t.appointmentTypes).values({ name, color: String(fd.get("color") || "#D91E3A"), isCommercial: fd.get("isCommercial") === "on" }).onConflictDoNothing();
  else await db.insert(tables[kind]).values({ name }).onConflictDoNothing();
  await audit(user.id, "create", kind, null, `Item "${name}" adicionado`); reval();
}
export async function removeListItem(kind: Simple, id: string) {
  const user = await requirePermission("settings.manage");
  try { await db.delete(tables[kind]).where(eq(tables[kind].id, id)); } catch { throw new Error("Não foi possível excluir: item em uso."); }
  await audit(user.id, "delete", kind, id, "Item removido"); reval();
}
export async function toggleTypeCommercial(id: string, v: boolean) {
  await requirePermission("settings.manage");
  await db.update(t.appointmentTypes).set({ isCommercial: v }).where(eq(t.appointmentTypes.id, id)); reval();
}

// ── Pipeline ──
export async function saveStage(id: string | null, fd: FormData) {
  const user = await requirePermission("settings.manage");
  const o = toObj(fd); const name = o.name?.trim(); if (!name) throw new Error("Informe o nome da etapa.");
  const vals = { name, color: o.color || "#6B7280" };
  if (id) await db.update(t.pipelineStages).set(vals).where(eq(t.pipelineStages.id, id));
  else { const all = await db.select().from(t.pipelineStages).orderBy(asc(t.pipelineStages.order)); const lostIdx = all.findIndex((s) => s.isLost); const wonIdx = all.findIndex((s) => s.isWon); const insertAt = Math.min(...[lostIdx, wonIdx].filter((i) => i >= 0), all.length); for (let i = insertAt; i < all.length; i++) await db.update(t.pipelineStages).set({ order: all[i].order + 1 }).where(eq(t.pipelineStages.id, all[i].id)); await db.insert(t.pipelineStages).values({ ...vals, order: insertAt + 1 }); }
  await audit(user.id, id ? "update" : "create", "stage", id, `Etapa "${name}" salva`); reval();
}
export async function moveStage(id: string, dir: -1 | 1) {
  await requirePermission("settings.manage");
  const all = await db.select().from(t.pipelineStages).orderBy(asc(t.pipelineStages.order));
  const i = all.findIndex((s) => s.id === id); const j = i + dir; if (i < 0 || j < 0 || j >= all.length) return;
  if (all[i].isWon || all[i].isLost || all[j].isWon || all[j].isLost) throw new Error("As etapas Venda Fechada e Perdido ficam fixas no fim.");
  await db.update(t.pipelineStages).set({ order: all[j].order }).where(eq(t.pipelineStages.id, all[i].id));
  await db.update(t.pipelineStages).set({ order: all[i].order }).where(eq(t.pipelineStages.id, all[j].id)); reval();
}
export async function deleteStage(id: string) {
  const user = await requirePermission("settings.manage");
  const st = await db.query.pipelineStages.findFirst({ where: eq(t.pipelineStages.id, id) }); if (!st) return;
  if (st.isWon || st.isLost || st.isDefault) throw new Error("Esta etapa é essencial e não pode ser removida.");
  const [{ c }] = await db.select({ c: count() }).from(t.leads).where(eq(t.leads.stageId, id)); if (c > 0) throw new Error(`Mova os ${c} leads desta etapa antes de excluí-la.`);
  await db.delete(t.pipelineStages).where(eq(t.pipelineStages.id, id));
  await audit(user.id, "delete", "stage", id, `Etapa "${st.name}" removida`); reval();
}

// ── Pontuação ──
export async function saveScoring(fd: FormData) {
  const user = await requirePermission("scoring.manage");
  for (const [k, v] of Object.entries(toObj(fd))) if (k.startsWith("pts_")) await db.update(t.scoringRules).set({ points: Math.max(0, intField(0).parse(v)) }).where(eq(t.scoringRules.key, k.slice(4)));
  await audit(user.id, "update", "scoring", null, "Regras de pontuação atualizadas"); reval();
}

// ── Demo ──
export async function loadDemo() { const user = await requirePermission("demo.manage"); await loadDemoData(user.id); await audit(user.id, "create", "demo", null, "Dados de demonstração carregados"); revalidatePath("/", "layout"); }
export async function clearDemo() { const user = await requirePermission("demo.manage"); const r = await clearDemoData(); await audit(user.id, "delete", "demo", null, `Dados demo removidos (${r.users} usuários, ${r.leads} leads, ${r.clients} clientes)`); revalidatePath("/", "layout"); }
