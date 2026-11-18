import { NextResponse, type NextRequest } from "next/server";
import { processDueChatTasks } from "@/lib/chat/tasks";
import { setSetting } from "@/lib/chat/settings-store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Processador de mensagens/tarefas agendadas do FORTE CHAT (funciona com o CRM fechado).
 * Chame a cada 1–5 min (cron-job.org, GitHub Actions, n8n...) com Authorization: Bearer <CRON_SECRET> ou header x-cron-secret.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET não configurado." }, { status: 503 });
  const auth = req.headers.get("authorization") ?? "";
  const given = auth.startsWith("Bearer ") ? auth.slice(7) : req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret") ?? "";
  if (given !== secret) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const result = await processDueChatTasks(25);
  await setSetting("chat_scheduler", { at: new Date().toISOString(), ...result });
  return NextResponse.json({ ok: true, at: new Date().toISOString(), ...result });
}
export const GET = handle;
export const POST = handle;
