// Geração e edição de imagem na OpenAI (GPT Image 2.x). Usado pela Edge Function studio-generate (Deno) E pela demo (Node).
// Só usa fetch/FormData/Blob, que existem nos dois ambientes.

export interface ImgRef { name: string; mime: string; bytes: Uint8Array }
export interface OpenAIImageInput {
  key: string; base?: string; model: string; prompt: string; aspect: string; quality: string
  refs: ImgRef[]; edit?: { image: ImgRef; mask?: ImgRef }
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
export function customSize(aspect: string): string {
  let [w, h] = parseAspect(aspect);
  const r = Math.min(3, Math.max(1 / 3, w / h));
  [w, h] = r >= 1 ? [1024 * r, 1024] : [1024, 1024 / r];
  const q = (n: number) => Math.min(3840, Math.max(256, Math.round(n / 16) * 16));
  return `${q(w)}x${q(h)}`;
}
const isFlexible = (model: string) => /^gpt-image-2/.test(model);

const blob = (r: ImgRef) => new Blob([r.bytes], { type: r.mime });
async function send(i: OpenAIImageInput, size: string): Promise<Response> {
  const base = (i.base ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const quality = ["low", "medium", "high"].includes(i.quality) ? i.quality : "high";
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

/** Gera (ou edita) uma imagem. Devolve o PNG e o "usage" (tokens) para calcular o custo real. */
export async function openaiImage(i: OpenAIImageInput): Promise<{ bytes: Uint8Array; usage: OpenAIUsage | null; size: string }> {
  let size = isFlexible(i.model) ? customSize(i.aspect) : legacySize(i.aspect);
  let res = await send(i, size);
  // se a API recusar o tamanho livre, tenta de novo com os tamanhos clássicos
  if (!res.ok && res.status === 400 && size !== legacySize(i.aspect)) {
    const txt = await res.text();
    if (/size/i.test(txt)) { size = legacySize(i.aspect); res = await send(i, size); }
    else throw new Error(`OpenAI imagem: 400 ${txt.slice(0, 500)}`);
  }
  if (!res.ok) throw new Error(`OpenAI imagem (${i.model}): ${res.status} ${(await res.text()).slice(0, 500)}`);
  const data = await res.json();
  const item = data?.data?.[0];
  const usage = (data?.usage ?? null) as OpenAIUsage | null;
  if (item?.b64_json) return { bytes: Uint8Array.from(atob(item.b64_json), (c) => c.charCodeAt(0)), usage, size };
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
