import { NextResponse, type NextRequest } from "next/server";
import { runRoutine } from "@/lib/salescop/routine";
import type { RoutineStepKey } from "@/lib/salescop/settings";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Rotina automática do SALES COP AI.
 * Chamado pelo Vercel Cron (vercel.json) ou por n8n/outro agendador: Authorization: Bearer <CRON_SECRET> (ou header x-cron-secret).
 * Sem parâmetros executa os passos cujo horário já passou e ainda não rodaram hoje; ?step=plano força um passo específico.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET não configurado." }, { status: 503 });
  const auth = req.headers.get("authorization") ?? "";
  const given = auth.startsWith("Bearer ") ? auth.slice(7) : req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret") ?? "";
  if (given !== secret) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const step = req.nextUrl.searchParams.get("step") as RoutineStepKey | null;
  const force = req.nextUrl.searchParams.get("force") === "1";
  const result = await runRoutine({ step: step ?? undefined, force });
  return NextResponse.json({ ok: true, at: new Date().toISOString(), ...result });
}
export const GET = handle;
export const POST = handle;
