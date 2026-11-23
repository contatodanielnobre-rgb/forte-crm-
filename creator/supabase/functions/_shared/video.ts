// Editor de vídeo (VPS): estilos prontos (vindos das skills da agência), prompt do "diretor de edição" e validação do plano.
// Código compartilhado entre a Edge Function `studio-generate` (Deno) e o servidor de demonstração (Node).
// Roda só TypeScript "apagável" (sem enum/namespace) para o Node abrir direto.

export type VideoEngine = "edit" | "saas" | "hyperframes";
export type CaptionVariant = "stacked" | "karaoke" | "single" | "boxed" | "none";

export interface VideoStyleSeed {
  slug: string;
  name: string;
  description: string;
  engine: VideoEngine;
  caption_variant: CaptionVariant;
  sfx: boolean;
  rules: string;
}

/** Estilos que já vêm no sistema. São a "skill" de edição: o diretor de edição (IA) segue estas regras. */
export const VIDEO_STYLES_BUILTIN: VideoStyleSeed[] = [
  {
    slug: "fala-dinamica",
    name: "Fala para câmera — dinâmico",
    description: "Cortes secos sem respiro, punch-in alternado, legenda karaokê e efeitos sutis nas viradas.",
    engine: "edit",
    caption_variant: "karaoke",
    sfx: true,
    rules: [
      "Formato vertical 1080x1920, 30 fps. Topo (~250 px) e rodapé (~400 px) livres de informação crítica.",
      "Corte todo silêncio e respiro longo; ritmo de Reels. Remova erros de fala e repetições (use cut.remove).",
      "Legenda karaokê: 3–5 palavras por bloco, a palavra falada acende. Destaque 1 palavra de impacto por frase (captions.emphasis).",
      "Punch-in alternado entre cortes (look.punch_in = true) e 2–5 zooms de ênfase nos pontos fortes.",
      "Palavras-chave na tela só nos 3–6 momentos mais importantes, sincronizadas com a fala (overlays tipo keyword).",
      "Efeitos sonoros: whoosh/swoosh nas viradas e nos overlays; pop/click discretos. Nunca mais de 1 efeito a cada ~2 s.",
      "Sem emoji, sem badges em pílula, sem gradiente roxo. Cor de destaque = a da marca.",
    ].join("\n"),
  },
  {
    slug: "reels-pianista",
    name: "Reels Pianista — motion + legenda empilhada",
    description: "Estilo da Agência Pianista: legenda empilhada (linha pequena + palavra de impacto), palavras-chave animadas, sem cara de IA.",
    engine: "edit",
    caption_variant: "stacked",
    sfx: false,
    rules: [
      "Vertical 1080x1920, 30 fps. Cada vídeo precisa parecer diferente do anterior: varie fonte, cor de destaque e tipo de transição.",
      "Legenda EMPILHADA para pessoa falando para a câmera: linha pequena em caixa alta + palavra de impacto grande em fonte de destaque (itálica serifada é permitida só aqui).",
      "Em vídeo narrado (voz em off) use a legenda 'boxed': palavra falada em branco sobre tarja colorida de cantos quase retos.",
      "Palavras-chave sincronizadas com a fala, com ícone que se desenha; complementam a legenda, não a substituem.",
      "NÃO use: badges/etiquetas decorativas no canto, degradê roxo, orbes, emoji, cards idênticos, copy genérica, legenda padrão solta de editor.",
      "Cortes pelo áudio (energia da fala), com folga no fim de cada trecho — nunca cortar o final de uma palavra.",
      "SFX só se o usuário pedir. Identidade do cliente manda: fontes, cores e logo dele; a logo não é redesenhada.",
      "Não invente número, preço, depoimento ou nome que não esteja na fala ou no briefing.",
    ].join("\n"),
  },
  {
    slug: "narrado-boxed",
    name: "Narrado com legenda em tarja (CIAMP)",
    description: "Vídeo com voz em off: legenda frase a frase, palavra falada em branco sobre tarja colorida; palavras-chave com ícone.",
    engine: "edit",
    caption_variant: "boxed",
    sfx: false,
    rules: [
      "Legenda falada frase a frase (2–5 palavras): palavra falada em BRANCO sobre tarja colorida (cor da marca) de cantos quase retos; palavras já ditas brancas, próximas mais fracas; no terço inferior.",
      "Texto da tela = fala (grafia correta). Palavras-chave com ícone sincronizadas com a fala.",
      "Final com cartão de logo parado ~4 s (outro.enabled = true) e a chamada para ação da marca.",
      "Transições limpas (sem flash); ritmo calmo e profissional. Sem emoji.",
    ].join("\n"),
  },
  {
    slug: "saas-google",
    name: "Produto SaaS — estilo apresentação Google",
    description: "Texto palavra por palavra, janelas de interface animadas, cursor, barra de progresso, confete e logo animada (motor saas-video).",
    engine: "saas",
    caption_variant: "none",
    sfx: true,
    rules: [
      "Use engine = saas e preencha 'storyboard' com o vocabulário do motor (cenas swap, title, ui, chips, progress, stat, media, cta, logo).",
      "Uma ideia por cena; no máximo ~7 palavras na tela; título em até 2 linhas; *palavra* destaca com a cor da marca; sem CAIXA ALTA gritante, sem emoji.",
      "Tema: light-fluid (produtividade/B2B amigável), dark-minimal (dev/design, lançamento seco) ou google-bright (IA/consumo). Neutro + UMA cor de marca.",
      "Estrutura 30–60 s: gancho em até 3 s → problema/promessa → demonstração (ui) → recursos (chips) → prova (stat/progress) → CTA → logo + URL.",
      "Texto nunca com corte seco; cada cena de 2,5–5 s (ui até 5,5 s). Português correto, com acentos revisados.",
      "Não invente número ou prova. Se faltar dado, use cenas sem número.",
    ].join("\n"),
  },
  {
    slug: "motion-tipografico",
    name: "Motion tipográfico (HyperFrames)",
    description: "Vídeo de texto animado, ritmado, com fundo gradiente da marca — HTML + GSAP renderizado pelo HyperFrames.",
    engine: "hyperframes",
    caption_variant: "none",
    sfx: true,
    rules: [
      "Use engine = hyperframes e preencha 'scenes' (title, bullets, stat, quote, cta). Cada cena de 2–4 s, texto curto (≤ 8 palavras).",
      "Fundo com gradiente suave da cor da marca; uma única fonte de destaque. Texto entra palavra por palavra e sai por dissolve.",
      "Se houver vídeo enviado, ele entra como camada de fundo (scenes.type = 'video') com legendas por cima.",
      "SFX: whoosh na troca de cena e pop quando entra cada item.",
    ].join("\n"),
  },
  {
    slug: "corte-podcast",
    name: "Cortes de podcast / entrevista",
    description: "Seleciona os melhores trechos, remove vazios e erros, legenda grande em tarja e barra de progresso.",
    engine: "edit",
    caption_variant: "boxed",
    sfx: false,
    rules: [
      "Se o material for longo, use cut.remove para ficar só com os trechos mais fortes (gancho nos primeiros 3 s, fechamento com conclusão).",
      "Remova pausas > 0,4 s, 'né', 'hã' e repetições. Velocidade 1.0 a 1.08.",
      "Legenda boxed grande no terço inferior; destaque a palavra mais forte de cada bloco.",
      "Barra de progresso fina no topo (overlays tipo progress) e título com o tema nos primeiros 2 s (overlay title).",
    ].join("\n"),
  },
];

