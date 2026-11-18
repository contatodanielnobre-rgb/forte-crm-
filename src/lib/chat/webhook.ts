import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ingestWebhook, sendWhatsAppText } from "@/lib/salescop/whatsapp";
import { askSalesCop } from "@/lib/salescop/ai";
import { getSalesCopSettings } from "@/lib/salescop/settings";
import { logExecution } from "@/lib/salescop/log";
import { verifySignature } from "./cloud-api";
import { ingestChatWebhook } from "./ingest";

/**
 * Webhook único da Meta (o app da Meta aceita uma URL de callback por app).
 * Atende /api/salescop/whatsapp (URL já cadastrada) e /api/chat/whatsapp.
 *  - mensagens de contatos/clientes → FORTE CHAT
 *  - mensagens de membros da equipe (telefone cadastrado no perfil) → SALES COP AI (fluxo existente, inalterado)
 */
export function handleWebhookVerify(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  if (sp.get("hub.mode") === "subscribe" && sp.get("hub.verify_token") && sp.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN) return new Response(sp.get("hub.challenge") ?? "", { status: 200 });
  return NextResponse.json({ error: "Token de verificação inválido." }, { status: 403 });
}

export async function handleWebhookEvent(req: NextRequest) {
  const raw = await req.text();
  const sig = verifySignature(raw, req.headers.get("x-hub-signature-256"));
  if (!sig.ok) {
    await logExecution({ kind: "whatsapp", action: "webhook", status: "BLOQUEADO", summary: "Webhook rejeitado: assinatura X-Hub-Signature-256 inválida." });
    return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
  }
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  // FORTE CHAT
  let chat = { messages: 0, statuses: 0, skippedTeam: 0 };
  try { chat = await ingestChatWebhook(body); }
  catch (e) { console.error("chat webhook", e); await logExecution({ kind: "whatsapp", action: "chat-webhook", status: "ERRO", summary: (e as Error).message }); }

  // SALES COP AI (comportamento original)
  const settings = await getSalesCopSettings();
  const incoming = await ingestWebhook(body);
  for (const m of incoming) {
    if (!m.user) continue; // contato/cliente: tratado pelo FORTE CHAT
    await logExecution({ kind: "whatsapp", action: "receive", summary: `${m.user.name}: ${m.text.slice(0, 200)}`, actorId: m.user.id });
    if (!settings.whatsapp.enabled) continue;
    const res = await askSalesCop({ question: m.text, actor: { id: m.user.id, name: m.user.name, role: m.user.role }, channel: "whatsapp" });
    await sendWhatsAppText({ phone: m.waId, userId: m.user.id, text: res.answer, actorId: m.user.id, kind: "reply" });
  }
  return NextResponse.json({ ok: true, received: incoming.length, chat, signatureChecked: sig.enforced });
}
