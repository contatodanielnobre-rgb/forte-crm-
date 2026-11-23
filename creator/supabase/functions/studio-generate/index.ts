// Supabase Edge Function: studio-generate
// Motor do Estúdio de criação de conteúdo. Ações:
//   plan     divide um texto longo em slides (roteiro + legenda + hashtags)         [precisa de chave OpenAI]
//   enhance  melhora um prompt                                                      [precisa de chave OpenAI]
//   train    analisa as imagens de referência da marca (visão) e guarda a análise   [precisa de chave OpenAI]
//   ideate   "criador de prompts": ideia/roteiro → ângulo, ganchos, slides, legenda (modo pensar / seguir regras)
//   train_agent  gera o manual do "designer" (agente) a partir da skill base da agência
//   brand_brief  lê o cadastro (e o site) de uma empresa e monta a base de treino dela
//   image    gera a imagem de um slide (linha studio_images com status "queued")
//   edit     edita uma imagem existente com marcadores/máscara (nova versão do slide)
//   transcribe     ditado por voz: áudio → texto (gpt-4o-transcribe)
//   describe_asset IA de visão descreve um personagem/objeto enviado (para o gerador reproduzir o mesmo)
//   video_plan     editor de vídeo (VPS): transcrição + pedido → plano de edição (chamada feita pelo worker com a service role)
//   video_analyze  editor de vídeo: medições/quadros de uma referência → regras de estilo
//   brand_import   lê documentos (PDF, imagens, reuniões) e preenche os campos do treinamento da empresa
//   logo_train / logo_ideate / logo_image / logo_inspect   criador de logos (treinar com referências, conceitos, imagem, leitura da logo aprovada)
//   logo_branding_plan / logo_branding_image               mockups de branding da logo aprovada
//   thumb_observe / thumb_train / thumb_ideate / thumb_image   criador de thumbnails (observar referências, treinar, conceitos a partir do vídeo, imagem)
// Provedores: openai, google (Nano Banana / Imagen), fal, ideogram, stability, recraft e custom (compatível com OpenAI).
// As chaves vêm de studio_provider_keys (nunca passam pelo navegador).
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { TRAIN_AGENT_SYSTEM, TRAIN_VISION_PROMPT, TRAIN_VISION_SYSTEM, enhanceSystem, ideateSystem, ideateUser, planSystem, trainAgentUser, buildPrompt, buildEditPrompt, brandBuilderSystem, brandBuilderUser, sanitizeSlides, READ_TEXT_PROMPT, READ_TEXT_SYSTEM, STYLE_VISION_SYSTEM, styleVisionPrompt, type AgentNotes, type VisualStyle } from "../_shared/prompts.ts";
import { fetchSite } from "../_shared/site.ts";
import { openaiImage, costFromUsage as usageCost } from "../_shared/openai-image.ts";
import { DESCRIBE_SYSTEM, describePrompt, isCast, selectImageRefs, transcribeAudio, vocabularyPrompt, type Attachment, type CastItem, type CompetitorPlan, type LogoPlan } from "../_shared/elements.ts";
import { ANALYZE_SYSTEM, sanitizePlan, sanitizeStyle, videoPlanSystem, videoPlanUser, type VideoPlanInput } from "../_shared/video.ts";
import { brandImportIntro, brandImportSystem, filterImportColors } from "../_shared/import.ts";
import { THUMB_CATEGORIES, THUMB_OBSERVE_SYSTEM, THUMB_SYNTH_SYSTEM, buildThumbPrompt, buildThumbRefinePrompt, compileThumbSkill, computeThumbStats, exemplarsBlock, learnedBlock, sanitizeObservations, sanitizeThumbAnalysis, sanitizeThumbConcepts, sanitizeThumbForm, thumbIdeateSystem, thumbIdeateUser, thumbObservePrompt, thumbSynthUser, type ThumbAnalysis, type ThumbAttach, type ThumbConcept, type ThumbObs } from "../_shared/thumb.ts";
import { LOGO_INSPECT_PROMPT, LOGO_INSPECT_SYSTEM, LOGO_TRAIN_PROMPT, LOGO_TRAIN_SYSTEM, brandingPlanSystem, brandingPlanUser, buildLogoPrompt, buildLogoRefinePrompt, buildMockupPrompt, compileLogoSkill, defaultScenes, logoIdeateSystem, logoIdeateUser, sanitizeConcepts, sanitizeForm, sanitizeInspect, sanitizeLogoAnalysis, sanitizeScenes, type LogoAnalysis, type LogoAttach } from "../_shared/logo.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

class Fail extends Error { constructor(msg: string, public status = 400, public code?: string) { super(msg); } }

// ---------- utilidades ----------
const b64ToBytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
function bytesToB64(u8: Uint8Array) {
  let s = ""; const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) s += String.fromCharCode(...u8.subarray(i, i + chunk));
  return btoa(s);
}
async function open(stored: string) {
  if (stored.startsWith("plain:")) return stored.slice(6);
  const raw = Deno.env.get("STUDIO_ENC_KEY");
  if (!raw) throw new Fail("STUDIO_ENC_KEY ausente: não foi possível ler a chave criptografada.", 500);
  const [, , iv, ct] = stored.split(":");
  const key = await crypto.subtle.importKey("raw", b64ToBytes(raw), "AES-GCM", false, ["decrypt"]);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBytes(iv) }, key, b64ToBytes(ct)));
}

const parseAspect = (a: string): [number, number] => {
  const m = /^(\d+(?:\.\d+)?)\s*[:xX/]\s*(\d+(?:\.\d+)?)$/.exec(a.trim());
  return m ? [Number(m[1]), Number(m[2])] : [4, 5];
};
function nearest(aspect: string, options: string[], sep = ":") {
  const [w, h] = parseAspect(aspect); const r = w / h;
  return options.map((o) => { const [x, y] = parseAspect(o.replace(sep, ":")); return { o, d: Math.abs(Math.log(x / y / r)) }; }).sort((a, b) => a.d - b.d)[0].o;
}
/** Tamanho final em pixels (largura 1080 como no Instagram; lado maior limitado a 2048). */
function targetSize(aspect: string): [number, number] {
  const [w, h] = parseAspect(aspect); const r = w / h;
  const W = r >= 1 ? 1080 * Math.min(r, 1.91) : 1080; const H = Math.round(W / r);
  return [Math.round(W), Math.min(H, 2048)];
}
const px16 = (n: number) => Math.max(256, Math.round(n / 16) * 16);

/** Recorta (centro) e redimensiona para a proporção exata pedida. Se a biblioteca não carregar, devolve o original. */
async function finalize(bytes: Uint8Array, aspect: string, opts: { flatten?: boolean } = {}): Promise<{ bytes: Uint8Array; w?: number; h?: number }> {
  try {
    const { Image } = await import("https://deno.land/x/imagescript@1.3.0/mod.ts");
    let img = await Image.decode(bytes);
    // logos: o modelo pode devolver PNG com fundo transparente; achata sobre branco para a arte ser sempre "logo em fundo branco"
    if (opts.flatten) { const white = new Image(img.width, img.height); white.fill(0xffffffff); white.composite(img); img = white; }
    const [aw, ah] = parseAspect(aspect); const want = aw / ah; const have = img.width / img.height;
    let { width: w, height: h } = img; let x = 0, y = 0;
    if (have > want * 1.005) { w = Math.round(h * want); x = Math.round((img.width - w) / 2); }
    else if (have < want / 1.005) { h = Math.round(w / want); y = Math.round((img.height - h) / 2); }
    let out = (x || y) ? img.crop(x, y, w, h) : img;
    const [tw, th] = targetSize(aspect);
    if (out.width > tw) out = out.resize(tw, th);
    return { bytes: await out.encode(), w: out.width, h: out.height };
  } catch (_) {
    return { bytes };
  }
}

// ---------- provedores ----------
interface Ref { name: string; mime: string; bytes: Uint8Array; url?: string }
interface GenInput {
  provider: string; apiModel: string; key: string; baseUrl?: string | null; prompt: string; aspect: string; quality: string
  refs: Ref[]; edit?: { image: Ref; mask?: Ref; annotated?: Ref }
}

const blob = (r: Ref) => new Blob([r.bytes], { type: r.mime });
async function mustOk(res: Response, label: string) {
  if (res.ok) return res;
  let detail = ""; try { detail = (await res.text()).slice(0, 400); } catch (_) { /* noop */ }
  throw new Fail(`${label}: ${res.status} ${detail}`.trim(), 502);
}
async function fetchBytes(url: string) { return new Uint8Array(await (await mustOk(await fetch(url), "Download da imagem")).arrayBuffer()); }

type Usage = { input_tokens?: number; output_tokens?: number; input_tokens_details?: { text_tokens?: number; image_tokens?: number } } | null;
interface Out { bytes: Uint8Array; usage?: Usage }

/** Custo em US$ a partir do "usage" (tabela de tokens da OpenAI: texto de entrada 5, imagem de entrada 8, imagem de saída 30 por 1M). */
function costFromUsage(provider: string, u?: Usage): number | null {
  return provider === "openai" ? usageCost(u) : null;
}

async function openaiLike(i: GenInput, base: string): Promise<Out> {
  const r = await openaiImage({ key: i.key, base, model: i.apiModel, prompt: i.prompt, aspect: i.aspect, quality: i.quality, refs: i.refs, edit: i.edit ? { image: i.edit.image, mask: i.edit.mask } : undefined });
  return { bytes: r.bytes, usage: r.usage };
}