// ---------------------------------------------------------------------------------------------------
// Prompt do diretor de edição
// ---------------------------------------------------------------------------------------------------
export interface SfxItem { id: string; tags: string[]; dur: number }
export interface VideoPlanInput {
  instruction: string;
  format: string;
  engine: VideoEngine | "auto";
  style?: { name?: string; rules?: string; caption_variant?: string; engine?: string } | null;
  brand?: { name?: string; colors?: string[]; fonts?: string[]; cta?: string; voice?: string; logo?: boolean; handle?: string; website?: string } | null;
  options: { cut_silence?: boolean; captions?: boolean; sfx?: boolean; outro?: boolean; max_seconds?: number };
  transcript?: { language?: string; duration?: number; words?: { w: string; s: number; e: number }[]; sentences?: { start: number; end: number; text: string }[] } | null;
  clips?: { name: string; start: number; end: number; width?: number; height?: number }[];
  hasVideo: boolean;
  hasAudioSpeech: boolean;
  sfx?: SfxItem[];
  reference?: { stats?: Record<string, unknown>; note?: string } | null;
  feedback?: string | null;
  previousPlan?: unknown;
}

const num = (v: unknown, d: number, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const hex = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v.trim()) ? v.trim() : d);

export const PLAN_FORMAT_DOC = `Responda SOMENTE com JSON válido neste formato (todos os tempos em SEGUNDOS da linha do tempo do material enviado, já concatenado):
{
  "summary": "o que você vai fazer, em 1–2 frases em português",
  "engine": "edit" | "saas" | "hyperframes",
  "cut": { "silences": true, "min_gap": 0.45, "pad": 0.12, "speed": 1.0, "remove": [ { "start": 12.3, "end": 15.0, "why": "erro de fala" } ] },
  "captions": { "variant": "stacked" | "karaoke" | "single" | "boxed" | "none", "emphasis": ["palavras de impacto, na grafia falada"] },
  "look": { "accent": "#RRGGBB", "text": "#FFFFFF", "box": "#RRGGBB", "font": "nome de fonte do Google Fonts", "accent_font": "fonte de destaque", "punch_in": true },
  "zooms": [ { "at": 4.2, "dur": 1.0, "scale": 1.12 } ],
  "overlays": [ { "type": "keyword" | "title" | "stat" | "lower_third" | "flash" | "progress", "at": 2.1, "dur": 1.6, "text": "texto curto", "sub": "linha de apoio opcional" } ],
  "sfx": [ { "id": "id do catálogo", "at": 2.1, "vol": 0.7 } ],
  "outro": { "enabled": true, "text": "chamada para ação", "dur": 3 },
  "storyboard": { "...": "SOMENTE se engine = saas (vocabulário do motor saas-video)" },
  "scenes": [ { "type": "title" | "bullets" | "stat" | "quote" | "cta" | "video", "text": "...", "items": ["..."], "value": "...", "dur": 3 } ]
}
Regras: omita campos que não se aplicam; nunca invente fatos; tempos dentro da duração do material; no máximo 12 overlays e 24 efeitos sonoros.`;

