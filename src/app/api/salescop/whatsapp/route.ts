import { NextResponse, type NextRequest } from "next/server";
import { ingestWebhook, sendWhatsAppText } from "@/lib/salescop/whatsapp";
import { askSalesCop } from "@/lib/salescop/ai";
import { getSalesCopSettings } from "@/lib/salescop/settings";
import { logExecution } from "@/lib/salescop/log";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Verificação do webhook (Meta → GET com hub.challenge). */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  if (sp.get("hub.mode") === "subscribe" && sp.get("hub.verify_token") && sp.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN) return new Response(sp.get("hub.challenge") ?? "", { status: 200 });
  return NextResponse.json({ error: "Token de verificação inválido." }, { status: 403 });
}

/** Recebe mensagens/status. Responde às perguntas dos usuários identificados pelo telefone cadastrado no CRM. */
export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const settings = await getSalesCopSettings();
  const incoming = await ingestWebhook(body);
  for (const m of incoming) {
    if (!m.user) { await logExecution({ kind: "whatsapp", action: "receive", status: "IGNORADO", summary: `Mensagem de número não cadastrado (${m.waId}).` }); continue; }
    await logExecution({ kind: "whatsapp", action: "receive", summary: `${m.user.name}: ${m.text.slice(0, 200)}`, actorId: m.user.id });
    if (!settings.whatsapp.enabled) continue;
    const res = await askSalesCop({ question: m.text, actor: { id: m.user.id, name: m.user.name, role: m.user.role }, channel: "whatsapp" });
    await sendWhatsAppText({ phone: m.waId, userId: m.user.id, text: res.answer, actorId: m.user.id, kind: "reply" });
  }
  return NextResponse.json({ ok: true, received: incoming.length });
}
