"use server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, t } from "@/db";
import { requirePermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { optStr, fd as toObj } from "@/lib/zod";

export async function createAward(fd: FormData) {
  const user = await requirePermission("awards.manage");
  const p = z.object({ name: z.string().min(2, "Informe o nome"), description: optStr, icon: z.string().default("trophy"), kind: z.string().default("custom"), value: optStr }).safeParse(toObj(fd));
  if (!p.success) throw new Error(p.error.issues[0].message);
  const [a] = await db.insert(t.awards).values(p.data).returning();
  await audit(user.id, "create", "award", a.id, `Premiação "${a.name}" criada`);
  revalidatePath("/ranking");
}
export async function deleteAward(id: string) {
  const user = await requirePermission("awards.manage");
  await db.delete(t.awards).where(eq(t.awards.id, id));
  await audit(user.id, "delete", "award", id, "Premiação removida");
  revalidatePath("/ranking");
}
export async function grantAward(fd: FormData) {
  const user = await requirePermission("awards.manage");
  const p = z.object({ awardId: z.string().min(1), userId: z.string().min(1, "Selecione o vendedor"), period: z.string().min(4), notes: optStr }).safeParse(toObj(fd));
  if (!p.success) throw new Error(p.error.issues[0].message);
  const [g] = await db.insert(t.awardGrants).values(p.data).returning();
  const award = await db.query.awards.findFirst({ where: eq(t.awards.id, p.data.awardId) });
  await notify([p.data.userId], `🏆 Você recebeu: ${award?.name}`, award?.value ?? undefined, "/ranking", "success");
  await audit(user.id, "create", "award_grant", g.id, `Premiação concedida`);
  revalidatePath("/ranking");
}
export async function revokeGrant(id: string) {
  await requirePermission("awards.manage");
  await db.delete(t.awardGrants).where(eq(t.awardGrants.id, id));
  revalidatePath("/ranking");
}
