// Supabase Edge Function: studio-keys
// Guarda/remove/testa as chaves de API dos provedores de imagem (somente administradores).
// A chave NUNCA volta para o navegador: ela fica na tabela studio_provider_keys (sem policies, só service role).
// Opcional: defina o secret STUDIO_ENC_KEY (32 bytes em base64) para criptografar as chaves em repouso (AES-GCM).
//   supabase secrets set STUDIO_ENC_KEY=$(openssl rand -base64 32)
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const PROVIDERS = ["openai", "google", "fal", "ideogram", "stability", "recraft", "custom"];

const b64 = (u8: Uint8Array) => btoa(String.fromCharCode(...u8));
async function encKey() {
  const raw = Deno.env.get("STUDIO_ENC_KEY");
  if (!raw) return null;
  const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function seal(plain: string) {
  const key = await encKey();
  if (!key) return "plain:" + plain;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain)));
  return `enc:v1:${b64(iv)}:${b64(ct)}`;
}
async function open(stored: string) {
  if (stored.startsWith("plain:")) return stored.slice(6);
  const [, , iv, ct] = stored.split(":");
  const key = await encKey();
  if (!key) throw new Error("STUDIO_ENC_KEY ausente: não foi possível ler a chave criptografada.");
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: Uint8Array.from(atob(iv), (c) => c.charCodeAt(0)) },
    key, Uint8Array.from(atob(ct), (c) => c.charCodeAt(0)));
  return new TextDecoder().decode(plain);
}

/** Chamada barata que só valida a credencial (não gera imagem nem cobra). */
async function testProvider(provider: string, key: string, baseUrl?: string | null): Promise<string | null> {
  try {
    let res: Response;
    if (provider === "openai") res = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${key}` } });
    else if (provider === "custom") res = await fetch(`${(baseUrl ?? "").replace(/\/$/, "")}/models`, { headers: { Authorization: `Bearer ${key}` } });
    else if (provider === "google") res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${encodeURIComponent(key)}`);
    else if (provider === "stability") res = await fetch("https://api.stability.ai/v1/user/account", { headers: { Authorization: `Bearer ${key}` } });
    else if (provider === "recraft") res = await fetch("https://external.api.recraft.ai/v1/users/me", { headers: { Authorization: `Bearer ${key}` } });
    else return null; // fal.ai e Ideogram não têm endpoint grátis de teste: aceitamos a chave e validamos na primeira geração
    if (res.ok) return null;
    return res.status === 401 || res.status === 403 ? "Chave recusada pelo provedor (não autorizada)." : `Provedor respondeu ${res.status}.`;
  } catch (e) {
    return `Não foi possível contatar o provedor: ${e instanceof Error ? e.message : e}`;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const asCaller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: me } = await asCaller.auth.getUser();
  if (!me?.user) return json({ error: "Sessão inválida" }, 401);
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: caller } = await admin.from("profiles").select("role, active").eq("id", me.user.id).single();
  if (!caller || caller.role !== "admin" || !caller.active) return json({ error: "Apenas administradores" }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  const action = String(body.action ?? "");
  const provider = String(body.provider ?? "");
  if (!PROVIDERS.includes(provider)) return json({ error: "Provedor desconhecido" }, 400);

  if (action === "set") {
    const apiKey = String(body.api_key ?? "").trim();
    const baseUrl = body.base_url ? String(body.base_url).trim() : null;
    if (apiKey.length < 8) return json({ error: "Cole a chave de API completa." }, 400);
    if (provider === "custom" && !baseUrl) return json({ error: "Informe a URL base da API compatível com OpenAI." }, 400);
    const problem = await testProvider(provider, apiKey, baseUrl);
    if (problem && body.skip_test !== true) return json({ error: problem }, 400);
    const { error } = await admin.from("studio_provider_keys").upsert({
      provider, api_key: await seal(apiKey), last4: apiKey.slice(-4), base_url: baseUrl, updated_by: me.user.id, updated_at: new Date().toISOString(),
    });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, encrypted: !!Deno.env.get("STUDIO_ENC_KEY") });
  }

  if (action === "delete") {
    await admin.from("studio_provider_keys").delete().eq("provider", provider);
    return json({ ok: true });
  }

  if (action === "test") {
    const { data: row } = await admin.from("studio_provider_keys").select("api_key, base_url").eq("provider", provider).maybeSingle();
    if (!row) return json({ error: "Nenhuma chave salva para este provedor." }, 404);
    let key: string;
    try { key = await open(row.api_key); } catch (e) { return json({ error: e instanceof Error ? e.message : String(e) }, 400); }
    const problem = await testProvider(provider, key, row.base_url);
    return problem ? json({ error: problem }, 400) : json({ ok: true });
  }

  return json({ error: "Ação desconhecida" }, 400);
});