/** Vocabulário do motor saas-video (resumo de references/storyboard-schema.md da skill). Só entra no prompt quando o motor pode ser saas. */
export const SAAS_DOC = `MOTOR saas-video — preencha "storyboard" assim (tudo em português correto, com acentos):
{ "meta": { "theme": "light-fluid" | "dark-minimal" | "google-bright", "font": "inter" | "dmsans", "brand": { "name": "...", "color": "#RRGGBB", "url": "site.com" } },
  "scenes": [ ...de 6 a 10 cenas, cada uma com "type", "start" (s), "dur" (s) e, se houver narração, "cue" (frase literal falada que dispara a cena)... ] }
Tipos de cena e campos OBRIGATÓRIOS:
- "swap": gancho com palavra que troca → "prefix" (ex.: "Transforme"), "items" (2 a 4 palavras), "suffix" opcional.
- "title": afirmação → "text" (até 7 palavras, "\\n" quebra linha, *palavra* destaca com a cor da marca), "sub" opcional.
- "ui": demonstração de produto → "variant": "library" (grade de cards: "items" com até 8 rótulos curtos) | "chat" ("prompt" até 45 caracteres e "reply" até 90) | "dashboard" ("stats": até 3 { "label", "value" } como "R$ 84,2k", "1.280", "12,4%"); opcional "title".
- "chips": lista de recursos → "text" e "chips" (3 a 5 itens de até 14 caracteres).
- "progress": processamento → resultado → "label", "doneLabel".
- "stat": prova numérica → "value" (inteiro), "prefix", "suffix", "label". SÓ use número que o usuário forneceu.
- "cta": chamada para ação → "text" e "button".
- "logo": encerramento → "tagline" opcional (a logo e o site da marca aparecem sozinhos).
Estrutura de 30–60 s: gancho (swap/title, até 3 s) → promessa → demonstração (ui) → recursos (chips) → prova (stat/progress, só com dado real) → cta → logo. Cada cena de 2,5 a 5 s. Sem emoji, sem CAIXA ALTA, no máximo ~7 palavras na tela.`;