async function google(i: GenInput): Promise<Uint8Array> {
  const base = "https://generativelanguage.googleapis.com/v1beta/models";
  const headers = { "x-goog-api-key": i.key, "Content-Type": "application/json" };
  if (i.apiModel.startsWith("imagen")) {
    const res = await fetch(`${base}/${i.apiModel}:predict`, {
      method: "POST", headers,
      body: JSON.stringify({ instances: [{ prompt: i.prompt }], parameters: { sampleCount: 1, aspectRatio: nearest(i.aspect, ["1:1", "3:4", "4:3", "9:16", "16:9"]) } }),
    });
    const data = await (await mustOk(res, "Google Imagen")).json();
    const b = data?.predictions?.[0]?.bytesBase64Encoded;
    if (!b) throw new Fail("A API não devolveu imagem.", 502);
    return b64ToBytes(b);
  }
  const parts: Record<string, unknown>[] = [{ text: i.prompt }];
  const imgs = i.edit ? [i.edit.image, ...(i.edit.annotated ? [i.edit.annotated] : [])] : i.refs;
  imgs.forEach((r) => parts.push({ inlineData: { mimeType: r.mime, data: bytesToB64(r.bytes) } }));
  const res = await fetch(`${base}/${i.apiModel}:generateContent`, {
    method: "POST", headers,
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: nearest(i.aspect, ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"]) } },
    }),
  });
  const data = await (await mustOk(res, "Google Gemini")).json();
  const out = (data?.candidates?.[0]?.content?.parts ?? []).find((p: { inlineData?: { data: string } }) => p.inlineData?.data);
  if (!out) throw new Fail(data?.candidates?.[0]?.finishReason ? `O modelo não gerou imagem (${data.candidates[0].finishReason}).` : "A API não devolveu imagem.", 502);
  return b64ToBytes(out.inlineData.data);
}

async function fal(i: GenInput): Promise<Uint8Array> {
  const [w, h] = parseAspect(i.aspect); const r = w / h;
  const W = px16(r >= 1 ? 1536 : 1536 * r), H = px16(r >= 1 ? 1536 / r : 1536);
  const body: Record<string, unknown> = { prompt: i.prompt, image_size: { width: W, height: H }, num_images: 1, output_format: "png" };
  const urls = (i.edit ? [i.edit.image] : i.refs).map((r) => r.url).filter(Boolean);
  if (urls.length) { body.image_url = urls[0]; body.image_urls = urls; }
  const res = await fetch(`https://fal.run/${i.apiModel}`, { method: "POST", headers: { Authorization: `Key ${i.key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await (await mustOk(res, "fal.ai")).json();
  const url = data?.images?.[0]?.url ?? data?.image?.url;
  if (!url) throw new Fail("A API não devolveu imagem.", 502);
  return await fetchBytes(url);
}

async function ideogram(i: GenInput): Promise<Uint8Array> {
  const fd = new FormData();
  fd.set("prompt", i.prompt); fd.set("rendering_speed", "DEFAULT");
  fd.set("aspect_ratio", nearest(i.aspect, ["1x1", "4x5", "5x4", "3x4", "4x3", "2x3", "3x2", "9x16", "16x9", "10x16", "16x10"], "x").replace(":", "x"));
  const res = await fetch("https://api.ideogram.ai/v1/ideogram-v3/generate", { method: "POST", headers: { "Api-Key": i.key }, body: fd });
  const data = await (await mustOk(res, "Ideogram")).json();
  if (!data?.data?.[0]?.url) throw new Fail("A API não devolveu imagem.", 502);
  return await fetchBytes(data.data[0].url);
}

async function stability(i: GenInput): Promise<Uint8Array> {
  const fd = new FormData();
  fd.set("prompt", i.prompt); fd.set("output_format", "png"); fd.set("model", i.apiModel);
  fd.set("aspect_ratio", nearest(i.aspect, ["1:1", "2:3", "3:2", "4:5", "5:4", "9:16", "16:9", "9:21", "21:9"]));
  const res = await fetch("https://api.stability.ai/v2beta/stable-image/generate/sd3", { method: "POST", headers: { Authorization: `Bearer ${i.key}`, Accept: "image/*" }, body: fd });
  return new Uint8Array(await (await mustOk(res, "Stability AI")).arrayBuffer());
}

async function recraft(i: GenInput): Promise<Uint8Array> {
  const size = nearest(i.aspect, ["1024x1024", "1024x1280", "1280x1024", "1024x1707", "1707x1024", "1024x1365", "1365x1024"], "x");
  const res = await fetch("https://external.api.recraft.ai/v1/images/generations", {
    method: "POST", headers: { Authorization: `Bearer ${i.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: i.prompt, size, model: i.apiModel }),
  });
  const data = await (await mustOk(res, "Recraft")).json();
  if (!data?.data?.[0]?.url) throw new Fail("A API não devolveu imagem.", 502);
  return await fetchBytes(data.data[0].url);
}

async function runProvider(i: GenInput): Promise<Out> {
  switch (i.provider) {
    case "openai": return openaiLike(i, "https://api.openai.com/v1");
    case "custom": return openaiLike(i, (i.baseUrl ?? "").replace(/\/$/, ""));
    case "google": return { bytes: await google(i) };
    case "fal": return { bytes: await fal(i) };
    case "ideogram": return { bytes: await ideogram(i) };
    case "stability": return { bytes: await stability(i) };
    case "recraft": return { bytes: await recraft(i) };
    default: throw new Fail(`Provedor sem suporte: ${i.provider}`);
  }
}

// ---------- texto (LLM) ----------
async function chat(key: string, model: string, system: string, user: unknown, jsonMode = false): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model, messages: [{ role: "system", content: system }, { role: "user", content: user }],
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  const data = await (await mustOk(res, "OpenAI (texto)")).json();
  return data?.choices?.[0]?.message?.content ?? "";
}

// ---------- prompt ----------
const clip = (s: string | null | undefined, n: number) => (s ?? "").slice(0, n);

