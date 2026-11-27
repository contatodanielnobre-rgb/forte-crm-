// Geração e edição de imagem na OpenAI (GPT Image 2.x). Usado pela Edge Function studio-generate (Deno) E pela demo (Node).
// Só usa fetch/FormData/Blob, que existem nos dois ambientes.

export interface ImgRef { name: string; mime: string; bytes: Uint8Array }
export interface OpenAIImageInput {
  key: string; base?: string; model: string; prompt: string; aspect: string; quality: string
  refs: ImgRef[]; edit?: { image: ImgRef; mask?: ImgRef }
  /** rascunho de teste: tela menor (lado curto 832 px), que custa bem menos */
  small?: boolean
}
export interface OpenAIUsage { input_tokens?: number; output_tokens?: number; input_tokens_details?: { text_tokens?: number; image_tokens?: number } }

export function parseAspect(a: string): [number, number] {
  const m = /^(\d+(?:\.\d+)?)\s*[:xX/]\s*(\d+(?:\.\d+)?)$/.exec(a.trim());
  return m ? [Number(m[1]), Number(m[2])] : [4, 5];
}

const LEGACY = ["1024x1024", "1024x1536", "1536x1024"];
export function legacySize(aspect: string): string {
  const [w, h] = parseAspect(aspect); const r = w / h;
  return LEGACY.map((o) => { const [x, y] = o.split("x").map(Number); return { o, d: Math.abs(Math.log(x / y / r)) }; }).sort((a, b) => a.d - b.d)[0].o;
}
/** Família GPT Image 2.x aceita tamanhos livres (múltiplos de 16, proporção até 3:1). O lado menor fica em 1024 px: 4:5 vira 1024×1280. */
export function customSize(aspect: string, short = 1024): string {
  let [w, h] = parseAspect(aspect);
  const r = Math.min(3, Math.max(1 / 3, w / h));
  [w, h] = r >= 1 ? [short * r, short] : [short, short / r];
  const q = (n: number) => Math.min(3840, Math.max(256, Math.round(n / 16) * 16));
  return `${q(w)}x${q(h)}`;
}
/** 4K Ultra: o maior tamanho na proporção pedida (até 3840 no lado maior e ~8,3 milhões de pixels, múltiplos de 16). */
export function ultraSize(aspect: string): string {
  const [w, h] = parseAspect(aspect);
  const r = Math.min(3, Math.max(1 / 3, w / h));
  let W = Math.sqrt(8_294_400 * r), H = W / r;
  const k = Math.min(1, 3840 / Math.max(W, H));
  W *= k; H *= k;
  const q = (n: number) => Math.max(256, Math.floor(n / 16 + 1e-6) * 16);
  return `${q(W)}x${q(H)}`;
}
const isFlexible = (model: string) => /^gpt-image-2/.test(model);

const blob = (r: ImgRef) => new Blob([r.bytes], { type: r.mime });
async function send(i: OpenAIImageInput, size: string): Promise<Response> {
  const base = (i.base ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const quality = ["low", "medium", "high"].includes(i.quality) ? i.quality : "high"; // "4k" = alta qualidade no tamanho máximo
  const headers = { Authorization: `Bearer ${i.key}` };
  const inputs = i.edit ? [i.edit.image] : i.refs;
  if (inputs.length) {
    const fd = new FormData();
    fd.set("model", i.model); fd.set("prompt", i.prompt); fd.set("size", size); fd.set("quality", quality); fd.set("n", "1");
    inputs.forEach((r) => fd.append("image[]", blob(r), r.name));
    if (i.edit?.mask) fd.set("mask", blob(i.edit.mask), "mask.png");
    return await fetch(`${base}/images/edits`, { method: "POST", headers, body: fd });
  }
  return await fetch(`${base}/images/generations`, {
    method: "POST", headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ model: i.model, prompt: i.prompt, size, quality, n: 1 }),
  });
}

function fromB64(s: string) {
  const bin = atob(s); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Gera (ou edita) uma imagem. Devolve o PNG e o "usage" (tokens) para calcular o custo real. */
export async function openaiImage(i: OpenAIImageInput): Promise<{ bytes: Uint8Array; usage: OpenAIUsage | null; size: string }> {
  const ultra = i.quality === "4k";
  if (ultra && !isFlexible(i.model)) throw new Error("Este modelo não gera em 4K.");
  let size = ultra ? ultraSize(i.aspect) : isFlexible(i.model) ? customSize(i.aspect, i.small ? 832 : 1024) : legacySize(i.aspect);
  let res = await send(i, size);
  // se a API recusar o tamanho livre, tenta de novo com os tamanhos clássicos (no 4K não: quem pediu 4K não recebe menor)
  if (!ultra && !res.ok && res.status === 400 && size !== legacySize(i.aspect)) {
    const txt = await res.text();
    if (/size/i.test(txt)) { size = legacySize(i.aspect); res = await send(i, size); }
    else throw new Error(`OpenAI imagem: 400 ${txt.slice(0, 500)}`);
  }
  if (!res.ok) throw new Error(`OpenAI imagem (${i.model}): ${res.status} ${(await res.text()).slice(0, 500)}`);
  const data = await res.json();
  const item = data?.data?.[0];
  const usage = (data?.usage ?? null) as OpenAIUsage | null;
  if (item?.b64_json) return { bytes: fromB64(item.b64_json), usage, size };
  if (item?.url) { const r = await fetch(item.url); if (!r.ok) throw new Error("Download da imagem falhou"); return { bytes: new Uint8Array(await r.arrayBuffer()), usage, size }; }
  throw new Error("A API não devolveu imagem.");
}

/** Custo em US$ a partir do usage: texto de entrada 5, imagem de entrada 8 e imagem de saída 30 por 1M de tokens. */
export function costFromUsage(u?: OpenAIUsage | null): number | null {
  if (!u?.output_tokens) return null;
  const d = u.input_tokens_details ?? {};
  const imgIn = d.image_tokens ?? 0;
  const txtIn = d.text_tokens ?? Math.max(0, (u.input_tokens ?? 0) - imgIn);
  return Math.round(((txtIn * 5 + imgIn * 8 + u.output_tokens * 30) / 1e6) * 10000) / 10000;
}
