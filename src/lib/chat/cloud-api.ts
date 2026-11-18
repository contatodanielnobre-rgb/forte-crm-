import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Cliente da WhatsApp Business Platform — Cloud API (oficial, Meta).
 * Nada é simulado: sem credenciais, toda chamada lança WhatsAppNotConfigured.
 *
 * Variáveis:
 *  WHATSAPP_TOKEN                  token permanente do System User (whatsapp_business_messaging + management)
 *  WHATSAPP_PHONE_NUMBER_ID        ID do número no WhatsApp Manager
 *  WHATSAPP_BUSINESS_ACCOUNT_ID    (opcional) WABA — lista os modelos (templates) aprovados
 *  WHATSAPP_VERIFY_TOKEN           token de verificação do webhook
 *  WHATSAPP_APP_SECRET             (recomendado) App Secret — valida a assinatura X-Hub-Signature-256 dos webhooks
 *  WHATSAPP_API_VERSION            (opcional) padrão v25.0
 */
export const GRAPH_VERSION = () => process.env.WHATSAPP_API_VERSION || "v25.0";
/** WHATSAPP_GRAPH_URL só existe para homologação (proxy/servidor de testes); em produção fica vazio → graph.facebook.com. */
const GRAPH = () => `${process.env.WHATSAPP_GRAPH_URL || "https://graph.facebook.com"}/${GRAPH_VERSION()}`;

export class WhatsAppNotConfigured extends Error { constructor() { super("Integração WhatsApp não configurada (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID)."); } }
export class WhatsAppApiError extends Error {
  constructor(message: string, public code?: number, public status?: number, public transient = false) { super(message); }
}

export function cloudConfigured() { return !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID); }
export function integrationStatus() {
  return [
    { key: "WHATSAPP_TOKEN", ok: !!process.env.WHATSAPP_TOKEN, label: "Token de acesso permanente (System User)", required: true },
    { key: "WHATSAPP_PHONE_NUMBER_ID", ok: !!process.env.WHATSAPP_PHONE_NUMBER_ID, label: "ID do número de telefone", required: true },
    { key: "WHATSAPP_VERIFY_TOKEN", ok: !!process.env.WHATSAPP_VERIFY_TOKEN, label: "Token de verificação do webhook", required: true },
    { key: "WHATSAPP_APP_SECRET", ok: !!process.env.WHATSAPP_APP_SECRET, label: "App Secret (assinatura dos webhooks)", required: true },
    { key: "WHATSAPP_BUSINESS_ACCOUNT_ID", ok: !!process.env.WHATSAPP_BUSINESS_ACCOUNT_ID, label: "ID da conta WhatsApp Business (modelos aprovados)", required: false },
    { key: "BLOB_READ_WRITE_TOKEN", ok: !!process.env.BLOB_READ_WRITE_TOKEN, label: "Armazenamento de arquivos (Vercel Blob)", required: true },
    { key: "CRON_SECRET", ok: !!process.env.CRON_SECRET, label: "Segredo do processador de agendamentos", required: true },
  ];
}

function token() { if (!cloudConfigured()) throw new WhatsAppNotConfigured(); return process.env.WHATSAPP_TOKEN!; }

/** Erros que valem nova tentativa automática (rede, limite de taxa, indisponibilidade). */
const TRANSIENT_CODES = new Set([1, 2, 4, 17, 341, 80007, 130429, 131000, 131016, 131048, 131056, 133004]);

async function graph<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { authorization: `Bearer ${token()}`, ...(init.headers as Record<string, string>) };
  let body = init.body;
  if (init.json !== undefined) { headers["content-type"] = "application/json"; body = JSON.stringify(init.json); }
  let r: Response;
  try { r = await fetch(`${GRAPH()}${path}`, { ...init, headers, body, cache: "no-store" }); }
  catch (e) { throw new WhatsAppApiError(`Falha de rede ao falar com a Meta: ${(e as Error).message}`, undefined, undefined, true); }
  const json = (await r.json().catch(() => ({}))) as { error?: { message?: string; code?: number; error_data?: { details?: string } } } & T;
  if (!r.ok || json.error) {
    const code = json.error?.code;
    const msg = humanError(code, json.error?.error_data?.details || json.error?.message || `HTTP ${r.status}`);
    throw new WhatsAppApiError(msg, code, r.status, r.status >= 500 || r.status === 429 || (code !== undefined && TRANSIENT_CODES.has(code)));
  }
  return json;
}

export function humanError(code: number | undefined, fallback: string) {
  switch (code) {
    case 131047: return "Mais de 24h desde a última mensagem do contato: só é possível enviar um modelo (template) aprovado.";
    case 131026: return "Mensagem não entregue: o número pode não ter WhatsApp ou não aceitou os termos atualizados.";
    case 131051: return "Tipo de mensagem não suportado pelo WhatsApp.";
    case 131052: case 131053: return "Falha ao processar a mídia (formato ou tamanho não aceito pelo WhatsApp).";
    case 132000: case 132001: case 132012: return "Modelo (template) inexistente, não aprovado ou com parâmetros incorretos.";
    case 130429: case 131056: return "Limite de envio da Meta atingido. Nova tentativa automática em instantes.";
    case 190: return "Token do WhatsApp inválido ou expirado.";
    case 100: return `Parâmetro inválido na Cloud API: ${fallback}`;
    default: return fallback;
  }
}