// ---------- handler ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    // O worker da VPS chama só as ações de vídeo, autenticado com a service role
    const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (bearer && bearer === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
      const wb = await req.json();
      const wa = String(wb.action ?? "");
      const wctx = { asCaller: admin, admin, userId: "worker" };
      if (wa === "video_plan") return json(await videoPlan(wctx, wb));
      if (wa === "video_analyze") return json(await videoAnalyze(wctx, wb));
      throw new Fail("Ação não permitida para o worker", 403);
    }
    const asCaller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: me } = await asCaller.auth.getUser();
    if (!me?.user) throw new Fail("Sessão inválida", 401);
    const { data: prof } = await admin.from("profiles").select("role, active").eq("id", me.user.id).single();
    if (!prof?.active || !["admin", "collaborator"].includes(prof.role)) throw new Fail("Sem permissão", 403);

    const body = await req.json();
    const action = String(body.action ?? "");
    const ctx = { asCaller, admin, userId: me.user.id };
    if (action === "image" || action === "edit") return json(await generateImage(ctx, body, action === "edit"));
    if (action === "plan") return json(await plan(ctx, body));
    if (action === "enhance") return json(await enhance(ctx, body));
    if (action === "train") return json(await train(ctx, body));
    if (action === "ideate") return json(await ideate(ctx, body));
    if (action === "train_agent") return json(await trainAgent(ctx));
    if (action === "brand_brief") return json(await brandBrief(ctx, body));
    if (action === "train_styles") return json(await trainStyles(ctx));
    if (action === "read_text") return json(await readText(ctx, body));
    if (action === "transcribe") return json(await transcribe(ctx, body));
    if (action === "describe_asset") return json(await describeAsset(ctx, body));
    if (action === "brand_import") return json(await brandImport(ctx, body));
    if (action === "video_analyze") return json(await videoAnalyze(ctx, body));
    if (action === "logo_train") return json(await logoTrain(ctx, body));
    if (action === "logo_ideate") return json(await logoIdeate(ctx, body));
    if (action === "logo_image") return json(await logoImage(ctx, body));
    if (action === "logo_inspect") return json(await logoInspect(ctx, body));
    if (action === "logo_branding_plan") return json(await logoBrandingPlan(ctx, body));
    if (action === "logo_branding_image") return json(await logoBrandingImage(ctx, body));
    if (action === "thumb_observe") return json(await thumbObserve(ctx, body));
    if (action === "thumb_train") return json(await thumbTrain(ctx, body));
    if (action === "thumb_ideate") return json(await thumbIdeate(ctx, body));
    if (action === "thumb_image") return json(await thumbImage(ctx, body));
    throw new Fail("Ação desconhecida");
  } catch (e) {
    if (e instanceof Fail) return json({ error: e.message, code: e.code }, e.status);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

interface Ctx { asCaller: SupabaseClient; admin: SupabaseClient; userId: string }

async function providerKey(ctx: Ctx, provider: string) {
  const { data } = await ctx.admin.from("studio_provider_keys").select("api_key, base_url").eq("provider", provider).maybeSingle();
  if (!data) throw new Fail(`Nenhuma chave de API salva para "${provider}". Cadastre em Modelos e APIs.`, 400, "no_key");
  return { key: await open(data.api_key), baseUrl: data.base_url as string | null };
}
async function settings(ctx: Ctx) {
  const { data } = await ctx.admin.from("studio_settings").select("*").eq("id", 1).single();
  return data as { text_model: string; default_model: string; agent_playbook: string | null; style_visuals: Record<string, unknown> | null; agent_notes: AgentNotes | null; agent_version: number; refs_per_slide: number };
}
async function download(ctx: Ctx, path: string): Promise<Ref> {
  const { data, error } = await ctx.admin.storage.from("studio").download(path);
  if (error || !data) throw new Fail(`Arquivo não encontrado no Storage: ${path}`, 404);
  const { data: s } = await ctx.admin.storage.from("studio").createSignedUrl(path, 600);
  return { name: path.split("/").pop() ?? "ref.png", mime: data.type || "image/png", bytes: new Uint8Array(await data.arrayBuffer()), url: s?.signedUrl };
}

async function rollup(ctx: Ctx, generationId: string) {
  const { data } = await ctx.admin.from("studio_images").select("status").eq("generation_id", generationId).eq("is_current", true);
  const st = (data ?? []).map((r) => r.status as string);
  if (st.some((s) => s === "queued" || s === "running")) return;
  const status = st.every((s) => s === "done") ? "done" : st.some((s) => s === "done") ? "partial" : "error";
  await ctx.admin.from("studio_generations").update({ status }).eq("id", generationId);
}

async function generateImage(ctx: Ctx, body: Record<string, unknown>, isEdit: boolean) {
  const id = String(body.image_id ?? "");
  const { data: img } = await ctx.asCaller.from("studio_images").select("*").eq("id", id).single();
  if (!img) throw new Fail("Imagem não encontrada ou sem permissão.", 404);
  const { data: gen } = await ctx.asCaller.from("studio_generations").select("*").eq("id", img.generation_id).single();
  const { data: brand } = await ctx.asCaller.from("studio_brands").select("*").eq("id", img.brand_id).single();
  if (!gen || !brand) throw new Fail("Geração ou marca não encontrada.", 404);
  await ctx.admin.from("studio_images").update({ status: "running", error: null }).eq("id", id);

  try {
    const { data: model } = await ctx.admin.from("studio_models").select("*").eq("id", (isEdit && body.model_id) ? String(body.model_id) : gen.model_id).single();
    if (!model) throw new Fail("Modelo não encontrado. Escolha outro modelo.");
    const { key, baseUrl } = await providerKey(ctx, model.provider);
    const caps = (model.capabilities ?? {}) as Record<string, boolean>;

    // Skill base + skill da marca (e só dela)
    const { data: base } = await ctx.admin.from("studio_brands").select("skill_doc").eq("is_base", true).maybeSingle();
    const brandDoc = brand.is_base ? null : brand.skill_doc;
    const baseDoc = brand.is_base ? brand.skill_doc : base?.skill_doc;

    // Referências: escolhidas no slide, senão logo + favoritas + recentes da própria marca
    let refs: Ref[] = [];
    const attach: Attachment[] = [];
    const logoPlan = ((gen.meta as Record<string, unknown> | null)?.logo ?? null) as LogoPlan | null;
    const competitor = ((gen.meta as Record<string, unknown> | null)?.competitor ?? null) as CompetitorPlan | null;
    let hasPrev = false;
    let edit: GenInput["edit"];
    if (isEdit) {
      if (!caps.edit) throw new Fail(`${model.name} não suporta edição. Escolha um modelo com edição (ex.: GPT Image 2.5).`);
      const { data: parent } = await ctx.asCaller.from("studio_images").select("storage_path").eq("id", img.parent_id).single();
      if (!parent?.storage_path) throw new Fail("Imagem original não encontrada.");
      edit = { image: await download(ctx, parent.storage_path) };
      if (body.mask_b64) edit.mask = { name: "mask.png", mime: "image/png", bytes: b64ToBytes(String(body.mask_b64)) };
      if (body.annotated_b64) edit.annotated = { name: "annotated.jpg", mime: "image/jpeg", bytes: b64ToBytes(String(body.annotated_b64)) };
    } else if (caps.refs) {
      const ids: string[] = img.ref_asset_ids ?? [];
      const { data: all } = await ctx.admin.from("studio_assets").select("id, kind, storage_path, thumb_path, favorite, tags, label, caption, created_at").eq("brand_id", brand.id)
        .order("favorite", { ascending: false }).order("created_at", { ascending: false }).limit(300);
      // cada imagem de referência é cobrada como entrada: o padrão são poucas (logo + N favoritas), configurável em studio_settings.refs_per_slide
      const perSlide = (await settings(ctx)).refs_per_slide ?? 3;
      const st = (gen.meta?.style as string | undefined) ?? null;
      const picked = selectImageRefs({ pool: all ?? [], ids, style: st, perSlide, logo: logoPlan, idx: img.slide_index, competitor, mainLogoId: brand.logo_asset_id });
      if (gen.kind === "carousel" && img.slide_index > 1) {
        const { data: first } = await ctx.admin.from("studio_images").select("storage_path").eq("generation_id", gen.id).eq("slide_index", 1).eq("is_current", true).eq("status", "done").maybeSingle();
        if (first?.storage_path) { refs.push(await download(ctx, first.storage_path)); attach.push({ role: "prev" }); hasPrev = true; }
      }
      // personagens, objetos e a logo vão em boa resolução; referências de estilo e concorrentes, em miniatura
      const loaded = await Promise.all(picked.map((p) => download(ctx, (p.role === "style" || p.role === "competitor") ? (p.asset.thumb_path ?? p.asset.storage_path) : p.asset.storage_path)));
      picked.forEach((p, i) => { refs.push(loaded[i]); attach.push({ role: p.role, label: p.asset.label, kind: p.asset.kind, description: p.asset.caption }); });
    }

    let prompt = isEdit
      ? buildEditPrompt(img.edit_markers, img.edit_note, !!(edit?.mask), !!(edit?.annotated))
      : buildPrompt({
        base: baseDoc, brand: brandDoc, brandName: brand.name, kind: gen.kind, aspect: gen.aspect, idx: img.slide_index,
        total: Number(gen.meta?.total ?? 1), role: img.role, text: img.slide_text, notes: img.slide_notes, hasRefs: refs.length - (hasPrev ? 1 : 0) > 0, hasPrev, attach, logo: logoPlan, competitor,
        style: ((gen.meta?.style as string | undefined) === "solido" || (gen.meta?.style as string | undefined) === "humanizado" ? gen.meta.style : null) as VisualStyle,
      });
    if (!isEdit && img.prompt && img.prompt.trim() && img.prompt !== img.slide_text && !img.prompt.includes("# TAREFA")) prompt += `\n\nInstrução adicional do usuário: ${img.prompt}`;

    const raw = await runProvider({ provider: model.provider, apiModel: model.api_model, key, baseUrl, prompt, aspect: gen.aspect, quality: gen.quality, refs, edit });
    const fin = await finalize(raw.bytes, gen.aspect);
    const path = `${brand.id}/${gen.id}/${img.id}.png`;
    const up = await ctx.admin.storage.from("studio").upload(path, fin.bytes, { contentType: "image/png", upsert: true });
    if (up.error) throw new Fail(`Falha ao salvar a imagem: ${up.error.message}`, 500);
    await ctx.admin.from("studio_images").update({
      status: "done", storage_path: path, width: fin.w ?? null, height: fin.h ?? null, prompt: prompt.slice(0, 12000),
      usage: raw.usage ?? null, cost_usd: costFromUsage(model.provider, raw.usage),
    }).eq("id", id);
    await rollup(ctx, gen.id);
    return { ok: true, path };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await ctx.admin.from("studio_images").update({ status: "error", error: msg.slice(0, 600) }).eq("id", id);
    await rollup(ctx, gen.id);
    throw e;
  }
}

async function textKey(ctx: Ctx) {
  const { key } = await providerKey(ctx, "openai");
  const s = await settings(ctx);
  return { key, model: s.text_model };
}

async function plan(ctx: Ctx, body: Record<string, unknown>) {
  const { key, model } = await textKey(ctx);
  const brandId = String(body.brand_id ?? "");
  const { data: brand } = await ctx.asCaller.from("studio_brands").select("name, skill_doc, hashtags, cta").eq("id", brandId).single();
  const sys = planSystem({ brandName: brand?.name ?? "", brandDoc: brand?.skill_doc, kind: String(body.kind ?? "carousel"), count: Number(body.count ?? 0), preset: (body.preset as string) ?? null, cta: brand?.cta, hashtags: brand?.hashtags });
  const out = await chat(key, model, sys, String(body.text ?? ""), true);
  const parsed = JSON.parse(out);
  return { ok: true, slides: parsed.slides ?? [], caption: parsed.caption ?? "", hashtags: parsed.hashtags ?? [] };
}

async function enhance(ctx: Ctx, body: Record<string, unknown>) {
  const { key, model } = await textKey(ctx);
  const brandId = String(body.brand_id ?? "");
  const { data: brand } = await ctx.asCaller.from("studio_brands").select("name, skill_doc").eq("id", brandId).single();
  const sys = enhanceSystem({ brandName: brand?.name ?? "", brandDoc: brand?.skill_doc, kind: String(body.kind ?? "carousel") });
  return { ok: true, text: (await chat(key, model, sys, String(body.prompt ?? ""))).trim() };
}

async function train(ctx: Ctx, body: Record<string, unknown>) {
  const { key, model } = await textKey(ctx);
  const brandId = String(body.brand_id ?? "");
  const { data: brand } = await ctx.asCaller.from("studio_brands").select("id, name").eq("id", brandId).single();
  if (!brand) throw new Fail("Marca não encontrada.", 404);
  const { data: assets } = await ctx.admin.from("studio_assets").select("storage_path, thumb_path, favorite").eq("brand_id", brandId).eq("kind", "reference")
    .order("favorite", { ascending: false }).order("created_at", { ascending: false }).limit(12);
  if (!assets?.length) throw new Fail("Envie imagens de referência antes de treinar a análise visual.", 400, "no_refs");
  const content: unknown[] = [{ type: "text", text: TRAIN_VISION_PROMPT }];
  for (const a of assets) {
    const ref = await download(ctx, a.thumb_path ?? a.storage_path);
    content.push({ type: "image_url", image_url: { url: `data:${ref.mime};base64,${bytesToB64(ref.bytes)}`, detail: "low" } });
  }
  const out = await chat(key, model, TRAIN_VISION_SYSTEM, content, true);
  const analysis = JSON.parse(out);
  await ctx.admin.from("studio_brands").update({ style_analysis: analysis }).eq("id", brandId);
  return { ok: true, analysis, analyzed: assets.length };
}

// ---------- agente "designer" (criador de prompts) ----------
async function ideate(ctx: Ctx, body: Record<string, unknown>) {
  const { key, model } = await textKey(ctx);
  const s = await settings(ctx);
  const brandId = String(body.brand_id ?? "");
  const { data: brand } = await ctx.asCaller.from("studio_brands").select("name, is_base, skill_doc, hashtags, cta, font_prefs").eq("id", brandId).single();
  if (!brand) throw new Fail("Marca não encontrada.", 404);
  const fr = body.fonts as { list?: string[]; style?: string; override?: boolean } | undefined;
  const brandList: string[] = (brand.font_prefs as { list?: string[] } | null)?.list ?? [];
  const fonts = { list: fr?.override ? (fr.list ?? []) : (fr?.list?.length ? fr.list : brandList), style: fr?.style ?? "", override: !!fr?.override, brandNotes: (brand.font_prefs as { notes?: string } | null)?.notes };
  const { data: base } = await ctx.admin.from("studio_brands").select("skill_doc").eq("is_base", true).maybeSingle();
  const idea = String(body.idea ?? "").trim();
  if (idea.length < 3) throw new Fail("Escreva a ideia, o tema ou o roteiro.");
  const refine = !!(body.previous && body.feedback);
  const cast: CastItem[] = (Array.isArray(body.cast) ? body.cast : []).map((c: Record<string, unknown>) => ({ id: String(c.id ?? ""), kind: c.kind === "object" ? "object" : "character", label: String(c.label ?? "").slice(0, 60), description: c.description ? String(c.description).slice(0, 600) : null } as CastItem)).filter((c: CastItem) => c.label).slice(0, 12);
  const comp = (body.competitor ?? null) as { asset_ids?: string[]; intensity?: number } | null;
  const compImgs: unknown[] = [];
  if (comp?.asset_ids?.length) {
    const { data: ca } = await ctx.admin.from("studio_assets").select("storage_path, thumb_path").eq("brand_id", brandId).eq("kind", "competitor").in("id", comp.asset_ids.slice(0, 4));
    for (const a of ca ?? []) { const r = await download(ctx, a.thumb_path ?? a.storage_path); compImgs.push({ type: "image_url", image_url: { url: `data:${r.mime};base64,${bytesToB64(r.bytes)}`, detail: "low" } }); }
  }
  const sys = ideateSystem({
    brandName: brand.name, isBase: !!brand.is_base, brandDoc: brand.skill_doc, baseDoc: base?.skill_doc, playbook: s.agent_playbook, notes: s.agent_notes,
    kind: String(body.kind ?? "carousel"), count: Number(body.count ?? 0), platform: String(body.platform ?? "instagram"), think: body.think !== false, follow: !!body.follow,
    cta: brand.cta, hashtags: brand.hashtags ?? [], refine, fonts, styleVisuals: s.style_visuals,
    visualStyle: (["solido", "humanizado"].includes(String(body.visual_style)) ? String(body.visual_style) : null) as VisualStyle,
    cast, logoNote: body.logo_note ? String(body.logo_note) : null, competitor: compImgs.length ? { intensity: Number(comp?.intensity ?? 50), n: compImgs.length } : null,
  });
  const userText = ideateUser({ idea, previous: body.previous, feedback: body.feedback ? String(body.feedback) : undefined });
  const user: unknown = compImgs.length ? [{ type: "text", text: userText }, ...compImgs] : userText;
  const out = await chat(key, model, sys, user, true);
  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(out); } catch { throw new Fail("A IA devolveu uma resposta fora do formato. Tente de novo.", 502); }
  const slides = sanitizeSlides(Array.isArray(parsed.slides) ? parsed.slides : [], body.kind === "static");
  if (!slides.length) throw new Fail("A IA não devolveu slides. Tente de novo com mais detalhes.", 502);
  return {
    ok: true, model, topic: parsed.topic ?? "", visual_style: parsed.visual_style ?? body.visual_style ?? null, type_system: parsed.type_system ?? null, angle: parsed.angle ?? "", hooks: parsed.hooks ?? [], slides: body.kind === "static" ? slides.slice(0, 1) : slides,
    caption: parsed.caption ?? "", hashtags: parsed.hashtags ?? [], checks: parsed.checks ?? [], rationale: parsed.rationale ?? "",
    debug: { system: sys, user: userText, model, playbook: !!s.agent_playbook, brand_skill: !!brand.skill_doc && !brand.is_base, base_skill: !!base?.skill_doc },
  };
}

