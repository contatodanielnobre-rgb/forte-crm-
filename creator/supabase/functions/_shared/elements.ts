// Personagens, objetos, logo e referências de concorrentes do Estúdio.
// Regras de escolha das imagens enviadas ao gerador + blocos de prompt + ditado por voz. Sem imports: roda no Deno (Edge Function) e no Node (demo).

export type Pos = "tl" | "tc" | "tr" | "ml" | "mc" | "mr" | "bl" | "bc" | "br";
export const POS_LABEL: Record<Pos, string> = {
  tl: "canto superior esquerdo", tc: "topo, centralizada", tr: "canto superior direito",
  ml: "meio, no lado esquerdo", mc: "centro", mr: "meio, no lado direito",
  bl: "canto inferior esquerdo", bc: "base, centralizada", br: "canto inferior direito",
};
export const LOGO_SIZE: Record<string, { label: string; pct: number }> = { sm: { label: "pequena", pct: 10 }, md: { label: "média", pct: 16 }, lg: { label: "grande", pct: 24 } };

/** Onde a logo aparece: lista de slides (1 = capa). Vazia = em nenhum. */
export interface LogoPlan { asset_id: string | null; position: Pos; size: "sm" | "md" | "lg"; slides: number[] }
export interface CompetitorPlan { asset_ids: string[]; intensity: number }
export interface CastItem { id: string; kind: "character" | "object"; label: string; description?: string | null }

export const isCast = (kind: string) => kind === "character" || kind === "object";
export const logoOnSlide = (p: LogoPlan | null | undefined, idx: number) => !!p && p.slides.includes(idx);

// ------------------------------------------------------------------------------------------------
// Escolha das imagens que vão junto com cada slide
// ------------------------------------------------------------------------------------------------
export interface PoolAsset { id: string; kind: string; storage_path: string; thumb_path?: string | null; favorite?: boolean; tags?: string[] | null; label?: string | null; caption?: string | null; name?: string; created_at?: string }
export interface PickedRef { asset: PoolAsset; role: "logo" | "cast" | "style" | "competitor" }

/**
 * Ordem enviada ao gerador: logo → personagens/objetos → referências de estilo → posts de concorrentes.
 * (o slide 1 do carrossel, quando existe, entra na frente de tudo — isso é feito por quem chama)
 * `ids` = ref_asset_ids do slide: personagens/objetos escolhidos + (opcional) referências de estilo escolhidas à mão.
 */
export function selectImageRefs(o: { pool: PoolAsset[]; ids: string[]; style: string | null; perSlide: number; logo: LogoPlan | null | undefined; idx: number; competitor: CompetitorPlan | null | undefined; mainLogoId?: string | null }): PickedRef[] {
  const out: PickedRef[] = [];
  const byFav = (a: PoolAsset, b: PoolAsset) => Number(b.favorite) - Number(a.favorite) || String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
  const explicitStyle = o.ids.length > 0 && o.pool.some((a) => a.kind === "reference" && o.ids.includes(a.id));

  // logo
  const logos = o.pool.filter((a) => a.kind === "logo").sort((a, b) => Number(b.id === o.mainLogoId) - Number(a.id === o.mainLogoId) || byFav(a, b)); // a logo principal da empresa vem primeiro
  if (o.logo) {
    if (logoOnSlide(o.logo, o.idx)) { const l = logos.find((a) => a.id === o.logo!.asset_id) ?? logos[0]; if (l) out.push({ asset: l, role: "logo" }); }
  } else if (logos[0] && (!o.ids.length || o.ids.includes(logos[0].id) || !explicitStyle)) {
    out.push({ asset: logos[0], role: "logo" }); // sem plano de logo: comportamento antigo (logo sempre junto)
  }
  // personagens e objetos escolhidos para este slide
  for (const id of o.ids) { const a = o.pool.find((x) => x.id === id && isCast(x.kind)); if (a && out.length < 8) out.push({ asset: a, role: "cast" }); }
  // referências de estilo: as escolhidas à mão, senão as do estilo do post e as favoritas
  const styles = o.pool.filter((a) => a.kind === "reference");
  const rank = (a: PoolAsset) => (o.style && (a.tags ?? []).includes(o.style) ? 0 : 1);
  const chosen = explicitStyle ? styles.filter((a) => o.ids.includes(a.id)).slice(0, 8) : [...styles].sort((x, y) => rank(x) - rank(y) || byFav(x, y)).slice(0, o.perSlide);
  chosen.forEach((a) => out.push({ asset: a, role: "style" }));
  // posts de concorrentes (referência de estrutura)
  if (o.competitor?.asset_ids?.length) o.pool.filter((a) => a.kind === "competitor" && o.competitor!.asset_ids.includes(a.id)).slice(0, 4).forEach((a) => out.push({ asset: a, role: "competitor" }));
  return out;
}

