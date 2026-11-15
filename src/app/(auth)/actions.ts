"use server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, t } from "@/db";
import { createSession, destroySession, hashPassword, verifyPassword } from "@/lib/auth";
import { ensureDefaults, hasUsers } from "@/lib/bootstrap";
import { audit } from "@/lib/audit";

export type AuthState = { error?: string } | undefined;

export async function loginAction(_: AuthState, fd: FormData): Promise<AuthState> {
  const parsed = z.object({ email: z.email("E-mail inválido"), password: z.string().min(1, "Informe a senha"), next: z.string().optional() }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { email, password, next } = parsed.data;
  const [user] = await db.select().from(t.users).where(eq(t.users.email, email.toLowerCase().trim()));
  if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) return { error: "E-mail ou senha incorretos." };
  await createSession(user.id);
  await audit(user.id, "login", "user", user.id, `${user.name} entrou no sistema`);
  redirect(next && next.startsWith("/") ? next : "/dashboard");
}

export async function logoutAction() { await destroySession(); redirect("/login"); }

export async function setupAction(_: AuthState, fd: FormData): Promise<AuthState> {
  if (await hasUsers()) return { error: "O sistema já foi configurado." };
  const parsed = z.object({ name: z.string().min(2, "Informe seu nome"), email: z.email("E-mail inválido"), password: z.string().min(6, "Senha com no mínimo 6 caracteres") }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await ensureDefaults(true);
  const [u] = await db.insert(t.users).values({ name: parsed.data.name, email: parsed.data.email.toLowerCase().trim(), passwordHash: await hashPassword(parsed.data.password), role: "ADMIN" }).returning();
  await createSession(u.id);
  await audit(u.id, "create", "user", u.id, "Administrador inicial criado");
  redirect("/dashboard");
}
