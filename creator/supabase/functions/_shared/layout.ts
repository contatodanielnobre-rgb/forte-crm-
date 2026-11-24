// Criador de layouts de site: prompts, leitura das respostas da IA e montagem dos prompts de imagem.
// Usado pela Edge Function studio-generate (Deno) E pela tela (tipos e textos): o mesmo texto vai para o modelo.
import { LAYOUT_CATEGORIES, LAYOUT_SECTIONS, LAYOUT_SKILL, LAYOUT_STYLES, layoutCategoryById, layoutSectionsBlock, layoutStyleById, layoutStylesBlock } from "./layout-skill.ts";
export { LAYOUT_CATEGORIES, LAYOUT_SECTIONS, LAYOUT_SKILL, LAYOUT_STYLES, layoutCategoryById, layoutSectionsBlock, layoutStyleById, layoutStylesBlock };

export const clip = (s: unknown, n: number) => String(s ?? "").trim().slice(0, n);
const hex = (s: unknown) => (/^#[0-9a-f]{6}$/i.test(String(s ?? "").trim()) ? String(s).trim().toUpperCase() : null);
const arr = (v: unknown, n = 8, len = 200): string[] => (Array.isArray(v) ? v : []).map((x) => clip(x, len)).filter(Boolean).slice(0, n);
const rec = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const catIds = new Set(LAYOUT_CATEGORIES.map((c) => c.id));
const cats = (v: unknown, max = 3) => arr(v, max, 30).map((x) => x.toLowerCase()).filter((x) => catIds.has(x));
const styleIds = new Set(LAYOUT_STYLES.map((s) => s.id));
const SECTION_KEYS = new Set(LAYOUT_SECTIONS.map((s) => s.key));
const sectionKey = (v: unknown) => { const k = clip(v, 40).toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_|_$/g, ""); return k || "secao"; };

// =================================================================================================
// TREINAMENTO — 1) leitura de cada site de referência
// =================================================================================================
export const LAYOUT_OBSERVE_SYSTEM = `Você é diretor de arte e analista de UX/UI de sites. Examina prints de um site (recortes da página em ordem de rolagem, de cima para baixo) com precisão técnica: estrutura, seções, grade, cores, tipografia, componentes, imagens e conversão. Seu objetivo é registrar o que faz o site funcionar para que outro designer reproduza o ESTILO e a LÓGICA sem copiar o conteúdo. Responda SEMPRE em JSON válido, em português do Brasil.`;

export function layoutObservePrompt(n: number, o: { name?: string; url?: string | null; hint?: string[] } = {}): string {
  return `Analise o site abaixo. São ${n} recorte(s) em ordem de rolagem (índice 0 = topo da página). Os recortes de uma mesma página podem se sobrepor um pouco. ${o.name ? `Nome informado: ${o.name}. ` : ""}${o.url ? `Endereço: ${o.url}. ` : ""}${o.hint?.length ? `Categorias sugeridas pelo usuário: ${o.hint.join(", ")}. ` : ""}Categorias possíveis: ${LAYOUT_CATEGORIES.map((c) => c.id).join(", ")} (escolha de 1 a 2; a primeira é a dominante). Estilos possíveis: ${LAYOUT_STYLES.map((s) => s.id).join(", ")} | other. Seções possíveis (key): ${LAYOUT_SECTIONS.map((s) => s.key).join(", ")} | other.
JSON:
{ "site": {
  "categories": ["saas"],
  "summary": "1–2 frases: o que o site vende, para quem e por que funciona (ou não)",
  "business": "negócio em poucas palavras", "audience": "público", "goal": "ação principal que o site quer (comprar, agendar, orçamento, inscrição…)", "tone": "tom de voz e sensação (ex.: premium e calmo, enérgico, acolhedor)",
  "style_id": "um dos estilos | other", "style_note": "como é o estilo em 1 frase concreta",
  "mode": "claro | escuro | misto",
  "palette": [ { "hex": "#RRGGBB", "role": "fundo | superficie | texto | marca | acento | acao | borda" } ],
  "typography": { "heading": "fonte do Google Fonts MAIS PARECIDA com os títulos", "heading_weight": "light | regular | medium | semibold | bold | extrabold | black", "body": "fonte parecida do texto", "scale_note": "tamanho da manchete em relação à página, caixa alta ou mista, destaques (degradê, sublinhado, cor)" },
  "grid": "contêiner (largura aproximada), colunas, alinhamento e respiro vertical entre seções",
  "radius": "pill | rounded | slight | square", "shadows": "none | soft | hard | glow | layered",
  "buttons": "forma, cor, tamanho e texto típico dos botões", "cards": "como são os cartões (borda, sombra, raio, conteúdo)", "icons": "linha | preenchido | 3D | ilustração | emoji | nenhum",
  "imagery": "fotografia real | ilustração | 3D | mockups | mista — e como são (luz, cenário, recorte)",
  "mascot": false,
  "hero": { "pattern": "A duas colunas | B centralizado | C tela cheia | D com formulário | other", "headline": "texto exato da manchete", "headline_style": "tamanho, peso, quebras, destaque", "cta": "texto do botão principal", "visual": "o que a imagem/mockup do hero mostra e onde fica", "header": "como é o cabeçalho (logo, links, botão)" },
  "sections": [ { "order": 1, "key": "hero", "label": "nome", "pattern": "composição com posições (ex.: 3 cartões em linha, ícone no topo)", "background": "claro | escuro | cor da marca | imagem", "copy_excerpt": "trecho curto do texto real", "components": ["cartões", "acordeão", "formulário"], "note": "o que esta seção faz bem" } ],
  "slices": [ { "index": 0, "sections": ["hero", "prova_rapida"] } ],
  "cta_strategy": "como e onde o site pede a ação (quantidade de botões, repetição, urgência)", "social_proof": "que prova social usa e onde",
  "density": "baixa | media | alta", "length": "curta (até 6 seções) | media | longa (12+)",
  "ux_strengths": ["3–5 pontos fortes concretos"], "ux_weaknesses": ["0–4 pontos fracos concretos"],
  "mobile_notes": "o que se percebe de adaptação para celular, se houver", "key_trait": "o que torna este layout memorável e reproduzível como padrão"
} }
Em "slices" informe, para CADA recorte (índice 0 a ${n - 1}), quais seções (keys do catálogo) aparecem nele: isso permite achar depois exemplos visuais de cada tipo de seção. Não invente o que não vê. Não cite nomes de pessoas reais; descreva-as. Se os recortes forem de várias páginas, descreva a página principal e mencione as outras em "summary".`;
}