export const HF_DOC = `MOTOR hyperframes — preencha "scenes" assim (cada cena de 2 a 4 s, texto curto):
[ { "type": "title", "text": "frase de até 8 palavras", "dur": 3 },
  { "type": "bullets", "text": "título", "items": ["item 1", "item 2", "item 3"], "dur": 4 },
  { "type": "stat", "value": "30%", "text": "legenda do número", "dur": 3 },
  { "type": "quote", "text": "frase de destaque", "dur": 3 },
  { "type": "cta", "text": "chamada para ação", "items": ["texto do botão"], "dur": 3 } ]
Se houver narração, inclua "cue" (frase literal falada) em cada cena. Comece com um gancho forte e termine com "cta".`;

export function videoPlanSystem(i: VideoPlanInput): string {
  const b = i.brand ?? {};
  const lines: string[] = [];
  lines.push("Você é o DIRETOR DE EDIÇÃO de vídeo da Forte Company, uma agência de marketing. Recebe o pedido do usuário, a transcrição com tempos das palavras e o catálogo de efeitos sonoros, e devolve um PLANO DE EDIÇÃO em JSON que uma máquina vai executar (ffmpeg + Remotion/HyperFrames).");
  lines.push("Você não vê o vídeo: decide pelo que foi falado, pelos tempos e pelo pedido. Seja específico e conservador; prefira poucos recursos bem colocados a muitos.");
  lines.push(`Formato de saída do vídeo: ${i.format}.`);
  if (b.name) lines.push(`Empresa: ${b.name}${b.handle ? ` (${b.handle})` : ""}${b.website ? ` — ${b.website}` : ""}.`);
  if (b.voice) lines.push(`Tom da marca: ${b.voice}`);
  if (b.colors?.length) lines.push(`Cores da marca (use como accent/box): ${b.colors.join(", ")}.`);
  if (b.fonts?.length) lines.push(`Fontes da marca (use em look.font / look.accent_font): ${b.fonts.join(", ")}.`);
  if (b.cta) lines.push(`Chamada para ação da marca: "${b.cta}".`);
  if (i.style?.rules) lines.push(`\nESTILO ESCOLHIDO — ${i.style.name ?? ""}\n${i.style.rules}`);
  const o = i.options ?? {};
  lines.push("\nOpções marcadas pelo usuário:");
  lines.push(`- cortar silêncios: ${o.cut_silence === false ? "NÃO (mantenha as pausas: cut.silences=false)" : "sim"}`);
  lines.push(`- legendas: ${o.captions === false ? "NÃO (captions.variant = none)" : "sim"}`);
  lines.push(`- efeitos sonoros: ${o.sfx === false ? "NÃO (sfx = [])" : "sim"}`);
  lines.push(`- cartão final: ${o.outro === false ? "NÃO" : "se fizer sentido"}`);
  if (o.max_seconds) lines.push(`- duração máxima: ${o.max_seconds} s (use cut.remove para chegar lá, preservando gancho e conclusão)`);
  if (i.engine !== "auto") lines.push(`\nMotor obrigatório: ${i.engine}.`);
  else lines.push("\nEscolha o motor: 'edit' (padrão quando há vídeo/áudio enviado), 'saas' (vídeo de produto SaaS a partir de narração/roteiro) ou 'hyperframes' (motion tipográfico).");
  if (!i.hasVideo) lines.push("Não há vídeo enviado: é criação do zero (motion). Use 'saas' ou 'hyperframes' e descreva as cenas.");
  if (i.sfx?.length) lines.push(`\nCATÁLOGO DE EFEITOS SONOROS (use só estes ids):\n${i.sfx.map((s) => `${s.id} [${s.tags.slice(0, 4).join(", ")}] ${s.dur}s`).join("\n")}`);
  if (i.reference) lines.push(`\nREFERÊNCIA enviada pelo usuário (imitar a LINGUAGEM — ritmo, legenda, movimentos — sem copiar marca/identidade):\n${JSON.stringify(i.reference).slice(0, 2500)}`);
  const sEngine = i.style?.engine;
  const maySaas = i.engine === "saas" || (i.engine === "auto" && (sEngine === "saas" || !i.hasVideo));
  const mayHf = i.engine === "hyperframes" || (i.engine === "auto" && (sEngine === "hyperframes" || !i.hasVideo));
  if (maySaas) lines.push("\n" + SAAS_DOC);
  if (mayHf) lines.push("\n" + HF_DOC);
  lines.push("\n" + PLAN_FORMAT_DOC);
  return lines.join("\n");
}

