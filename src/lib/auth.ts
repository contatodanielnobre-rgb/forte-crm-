import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, t } from "@/db";
import { can, type Permission } from "./permissions";
import type { Role } from "@/db/schema";

const COOKIE = "forte_session";
const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret-change-me");

export type SessionUser = { id: string; name: string; email: string; role: Role; avatarUrl: string | null; theme: string };

export async function createSession(userId: string) {
  const token = await new SignJWT({ sub: userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("7d").sign(secret());
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 7 });
}
export async function destroySession() { (await cookies()).delete(COOKIE); }

export async function getSession(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const id = String(payload.sub);
    const [u] = await db.select({ id: t.users.id, name: t.users.name, email: t.users.email, role: t.users.role, avatarUrl: t.users.avatarUrl, theme: t.users.theme, active: t.users.active }).from(t.users).where(eq(t.users.id, id));
    if (!u || !u.active) return null;
    const { active: _a, ...rest } = u; void _a;
    return rest;
  } catch { return null; }
}

export async function requireUser(): Promise<SessionUser> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

/** Garante a permissão no servidor (ações e páginas). Lança erro se negado. */
export async function requirePermission(p: Permission): Promise<SessionUser> {
  const s = await requireUser();
  if (!can(s.role, p)) throw new Error("Acesso negado: você não tem permissão para esta ação.");
  return s;
}

export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

/** Versão para páginas: redireciona para /sem-acesso quando o perfil não tem a permissão. */
export async function requirePage(p: Permission): Promise<SessionUser> {
  const s = await requireUser();
  if (!can(s.role, p)) redirect("/sem-acesso");
  return s;
}