// ------------------------------------------------------------------------------------------------
// Blocos de prompt
// ------------------------------------------------------------------------------------------------
export interface Attachment { role: "prev" | "logo" | "cast" | "style" | "competitor"; label?: string | null; kind?: string; description?: string | null }

export function attachmentsBlock(list: Attachment[]): string {
  if (!list.length) return "";
  const lines: string[] = [];
  let i = 0;
  while (i < list.length) {
    const a = list[i]; const n = i + 1;
    if (a.role === "style" || a.role === "competitor") {
      let j = i; while (j + 1 < list.length && list[j + 1].role === a.role) j++;
      const rng = j > i ? `Imagens ${n}–${j + 1}` : `Imagem ${n}`;
      lines.push(a.role === "style"
        ? `- ${rng} — REFERÊNCIAS DE ESTILO da própria marca: siga linguagem visual, composição, tipografia e acabamento delas, sem copiar o conteúdo literal.`
        : `- ${rng} — POSTS DE CONCORRENTES, só como referência de estrutura e composição (veja a regra de semelhança abaixo). NUNCA reproduza o texto, a logo, o nome ou a identidade deles.`);
      i = j + 1; continue;
    }
    if (a.role === "prev") lines.push(`- Imagem ${n} — o SLIDE 1 deste mesmo carrossel: mantenha continuidade total de estilo, fonte, cores e realismo.`);
    else if (a.role === "logo") lines.push(`- Imagem ${n} — a LOGO oficial da marca: quando for usada, reproduza-a EXATAMENTE como está (forma, letras, cores e proporções). Não redesenhe nem invente variações.`);
    else if (a.kind === "character") lines.push(`- Imagem ${n} — PERSONAGEM "${a.label || "personagem"}": é uma pessoa definida. Sempre que ${a.label || "o personagem"} aparecer, use ESTA MESMA pessoa (rosto, cabelo, tom de pele, idade, traços marcantes e, se não houver outra instrução, a mesma roupa). Não crie outro rosto.${a.description ? ` Descrição: ${a.description}` : ""}`);
    else lines.push(`- Imagem ${n} — OBJETO "${a.label || "objeto"}": reproduza o MESMO objeto (modelo, cor, acabamento, placa/letras/marcas visíveis exatamente como na foto, detalhes e proporções). Não troque por outro modelo.${a.description ? ` Descrição: ${a.description}` : ""}`);
    i++;
  }
  return `# IMAGENS ANEXADAS (na ordem em que foram enviadas)\n${lines.join("\n")}`;
}

export function castSlideBlock(att: Attachment[]): string {
  const names = att.filter((a) => a.role === "cast").map((a) => `${a.label} (${a.kind === "character" ? "personagem" : "objeto"})`);
  return names.length ? `NESTE SLIDE devem aparecer: ${names.join(", ")}. Mostre-os conforme a direção visual deste slide, fiéis às imagens anexadas. Se não houver instrução de posição, integre-os de forma natural à cena e à hierarquia do texto.` : "";
}

export function logoBlock(plan: LogoPlan | null | undefined, idx: number, hasFile: boolean, attachIndex?: number): string {
  if (!plan) return "";
  if (!logoOnSlide(plan, idx)) return "LOGO: NÃO coloque a logo da marca neste slide (nem logotipo escrito, nem selo da marca). Esta instrução vale mais que qualquer regra de logo da skill.";
  if (!hasFile) return "";
  const s = LOGO_SIZE[plan.size] ?? LOGO_SIZE.md;
  return `LOGO NESTE SLIDE: aplique a logo da marca${attachIndex ? ` (imagem ${attachIndex})` : ""} no ${POS_LABEL[plan.position] ?? POS_LABEL.br}, tamanho ${s.label} (largura ≈ ${s.pct}% da arte), com margem de segurança, sem cobrir o texto e reproduzida fielmente ao arquivo. Esta instrução de logo vale mais que qualquer regra da skill.`;
}

