import "server-only";
import { NextResponse } from "next/server";
import { getSession, type SessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }

/** Wrapper das rotas do chat: sessão + permissão chat.view + erros em JSON. */
export function chatRoute<C>(fn: (user: SessionUser, req: Request, ctx: C) => Promise<Response | unknown>) {
  return async (req: Request, ctx: C) => {
    const user = await getSession();
    if (!user) return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });
    if (!can(user.role, "chat.view")) return NextResponse.json({ error: "Sem permissão para o FORTE CHAT." }, { status: 403 });
    try {
      const r = await fn(user, req, ctx);
      return r instanceof Response ? r : NextResponse.json(r);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 400;
      if (!(e instanceof HttpError)) console.error("[chat]", e);
      return NextResponse.json({ error: (e as Error).message || "Erro inesperado." }, { status });
    }
  };
}