async function trainAgent(ctx: Ctx) {
  const { key, model } = await textKey(ctx);
  const { data: base } = await ctx.admin.from("studio_brands").select("skill_doc, style_analysis").eq("is_base", true).maybeSingle();
  const { data: st } = await ctx.admin.from("studio_settings").select("agent_notes, agent_version").eq("id", 1).single();
  if (!base?.skill_doc) throw new Fail("Treine a skill base antes (passo anterior).", 400, "no_base");
  const playbook = (await chat(key, model, TRAIN_AGENT_SYSTEM, trainAgentUser({ baseDoc: base.skill_doc, analysis: base.style_analysis, notes: st?.agent_notes }))).trim();
  if (playbook.length < 200) throw new Fail("A IA devolveu um manual curto demais. Tente de novo.", 502);
  const version = (st?.agent_version ?? 0) + 1;
  await ctx.admin.from("studio_settings").update({ agent_playbook: playbook, agent_version: version, agent_trained_at: new Date().toISOString() }).eq("id", 1);
  return { ok: true, playbook, version, model };
}

async function brandBrief(ctx: Ctx, body: Record<string, unknown>) {
  const { key, model } = await textKey(ctx);
  const s = await settings(ctx);
  const brandId = String(body.brand_id ?? "");
  const { data: brand } = await ctx.asCaller.from("studio_brands").select("id, name, is_base").eq("id", brandId).single();
  if (!brand) throw new Fail("Marca não encontrada.", 404);
  const { data: base } = await ctx.admin.from("studio_brands").select("skill_doc").eq("is_base", true).maybeSingle();
  const brief = (body.brief ?? {}) as Record<string, string>;
  const name = String(body.name ?? brand.name);
  if (![brief.about, brief.products, body.website].some((x) => String(x ?? "").trim().length > 3)) throw new Fail("Conte o que a empresa faz (ou informe o site) para a IA montar a base de treino.");
  const website = String(body.website ?? "").trim();
  const site = website && body.read_site !== false ? await fetchSite(website) : null;
  const sys = brandBuilderSystem({ baseDoc: base?.skill_doc, notes: s.agent_notes });
  const user = brandBuilderUser({ name, website, segment: body.segment ? String(body.segment) : null, handle: body.handle ? String(body.handle) : null, brief, site });
  const out = await chat(key, model, sys, user, true);
  let p: Record<string, unknown>;
  try { p = JSON.parse(out); } catch { throw new Fail("A IA devolveu uma resposta fora do formato. Tente de novo.", 502); }
  // cores: só as que realmente vieram do site (a IA não pode inventar paleta)
  const real = new Set((site?.colors ?? []).map((c) => c.toUpperCase()));
  const colors = (Array.isArray(p.colors) ? p.colors : []).filter((c: { hex?: string }) => c?.hex && real.has(String(c.hex).toUpperCase()));
  return { ok: true, model, ...p, colors, site: site ? { fetched: true, title: site.title, colors: site.colors, fonts: site.fonts } : { fetched: false, requested: !!website } };
}

/** Treina o visual dos estilos: a IA de visão analisa as referências marcadas como "solido" e "humanizado" na biblioteca da skill base */
async function trainStyles(ctx: Ctx) {
  const { key, model } = await textKey(ctx);
  const { data: base } = await ctx.admin.from("studio_brands").select("id").eq("is_base", true).maybeSingle();
  if (!base) throw new Fail("Skill base não encontrada.", 404);
  const { data: all } = await ctx.admin.from("studio_assets").select("storage_path, thumb_path, tags, favorite").eq("brand_id", base.id).eq("kind", "reference");
  const out: Record<string, unknown> = {}; const counts: Record<string, number> = {};
  for (const style of ["solido", "humanizado"] as const) {
    const refs = (all ?? []).filter((a) => (a.tags ?? []).includes(style)).slice(0, 9);
    counts[style] = refs.length;
    if (!refs.length) continue;
    const content: unknown[] = [{ type: "text", text: styleVisionPrompt(style) }];
    for (const a of refs) { const r = await download(ctx, a.thumb_path ?? a.storage_path); content.push({ type: "image_url", image_url: { url: `data:${r.mime};base64,${bytesToB64(r.bytes)}`, detail: "low" } }); }
    out[style] = JSON.parse(await chat(key, model, STYLE_VISION_SYSTEM, content, true));
  }
  if (!Object.keys(out).length) throw new Fail("Marque referências como Sólido ou Humanizado na biblioteca da skill base antes de treinar os estilos.", 400, "no_style_refs");
  const { data: cur } = await ctx.admin.from("studio_settings").select("style_visuals").eq("id", 1).single();
  await ctx.admin.from("studio_settings").update({ style_visuals: { ...(cur?.style_visuals ?? {}), ...out } }).eq("id", 1);
  return { ok: true, model, styles: out, counts };
}

