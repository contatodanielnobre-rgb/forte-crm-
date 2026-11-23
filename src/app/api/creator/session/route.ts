import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * Login único do Criador: o usuário já entrou no CRM (cookie próprio). Aqui achamos/criamos o espelho dele no Supabase Auth
 * do projeto do admin e devolvemos uma sessão do Supabase (access + refresh token) para o app /creator.
 *
 * O espelho usa uma senha que só o servidor sabe (HMAC do e-mail com o AUTH_SECRET): ninguém consegue entrar direto no
 * Supabase Auth, e não há link mágico (o Supabase limita a 1 por minuto por usuário).
 */
const mirrorPassword = (email: string) =>
  createHmac("sha256", process.env.AUTH_SECRET || "dev-secret-change-me").update("creator:" + email).digest("base64url");

export async function GET() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });
  if (!can(user.role, "creator.use")) return NextResponse.json({ error: "Sem permissão para o Criador de Conteúdo." }, { status: 403 });
  const url = process.env.CREATOR_SUPABASE_URL, secret = process.env.CREATOR_SUPABASE_SECRET_KEY, pub = process.env.CREATOR_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !secret || !pub) return NextResponse.json({ error: "Criador não configurado (CREATOR_SUPABASE_*)." }, { status: 500 });
  const email = user.email.toLowerCase();
  const password = mirrorPassword(email);
  const admin = { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json" };
  const login = () => fetch(`${url}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: pub, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  try {
    let res = await login();
    if (!res.ok) {
      // primeira vez (ou senha do espelho diferente): cria o usuário ou realinha a senha
      const known = (await db.execute(sql`select id from public.profiles where lower(email) = ${email} limit 1`)) as unknown as { id: string }[];
      let uid = known[0]?.id;
      if (uid) {
        const up = await fetch(`${url}/auth/v1/admin/users/${uid}`, { method: "PUT", headers: admin, body: JSON.stringify({ password, email_confirm: true }) });
        if (!up.ok) throw new Error("não consegui atualizar o espelho no Auth");
      } else {
        const create = await fetch(`${url}/auth/v1/admin/users`, { method: "POST", headers: admin, body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: user.name } }) });
        const cj = await create.json();
        if (!create.ok || !cj.id) throw new Error(cj.msg || cj.message || "não consegui criar o espelho no Auth");
        uid = cj.id as string;
      }
      // perfil (papel) espelhado do CRM: ADMIN → admin, GESTOR → collaborator
      const role = user.role === "ADMIN" ? "admin" : "collaborator";
      await db.execute(sql`insert into public.profiles (id, email, full_name, role, active) values (${uid}::uuid, ${email}, ${user.name}, ${role}::public.user_role, true)
        on conflict (id) do update set role = excluded.role, full_name = excluded.full_name, email = excluded.email, active = true`);
      res = await login();
    }
    const j = await res.json();
    if (!res.ok || !j.access_token) throw new Error(j.msg || j.error_description || "login do espelho falhou");
    // mantém o papel do espelho em dia com o do CRM (ex.: gestor promovido a administrador)
    await db.execute(sql`update public.profiles set role = ${user.role === "ADMIN" ? "admin" : "collaborator"}::public.user_role, full_name = ${user.name}, active = true where id = ${j.user?.id}::uuid`);
    return NextResponse.json({ access_token: j.access_token, refresh_token: j.refresh_token, expires_in: j.expires_in }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[creator/session]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Não foi possível abrir o Criador agora. Tente de novo." }, { status: 502 });
  }
}
