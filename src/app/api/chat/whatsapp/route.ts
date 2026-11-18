import type { NextRequest } from "next/server";
import { handleWebhookEvent, handleWebhookVerify } from "@/lib/chat/webhook";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Verificação do webhook (Meta → GET com hub.challenge). */
export async function GET(req: NextRequest) { return handleWebhookVerify(req); }

/** Recebe mensagens/status: equipe → SALES COP AI; contatos → FORTE CHAT. Valida a assinatura quando WHATSAPP_APP_SECRET está definido. */
export async function POST(req: NextRequest) { return handleWebhookEvent(req); }