/** Remover IA › camadas de texto: a IA de visão localiza cada bloco de texto da arte (texto + caixa em %) */
async function readText(ctx: Ctx, body: Record<string, unknown>) {
  const { key, model } = await textKey(ctx);
  const { data: img } = await ctx.asCaller.from("studio_images").select("storage_path").eq("id", String(body.image_id ?? "")).single();
  if (!img?.storage_path) throw new Fail("Imagem não encontrada ou sem permissão.", 404);
  const ref = await download(ctx, img.storage_path);
  const content = [{ type: "text", text: READ_TEXT_PROMPT }, { type: "image_url", image_url: { url: `data:${ref.mime};base64,${bytesToB64(ref.bytes)}`, detail: "high" } }];
  const parsed = JSON.parse(await chat(key, model, READ_TEXT_SYSTEM, content, true));
  return { ok: true, model, blocks: Array.isArray(parsed.blocks) ? parsed.blocks : [] };
}

// ---------- ditado por voz ----------
async function transcribe(ctx: Ctx, body: Record<string, unknown>) {
  const { key } = await providerKey(ctx, "openai");
  const audio = String(body.audio_b64 ?? "");
  if (audio.length < 200) throw new Fail("Áudio vazio.");
  if (audio.length > 34_000_000) throw new Fail("Trecho de áudio grande demais (máx. ~25 MB).");
  const vocab = Array.isArray(body.vocab) ? (body.vocab as unknown[]).map(String) : [];
  const r = await transcribeAudio({ key, bytes: b64ToBytes(audio), mime: String(body.mime ?? "audio/webm"), prompt: vocabularyPrompt(["Forte Company", "GPT Image 2.6 Sunburst", "GPT-6 Luna", "IA", "carrossel", "Instagram", "TikTok", "CTA", ...vocab], body.tail ? String(body.tail) : undefined) });
  return { ok: true, text: r.text, model: r.model };
}

// ---------- personagem/objeto: descrição por IA de visão ----------
async function describeAsset(ctx: Ctx, body: Record<string, unknown>) {
  const { key, model } = await textKey(ctx);
  const { data: a } = await ctx.asCaller.from("studio_assets").select("id, kind, label, storage_path, thumb_path").eq("id", String(body.asset_id ?? "")).single();
  if (!a || !isCast(a.kind)) throw new Fail("Personagem/objeto não encontrado.", 404);
  const ref = await download(ctx, a.thumb_path ?? a.storage_path);
  const content = [{ type: "text", text: describePrompt(a.kind, a.label) }, { type: "image_url", image_url: { url: `data:${ref.mime};base64,${bytesToB64(ref.bytes)}`, detail: "high" } }];
  const p = JSON.parse(await chat(key, model, DESCRIBE_SYSTEM, content, true));
  const description = String(p.description ?? "").trim();
  if (!description) throw new Fail("A IA não conseguiu descrever a imagem.", 502);
  await ctx.admin.from("studio_assets").update({ caption: description }).eq("id", a.id);
  return { ok: true, description, short: String(p.short ?? ""), model };
}

// ---------- documentos da empresa → campos do treinamento ----------
async function brandImport(ctx: Ctx, body: Record<string, unknown>) {
  const { key, model } = await textKey(ctx);
  const s = await settings(ctx);
  const brandId = String(body.brand_id ?? "");
  const { data: brand } = await ctx.asCaller.from("studio_brands").select("id, name, is_base").eq("id", brandId).single();
  if (!brand) throw new Fail("Marca não encontrada.", 404);
  const docIds = (Array.isArray(body.doc_ids) ? body.doc_ids : []).map(String);
  const { data: docs } = await ctx.asCaller.from("studio_brand_docs").select("*").eq("brand_id", brandId).in("id", docIds);
  const list = (docs ?? []).filter((d) => d.storage_path || d.extracted_text);
  if (!list.length) throw new Fail("Envie ao menos um documento.");
  const { data: base } = await ctx.admin.from("studio_brands").select("skill_doc").eq("is_base", true).maybeSingle();
  const website = String(body.website ?? "").trim();
  const site = website && body.read_site !== false ? await fetchSite(website) : null;

  const numbered = list.map((d, i) => ({ d, n: i + 1 }));
  const parts: unknown[] = [];
  const images: { n: number; doc: typeof list[number] }[] = [];
  let pdfBytes = 0;
  for (const { d, n } of numbered) {
    if (d.kind === "image" && d.storage_path && images.length < 12) images.push({ n, doc: d });
    else if (/pdf/i.test(d.mime_type ?? "") && d.storage_path && pdfBytes < 22_000_000) {
      const f = await download(ctx, d.storage_path); pdfBytes += f.bytes.length;
      parts.push({ type: "file", file: { filename: d.name.replace(/[^\w.\- ]+/g, "_"), file_data: `data:application/pdf;base64,${bytesToB64(f.bytes)}` } });
    }
  }
  const intro = brandImportIntro({ name: String(body.name ?? brand.name), website, segment: body.segment ? String(body.segment) : null, handle: body.handle ? String(body.handle) : null,
    docs: numbered.map(({ d, n }) => ({ n, name: d.name, kind: d.kind, text: d.extracted_text })), site, hasImages: images.length > 0 });
  const content: unknown[] = [{ type: "text", text: intro }, ...parts];
  images.forEach(({ n, doc }, i) => { content.push({ type: "text", text: `IMAGEM índice ${i} = arquivo [${n}] ${doc.name}` }); });
  for (const { doc } of images) { const r = await download(ctx, doc.storage_path); content.push({ type: "image_url", image_url: { url: `data:${r.mime};base64,${bytesToB64(r.bytes)}`, detail: "auto" } }); }

  const out = await chat(key, model, brandImportSystem({ baseDoc: base?.skill_doc, notes: s.agent_notes }), content, true);
  let p: Record<string, unknown>;
  try { p = JSON.parse(out); } catch { throw new Fail("A IA devolveu uma resposta fora do formato. Tente de novo.", 502); }
  const colors = filterImportColors(p.colors, { siteColors: site?.colors ?? [], texts: list.map((d) => d.extracted_text ?? "") });
  const imgs = (Array.isArray(p.images) ? p.images : []).map((x: Record<string, unknown>) => {
    const it = images[Number(x.index)];
    return it ? { doc_id: it.doc.id, kind: ["logo", "character", "object", "reference", "ignore"].includes(String(x.kind)) ? String(x.kind) : "ignore", variant: String(x.variant ?? ""), label: String(x.label ?? "").slice(0, 60), description: String(x.description ?? "").slice(0, 600) } : null;
  }).filter(Boolean);
  for (const d of list) await ctx.admin.from("studio_brand_docs").update({ status: "analyzed", summary: ((p.sources as string[] | undefined) ?? []).find((x) => x.includes(d.name))?.slice(0, 400) ?? null }).eq("id", d.id);
  return { ok: true, model, ...p, colors, images: imgs, docs_read: list.length, site: site ? { fetched: true, title: site.title, colors: site.colors, fonts: site.fonts } : { fetched: false, requested: !!website } };
}

// ---------- editor de vídeo (VPS) ----------
type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail: "low" } };
function withFrames(text: string, frames: unknown): string | Part[] {
  const f = Array.isArray(frames) ? (frames as unknown[]).map(String).filter((x) => x.startsWith("data:image/")).slice(0, 8) : [];
  return f.length ? [{ type: "text", text }, ...f.map((url): Part => ({ type: "image_url", image_url: { url, detail: "low" } }))] : text;
}
async function videoPlan(ctx: Ctx, body: Record<string, unknown>) {
  const { key, model } = await textKey(ctx);
  const { data: job } = await ctx.admin.from("video_jobs").select("*").eq("id", String(body.job_id ?? "")).single();
  if (!job) throw new Fail("Pedido de vídeo não encontrado", 404);
  let style: { name: string; rules: string; caption_variant: string; engine: string } | null = null;
  if (job.style_id) { const { data } = await ctx.admin.from("video_styles").select("name, rules, caption_variant, engine").eq("id", job.style_id).maybeSingle(); style = data; }
  let previousPlan: unknown = null;
  if (job.parent_id) { const { data } = await ctx.admin.from("video_jobs").select("plan").eq("id", job.parent_id).maybeSingle(); previousPlan = data?.plan ?? null; }
  const input: VideoPlanInput = {
    instruction: String(job.instruction ?? ""), format: job.format, engine: job.engine, style, brand: job.brand ?? {}, options: job.options ?? {},
    transcript: (body.transcript as VideoPlanInput["transcript"]) ?? null, clips: (body.clips as VideoPlanInput["clips"]) ?? [],
    hasVideo: !!body.has_video, hasAudioSpeech: !!(body.transcript as { words?: unknown[] } | null)?.words?.length,
    sfx: (body.sfx as VideoPlanInput["sfx"]) ?? [], reference: (body.reference as VideoPlanInput["reference"]) ?? null, feedback: job.feedback ?? null, previousPlan,
  };
  const out = await chat(key, model, videoPlanSystem(input), withFrames(videoPlanUser(input), body.frames), true);
  let parsed: unknown; try { parsed = JSON.parse(out); } catch { throw new Fail("A IA devolveu um plano inválido. Tente de novo."); }
  const duration = Number((body.transcript as { duration?: number } | null)?.duration ?? body.duration ?? 60);
  const plan = sanitizePlan(parsed, { duration, sfxIds: (input.sfx ?? []).map((s) => s.id), brandColor: (job.brand?.colors ?? [])[0], engine: job.engine, options: job.options ?? {}, styleVariant: style?.caption_variant });
  return { ok: true, plan, model };
}
async function videoAnalyze(ctx: Ctx, body: Record<string, unknown>) {
  const { key, model } = await textKey(ctx);
  const text = `MEDIÇÕES DA REFERÊNCIA:
${JSON.stringify(body.stats ?? {}).slice(0, 4000)}

TRANSCRIÇÃO (trecho):
${String(body.transcript ?? "").slice(0, 3000)}

PEDIDO DO USUÁRIO: ${String(body.note ?? "(nenhum)")}`;
  const out = await chat(key, model, ANALYZE_SYSTEM, withFrames(text, body.frames), true);
  let parsed: unknown; try { parsed = JSON.parse(out); } catch { throw new Fail("A IA devolveu uma análise inválida. Tente de novo."); }
  return { ok: true, style: sanitizeStyle(parsed), model };
}