export interface LayoutSection { order: number; key: string; label: string; pattern: string; background: string; copy_excerpt: string; components: string[]; note: string }
export interface LayoutObs {
  categories: string[]; summary: string; business: string; audience: string; goal: string; tone: string; style_id: string; style_note: string; mode: string
  palette: { hex: string; role: string }[]; typography: { heading: string; heading_weight: string; body: string; scale_note: string }
  grid: string; radius: string; shadows: string; buttons: string; cards: string; icons: string; imagery: string; mascot: boolean
  hero: { pattern: string; headline: string; headline_style: string; cta: string; visual: string; header: string }
  sections: LayoutSection[]; slices?: { index: number; sections: string[] }[]; slice_orders?: number[]; cta_strategy: string; social_proof: string; density: string; length: string
  ux_strengths: string[]; ux_weaknesses: string[]; mobile_notes: string; key_trait: string
}
export function sanitizeSiteObs(raw: unknown): LayoutObs | null {
  const r = rec(rec(raw).site ?? raw);
  if (!Object.keys(r).length) return null;
  const t = rec(r.typography), h = rec(r.hero);
  const sid = clip(r.style_id, 30).toLowerCase();
  return {
    categories: cats(r.categories, 2), summary: clip(r.summary, 400), business: clip(r.business, 160), audience: clip(r.audience, 160), goal: clip(r.goal, 140), tone: clip(r.tone, 160),
    style_id: styleIds.has(sid) ? sid : "other", style_note: clip(r.style_note, 240), mode: ["claro", "escuro", "misto"].includes(clip(r.mode, 10).toLowerCase()) ? clip(r.mode, 10).toLowerCase() : "claro",
    palette: (Array.isArray(r.palette) ? r.palette : []).map((p) => { const x = rec(p); const h2 = hex(x.hex); return h2 ? { hex: h2, role: clip(x.role, 20).toLowerCase() } : null; }).filter(Boolean).slice(0, 8) as { hex: string; role: string }[],
    typography: { heading: clip(t.heading, 60), heading_weight: clip(t.heading_weight, 20).toLowerCase(), body: clip(t.body, 60), scale_note: clip(t.scale_note, 220) },
    grid: clip(r.grid, 260), radius: clip(r.radius, 12).toLowerCase(), shadows: clip(r.shadows, 12).toLowerCase(), buttons: clip(r.buttons, 220), cards: clip(r.cards, 220), icons: clip(r.icons, 40).toLowerCase(), imagery: clip(r.imagery, 260), mascot: !!r.mascot,
    hero: { pattern: clip(h.pattern, 40), headline: clip(h.headline, 140), headline_style: clip(h.headline_style, 200), cta: clip(h.cta, 60), visual: clip(h.visual, 220), header: clip(h.header, 180) },
    sections: (Array.isArray(r.sections) ? r.sections : []).map((s, i): LayoutSection => { const x = rec(s); const k = sectionKey(x.key); return { order: Number(x.order) || i + 1, key: SECTION_KEYS.has(k) ? k : "outra", label: clip(x.label, 60), pattern: clip(x.pattern, 240), background: clip(x.background, 30), copy_excerpt: clip(x.copy_excerpt, 140), components: arr(x.components, 6, 40), note: clip(x.note, 200) }; }).slice(0, 24),
    slices: (Array.isArray(r.slices) ? r.slices : []).map((x) => { const y = rec(x); return { index: Number(y.index), sections: arr(y.sections, 4, 30).map(sectionKey) }; }).filter((x) => Number.isInteger(x.index) && x.index >= 0).slice(0, 14),
    cta_strategy: clip(r.cta_strategy, 280), social_proof: clip(r.social_proof, 240), density: clip(r.density, 10).toLowerCase(), length: clip(r.length, 40).toLowerCase(),
    ux_strengths: arr(r.ux_strengths, 5, 200), ux_weaknesses: arr(r.ux_weaknesses, 4, 200), mobile_notes: clip(r.mobile_notes, 240), key_trait: clip(r.key_trait, 240),
  };
}

// =================================================================================================
// TREINAMENTO — 2) síntese por categoria (texto)
// =================================================================================================
export const LAYOUT_SYNTH_SYSTEM = `Você é diretor de criação de uma agência de design de sites. Recebe observações detalhadas de sites de referência do usuário, agrupadas por categoria, e escreve o MANUAL DE ESTILO aprendido: padrões repetidos, estruturas de seção que funcionam, tipografia, cor, componentes e o que evitar. Seja específico (ordem das seções, posições, tamanhos, cores, tratamentos), nunca genérico. Não copie conteúdo de nenhum site; descreva o padrão. Responda SEMPRE em JSON válido, em português do Brasil.`;

export interface LayoutCatAnalysis { count?: number; summary?: string; structure?: string; hero?: string; sections?: string; palette?: string; typography?: string; components?: string; imagery?: string; conversion?: string; tone?: string; do?: string[]; dont?: string[] }
export interface LayoutStats { n: number; dark_pct: number; mascot_pct: number; avg_sections: number; styles: [string, number][]; heading_fonts: [string, number][]; body_fonts: [string, number][]; hero: [string, number][]; radius: [string, number][]; imagery: [string, number][]; density: [string, number][]; section_freq: [string, number][]; opening: [string, number][] }
export interface LayoutAnalysis {
  stats?: Record<string, LayoutStats>
  general?: { summary?: string; structure?: string; color?: string; typography?: string; components?: string; imagery?: string; conversion?: string; do?: string[]; dont?: string[] }
  categories?: Record<string, LayoutCatAnalysis>
}

export function layoutSynthUser(obs: { index: number; o: LayoutObs; name?: string }[], groups: Record<string, number[]>): string {
  const line = (x: { o: LayoutObs; name?: string }) => { const o = x.o; return JSON.stringify({ site: x.name, resumo: o.summary, objetivo: o.goal, tom: o.tone, estilo: `${o.style_id}: ${o.style_note}`, modo: o.mode, cores: o.palette.map((p) => `${p.hex} ${p.role}`), fontes: `${o.typography.heading} ${o.typography.heading_weight} / ${o.typography.body}; ${o.typography.scale_note}`, grade: o.grid, cantos: o.radius, sombras: o.shadows, botoes: o.buttons, cartoes: o.cards, icones: o.icons, imagens: o.imagery, mascote: o.mascot, hero: o.hero, secoes: o.sections.map((s) => `${s.order}.${s.key}(${s.pattern}; fundo ${s.background})`), cta: o.cta_strategy, prova_social: o.social_proof, densidade: o.density, tamanho: o.length, pontos_fortes: o.ux_strengths, pontos_fracos: o.ux_weaknesses, traco: o.key_trait }); };
  const byIdx = new Map(obs.map((x) => [x.index, x]));
  const blocks = Object.entries(groups).filter(([, ids]) => ids.length).map(([cat, ids]) => `## CATEGORIA ${cat} (${ids.length} sites)\n${ids.map((i) => byIdx.get(i)).filter(Boolean).map((x) => `- ${line(x!)}`).join("\n")}`);
  return `OBSERVAÇÕES DOS SITES DE REFERÊNCIA DO USUÁRIO:\n\n${blocks.join("\n\n")}\n\nEscreva o manual de estilo APRENDIDO destes sites. Para cada categoria com observações devolva os padrões (use números, posições e ordem de seções concretas) e, em "general", o que é comum a TODOS. Formato:
{
  "general": { "summary": "2–3 frases sobre o gosto do conjunto", "structure": "como as páginas são organizadas e quanto respiram", "color": "paletas, modo claro/escuro e uso do acento", "typography": "fontes, pesos, escala e destaques", "components": "botões, cartões, ícones, cantos e sombras", "imagery": "tipo de imagem e tratamento", "conversion": "como pedem a ação e usam prova social", "do": ["5–8 práticas"], "dont": ["5–8 coisas a evitar"] },
  "categories": { "<id da categoria>": { "summary": "...", "structure": "ordem típica das seções com quantas", "hero": "padrão do hero (colunas, manchete, botões, imagem) com medidas", "sections": "padrões de composição das seções-chave", "palette": "cores dominantes e papéis", "typography": "fontes parecidas, pesos e escala", "components": "botões, cartões, ícones, cantos e sombras", "imagery": "fotografia/ilustração/3D e tratamento", "conversion": "CTAs, prova social, urgência, garantia", "tone": "tom de voz e microcopy", "do": ["3–6"], "dont": ["3–6"] } }
}`;
}