export function videoPlanUser(i: VideoPlanInput): string {
  const parts: string[] = [];
  parts.push(`PEDIDO DO USUÁRIO:\n${i.instruction || "(sem instruções: faça uma edição dinâmica padrão)"}`);
  if (i.feedback) parts.push(`AJUSTE PEDIDO SOBRE A VERSÃO ANTERIOR:\n${i.feedback}\n\nPLANO ANTERIOR (altere só o necessário):\n${JSON.stringify(i.previousPlan ?? {}).slice(0, 12000)}`);
  if (i.clips?.length) parts.push(`TRECHOS ENVIADOS (já concatenados nesta ordem):\n${i.clips.map((c, n) => `${n + 1}. ${c.name} — de ${c.start.toFixed(1)}s a ${c.end.toFixed(1)}s${c.width ? ` (${c.width}x${c.height})` : ""}`).join("\n")}`);
  const t = i.transcript;
  if (t?.sentences?.length) {
    parts.push(`TRANSCRIÇÃO POR FRASE (idioma ${t.language ?? "?"}, duração total ${t.duration ?? "?"}s):\n${t.sentences.map((s) => `[${s.start.toFixed(1)}–${s.end.toFixed(1)}] ${s.text}`).join("\n").slice(0, 24000)}`);
  } else if (i.hasVideo) parts.push("TRANSCRIÇÃO: nenhuma fala detectada (o vídeo pode ser mudo ou só música). Não use legenda; foque em cortes, zooms e overlays.");
  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------------------------------
// Validação: a IA erra; o worker nunca recebe um plano que quebre o render
// ---------------------------------------------------------------------------------------------------
export interface VideoPlan {
  summary: string;
  engine: VideoEngine;
  cut: { silences: boolean; min_gap: number; pad: number; speed: number; remove: { start: number; end: number; why?: string }[] };
  captions: { variant: CaptionVariant; emphasis: string[] };
  look: { accent: string; text: string; box: string; font: string; accent_font: string; punch_in: boolean };
  zooms: { at: number; dur: number; scale: number }[];
  overlays: { type: string; at: number; dur: number; text: string; sub: string }[];
  sfx: { id: string; at: number; vol: number }[];
  outro: { enabled: boolean; text: string; dur: number };
  storyboard?: Record<string, unknown> | null;
  scenes?: Record<string, unknown>[] | null;
}

export function sanitizePlan(raw: unknown, ctx: { duration: number; sfxIds: string[]; brandColor?: string; engine: VideoEngine | "auto"; options: VideoPlanInput["options"]; styleVariant?: string }): VideoPlan {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const dur = Math.max(1, ctx.duration || 60);
  const engines: VideoEngine[] = ["edit", "saas", "hyperframes"];
  const engine: VideoEngine = ctx.engine !== "auto" ? ctx.engine : engines.includes(r.engine) ? r.engine : "edit";
  const variants: CaptionVariant[] = ["stacked", "karaoke", "single", "boxed", "none"];
  let variant: CaptionVariant = variants.includes(r.captions?.variant) ? r.captions.variant : (variants.includes(ctx.styleVariant as CaptionVariant) ? (ctx.styleVariant as CaptionVariant) : "karaoke");
  if (ctx.options.captions === false) variant = "none";
  const accent = hex(r.look?.accent, ctx.brandColor ?? "#FFD60A");
  const sfxOk = new Set(ctx.sfxIds);
  const within = (t: unknown) => num(t, 0, 0, dur);
  const overlayTypes = ["keyword", "title", "stat", "lower_third", "flash", "progress"];
  const rm: { start: number; end: number; why?: string }[] = Array.isArray(r.cut?.remove) ? r.cut.remove.slice(0, 80).map((x: any) => ({ start: within(x?.start), end: within(x?.end), why: str(x?.why, 80) })).filter((x: { start: number; end: number }) => x.end - x.start >= 0.2) : [];
  return {
    summary: str(r.summary, 400) || "Edição dinâmica padrão.",
    engine,
    cut: { silences: ctx.options.cut_silence === false ? false : r.cut?.silences !== false, min_gap: num(r.cut?.min_gap, 0.45, 0.2, 2), pad: num(r.cut?.pad, 0.12, 0.05, 0.4), speed: num(r.cut?.speed, 1, 0.8, 1.5), remove: rm },
    captions: { variant, emphasis: Array.isArray(r.captions?.emphasis) ? r.captions.emphasis.map((x: unknown) => str(x, 40)).filter(Boolean).slice(0, 60) : [] },
    look: { accent, text: hex(r.look?.text, "#FFFFFF"), box: hex(r.look?.box, accent), font: str(r.look?.font, 60) || "Montserrat", accent_font: str(r.look?.accent_font, 60) || str(r.look?.font, 60) || "Playfair Display", punch_in: r.look?.punch_in !== false },
    zooms: Array.isArray(r.zooms) ? r.zooms.slice(0, 12).map((z: any) => ({ at: within(z?.at), dur: num(z?.dur, 1, 0.4, 3), scale: num(z?.scale, 1.12, 1.03, 1.35) })) : [],
    overlays: Array.isArray(r.overlays) ? r.overlays.slice(0, 12).filter((o: any) => overlayTypes.includes(o?.type)).map((o: any) => ({ type: o.type, at: within(o?.at), dur: num(o?.dur, 1.6, 0.4, 8), text: str(o?.text, 80), sub: str(o?.sub, 100) })) : [],
    sfx: ctx.options.sfx === false ? [] : Array.isArray(r.sfx) ? r.sfx.slice(0, 24).filter((s: any) => sfxOk.has(s?.id)).map((s: any) => ({ id: s.id, at: within(s?.at), vol: num(s?.vol, 0.6, 0.1, 1) })) : [],
    outro: { enabled: ctx.options.outro === false ? false : !!r.outro?.enabled, text: str(r.outro?.text, 90), dur: num(r.outro?.dur, 3, 1.5, 6) },
    storyboard: engine === "saas" && r.storyboard && typeof r.storyboard === "object" ? r.storyboard : null,
    scenes: engine === "hyperframes" && Array.isArray(r.scenes) ? r.scenes.slice(0, 40) : null,
  };
}

// ---------------------------------------------------------------------------------------------------
// "Aprender com referência": transforma as medições/quadros de um vídeo de exemplo em regras de estilo
// ---------------------------------------------------------------------------------------------------
export const ANALYZE_SYSTEM = `Você é diretor de arte e editor de vídeo. Recebe medições e quadros de um vídeo de REFERÊNCIA e escreve as regras de estilo (em português) para que um editor automático reproduza a LINGUAGEM — ritmo de cortes, tipo e posição de legenda, tipografia, cores, transições, zoom, uso de overlays e de som — sem copiar marca, logo, pessoas ou textos do original.
Responda SOMENTE com JSON:
{ "name": "nome curto do estilo", "description": "1 frase", "engine": "edit" | "saas" | "hyperframes", "caption_variant": "stacked" | "karaoke" | "single" | "boxed" | "none", "sfx": true | false, "rules": "5 a 9 linhas, uma regra por linha, objetivas e verificáveis (ex.: 'Corte a cada ~2 s', 'Legenda de 3 palavras no terço inferior com a palavra falada em amarelo')" }`;

export function sanitizeStyle(raw: unknown): { name: string; description: string; engine: VideoEngine; caption_variant: CaptionVariant; sfx: boolean; rules: string } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const engines: VideoEngine[] = ["edit", "saas", "hyperframes"];
  const variants: CaptionVariant[] = ["stacked", "karaoke", "single", "boxed", "none"];
  return {
    name: str(r.name, 80) || "Estilo da referência",
    description: str(r.description, 240),
    engine: engines.includes(r.engine) ? r.engine : "edit",
    caption_variant: variants.includes(r.caption_variant) ? r.caption_variant : "karaoke",
    sfx: !!r.sfx,
    rules: str(Array.isArray(r.rules) ? r.rules.join("\n") : r.rules, 3000),
  };
}