// ---------- criador de logos + branding ----------
const imgPart = (r: Ref, detail: "low" | "auto" | "high" = "low") => ({ type: "image_url", image_url: { url: `data:${r.mime};base64,${bytesToB64(r.bytes)}`, detail } });
const noteOf = (s: { agent_notes: unknown }, k: string) => { const v = (s.agent_notes as Record<string, unknown> | null)?.[k]; return typeof v === "string" && v.trim() ? v.trim() : null; };

/** Treinar logos: IA de visão lê as logos de referência da pasta e grava o documento de estilo */
async function logoTrain(ctx: Ctx, body: Record<string, unknown>) {
  const brandId = String(body.brand_id ?? "");
  const { data: brand } = await ctx.asCaller.from("studio_brands").select("id, name, is_base, logo_skill_version, logo_analysis, logo_notes").eq("id", brandId).single();
  if (!brand) throw new Fail("Pasta não encontrada.", 404);
  const { data: assets } = await ctx.admin.from("studio_assets").select("storage_path, thumb_path, favorite").eq("brand_id", brandId).eq("kind", "logo_ref").order("favorite", { ascending: false }).order("created_at", { ascending: false });
  const total = assets?.length ?? 0;
  if (!total) throw new Fail("Envie logos de referência antes de treinar.", 400, "no_refs");
  let analysis: LogoAnalysis | null = null;
  if (body.analyze !== false) {
    const { key, model } = await textKey(ctx);
    const content: unknown[] = [{ type: "text", text: LOGO_TRAIN_PROMPT }];
    for (const a of (assets ?? []).slice(0, 16)) content.push(imgPart(await download(ctx, a.thumb_path ?? a.storage_path), "auto"));
    let parsed: unknown; try { parsed = JSON.parse(await chat(key, model, LOGO_TRAIN_SYSTEM, content, true)); } catch { throw new Fail("A IA devolveu uma análise fora do formato. Tente de novo.", 502); }
    analysis = sanitizeLogoAnalysis(parsed);
  }
  const version = (brand.logo_skill_version ?? 0) + 1;
  const doc = compileLogoSkill({ name: brand.name, isBase: brand.is_base, analysis, refs: total, version, extra: brand.logo_notes });
  await ctx.admin.from("studio_brands").update({ logo_analysis: analysis ?? brand.logo_analysis, logo_skill_doc: doc, logo_skill_version: version, logo_trained_at: new Date().toISOString(), logo_trained_refs: total }).eq("id", brandId);
  return { ok: true, analysis, version, refs: total, doc };
}

async function projectCtx(ctx: Ctx, projectId: string) {
  const { data: project } = await ctx.asCaller.from("logo_projects").select("*").eq("id", projectId).single();
  if (!project) throw new Fail("Projeto de logo não encontrado ou sem permissão.", 404);
  const { data: brand } = await ctx.asCaller.from("studio_brands").select("id, name, is_base, logo_skill_doc, logo_analysis").eq("id", project.brand_id).single();
  const { data: base } = await ctx.admin.from("studio_brands").select("id, logo_skill_doc, logo_analysis").eq("is_base", true).maybeSingle();
  return { project, brand: brand!, base };
}

/** Briefing → conceitos de logo (a skill de designer pensa; o gerador de imagens só desenha) */
async function logoIdeate(ctx: Ctx, body: Record<string, unknown>) {
  const { key, model } = await textKey(ctx);
  const s = await settings(ctx);
  const { project, brand, base } = await projectCtx(ctx, String(body.project_id ?? ""));
  const form = sanitizeForm(project.form);
  if (form.company.length < 2) throw new Fail("Informe o nome da empresa.");
  const count = Math.max(1, Math.min(6, Number(body.count) || form.count || 4));
  const inputs = ((project.inputs ?? []) as { path: string; role: string; note?: string }[]).slice(0, 4);
  const imgs: unknown[] = [];
  for (const i of inputs) { try { imgs.push(imgPart(await download(ctx, i.path))); } catch { /* arquivo sumiu */ } }
  const refine = body.feedback ? { previous: body.previous ?? {}, feedback: String(body.feedback) } : null;
  const sys = logoIdeateSystem({ baseDoc: base?.logo_skill_doc ?? null, brandDoc: brand.is_base ? null : brand.logo_skill_doc, extra: noteOf(s, "logo_rules"), count });
  const userText = logoIdeateUser({ form, inputs: inputs.map((i) => ({ role: i.role, note: i.note })), refine, count, usedConcepts: Array.isArray(body.used) ? (body.used as unknown[]).map(String).slice(0, 12) : [] });
  const out = await chat(key, model, sys, imgs.length ? [{ type: "text", text: userText }, ...imgs] : userText, true);
  let parsed: unknown; try { parsed = JSON.parse(out); } catch { throw new Fail("A IA devolveu uma resposta fora do formato. Tente de novo.", 502); }
  const r = sanitizeConcepts(parsed, count, form);
  if (!r.concepts.length) throw new Fail("A IA não devolveu conceitos. Tente de novo com mais detalhes.", 502);
  await ctx.admin.from("logo_projects").update({ positioning: r.positioning || project.positioning, cliches: r.cliches, status: "generating" }).eq("id", project.id);
  return { ok: true, model, ...r };
}

async function logoRollup(ctx: Ctx, projectId: string) {
  const { data: vs } = await ctx.admin.from("logo_versions").select("status").eq("project_id", projectId);
  if ((vs ?? []).some((v) => v.status === "queued" || v.status === "running")) return;
  const { data: p } = await ctx.admin.from("logo_projects").select("approved_version_id").eq("id", projectId).single();
  await ctx.admin.from("logo_projects").update({ status: p?.approved_version_id ? "approved" : (vs ?? []).some((v) => v.status === "done") ? "ready" : "draft" }).eq("id", projectId);
}

async function pickImageModel(ctx: Ctx, wanted: unknown, fallback: unknown) {
  const s = await settings(ctx);
  const id = String(wanted || fallback || s.default_model);
  const { data: model } = await ctx.admin.from("studio_models").select("*").eq("id", id).single();
  if (!model) throw new Fail("Modelo de imagem não encontrado. Escolha outro em Modelos e APIs.");
  return model as { provider: string; api_model: string; name: string; capabilities: Record<string, boolean> };
}

async function logoImage(ctx: Ctx, body: Record<string, unknown>) {
  const id = String(body.version_id ?? "");
  const { data: ver } = await ctx.asCaller.from("logo_versions").select("*").eq("id", id).single();
  if (!ver) throw new Fail("Versão não encontrada ou sem permissão.", 404);
  await ctx.admin.from("logo_versions").update({ status: "running", error: null }).eq("id", id);
  try {
    const { project, brand, base } = await projectCtx(ctx, ver.project_id);
    const model = await pickImageModel(ctx, body.model_id, project.model_id);
    const { key, baseUrl } = await providerKey(ctx, model.provider);
    const form = sanitizeForm(project.form);
    const refs: Ref[] = []; const attach: LogoAttach[] = [];
    if (ver.parent_id) {
      const { data: parent } = await ctx.asCaller.from("logo_versions").select("storage_path").eq("id", ver.parent_id).single();
      if (!parent?.storage_path) throw new Fail("A versão original não foi encontrada.");
      refs.push(await download(ctx, parent.storage_path)); attach.push({ role: "parent" });
    }
    if (model.capabilities?.refs) {
      if (!ver.parent_id) {
        // referências de estilo do treinamento (poucas: cada imagem enviada é cobrada como entrada)
        const { data: pool } = await ctx.admin.from("studio_assets").select("storage_path, thumb_path, brand_id, favorite, created_at").in("brand_id", [brand.id, base?.id ?? brand.id]).eq("kind", "logo_ref")
          .order("favorite", { ascending: false }).order("created_at", { ascending: false }).limit(40);
        const own = (pool ?? []).filter((a) => a.brand_id === brand.id), gen = (pool ?? []).filter((a) => a.brand_id !== brand.id);
        const styleRefs = [...own.slice(0, 2), ...gen.slice(0, 3)].slice(0, 3);
        for (const a of styleRefs) { refs.push(await download(ctx, a.thumb_path ?? a.storage_path)); attach.push({ role: "style" }); }
      }
      const inputs = ((project.inputs ?? []) as { path: string; role: string; note?: string }[]).slice(0, 4);
      for (const i of inputs) { try { refs.push(await download(ctx, i.path)); attach.push({ role: (["competitor", "attempt", "inspiration"].includes(i.role) ? i.role : "inspiration") as LogoAttach["role"], note: i.note }); } catch { /* arquivo sumiu */ } }
    }
    const analysis = (brand.logo_analysis ?? base?.logo_analysis ?? null) as LogoAnalysis | null;
    const concept = (ver.concept ?? {}) as Record<string, unknown>;
    const total = Number((await ctx.admin.from("logo_versions").select("id", { count: "exact", head: true }).eq("project_id", project.id).is("parent_id", null)).count ?? 1);
    const prompt = ver.parent_id && ver.feedback
      ? buildLogoRefinePrompt({ form, feedback: ver.feedback, attach })
      : buildLogoPrompt({ form, concept: concept as never, index: Number(concept.index ?? ver.number ?? 1), total: Math.max(total, 1), analysis, attach, positioning: project.positioning ?? undefined });
    const raw = await runProvider({ provider: model.provider, apiModel: model.api_model, key, baseUrl, prompt, aspect: "1:1", quality: String(body.quality ?? project.quality ?? "medium"), refs });
    const fin = await finalize(raw.bytes, "1:1", { flatten: true });
    const path = `${brand.id}/logos/${project.id}/${ver.id}.png`;
    const up = await ctx.admin.storage.from("studio").upload(path, fin.bytes, { contentType: "image/png", upsert: true });
    if (up.error) throw new Fail(`Falha ao salvar a imagem: ${up.error.message}`, 500);
    await ctx.admin.from("logo_versions").update({ status: "done", storage_path: path, width: fin.w ?? null, height: fin.h ?? null, prompt: prompt.slice(0, 12000), usage: raw.usage ?? null, cost_usd: costFromUsage(model.provider, raw.usage) }).eq("id", id);
    await logoRollup(ctx, project.id);
    return { ok: true, path };
  } catch (e) {
    await ctx.admin.from("logo_versions").update({ status: "error", error: (e instanceof Error ? e.message : String(e)).slice(0, 600) }).eq("id", id);
    await logoRollup(ctx, ver.project_id);
    throw e;
  }
}