export function sanitizeLayoutAnalysis(raw: unknown, counts: Record<string, number> = {}, stats?: Record<string, LayoutStats>): LayoutAnalysis {
  const r = rec(raw), g = rec(r.general), c = rec(r.categories);
  const categories: Record<string, LayoutCatAnalysis> = {};
  for (const [id, v0] of Object.entries(c)) {
    if (!catIds.has(id)) continue;
    const v = rec(v0);
    categories[id] = { count: counts[id] ?? 0, summary: clip(v.summary, 500), structure: clip(v.structure, 600), hero: clip(v.hero, 600), sections: clip(v.sections, 800), palette: clip(v.palette, 400), typography: clip(v.typography, 500), components: clip(v.components, 500), imagery: clip(v.imagery, 400), conversion: clip(v.conversion, 500), tone: clip(v.tone, 300), do: arr(v.do, 6), dont: arr(v.dont, 6) };
  }
  return { stats, general: { summary: clip(g.summary, 600), structure: clip(g.structure, 700), color: clip(g.color, 600), typography: clip(g.typography, 600), components: clip(g.components, 600), imagery: clip(g.imagery, 500), conversion: clip(g.conversion, 600), do: arr(g.do, 8), dont: arr(g.dont, 8) }, categories };
}

/** Documento de treinamento de layouts (fica salvo na pasta e é lido nas próximas criações) */
export function compileLayoutSkill(o: { name: string; isBase: boolean; analysis: LayoutAnalysis | null; refs: number; version: number; extra?: string | null }): string {
  const a = o.analysis, g = a?.general;
  const L = (t: string, v?: string | string[] | null) => (Array.isArray(v) ? (v.length ? `${t}\n${v.map((x) => `- ${x}`).join("\n")}\n` : "") : v ? `${t} ${v}\n` : "");
  const lines = [
    `# TREINAMENTO DE LAYOUTS DE SITE — ${o.isBase ? "Agência (padrão para todos os projetos)" : o.name} · v${o.version}`,
    `Baseado em ${o.refs} site(s) de referência${a ? " analisados por IA de visão" : " (sem análise de IA)"}.`, "",
    g ? L("**Gosto do conjunto:**", g.summary) : "", g ? L("**Estrutura:**", g.structure) : "", g ? L("**Cor:**", g.color) : "", g ? L("**Tipografia:**", g.typography) : "", g ? L("**Componentes:**", g.components) : "",
    g ? L("**Imagens:**", g.imagery) : "", g ? L("**Conversão:**", g.conversion) : "", g ? L("**Sempre:**", g.do) : "", g ? L("**Nunca:**", g.dont) : "",
  ];
  for (const [id, c] of Object.entries(a?.categories ?? {})) {
    lines.push(`## ${layoutCategoryById(id)?.label ?? id}${c.count ? ` (${c.count} sites)` : ""}`, L("**Resumo:**", c.summary), L("**Estrutura:**", c.structure), L("**Hero:**", c.hero), L("**Seções:**", c.sections), L("**Paleta:**", c.palette), L("**Tipografia:**", c.typography), L("**Componentes:**", c.components), L("**Imagens:**", c.imagery), L("**Conversão:**", c.conversion), L("**Tom:**", c.tone), L("**Sempre:**", c.do), L("**Nunca:**", c.dont));
  }
  if (a?.stats) lines.push(layoutStatsLines(a.stats));
  if (o.extra) lines.push(`**Regras extras escritas pela equipe:**\n${o.extra}\n`);
  return lines.filter((l) => l !== "").join("\n");
}

/** Trecho do que foi APRENDIDO para as categorias escolhidas (vai nos prompts do plano e, resumido, no das imagens) */
export function layoutLearnedBlock(analysis: LayoutAnalysis | null | undefined, categories: string[], full = true): string {
  if (!analysis) return "";
  const g = analysis.general, out: string[] = [];
  if (g) out.push(`GERAL: ${[g.summary, g.structure && `Estrutura: ${g.structure}`, g.color && `Cor: ${g.color}`, g.typography && `Tipografia: ${g.typography}`, g.components && `Componentes: ${g.components}`, g.conversion && `Conversão: ${g.conversion}`].filter(Boolean).join(" ")}`);
  for (const id of categories) {
    const c = analysis.categories?.[id]; if (!c) continue;
    out.push(`${(layoutCategoryById(id)?.label ?? id).toUpperCase()}: ${[c.summary, c.structure && `Estrutura: ${c.structure}`, c.hero && `Hero: ${c.hero}`, c.sections && `Seções: ${c.sections}`, c.palette && `Paleta: ${c.palette}`, c.typography && `Tipografia: ${c.typography}`, c.components && `Componentes: ${c.components}`, c.imagery && `Imagens: ${c.imagery}`, c.conversion && `Conversão: ${c.conversion}`, full && c.dont?.length ? `Evitar: ${c.dont.join("; ")}` : ""].filter(Boolean).join(" ")}`);
  }
  return out.join("\n");
}

/** Linhas compactas de sites REAIS do usuário: exemplos de estrutura, seção e estilo */
export function layoutExemplarsBlock(list: { obs: LayoutObs; name?: string; tags: string[] }[], categories: string[], max = 4): string {
  const score = (x: { obs: LayoutObs; tags: string[] }) => (categories.length ? x.tags.filter((t) => categories.includes(t)).length * 10 : 0) + Math.random();
  const picks = [...list].sort((a, b) => score(b) - score(a)).slice(0, max);
  if (!picks.length) return "";
  const line = (x: { obs: LayoutObs; name?: string; tags: string[] }) => { const o = x.obs; return `- [${x.tags.join("/")}] ${x.name ?? "site"}: ${o.summary} | estilo ${o.style_id} (${o.style_note}), modo ${o.mode}; paleta ${o.palette.slice(0, 4).map((p) => p.hex).join(" ")}; fontes ${o.typography.heading} ${o.typography.heading_weight} + ${o.typography.body}; cantos ${o.radius}, sombras ${o.shadows}; hero ${o.hero.pattern}: "${o.hero.headline}" / botão "${o.hero.cta}" / visual ${o.hero.visual}; seções: ${o.sections.slice(0, 10).map((s) => `${s.key}`).join(" > ")}; CTA: ${o.cta_strategy}; traço: ${o.key_trait}`; };
  return `# EXEMPLOS REAIS (sites que o usuário fez/estuda; imite a LÓGICA, a estrutura e o nível de acabamento, nunca o conteúdo)\n${picks.map(line).join("\n")}`;
}