export type SendPayload =
  | { kind: "text"; text: string }
  | { kind: "image" | "audio" | "document" | "video"; waMediaId: string; caption?: string | null; filename?: string | null }
  | { kind: "template"; name: string; language: string; params: string[] };

/** Envia uma mensagem e retorna o wamid. */
export async function cloudSend(to: string, p: SendPayload, replyToWaMessageId?: string | null) {
  const base: Record<string, unknown> = { messaging_product: "whatsapp", recipient_type: "individual", to };
  if (replyToWaMessageId) base.context = { message_id: replyToWaMessageId };
  let msg: Record<string, unknown>;
  if (p.kind === "text") msg = { type: "text", text: { preview_url: true, body: p.text.slice(0, 4096) } };
  else if (p.kind === "template") msg = { type: "template", template: { name: p.name, language: { code: p.language }, components: p.params.length ? [{ type: "body", parameters: p.params.map((text) => ({ type: "text", text })) }] : [] } };
  else {
    const media: Record<string, unknown> = { id: p.waMediaId };
    if (p.caption && p.kind !== "audio") media.caption = p.caption.slice(0, 1024);
    if (p.kind === "document" && p.filename) media.filename = p.filename;
    msg = { type: p.kind, [p.kind]: media };
  }
  const res = await graph<{ messages?: { id: string }[] }>(`/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, { method: "POST", json: { ...base, ...msg } });
  const id = res.messages?.[0]?.id;
  if (!id) throw new WhatsAppApiError("A Meta não retornou o ID da mensagem.");
  return { waMessageId: id, request: { ...base, ...msg } };
}

/** Sobe um arquivo para a Meta e retorna o media id (necessário para enviar áudio/documento/imagem). */
export async function cloudUploadMedia(data: Buffer, mimeType: string, fileName: string) {
  const fd = new FormData();
  fd.append("messaging_product", "whatsapp");
  fd.append("type", mimeType);
  fd.append("file", new Blob([new Uint8Array(data)], { type: mimeType }), fileName);
  const res = await graph<{ id: string }>(`/${process.env.WHATSAPP_PHONE_NUMBER_ID}/media`, { method: "POST", body: fd });
  return res.id;
}

/** Baixa uma mídia recebida (2 passos: metadados → URL temporária autenticada). */
export async function cloudDownloadMedia(waMediaId: string) {
  const meta = await graph<{ url: string; mime_type: string; sha256?: string; file_size?: number }>(`/${waMediaId}`);
  const r = await fetch(meta.url, { headers: { authorization: `Bearer ${token()}` }, cache: "no-store" });
  if (!r.ok) throw new WhatsAppApiError(`Falha ao baixar mídia (${r.status}).`, undefined, r.status, r.status >= 500);
  return { data: Buffer.from(await r.arrayBuffer()), mimeType: meta.mime_type, sha256: meta.sha256 ?? null };
}

/** Marca como lida (mostra os dois tiques azuis para o contato). */
export async function cloudMarkRead(waMessageId: string) {
  await graph(`/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, { method: "POST", json: { messaging_product: "whatsapp", status: "read", message_id: waMessageId } });
}

export type CloudTemplate = { name: string; language: string; category: string; body: string; params: number };
/** Modelos aprovados da conta (precisa de WHATSAPP_BUSINESS_ACCOUNT_ID). */
export async function cloudTemplates(): Promise<CloudTemplate[]> {
  const waba = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  const fallback = process.env.WHATSAPP_TEMPLATE_DAILY ? [{ name: process.env.WHATSAPP_TEMPLATE_DAILY, language: "pt_BR", category: "UTILITY", body: "{{1}}", params: 1 }] : [];
  if (!waba || !cloudConfigured()) return fallback;
  const res = await graph<{ data: { name: string; language: string; status: string; category: string; components: { type: string; text?: string }[] }[] }>(`/${waba}/message_templates?fields=name,language,status,category,components&limit=200`);
  return res.data.filter((x) => x.status === "APPROVED").map((x) => {
    const body = x.components.find((c) => c.type === "BODY")?.text ?? "";
    return { name: x.name, language: x.language, category: x.category, body, params: new Set(body.match(/\{\{\s*\d+\s*\}\}/g) ?? []).size };
  });
}

/** Valida X-Hub-Signature-256 (HMAC-SHA256 do corpo bruto com o App Secret). */
export function verifySignature(rawBody: string, header: string | null) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return { ok: true, enforced: false };
  if (!header?.startsWith("sha256=")) return { ok: false, enforced: true };
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(header.slice(7), "hex"), b = Buffer.from(expected, "hex");
  return { ok: a.length === b.length && timingSafeEqual(a, b), enforced: true };
}

/** Formatos aceitos pelo WhatsApp por tipo (limites oficiais). */
export const WA_LIMITS = {
  audio: { max: 16 * 1024 * 1024, types: ["audio/ogg", "audio/mpeg", "audio/mp4", "audio/aac", "audio/amr"] },
  image: { max: 5 * 1024 * 1024, types: ["image/jpeg", "image/png"] },
  video: { max: 16 * 1024 * 1024, types: ["video/mp4", "video/3gpp"] },
  document: { max: 100 * 1024 * 1024, types: [] as string[] },
};
export function waKindFor(mime: string): "audio" | "image" | "video" | "document" {
  const base = mime.split(";")[0].trim().toLowerCase();
  if (WA_LIMITS.audio.types.includes(base)) return "audio";
  if (WA_LIMITS.image.types.includes(base)) return "image";
  if (WA_LIMITS.video.types.includes(base)) return "video";
  return "document";
}