/** Lê a logo aprovada: descrição fiel, nome/slogan, fonte parecida e cores */
async function logoInspect(ctx: Ctx, body: Record<string, unknown>) {
  const { key, model } = await textKey(ctx);
  const { data: ver } = await ctx.asCaller.from("logo_versions").select("id, project_id, storage_path").eq("id", String(body.version_id ?? "")).single();
  if (!ver?.storage_path) throw new Fail("Versão não encontrada ou sem imagem.", 404);
  const ref = await download(ctx, ver.storage_path);
  const parsed = JSON.parse(await chat(key, model, LOGO_INSPECT_SYSTEM, [{ type: "text", text: LOGO_INSPECT_PROMPT }, imgPart(ref, "high")], true));
  const inspect = sanitizeInspect(parsed);
  await ctx.admin.from("logo_projects").update({ inspect }).eq("id", ver.project_id);
  return { ok: true, inspect, model };
}

/** Plano de cenas de branding adaptado ao segmento */
async function logoBrandingPlan(ctx: Ctx, body: Record<string, unknown>) {
  const { key, model } = await textKey(ctx);
  const s = await settings(ctx);
  const { project } = await projectCtx(ctx, String(body.project_id ?? ""));
  const form = sanitizeForm(project.form);
  const count = Math.max(4, Math.min(16, Number(body.count) || 12));
  const palette = (Array.isArray(body.palette) ? body.palette : form.colors).map(String).slice(0, 6);
  const out = await chat(key, model, brandingPlanSystem({ extra: noteOf(s, "branding_rules"), count }), brandingPlanUser({ form, inspect: project.inspect, palette, count }), true);
  let parsed: unknown; try { parsed = JSON.parse(out); } catch { parsed = {}; }
  return { ok: true, model, ...sanitizeScenes(parsed, count, defaultScenes(form.segment, form.offer, count)) };
}

async function logoBrandingImage(ctx: Ctx, body: Record<string, unknown>) {
  const id = String(body.branding_id ?? "");
  const { data: row } = await ctx.asCaller.from("logo_brandings").select("*").eq("id", id).single();
  if (!row) throw new Fail("Cena não encontrada ou sem permissão.", 404);
  await ctx.admin.from("logo_brandings").update({ status: "running", error: null }).eq("id", id);
  try {
    const { project, brand } = await projectCtx(ctx, row.project_id);
    const model = await pickImageModel(ctx, body.model_id, project.model_id);
    if (!model.capabilities?.refs) throw new Fail(`${model.name} não aceita imagem de referência, necessária para aplicar a logo. Escolha um modelo OpenAI/Gemini.`);
    const { key, baseUrl } = await providerKey(ctx, model.provider);
    const s = await settings(ctx);
    const { data: ver } = await ctx.asCaller.from("logo_versions").select("storage_path").eq("id", row.version_id ?? project.approved_version_id).single();
    const logoPath = row.logo_path ?? ver?.storage_path;
    if (!logoPath) throw new Fail("A logo aprovada não foi encontrada.");
    const form = sanitizeForm(project.form);
    const palette = ((project.branding as { palette?: string[] } | null)?.palette ?? form.colors).slice(0, 6);
    const prompt = buildMockupPrompt({ scene: { title: row.title, scene: row.scene, aspect: row.aspect, variant: row.variant }, company: form.company, segment: form.segment, palette, logoDescription: (project.inspect as { description?: string } | null)?.description ?? null, extra: noteOf(s, "branding_rules"), feedback: row.feedback });
    const raw = await runProvider({ provider: model.provider, apiModel: model.api_model, key, baseUrl, prompt, aspect: row.aspect, quality: String(body.quality ?? project.quality ?? "medium"), refs: [await download(ctx, logoPath)] });
    const fin = await finalize(raw.bytes, row.aspect);
    const path = `${brand.id}/logos/${project.id}/branding/${row.id}-${Date.now().toString(36)}.png`;
    const up = await ctx.admin.storage.from("studio").upload(path, fin.bytes, { contentType: "image/png", upsert: true });
    if (up.error) throw new Fail(`Falha ao salvar a imagem: ${up.error.message}`, 500);
    await ctx.admin.from("logo_brandings").update({ status: "done", storage_path: path, width: fin.w ?? null, height: fin.h ?? null, prompt: prompt.slice(0, 12000), usage: raw.usage ?? null, cost_usd: costFromUsage(model.provider, raw.usage), feedback: null }).eq("id", id);
    return { ok: true, path };
  } catch (e) {
    await ctx.admin.from("logo_brandings").update({ status: "error", error: (e instanceof Error ? e.message : String(e)).slice(0, 600) }).eq("id", id);
    throw e;
  }
}


// ---------- criador de thumbnails ----------
/** Passo 1 do treino: a IA de visão observa até 8 thumbnails por chamada (posição, expressão, texto, paleta…) e já sugere as categorias */
async function thumbObserve(ctx: Ctx, body: Record<string, unknown>) {
  const { key, model } = await textKey(ctx);
  const brandId = String(body.brand_id ?? "");
  const { data: brand } = await ctx.asCaller.from("studio_brands").select("id").eq("id", brandId).single();
  if (!brand) throw new Fail("Pasta não encontrada.", 404);
  const ids = (Array.isArray(body.asset_ids) ? body.asset_ids : []).map(String).slice(0, 8);
  const { data: assets } = await ctx.admin.from("studio_assets").select("id, storage_path, thumb_path, tags").eq("brand_id", brandId).eq("kind", "thumb_ref").in("id", ids);
  const list = assets ?? [];
  if (!list.length) throw new Fail("Nenhuma thumbnail para observar.", 400);
  const content: unknown[] = [{ type: "text", text: thumbObservePrompt(list.length) }];
  for (const a of list) content.push(imgPart(await download(ctx, a.thumb_path ?? a.storage_path), "auto"));
  let parsed: unknown; try { parsed = JSON.parse(await chat(key, model, THUMB_OBSERVE_SYSTEM, content, true)); } catch { throw new Fail("A IA devolveu uma análise fora do formato. Tente de novo.", 502); }
  const obs = sanitizeObservations(parsed, list.length);
  for (const o of obs) {
    const a = list[o.index];
    const own = ((a.tags ?? []) as string[]).filter((t) => THUMB_CATEGORIES.some((c) => c.id === t));
    await ctx.admin.from("studio_assets").update({ meta: o, tags: own.length ? a.tags : [...((a.tags ?? []) as string[]), ...o.categories] }).eq("id", a.id);
  }
  return { ok: true, observed: obs.length, model };
}

/** Passo 2 do treino: sintetiza o manual de estilo (geral + por categoria) a partir das observações e grava o documento */
async function thumbTrain(ctx: Ctx, body: Record<string, unknown>) {
  const brandId = String(body.brand_id ?? "");
  const { data: brand } = await ctx.asCaller.from("studio_brands").select("id, name, is_base, thumb_skill_version, thumb_analysis, thumb_notes").eq("id", brandId).single();
  if (!brand) throw new Fail("Pasta não encontrada.", 404);
  const { data: assets } = await ctx.admin.from("studio_assets").select("id, tags, meta").eq("brand_id", brandId).eq("kind", "thumb_ref");
  const total = assets?.length ?? 0;
  if (!total) throw new Fail("Envie thumbnails de referência antes de treinar.", 400, "no_refs");
  let analysis: ThumbAnalysis | null = null;
  const observed = (assets ?? []).filter((a) => a.meta);
  const stats = observed.length ? computeThumbStats(observed.map((a) => ({ o: a.meta as ThumbObs, tags: ((a.tags ?? []) as string[]).filter((t) => THUMB_CATEGORIES.some((c) => c.id === t)) }))) : undefined;
  if (body.analyze === false && stats) analysis = { stats };
  if (body.analyze !== false && observed.length) {
    const { key, model } = await textKey(ctx);
    const obs = observed.map((a, i) => ({ index: i, o: a.meta as ThumbObs, tags: ((a.tags ?? []) as string[]) }));
    const groups: Record<string, number[]> = {};
    for (const x of obs) { const cs = x.tags.filter((t) => THUMB_CATEGORIES.some((c) => c.id === t)); for (const c of (cs.length ? cs : x.o.categories)) (groups[c] ??= []).push(x.index); }
    let parsed: unknown; try { parsed = JSON.parse(await chat(key, model, THUMB_SYNTH_SYSTEM, thumbSynthUser(obs.map((x) => ({ index: x.index, o: x.o })), groups), true)); } catch { throw new Fail("A IA devolveu um manual fora do formato. Tente de novo.", 502); }
    analysis = sanitizeThumbAnalysis(parsed, Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length])), stats);
  }
  const version = (brand.thumb_skill_version ?? 0) + 1;
  const doc = compileThumbSkill({ name: brand.name, isBase: brand.is_base, analysis: analysis ?? brand.thumb_analysis, refs: total, version, extra: brand.thumb_notes });
  await ctx.admin.from("studio_brands").update({ thumb_analysis: analysis ?? brand.thumb_analysis, thumb_skill_doc: doc, thumb_skill_version: version, thumb_trained_at: new Date().toISOString(), thumb_trained_refs: total }).eq("id", brandId);
  return { ok: true, analysis, version, refs: total, observed: observed.length, doc };
}