export function competitorBrief(intensity: number): string {
  const v = Math.max(0, Math.min(100, Math.round(intensity)));
  if (v >= 80) return `SEMELHANÇA ALTA (${v}%): reproduza de perto a ESTRUTURA dos posts de concorrentes (composição, hierarquia do texto, ritmo, tipo de fundo e de enquadramento, uso de destaque), mas com a identidade, as cores, as fontes, a logo e o conteúdo da NOSSA marca. Deve parecer da mesma categoria, não uma cópia.`;
  if (v >= 55) return `SEMELHANÇA MÉDIA (${v}%): inspire-se na lógica dos posts de concorrentes (como organizam título, imagem e destaque), mas dê à peça uma cara própria da nossa marca: composição e acabamento claramente nossos.`;
  if (v >= 30) return `SEMELHANÇA BAIXA (${v}%): use os posts de concorrentes só para entender o que o mercado faz e fazer DIFERENTE. Pegue no máximo o tema; composição, estilo e acabamento devem ser próprios da nossa marca.`;
  return `SEM SEMELHANÇA (${v}%): os posts de concorrentes mostram o que o mercado já faz; crie algo propositalmente DIFERENTE e próprio da nossa marca, evitando as fórmulas visuais deles.`;
}

export function competitorBlock(plan: CompetitorPlan | null | undefined, has: boolean): string {
  return plan && has ? `# REGRA DE SEMELHANÇA COM CONCORRENTES\n${competitorBrief(plan.intensity)}` : "";
}

/** Para o AGENTE (criador de prompts): quem está disponível, onde a logo entra e o que fazer com os concorrentes */
export function ideateElementsBlock(o: { cast: CastItem[]; logoNote?: string | null; competitor?: { intensity: number; n: number } | null }): string {
  const parts: string[] = [];
  if (o.cast.length) {
    parts.push(`# PERSONAGENS E OBJETOS DESTE POST
O usuário anexou imagens de referência que serão enviadas ao gerador junto com o slide. Disponíveis (use o nome exato):
${o.cast.map((c) => `- ${c.label} (${c.kind === "character" ? "personagem" : "objeto"})${c.description ? `: ${c.description}` : ""}`).join("\n")}
REGRAS: (1) Onde o usuário disser (ex.: "@Dennis aparece na capa") coloque o item nesse slide. Se ele não disser onde, use na capa e onde fizer sentido para o tema, sem forçar em todos os slides. (2) Em cada slide devolva "cast": ["nome exato", ...] apenas com os itens que realmente aparecem naquele slide e escreva na direção visual ("visual") o que cada um faz, onde fica e em que escala, chamando-o pelo nome (ex.: "Dennis de braços cruzados à direita"). (3) NUNCA descreva rosto nem invente traços: eles vêm da imagem de referência. (4) Para um objeto como veículo, preserve modelo, cor e placa da referência. (5) Itens não escolhidos para o slide não entram no "cast" dele.`);
  }
  if (o.logoNote) parts.push(`# LOGO\n${o.logoNote} Reserve espaço limpo para a logo na direção visual desses slides; NÃO escreva o nome da marca como texto no lugar da logo.`);
  if (o.competitor && o.competitor.n > 0) parts.push(`# POSTS DE CONCORRENTES (referência)\nO usuário anexou ${o.competitor.n} post(s) de concorrentes (imagens na mensagem). ${competitorBrief(o.competitor.intensity)} Nunca copie textos, nomes, logos ou promessas deles.`);
  return parts.join("\n\n");
}