// =================================================================================================
// ESTATÍSTICAS (calculadas em código a partir das observações)
// =================================================================================================
const top = (vals: string[], k = 3): [string, number][] => {
  const m = new Map<string, number>(); vals.map((v) => v.trim().toLowerCase()).filter((v) => v && v !== "other" && v !== "outra" && v !== "-").forEach((v) => m.set(v, (m.get(v) ?? 0) + 1));
  const n = Math.max(1, vals.length);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([v, c]) => [v, Math.round((c / n) * 100)]);
};
export function computeLayoutStats(items: { o: LayoutObs; tags: string[] }[]): Record<string, LayoutStats> {
  const groups: Record<string, LayoutObs[]> = { _todos: items.map((x) => x.o) };
  for (const x of items) for (const c of (x.tags.length ? x.tags : x.o.categories)) (groups[c] ??= []).push(x.o);
  const out: Record<string, LayoutStats> = {};
  for (const [k, list] of Object.entries(groups)) {
    const n = list.length;
    out[k] = {
      n, dark_pct: Math.round((list.filter((o) => o.mode === "escuro").length / n) * 100), mascot_pct: Math.round((list.filter((o) => o.mascot).length / n) * 100),
      avg_sections: Math.round((list.reduce((s, o) => s + o.sections.length, 0) / n) * 10) / 10,
      styles: top(list.map((o) => o.style_id), 3), heading_fonts: top(list.map((o) => o.typography.heading.split(/[ ,(]/)[0]), 4), body_fonts: top(list.map((o) => o.typography.body.split(/[ ,(]/)[0]), 3),
      hero: top(list.map((o) => o.hero.pattern.split(" ")[0]), 3), radius: top(list.map((o) => o.radius), 2), imagery: top(list.map((o) => o.imagery.split(/[ —,.;]/)[0]), 3), density: top(list.map((o) => o.density), 2),
      section_freq: top(list.flatMap((o) => o.sections.map((s) => s.key)), 8), opening: top(list.map((o) => o.sections.slice(0, 3).map((s) => s.key).join(">")), 2),
    };
  }
  return out;
}
const fmt = (a: [string, number][]) => a.map(([v, p]) => `${v} ${p}%`).join(", ");
export function layoutStatsLines(st?: Record<string, LayoutStats>): string {
  if (!st) return "";
  return `## ESTATÍSTICAS DOS SEUS SITES (contadas pela IA de visão; use como probabilidade, não como regra fixa)\n${Object.entries(st).map(([k, v]) => `- ${k === "_todos" ? "TODOS" : layoutCategoryById(k)?.label ?? k} (${v.n}): fundo escuro ${v.dark_pct}%, com mascote ${v.mascot_pct}%, média de ${v.avg_sections} seções; estilos: ${fmt(v.styles) || "—"}; fontes de título: ${fmt(v.heading_fonts) || "—"}; fontes de texto: ${fmt(v.body_fonts) || "—"}; hero: ${fmt(v.hero) || "—"}; cantos: ${fmt(v.radius) || "—"}; imagens: ${fmt(v.imagery) || "—"}; densidade: ${fmt(v.density) || "—"}; seções mais comuns: ${fmt(v.section_freq) || "—"}; abertura da página: ${fmt(v.opening) || "—"}`).join("\n")}\n`;
}

// =================================================================================================
// ESTÚDIO — formulário
// =================================================================================================
export const GOAL_LABEL: Record<string, string> = { auto: "a IA decide pela categoria", vendas: "vender direto (compra online/checkout)", leads: "captar leads (nome, e-mail, WhatsApp)", agendamento: "levar ao agendamento/consulta", orcamento: "pedir orçamento/proposta", inscricao: "inscrição em evento/aula/curso", institucional: "apresentar a empresa e gerar contato" };
export const MASCOT_LABEL: Record<string, string> = { auto: "a IA decide se o mascote combina com a marca", yes: "CRIAR um mascote para a marca", no: "SEM mascote" };
export interface LayoutUrl { url: string; role: "current" | "competitor" | "inspiration" }
export interface LayoutForm {
  business: string; segment: string; about: string; offer: string; audience: string; goal: string; categories: string[]; tone: string
  style_ids: string[]; style_notes: string; palette_mode: "auto" | "custom" | "keep"; palette: string[]; font_heading: string; font_body: string
  pages: string[]; sections_wanted: string; mascot: string; mascot_desc: string; format: "desktop" | "mobile"; urls: LayoutUrl[]
  keep: string; change: string; copy_mode: "auto" | "keep"; lang: string; notes: string; avoid: string
}
export const emptyLayoutForm = (): LayoutForm => ({ business: "", segment: "", about: "", offer: "", audience: "", goal: "auto", categories: [], tone: "", style_ids: [], style_notes: "", palette_mode: "auto", palette: [], font_heading: "", font_body: "", pages: ["home"], sections_wanted: "", mascot: "auto", mascot_desc: "", format: "desktop", urls: [], keep: "", change: "", copy_mode: "auto", lang: "português do Brasil", notes: "", avoid: "" });
export function sanitizeLayoutForm(raw: unknown): LayoutForm {
  const r = rec(raw), d = emptyLayoutForm();
  const pick = <T extends string>(v: unknown, ok: readonly T[], dflt: T): T => (ok.includes(String(v) as T) ? (String(v) as T) : dflt);
  return {
    business: clip(r.business, 120), segment: clip(r.segment, 120), about: clip(r.about, 6000), offer: clip(r.offer, 1500), audience: clip(r.audience, 400), goal: Object.keys(GOAL_LABEL).includes(String(r.goal)) ? String(r.goal) : d.goal, categories: cats(r.categories, 2), tone: clip(r.tone, 200),
    style_ids: arr(r.style_ids, 2, 30).filter((x) => styleIds.has(x)), style_notes: clip(r.style_notes, 600), palette_mode: pick(r.palette_mode, ["auto", "custom", "keep"] as const, "auto"), palette: (Array.isArray(r.palette) ? r.palette : []).map(hex).filter(Boolean).slice(0, 5) as string[],
    font_heading: clip(r.font_heading, 60), font_body: clip(r.font_body, 60), pages: arr(r.pages, 8, 40).length ? arr(r.pages, 8, 40) : ["home"], sections_wanted: clip(r.sections_wanted, 800),
    mascot: Object.keys(MASCOT_LABEL).includes(String(r.mascot)) ? String(r.mascot) : "auto", mascot_desc: clip(r.mascot_desc, 500), format: pick(r.format, ["desktop", "mobile"] as const, "desktop"),
    urls: (Array.isArray(r.urls) ? r.urls : []).map((u) => { const x = rec(u); return { url: clip(x.url, 300), role: pick(x.role, ["current", "competitor", "inspiration"] as const, "inspiration") }; }).filter((u) => u.url).slice(0, 6),
    keep: clip(r.keep, 800), change: clip(r.change, 800), copy_mode: pick(r.copy_mode, ["auto", "keep"] as const, "auto"), lang: clip(r.lang, 30) || d.lang, notes: clip(r.notes, 1200), avoid: clip(r.avoid, 500),
  };
}

export function layoutFormBlock(f: LayoutForm): string {
  const cat = f.categories.length ? f.categories.map((c) => layoutCategoryById(c)?.label ?? c).join(" + ") : "a IA decide pelo negócio";
  const styles = f.style_ids.length ? f.style_ids.map((s) => `${layoutStyleById(s)?.label ?? s}`).join(" + ") : "";
  return [
    f.business ? `- Negócio: ${f.business}` : "", f.segment ? `- Segmento: ${f.segment}` : "", `- Tipo de site (categoria): ${cat}`,
    f.offer ? `- Oferta/produto principal: ${f.offer}` : "", f.audience ? `- Público: ${f.audience}` : "", `- Objetivo do site: ${GOAL_LABEL[f.goal] ?? GOAL_LABEL.auto}`, f.tone ? `- Tom de voz: ${f.tone}` : "",
    styles ? `- ESTILO ESCOLHIDO PELO USUÁRIO (obrigatório): ${styles}${f.style_notes ? `; detalhes: ${f.style_notes}` : ""}` : f.style_notes ? `- Estilo pedido: ${f.style_notes}` : "- Estilo: a IA escolhe pela categoria, pelo negócio e pelas referências",
    f.palette_mode === "custom" && f.palette.length ? `- PALETA OBRIGATÓRIA: ${f.palette.join(", ")}` : f.palette_mode === "keep" ? "- Paleta: MANTER as cores do site/marca atual (extraia-as dos prints)" : "- Paleta: a IA define pela marca e pelo segmento",
    f.font_heading || f.font_body ? `- FONTES OBRIGATÓRIAS: títulos ${f.font_heading || "(a IA escolhe)"}; texto ${f.font_body || "(a IA escolhe)"}` : "",
    `- Formato: ${f.format === "mobile" ? "MOBILE (tela de celular em pé, 9:16)" : "DESKTOP (tela de computador, 16:9)"}`,
    `- Páginas a desenhar: ${f.pages.join(", ")}`, f.sections_wanted ? `- Seções pedidas/obrigatórias: ${f.sections_wanted}` : "",
    `- Mascote: ${MASCOT_LABEL[f.mascot] ?? MASCOT_LABEL.auto}${f.mascot === "yes" && f.mascot_desc ? ` (ideia do usuário: ${f.mascot_desc})` : ""}`,
    f.keep ? `- MANTER do site atual: ${f.keep}` : "", f.change ? `- MUDAR/MELHORAR: ${f.change}` : "", `- Textos: ${f.copy_mode === "keep" ? "reaproveite os textos reais do site atual (ajuste só o necessário)" : "reescreva a copy com foco em conversão, usando fatos reais do site atual e do negócio"}; idioma: ${f.lang}`,
    f.urls.length ? `- Links informados: ${f.urls.map((u) => `${u.role === "current" ? "site atual" : u.role === "competitor" ? "concorrente" : "inspiração"} ${u.url}`).join("; ")}` : "",
    f.avoid ? `- Evitar: ${f.avoid}` : "", f.notes ? `- Observações do usuário (OBRIGATÓRIAS; interprete-as com as referências): ${f.notes}` : "",
  ].filter(Boolean).join("\n");
}

// =================================================================================================
// ESTÚDIO — leitura do site atual (análise)
// =================================================================================================
export const LAYOUT_ANALYZE_SYSTEM = `Você é analista de UX/UI e estrategista de conversão. Lê os prints do site atual de um cliente (recortes em ordem de rolagem) e extrai com precisão o conteúdo real e os problemas de design, para que um designer faça o redesenho sem inventar nada. Responda SEMPRE em JSON válido, em português do Brasil.`;
export function layoutAnalyzePrompt(n: number, o: { form: LayoutForm; sites?: string }): string {
  return `São ${n} recorte(s) do site ATUAL do cliente, em ordem de rolagem (0 = topo). ${o.sites ? `Resumo dos links informados (texto das páginas):\n${o.sites}\n` : ""}Dados do cliente:\n${layoutFormBlock(o.form)}
Devolva JSON:
{ "analysis": {
  "summary": "o que o site atual comunica, para quem e como está o nível de design (3–4 frases honestas)",
  "business_read": "o que a empresa realmente faz/vende, segundo o site",
  "pages_detected": ["páginas ou telas que aparecem nos prints"],
  "sections": [ { "order": 1, "key": "hero | ... | other", "label": "nome", "content": { "headline": "texto exato", "sub": "texto exato", "cta": "botão", "items": ["itens/cartões com texto"] }, "works": "o que está bom e deve ser mantido", "fails": "o que está fraco" } ],
  "content": { "offers": ["ofertas, planos, preços visíveis"], "numbers": ["números e provas reais"], "testimonials": ["depoimentos reais (só iniciais/nome se aparecer)"], "contacts": { "phone": "", "whatsapp": "", "email": "", "address": "", "hours": "", "social": [] } },
  "brand": { "colors": ["#RRGGBB"], "fonts": ["fontes parecidas"], "logo": "como é o logo (descrição fiel)", "tone": "tom de voz atual" },
  "ux_issues": ["problemas concretos de UX/UI (hierarquia, contraste, espaçamento, CTA, mobile…)"],
  "opportunities": ["oportunidades de redesign com maior impacto"],
  "recommended_category": "id de categoria", "mascot_fit": "sim | não | talvez — e por quê"
} }
Copie textos reais exatamente como estão (corrigindo só óbvios erros de leitura). Não invente conteúdo que não aparece.`;
}
export interface LayoutSiteAnalysis { summary: string; business_read: string; pages_detected: string[]; sections: { order: number; key: string; label: string; content: { headline: string; sub: string; cta: string; items: string[] }; works: string; fails: string }[]; content: { offers: string[]; numbers: string[]; testimonials: string[]; contacts: Record<string, unknown> }; brand: { colors: string[]; fonts: string[]; logo: string; tone: string }; ux_issues: string[]; opportunities: string[]; recommended_category: string; mascot_fit: string }
export function sanitizeLayoutSiteAnalysis(raw: unknown): LayoutSiteAnalysis {
  const r = rec(rec(raw).analysis ?? raw), c = rec(r.content), b = rec(r.brand), ct = rec(c.contacts);
  return {
    summary: clip(r.summary, 900), business_read: clip(r.business_read, 400), pages_detected: arr(r.pages_detected, 8, 60),
    sections: (Array.isArray(r.sections) ? r.sections : []).map((s, i) => { const x = rec(s), k = rec(x.content); return { order: Number(x.order) || i + 1, key: sectionKey(x.key), label: clip(x.label, 60), content: { headline: clip(k.headline, 200), sub: clip(k.sub, 300), cta: clip(k.cta, 60), items: arr(k.items, 8, 140) }, works: clip(x.works, 220), fails: clip(x.fails, 220) }; }).slice(0, 24),
    content: { offers: arr(c.offers, 8, 160), numbers: arr(c.numbers, 10, 100), testimonials: arr(c.testimonials, 6, 220), contacts: Object.fromEntries(["phone", "whatsapp", "email", "address", "hours"].map((k) => [k, clip(ct[k], 160)]).concat([["social", arr(ct.social, 6, 100) as unknown as string]])) },
    brand: { colors: (Array.isArray(b.colors) ? b.colors : []).map(hex).filter(Boolean).slice(0, 6) as string[], fonts: arr(b.fonts, 4, 60), logo: clip(b.logo, 260), tone: clip(b.tone, 200) },
    ux_issues: arr(r.ux_issues, 10, 220), opportunities: arr(r.opportunities, 8, 220), recommended_category: cats([r.recommended_category], 1)[0] ?? "", mascot_fit: clip(r.mascot_fit, 200),
  };
}
export function analysisBlock(a: LayoutSiteAnalysis | null | undefined): string {
  if (!a) return "";
  const L = (t: string, v: string | string[]) => (Array.isArray(v) ? (v.length ? `${t}\n${v.map((x) => `  - ${x}`).join("\n")}` : "") : v ? `${t} ${v}` : "");
  return [`# LEITURA DO SITE ATUAL DO CLIENTE (conteúdo REAL: reaproveite; nunca invente além disto)`, L("Resumo:", a.summary), L("O que a empresa faz:", a.business_read), L("Páginas:", a.pages_detected),
    a.sections.length ? `Seções atuais:\n${a.sections.map((s) => `  ${s.order}. ${s.key} — "${s.content.headline}" ${s.content.sub ? `/ "${s.content.sub}"` : ""} ${s.content.cta ? `[botão: ${s.content.cta}]` : ""} ${s.content.items.length ? `itens: ${s.content.items.join(" | ")}` : ""} (bom: ${s.works || "—"}; fraco: ${s.fails || "—"})`).join("\n")}` : "",
    L("Ofertas/preços:", a.content.offers), L("Números e provas:", a.content.numbers), L("Depoimentos:", a.content.testimonials), a.content.contacts && Object.values(a.content.contacts).some((v) => (Array.isArray(v) ? v.length : v)) ? `Contatos: ${JSON.stringify(a.content.contacts)}` : "",
    a.brand.colors.length ? `Cores atuais: ${a.brand.colors.join(", ")}` : "", a.brand.fonts.length ? `Fontes atuais: ${a.brand.fonts.join(", ")}` : "", a.brand.logo ? `Logo: ${a.brand.logo}` : "", a.brand.tone ? `Tom atual: ${a.brand.tone}` : "",
    L("Problemas de UX/UI:", a.ux_issues), L("Oportunidades:", a.opportunities), a.mascot_fit ? `Mascote: ${a.mascot_fit}` : ""].filter(Boolean).join("\n");
}

// =================================================================================================
// ESTÚDIO — plano (sistema de design + páginas + seções)
// =================================================================================================
export interface LayoutDesignSystem { name: string; style_id: string; mood: string; palette: { role: string; hex: string; usage: string }[]; typography: { heading: string; heading_weight: string; body: string; body_weight: string; scale: string }; grid: string; radius: string; shadows: string; buttons: string; cards: string; icons: string; imagery: string; rhythm: string; mascot: { use: boolean; name: string; description: string } }
export interface LayoutSectionPlan { key: string; name: string; purpose: string; background: string; layout: string; copy: { headline: string; sub: string; cta: string; cta2: string; items: string[]; extra: string }; components: string[]; imagery: string; mobile_note: string; image_brief: string }
export interface LayoutPagePlan { key: string; name: string; goal: string; sections: LayoutSectionPlan[] }
export interface LayoutPlan { strategy: string; category: string; design_system: LayoutDesignSystem; pages: LayoutPagePlan[] }

export function layoutPlanSystem(o: { baseDoc?: string | null; brandDoc?: string | null; extra?: string | null; categories: string[]; exemplars?: string }): string {
  const sel = o.categories.length ? LAYOUT_CATEGORIES.filter((c) => o.categories.includes(c.id)) : LAYOUT_CATEGORIES;
  return `${LAYOUT_SKILL}

# MANUAIS DAS CATEGORIAS${o.categories.length ? " ESCOLHIDAS" : " (escolha a melhor para o negócio)"}
${sel.map((c) => `## ${c.label} [${c.id}]\n${c.playbook}`).join("\n\n")}

${layoutStylesBlock()}

${layoutSectionsBlock()}

${o.baseDoc ? `# TREINAMENTO DA AGÊNCIA (aprendido dos sites de referência)\n${o.baseDoc}\n` : ""}${o.brandDoc ? `# TREINAMENTO DESTA PASTA\n${o.brandDoc}\n` : ""}${o.exemplars ? `${o.exemplars}\n` : ""}${o.extra ? `# REGRAS EXTRAS DA AGÊNCIA\n${o.extra}\n` : ""}
# SUA TAREFA AGORA
Entregue o PLANO DO REDESIGN: a estratégia, o SISTEMA DE DESIGN completo e, para cada página pedida, a lista ORDENADA de seções com o texto exato (copy) e a composição de cada uma. Regras: (1) tudo que o usuário DEFINIU (estilo, paleta, fontes, formato, páginas, seções pedidas, mascote, manter/mudar, texto) é OBRIGATÓRIO e vale no plano inteiro; o que não foi definido você decide pela categoria, pelo negócio, pela leitura do site atual e pelos exemplos/treinamento; (2) reaproveite o conteúdo REAL do site atual (ofertas, números, depoimentos, contatos, textos) — não invente números, preços, depoimentos nem logos de clientes; se faltar dado, escreva texto neutro e plausível sem números falsos; (3) o hero vem primeiro e é a seção mais cuidada; use a ordem de seções do manual da categoria adaptada ao negócio, entre 6 e 14 seções por página (home) e 4 a 8 nas demais; (4) varie a composição entre seções vizinhas, mantendo o mesmo sistema visual; (5) decida o mascote: se a marca é simpática/infantil/educacional/esportiva/app, proponha (use=true) e descreva; se é sóbria, use=false; (6) paleta com 6–8 cores com papel (fundo, superfície, texto, texto_suave, marca, acento, acao, borda) e hexadecimais reais; (7) cada "image_brief" é um parágrafo de direção de arte para o gerador de imagem: composição com posições e proporções, todos os textos exatos (manchete, subtítulo, botões, itens de menu, números), componentes de interface, imagens e o fundo; (8) o texto de cada seção é curto e em ${"português do Brasil"} salvo outro idioma pedido.
Responda SOMENTE em JSON válido:
{
  "strategy": "3–4 frases: leitura do negócio, objetivo do site, como o redesign resolve os problemas do site atual",
  "category": "id da categoria dominante",
  "design_system": {
    "name": "nome curto do sistema (ex.: Aurora Glass)", "style_id": "um dos estilos | other", "mood": "sensação em 1 frase",
    "palette": [ { "role": "fundo | superficie | texto | texto_suave | marca | acento | acao | borda", "hex": "#RRGGBB", "usage": "onde usar" } ],
    "typography": { "heading": "fonte do Google Fonts", "heading_weight": "peso", "body": "fonte do Google Fonts", "body_weight": "peso", "scale": "tamanhos da manchete, títulos, texto, botões" },
    "grid": "contêiner, colunas, respiro entre seções", "radius": "cantos (botões, cartões, imagens)", "shadows": "sombras e bordas", "buttons": "forma, altura, cor, texto, estados", "cards": "estilo dos cartões", "icons": "estilo dos ícones", "imagery": "tipo e tratamento das imagens", "rhythm": "alternância de fundos ao longo da página",
    "mascot": { "use": false, "name": "nome", "description": "forma, cores da marca, expressão, estilo (3D/vetor), roupa/acessórios" }
  },
  "pages": [ { "key": "home", "name": "Home", "goal": "função da página", "sections": [ {
    "key": "chave do catálogo (hero, prova_rapida, problema…) ou outra", "name": "nome da seção", "purpose": "por que existe",
    "background": "claro | claro-alt | escuro | cor da marca | imagem", "layout": "composição com posições e proporções",
    "copy": { "headline": "texto exato", "sub": "texto exato", "cta": "texto do botão principal", "cta2": "botão secundário (opcional)", "items": ["textos exatos de cartões/itens/perguntas/números"], "extra": "microtexto, selo, legenda" },
    "components": ["cabeçalho com …", "cartões …"], "imagery": "o que as imagens mostram", "mobile_note": "como adapta no celular",
    "image_brief": "parágrafo completo de direção de arte para o gerador de imagem"
  } ] } ]
}`;
}

export function layoutPlanUser(o: { form: LayoutForm; analysis?: LayoutSiteAnalysis | null; sites?: string; inputs: { role: string; note?: string | null }[]; refine?: { previous: unknown; feedback: string } | null }): string {
  const t: Record<string, string> = { current: "Print do SITE ATUAL do cliente", competitor: "Site de CONCORRENTE (referência de estrutura; faça diferente)", inspiration: "Inspiração visual (absorva a sensação, não o conteúdo)" };
  const parts = [`# PROJETO\n${layoutFormBlock(o.form)}`];
  if (o.analysis) parts.push(analysisBlock(o.analysis));
  if (o.sites) parts.push(`# TEXTO DAS PÁGINAS INFORMADAS POR LINK (use para entender o negócio; não copie)\n${o.sites}`);
  if (o.inputs.length) parts.push(`# IMAGENS ANEXAS\n${o.inputs.map((i, n) => `${n + 1}. ${t[i.role] ?? i.role}${i.note ? ` — nota: ${i.note}` : ""}`).join("\n")}`);
  if (o.refine) parts.push(`# AJUSTE PEDIDO\nPlano anterior (resumo): ${JSON.stringify(o.refine.previous).slice(0, 5000)}\nO usuário pediu: ${o.refine.feedback}\nRefaça o plano aplicando o pedido e mantendo o que não foi mencionado.`);
  return parts.join("\n\n");
}

export function sanitizeLayoutPlan(raw: unknown, form: LayoutForm): LayoutPlan {
  const r = rec(raw), ds = rec(r.design_system), ty = rec(ds.typography), ms = rec(ds.mascot);
  const palette = (Array.isArray(ds.palette) ? ds.palette : []).map((p) => { const x = rec(p), h = hex(x.hex); return h ? { role: clip(x.role, 20).toLowerCase(), hex: h, usage: clip(x.usage, 100) } : null; }).filter(Boolean).slice(0, 10) as { role: string; hex: string; usage: string }[];
  const sid = clip(ds.style_id, 30).toLowerCase();
  const system: LayoutDesignSystem = {
    name: clip(ds.name, 60), style_id: styleIds.has(sid) ? sid : (form.style_ids[0] ?? "other"), mood: clip(ds.mood, 200), palette: form.palette_mode === "custom" && form.palette.length ? form.palette.map((h, i) => ({ role: ["marca", "acento", "fundo", "texto", "acao"][i] ?? "acento", hex: h, usage: "definida pelo usuário" })).concat(palette.filter((p) => !form.palette.includes(p.hex) && ["fundo", "superficie", "texto", "texto_suave", "borda"].includes(p.role))).slice(0, 10) : palette,
    typography: { heading: form.font_heading || clip(ty.heading, 60), heading_weight: clip(ty.heading_weight, 20), body: form.font_body || clip(ty.body, 60), body_weight: clip(ty.body_weight, 20), scale: clip(ty.scale, 260) },
    grid: clip(ds.grid, 260), radius: clip(ds.radius, 200), shadows: clip(ds.shadows, 200), buttons: clip(ds.buttons, 260), cards: clip(ds.cards, 260), icons: clip(ds.icons, 160), imagery: clip(ds.imagery, 260), rhythm: clip(ds.rhythm, 260),
    mascot: { use: form.mascot === "no" ? false : form.mascot === "yes" ? true : !!ms.use, name: clip(ms.name, 60), description: clip(ms.description || form.mascot_desc, 500) },
  };
  const pages = (Array.isArray(r.pages) ? r.pages : []).map((p, pi): LayoutPagePlan => {
    const x = rec(p);
    return { key: sectionKey(x.key) || `p${pi + 1}`, name: clip(x.name, 60) || `Página ${pi + 1}`, goal: clip(x.goal, 200), sections: (Array.isArray(x.sections) ? x.sections : []).map((s, si): LayoutSectionPlan => {
      const y = rec(s), c = rec(y.copy);
      return { key: sectionKey(y.key), name: clip(y.name, 60) || `Seção ${si + 1}`, purpose: clip(y.purpose, 200), background: clip(y.background, 30), layout: clip(y.layout, 500), copy: { headline: clip(c.headline, 200), sub: clip(c.sub, 400), cta: clip(c.cta, 60), cta2: clip(c.cta2, 60), items: arr(c.items, 12, 200), extra: clip(c.extra, 200) }, components: arr(y.components, 10, 120), imagery: clip(y.imagery, 300), mobile_note: clip(y.mobile_note, 200), image_brief: clip(y.image_brief, 2200) };
    }).filter((s) => s.image_brief || s.layout || s.copy.headline).slice(0, 16) };
  }).filter((p) => p.sections.length).slice(0, 8);
  return { strategy: clip(r.strategy, 900), category: cats([r.category], 1)[0] ?? form.categories[0] ?? "", design_system: system, pages };
}

// =================================================================================================
// IMAGENS
// =================================================================================================
export interface LayoutAttach { role: "system" | "mascot" | "anchor" | "current" | "style" | "competitor" | "inspiration" | "parent" | "type"; note?: string | null }
export function layoutAttachmentsBlock(list: LayoutAttach[]): string {
  if (!list.length) return "";
  const lines: string[] = []; let i = 0;
  while (i < list.length) {
    const a = list[i], n = i + 1;
    if (a.role === "style") {
      let j = i; while (j + 1 < list.length && list[j + 1].role === "style") j++;
      lines.push(`- ${j > i ? `Imagens ${n}–${j + 1}` : `Imagem ${n}`} — RECORTES REAIS de sites de referência do treino (${a.note || "a mesma seção"}): copie o NÍVEL de acabamento, a grade, o respiro, a hierarquia e o tratamento dos componentes. NUNCA copie textos, marcas, pessoas nem imagens delas.`);
      i = j + 1; continue;
    }
    if (a.role === "system") lines.push(`- Imagem ${n} — GUIA DE ESTILO aprovado deste projeto: use EXATAMENTE a mesma paleta, tipografia, estilo de botões, cartões, ícones, cantos e sombras.`);
    else if (a.role === "type") lines.push(`- Imagem ${n} — AMOSTRA TIPOGRÁFICA: os títulos e o texto do site devem usar EXATAMENTE estas famílias de letras (mesmo desenho e peso).`);
    else if (a.role === "mascot") lines.push(`- Imagem ${n} — MASCOTE da marca: quando o mascote aparecer, use ESTE MESMO personagem (forma, cores, rosto, estilo), mudando só pose e expressão.`);
    else if (a.role === "anchor") lines.push(`- Imagem ${n} — SEÇÃO JÁ APROVADA deste mesmo site (${a.note ?? "hero"}): a nova seção precisa parecer da MESMA página: mesmo cabeçalho/estilo, mesmas cores, fontes, botões, cartões, ícones, cantos e sombras. Não repita a composição dela e use fotografias, pessoas e ilustrações DIFERENTES das dela (nunca reaproveite a mesma foto).`);
    else if (a.role === "current") lines.push(`- Imagem ${n} — recorte do SITE ATUAL do cliente (${a.note ?? "seção correspondente"}): fonte do CONTEÚDO REAL (textos, produtos, números). Redesenhe com qualidade muito superior, sem copiar o layout fraco.`);
    else if (a.role === "parent") lines.push(`- Imagem ${n} — a SEÇÃO ATUAL: base do ajuste.`);
    else if (a.role === "competitor") lines.push(`- Imagem ${n} — site de OUTRO negócio: só referência de estrutura; faça DIFERENTE e não copie nada.`);
    else lines.push(`- Imagem ${n} — INSPIRAÇÃO: pegue a sensação e a energia, não o conteúdo.`);
    i++;
  }
  return `## IMAGENS ANEXAS (nesta ordem)\n${lines.join("\n")}`;
}

export const LAYOUT_RULES = `## REGRAS DO LAYOUT (inegociáveis)
- A imagem É a seção do site: tela plana, de borda a borda, SEM moldura de navegador, SEM barra de endereço, SEM mockup em perspectiva, SEM sombra externa. Parece um print limpo de um site real e pronto.
- TEXTO: escreva EXATAMENTE os textos indicados, uma vez, com ortografia correta em português do Brasil. Nenhum lorem ipsum, nenhuma palavra inventada ou borrada. Para textos longos secundários use poucas linhas curtas e plausíveis. Botões com o texto exato. Números e preços só os informados.
- Hierarquia clara: UM foco por seção (manchete → imagem/prova → botão). Contraste legível, respiro generoso (múltiplos de 8 px), alinhamento em grade, alturas de cartões iguais, mesmo raio e sombra em tudo.
- Mesma linguagem visual em todas as seções do site: paleta, fontes, botões, cartões, ícones, cantos e sombras iguais aos do guia de estilo.
- Imagens dentro da seção: realistas e coerentes (fotografia natural, produto bem iluminado, mockups limpos de telas) ou no estilo definido; sem logos de marcas reais, sem celebridades, sem rostos distorcidos, mãos naturais.
- Sem excesso de elementos, sem degradês arco-íris, sem 5 estilos diferentes. Parece desenhado por um estúdio profissional.`;

function systemBlock(ds: LayoutDesignSystem, form: LayoutForm): string {
  const pal = ds.palette.map((p) => `${p.role} ${p.hex}`).join(", ");
  return [`Sistema "${ds.name || "do projeto"}" — ${ds.mood}`, ds.style_id && ds.style_id !== "other" ? `Estilo: ${layoutStyleById(ds.style_id)?.label ?? ds.style_id} — ${layoutStyleById(ds.style_id)?.look ?? ""}` : "",
    `Paleta: ${pal}`, `Tipografia: títulos ${ds.typography.heading} ${ds.typography.heading_weight}; texto ${ds.typography.body} ${ds.typography.body_weight}; ${ds.typography.scale}`, `Grade: ${ds.grid}`, `Cantos: ${ds.radius}`, `Sombras/bordas: ${ds.shadows}`, `Botões: ${ds.buttons}`, `Cartões: ${ds.cards}`, `Ícones: ${ds.icons}`, `Imagens: ${ds.imagery}`, `Ritmo de fundos: ${ds.rhythm}`,
    ds.mascot.use ? `Mascote: ${ds.mascot.name} — ${ds.mascot.description}` : "Sem mascote.", `Idioma dos textos: ${form.lang}`].filter(Boolean).join("\n");
}
const aspectNote = (f: LayoutForm) => (f.format === "mobile" ? "Formato MOBILE: tela de celular em pé (proporção 9:16), uma coluna, botões largos, áreas de toque grandes, barra superior com logo e menu hambúrguer; a imagem é a tela inteira do celular, sem moldura de aparelho." : "Formato DESKTOP: tela de computador (proporção 16:9), contêiner centralizado de ~1200 px, cabeçalho no topo quando for o hero.");

/** Guia de estilo do projeto (1ª imagem): paleta, tipografia, botões, cartões, ícones, campos, mascote */
export function buildSystemBoardPrompt(o: { form: LayoutForm; plan: LayoutPlan; attach: LayoutAttach[]; learned?: string }): string {
  const ds = o.plan.design_system;
  return `# TAREFA
Você é um diretor de arte de UX/UI. Crie UMA prancha de GUIA DE ESTILO (style tile) 16:9 para o site de "${o.form.business || "o cliente"}": a base visual que todas as seções vão seguir.

## SISTEMA DE DESIGN
${systemBlock(ds, o.form)}

## O QUE A PRANCHA MOSTRA (organizada em grade limpa, tudo rotulado em português com textos curtos)
- Paleta: amostras grandes de cada cor, com o nome do papel e o código hexadecimal escrito (${ds.palette.map((p) => `${p.role} ${p.hex}`).join(", ")}).
- Tipografia: especímen dos títulos (${ds.typography.heading}) e do texto (${ds.typography.body}) com "Aa", alfabeto e uma frase de exemplo curta.
- Botões: primário, secundário e desabilitado, no estilo definido, com texto de verbo (ex.: "Quero começar").
- Componentes: um cartão de exemplo, um campo de formulário com rótulo, um selo/etiqueta, um conjunto de 6 ícones no estilo definido, uma amostra de imagem no tratamento definido.
${ds.mascot.use ? "- O mascote em destaque, grande, em uma pose simpática." : ""}
- Uma miniatura de cabeçalho (logo, 4 links, botão).
Visual limpo, bonito e profissional como a prancha de um estúdio de design; fundo conforme o ritmo do sistema; sem texto além do necessário; ortografia correta.

${LAYOUT_RULES}
${o.learned ? `\n## ESTILO APRENDIDO NO TREINAMENTO (siga)\n${o.learned}\n` : ""}${layoutAttachmentsBlock(o.attach) ? `\n${layoutAttachmentsBlock(o.attach)}\n` : ""}`.trim();
}

/** Mascote da marca (imagem de referência para as seções) */
export function buildMascotPrompt(o: { form: LayoutForm; plan: LayoutPlan; attach: LayoutAttach[] }): string {
  const ds = o.plan.design_system;
  return `# TAREFA
Crie o MASCOTE da marca "${o.form.business || "o cliente"}" (${o.form.segment || o.plan.category}) para ser usado em um site.

## PERSONAGEM
${ds.mascot.name ? `Nome: ${ds.mascot.name}\n` : ""}${ds.mascot.description || "Personagem simpático e memorável, com a identidade da marca."}
Use as cores da marca: ${ds.palette.filter((p) => ["marca", "acento", "acao"].includes(p.role)).map((p) => p.hex).join(", ") || "da paleta do projeto"}. Estilo de acabamento coerente com o sistema (${ds.imagery}).

## ENTREGA (16:9)
Uma folha de personagem limpa: o mascote GRANDE no centro em pose de boas-vindas (corpo inteiro, de frente, rosto expressivo), e à direita 3 poses menores (apontando, comemorando, pensando) — SEMPRE o mesmo personagem, com as mesmas proporções, cores e detalhes. Fundo liso e suave (cor clara da paleta), sombra leve de contato no chão, sem texto, sem logos.
Qualidade de ilustração profissional de mascote de marca, formas limpas, sem mãos deformadas, olhos expressivos, acabamento consistente.
${layoutAttachmentsBlock(o.attach) ? `\n${layoutAttachmentsBlock(o.attach)}` : ""}`.trim();
}

export function buildSectionPrompt(o: { form: LayoutForm; plan: LayoutPlan; page: LayoutPagePlan; section: LayoutSectionPlan; index: number; total: number; attach: LayoutAttach[]; learned?: string; feedback?: string | null }): string {
  const s = o.section, ds = o.plan.design_system, c = s.copy;
  const copy = [c.headline && `Manchete: "${c.headline}"`, c.sub && `Subtítulo: "${c.sub}"`, c.cta && `Botão principal: "${c.cta}"`, c.cta2 && `Botão secundário: "${c.cta2}"`, c.items.length && `Itens (textos exatos): ${c.items.map((x) => `"${x}"`).join(" · ")}`, c.extra && `Detalhe: "${c.extra}"`].filter(Boolean).join("\n- ");
  return `# TAREFA
Você é um diretor de arte de UX/UI. Desenhe a seção ${o.index} de ${o.total} da página "${o.page.name}" do site de "${o.form.business || "o cliente"}": **${s.name}**${s.key === "hero" ? " (a primeira dobra: a seção mais importante, com cabeçalho)" : ""}. ${aspectNote(o.form)}

## SISTEMA DE DESIGN (idêntico em todas as seções)
${systemBlock(ds, o.form)}

## ESTA SEÇÃO
- Objetivo: ${s.purpose || "—"}
- Fundo: ${s.background || "conforme o ritmo do sistema"}
- Composição: ${s.layout}
- TEXTOS EXATOS (os únicos textos legíveis; ortografia idêntica):\n- ${copy || "(sem texto definido)"}
${s.components.length ? `- Componentes: ${s.components.join("; ")}\n` : ""}${s.imagery ? `- Imagens: ${s.imagery}\n` : ""}- Direção detalhada: ${s.image_brief}
${o.feedback ? `\n## AJUSTE PEDIDO PELO USUÁRIO (prevalece)\n${o.feedback}\n` : ""}
${LAYOUT_RULES}
${o.learned ? `\n## ESTILO APRENDIDO NO TREINAMENTO (siga)\n${o.learned}\n` : ""}${layoutAttachmentsBlock(o.attach) ? `\n${layoutAttachmentsBlock(o.attach)}\n` : ""}`.trim();
}

export function buildSectionRefinePrompt(o: { feedback: string; attach: LayoutAttach[]; form: LayoutForm }): string {
  return `# TAREFA: AJUSTAR UMA SEÇÃO EXISTENTE
A imagem 1 é a seção atual do site. Aplique SOMENTE a alteração pedida e mantenha TODO o resto igual: composição, textos, paleta, fontes, botões, cartões, ícones, cantos e imagens (exceto o que a alteração menciona). ${aspectNote(o.form)}

## ALTERAÇÃO PEDIDA
${o.feedback}

${LAYOUT_RULES}
${layoutAttachmentsBlock(o.attach) ? `\n${layoutAttachmentsBlock(o.attach)}` : ""}`.trim();
}