async function thumbProjectCtx(ctx: Ctx, projectId: string) {
  const { data: project } = await ctx.asCaller.from("thumb_projects").select("*").eq("id", projectId).single();
  if (!project) throw new Fail("Projeto de thumbnail não encontrado ou sem permissão.", 404);
  const { data: brand } = await ctx.asCaller.from("studio_brands").select("id, name, is_base, thumb_skill_doc, thumb_analysis").eq("id", project.brand_id).single();
  const { data: base } = await ctx.admin.from("studio_brands").select("id, thumb_skill_doc, thumb_analysis").eq("is_base", true).maybeSingle();
  return { project, brand: brand!, base };
}

/** Explicação do vídeo → conceitos de thumbnail */
async function thumbIdeate(ctx: Ctx, body: Record<string, unknown>) {
  const { key, model } = await textKey(ctx);
  const s = await settings(ctx);
  const { project, brand, base } = await thumbProjectCtx(ctx, String(body.project_id ?? ""));
  const form = sanitizeThumbForm(project.form);
  if (form.brief.trim().length < 15 && form.title.trim().length < 4) throw new Fail("Explique sobre o que é o vídeo (ou escreva o título).");
  const count = Math.max(1, Math.min(8, Number(body.count) || form.count || 6));
  const inputs = ((project.inputs ?? []) as { path: string; role: string; note?: string }[]).slice(0, 4);
  const imgs: unknown[] = [];
  for (const i of inputs) { try { imgs.push(imgPart(await download(ctx, i.path))); } catch { /* arquivo sumiu */ } }
  const refine = body.feedback ? { previous: body.previous ?? {}, feedback: String(body.feedback) } : null;
  const sys = thumbIdeateSystem({ baseDoc: base?.thumb_skill_doc ?? null, brandDoc: brand.is_base ? null : brand.thumb_skill_doc, extra: noteOf(s, "thumb_rules"), count, categories: form.categories });
  const { data: pool } = await ctx.admin.from("studio_assets").select("tags, meta").in("brand_id", [brand.id, base?.id ?? brand.id]).eq("kind", "thumb_ref").not("meta", "is", null).limit(200);
  const exemplars = exemplarsBlock((pool ?? []).map((a) => ({ obs: a.meta as ThumbObs, tags: ((a.tags ?? []) as string[]).filter((t) => THUMB_CATEGORIES.some((c) => c.id === t)) })), form.categories);
  const userText = thumbIdeateUser({ form, inputs: inputs.map((i) => ({ role: i.role, note: i.note })), refine, used: Array.isArray(body.used) ? (body.used as unknown[]).map(String).slice(0, 16) : [], exemplars });
  const out = await chat(key, model, sys, imgs.length ? [{ type: "text", text: userText }, ...imgs] : userText, true);
  let parsed: unknown; try { parsed = JSON.parse(out); } catch { throw new Fail("A IA devolveu uma resposta fora do formato. Tente de novo.", 502); }
  const r = sanitizeThumbConcepts(parsed, count, form);
  if (!r.concepts.length) throw new Fail("A IA não devolveu conceitos. Tente de novo com mais detalhes.", 502);
  await ctx.admin.from("thumb_projects").update({ analysis: r.analysis || project.analysis, status: "generating" }).eq("id", project.id);
  return { ok: true, model, ...r };
}

async function thumbRollup(ctx: Ctx, projectId: string) {
  const { data: vs } = await ctx.admin.from("thumb_versions").select("status").eq("project_id", projectId);
  if ((vs ?? []).some((v) => v.status === "queued" || v.status === "running")) return;
  const { data: p } = await ctx.admin.from("thumb_projects").select("approved_version_id").eq("id", projectId).single();
  await ctx.admin.from("thumb_projects").update({ status: p?.approved_version_id ? "approved" : (vs ?? []).some((v) => v.status === "done") ? "ready" : "draft" }).eq("id", projectId);
}

async function thumbImage(ctx: Ctx, body: Record<string, unknown>) {
  const id = String(body.version_id ?? "");
  const { data: ver } = await ctx.asCaller.from("thumb_versions").select("*").eq("id", id).single();
  if (!ver) throw new Fail("Versão não encontrada ou sem permissão.", 404);
  await ctx.admin.from("thumb_versions").update({ status: "running", error: null }).eq("id", id);
  try {
    const { project, brand, base } = await thumbProjectCtx(ctx, ver.project_id);
    const model = await pickImageModel(ctx, body.model_id, project.model_id);
    const { key, baseUrl } = await providerKey(ctx, model.provider);
    const form = sanitizeThumbForm(project.form);
    const concept = (ver.concept ?? {}) as ThumbConcept;
    const refs: Ref[] = []; const attach: ThumbAttach[] = [];
    if (ver.parent_id) {
      const { data: parent } = await ctx.asCaller.from("thumb_versions").select("storage_path").eq("id", ver.parent_id).single();
      if (!parent?.storage_path) throw new Fail("A versão original não foi encontrada.");
      refs.push(await download(ctx, parent.storage_path)); attach.push({ role: "parent" });
    }
    const castIds = form.cast.map((c) => c.id);
    if (castIds.length && !model.capabilities?.refs) throw new Fail(`${model.name} não aceita fotos de referência, necessárias para manter o rosto do personagem. Escolha um modelo OpenAI/Gemini em Modelos e APIs.`);
    if (model.capabilities?.refs) {
      // pessoas citadas pelo conceito (ou todas, se o conceito não disse): o rosto vem sempre da foto
      const named = new Set((concept.characters ?? []).map((c) => String(c.who).toLowerCase()));
      const chosen = form.cast.filter((c) => !named.size || named.has(c.label.toLowerCase()) || ![...named].some((n) => form.cast.some((x) => x.label.toLowerCase() === n))).slice(0, 3);
      const { data: people } = await ctx.admin.from("studio_assets").select("id, label, caption, storage_path").in("id", chosen.map((c) => c.id));
      for (const c of chosen) {
        const a = (people ?? []).find((p) => p.id === c.id); if (!a) continue;
        refs.push(await download(ctx, a.storage_path)); attach.push({ role: "cast", label: a.label ?? c.label, description: a.caption ?? c.description, castRole: c.role });
      }
      if (!ver.parent_id) {
        const { data: pool } = await ctx.admin.from("studio_assets").select("storage_path, thumb_path, brand_id, favorite, tags, created_at").in("brand_id", [brand.id, base?.id ?? brand.id]).eq("kind", "thumb_ref")
          .order("favorite", { ascending: false }).order("created_at", { ascending: false }).limit(200);
        const tagged = (pool ?? []).filter((a) => ((a.tags ?? []) as string[]).includes(concept.category));
        const picks = (tagged.length ? tagged : (pool ?? []).filter((a) => a.favorite)).slice(0, 3);
        for (const a of picks) { refs.push(await download(ctx, a.thumb_path ?? a.storage_path)); attach.push({ role: "style" }); }
      }
      for (const i of ((project.inputs ?? []) as { path: string; role: string; note?: string }[]).slice(0, 2)) { try { refs.push(await download(ctx, i.path)); attach.push({ role: (["competitor", "inspiration", "own"].includes(i.role) ? i.role : "inspiration") as ThumbAttach["role"] }); } catch { /* arquivo sumiu */ } }
    }
    const an = ((brand.thumb_analysis as ThumbAnalysis | null)?.categories?.[concept.category] ? brand.thumb_analysis : base?.thumb_analysis ?? brand.thumb_analysis) as ThumbAnalysis | null;
    const learned = learnedBlock(an, concept.category ? [concept.category] : [], false);
    const total = Number((await ctx.admin.from("thumb_versions").select("id", { count: "exact", head: true }).eq("project_id", project.id).is("parent_id", null)).count ?? 1);
    const prompt = ver.parent_id && ver.feedback
      ? buildThumbRefinePrompt({ form, feedback: ver.feedback, attach })
      : buildThumbPrompt({ form, concept, index: Number(concept.index ?? ver.number ?? 1), total: Math.max(total, 1), attach, learned });
    const raw = await runProvider({ provider: model.provider, apiModel: model.api_model, key, baseUrl, prompt, aspect: "16:9", quality: String(body.quality ?? project.quality ?? "medium"), refs });
    const fin = await finalize(raw.bytes, "16:9");
    const path = `${brand.id}/thumbs/${project.id}/${ver.id}.png`;
    const up = await ctx.admin.storage.from("studio").upload(path, fin.bytes, { contentType: "image/png", upsert: true });
    if (up.error) throw new Fail(`Falha ao salvar a imagem: ${up.error.message}`, 500);
    await ctx.admin.from("thumb_versions").update({ status: "done", storage_path: path, width: fin.w ?? null, height: fin.h ?? null, prompt: prompt.slice(0, 12000), usage: raw.usage ?? null, cost_usd: costFromUsage(model.provider, raw.usage) }).eq("id", id);
    await thumbRollup(ctx, project.id);
    return { ok: true, path };
  } catch (e) {
    await ctx.admin.from("thumb_versions").update({ status: "error", error: (e instanceof Error ? e.message : String(e)).slice(0, 600) }).eq("id", id);
    await thumbRollup(ctx, ver.project_id);
    throw e;
  }
}