export const DESCRIBE_SYSTEM = "Você descreve imagens com precisão para que um gerador de imagens reproduza o MESMO personagem ou objeto em novas cenas.";
export function describePrompt(kind: "character" | "object", label?: string | null): string {
  return kind === "character"
    ? `Descreva APENAS a IDENTIDADE FACIAL da pessoa${label ? ` "${label}"` : ""} desta foto, para recriar o MESMO rosto em outras cenas: idade aparente, gênero aparente, tom de pele, formato do rosto, cabelo (cor, comprimento, estilo, linha do cabelo), barba/bigode (formato e densidade), olhos (cor e formato), sobrancelhas, nariz, óculos, brincos e marcas marcantes DO ROSTO. NÃO descreva roupa, pose, braços, mãos, relógio, acessórios do corpo, fundo, luz nem a expressão do momento: a pessoa será colocada em cenas com roupas, poses, ângulos e expressões DIFERENTES, então a descrição não pode prendê-la à foto. Se houver tatuagens ou marcas visíveis no corpo, liste em "body_marks" (vazio se não houver). Informe também "face_box": a caixa da cabeça inteira (cabelo, orelhas, queixo e pescoço até as clavículas) em frações de 0 a 1 da imagem. Responda SOMENTE JSON: {"description":"3 a 4 frases só do rosto","short":"até 8 palavras","body_marks":"","face_box":{"x":0.0,"y":0.0,"w":0.0,"h":0.0}}.`
    : `Descreva o objeto${label ? ` "${label}"` : ""} desta foto para recriá-lo com fidelidade em outras cenas: tipo, marca e modelo SE estiverem visíveis, cor exata, acabamento, materiais, detalhes marcantes, textos/placa/letras visíveis (transcreva exatamente), acessórios, estado e ângulo. Seja objetivo e factual. Responda SOMENTE JSON: {"description":"3 a 5 frases","short":"até 8 palavras"}.`;
}

// ------------------------------------------------------------------------------------------------
// Ditado por voz (OpenAI gpt-4o-transcribe, com plano B)
// ------------------------------------------------------------------------------------------------
export const TRANSCRIBE_MODELS = ["gpt-4o-transcribe", "gpt-4o-mini-transcribe", "whisper-1"];
const HALLUCINATIONS = /^(obrigad[oa]( por assistir)?[.!]?|legendas? (pela|por) comunidade.*|tchau[.!]?|até a próxima[.!]?|inscreva-se.*)$/i;

export function vocabularyPrompt(terms: string[], tail?: string): string {
  const list = Array.from(new Set(terms.map((t) => t.trim()).filter(Boolean))).slice(0, 60).join(", ");
  return `Transcrição em português do Brasil de alguém ditando uma ideia de post. Use pontuação e maiúsculas corretas (vírgulas, pontos, interrogações). Termos e nomes que podem aparecer: ${list}.${tail ? ` Trecho anterior: ${tail.slice(-220)}` : ""}`;
}

export async function transcribeAudio(o: { key: string; base?: string; bytes: Uint8Array; mime: string; prompt?: string; language?: string; models?: string[] }): Promise<{ text: string; model: string }> {
  const base = (o.base ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const ext = /mp4|m4a/.test(o.mime) ? "m4a" : /wav/.test(o.mime) ? "wav" : /mpeg|mp3/.test(o.mime) ? "mp3" : /ogg/.test(o.mime) ? "ogg" : "webm";
  let lastErr = "";
  for (const model of o.models ?? TRANSCRIBE_MODELS) {
    const fd = new FormData();
    fd.set("model", model); fd.set("language", o.language ?? "pt"); fd.set("response_format", "json");
    if (o.prompt) fd.set("prompt", o.prompt.slice(0, 900));
    fd.set("file", new Blob([o.bytes], { type: o.mime || "audio/webm" }), `audio.${ext}`);
    const res = await fetch(`${base}/audio/transcriptions`, { method: "POST", headers: { Authorization: `Bearer ${o.key}` }, body: fd });
    if (res.ok) {
      const data = await res.json();
      const text = String(data?.text ?? "").trim();
      return { text: HALLUCINATIONS.test(text) ? "" : text, model };
    }
    lastErr = `${res.status} ${(await res.text()).slice(0, 300)}`;
    if (res.status !== 400 && res.status !== 404) break; // só tenta o próximo modelo se este não existir/for recusado
  }
  throw new Error(`Transcrição (OpenAI): ${lastErr}`);
}
