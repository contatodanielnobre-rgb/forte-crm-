// Criador de thumbnails: prompts, leitura das respostas da IA e montagem do prompt de imagem.
// Usado pela Edge Function studio-generate (Deno) E pelo servidor de demonstração (Node): o mesmo texto vai para o modelo nos dois lugares.
import { THUMB_CATEGORIES, THUMB_LETTERING, THUMB_REF_FONTS, THUMB_SKILL, THUMB_TYPE_GUIDE, categoryById, lettering } from "./thumb-skill.ts";
export { THUMB_CATEGORIES, THUMB_LETTERING, THUMB_REF_FONTS, THUMB_SKILL, THUMB_TYPE_GUIDE, categoryById, lettering };
const LET_IDS = THUMB_LETTERING.map((l) => l.id);

export const clip = (s: unknown, n: number) => String(s ?? "").trim().slice(0, n);
const hex = (s: unknown) => (/^#[0-9a-f]{6}$/i.test(String(s ?? "").trim()) ? String(s).trim().toUpperCase() : null);
const arr = (v: unknown, n = 8, len = 200): string[] => (Array.isArray(v) ? v : []).map((x) => clip(x, len)).filter(Boolean).slice(0, n);
const rec = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const catIds = new Set(THUMB_CATEGORIES.map((c) => c.id));
const cats = (v: unknown, max = 3) => arr(v, max, 30).map((x) => x.toLowerCase()).filter((x) => catIds.has(x));

// =================================================================================================
// TREINAMENTO — 1) observação de cada thumbnail
// =================================================================================================
export const THUMB_OBSERVE_SYSTEM = `Você é diretor de arte e analista de CTR de thumbnails do YouTube. Examina cada thumbnail com precisão técnica (composição, rosto, cor, texto, fundo, efeitos) para que outro designer consiga reproduzir o ESTILO sem copiar o conteúdo. Responda SEMPRE em JSON válido, em português do Brasil.`;

export function thumbObservePrompt(n: number): string {
  const LET_IDS_TXT = LET_IDS;
  void LET_IDS_TXT;
  return `Analise as ${n} thumbnails anexas (na ordem, índice 0 a ${n - 1}). Algumas imagens podem ser apresentações de portfólio (antes/depois, vários painéis): nesse caso analise o design FINAL (o melhor/mais produzido). Para CADA imagem devolva um objeto. Categorias possíveis: ${THUMB_CATEGORIES.map((c) => c.id).join(", ")} (escolha de 1 a 3, a primeira é a dominante).
JSON:
{ "items": [ {
  "index": 0,
  "categories": ["aventura"],
  "summary": "1 frase: o que a imagem conta e por que clica",
  "has_text": true,
  "text": ["palavras exatas que aparecem, se houver"],
  "text_position": "onde está o texto (topo, esquerda, atrás da cabeça, no chão…)",
  "text_style": "descrição livre do lettering (como as letras são)",
  "lettering": { "style_id": "${LET_IDS.join(" | ")} | other", "font_hint": "a fonte do Google Fonts MAIS PARECIDA com as letras (ex.: Montserrat, Anton, Bebas Neue, Poppins, Inter, Open Sans, Plus Jakarta Sans)", "font_alts": ["2 outras fontes parecidas"], "weight": "thin | light | regular | medium | bold | extrabold | black | mixed (se mistura pesos)", "case": "upper | lower | mixed", "color": "cor do texto", "highlight": "none | pincelada | caixa | pílula | contorno | sombra | sublinhado | tarja", "arrow": false, "look": "peso, largura, caixa alta/mista, cor, textura/desgaste, contorno ou sombra (ou nenhum)", "container": "none | caixa | pílula | etiqueta | pincelada | outro", "integration": "atrás do sujeito | sobre o fundo | dentro da cena", "hierarchy": "uma linha | duas camadas | várias" },
  "text_needed": "por que esta thumbnail precisa (ou não) de texto",
  "persons": 1,
  "person_role": "creator | story_character | group | none",
  "person_position": "left | center | right | both_sides | none",
  "face_size": "close | medium | wide | none",
  "expression": "emoção exata do rosto (frase curta)",
  "expression_class": "shock | open_mouth | teeth | fear | confident | smile | serious | think | sad | doubt | neutral | none",
  "face_height_pct": 0,
  "text_height_pct": 0,
  "text_behind": false,
  "gaze": "camera | object | away | none",
  "pose_hands": "o que o corpo e as mãos fazem",
  "background": "tipo de fundo/cenário",
  "palette": ["#RRGGBB", "#RRGGBB", "#RRGGBB"],
  "saturation": "low | medium | high",
  "lighting": "luz, glow, rim light, vinheta",
  "camera": "lente/ângulo (grande-angular, selfie, plongée, close…)",
  "effects": ["efeitos visíveis"],
  "props": ["objetos importantes e onde estão"],
  "object_logic": "como os objetos interagem com a pessoa/ambiente (segura, apoia, aponta, toca) e por que estão ali",
  "realism": "fotografia natural | retoque comercial | render 3D/ilustração",
  "skeleton": "A rosto de lado+prova | B palavra gigante atrás | C dois blocos de texto em volta do rosto | D educativo claro | E plongée de provocação | F aventura cinematográfica | G painel de investigação | H comparação/VS | I indivíduo × multidão | other",
  "key_trait": "o recurso que mais chama atenção nesta imagem"
} ] }
Não invente o que não vê. Não cite nomes de pessoas reais; descreva-as.`;
}

export interface ThumbObs {
  index: number; categories: string[]; summary: string; has_text: boolean; text: string[]; text_position: string; text_style: string; text_needed: string
  persons: number; person_role: string; person_position: string; face_size: string; expression: string; gaze: string; pose_hands: string
  background: string; palette: string[]; saturation: string; lighting: string; camera: string; effects: string[]; props: string[]; key_trait: string
  lettering: { style_id: string; font_hint: string; look: string; container: string; integration: string; hierarchy: string; font_alts?: string[]; weight?: string; case?: string; color?: string; highlight?: string; arrow?: boolean }
  object_logic: string; realism: string; skeleton: string
  expression_class: string; face_height_pct: number; text_height_pct: number; text_behind: boolean
}
export function sanitizeObservations(raw: unknown, n: number): ThumbObs[] {
  const items = ((raw && typeof raw === "object" ? (raw as Record<string, unknown>).items : null) ?? []) as Record<string, unknown>[];
  const out: ThumbObs[] = [];
  for (const o of Array.isArray(items) ? items : []) {
    const index = Number(o.index);
    if (!Number.isInteger(index) || index < 0 || index >= n) continue;
    out.push({
      index, categories: cats(o.categories), summary: clip(o.summary, 220), has_text: !!o.has_text, text: arr(o.text, 6, 40), text_position: clip(o.text_position, 80), text_style: clip(o.text_style, 120),
      text_needed: clip(o.text_needed, 160), persons: Math.max(0, Math.min(40, Number(o.persons) || 0)), person_role: clip(o.person_role, 20), person_position: clip(o.person_position, 20), face_size: clip(o.face_size, 12),
      expression: clip(o.expression, 100), gaze: clip(o.gaze, 12), pose_hands: clip(o.pose_hands, 140), background: clip(o.background, 140),
      palette: (Array.isArray(o.palette) ? o.palette : []).map(hex).filter(Boolean).slice(0, 4) as string[], saturation: clip(o.saturation, 10), lighting: clip(o.lighting, 140), camera: clip(o.camera, 80),
      effects: arr(o.effects, 6, 60), props: arr(o.props, 6, 80), key_trait: clip(o.key_trait, 180),
      lettering: (() => { const l = rec(o.lettering); const id = clip(l.style_id, 30); return { style_id: LET_IDS.includes(id) ? id : "other", font_hint: clip(l.font_hint, 60), look: clip(l.look, 200), container: clip(l.container, 30), integration: clip(l.integration, 40), hierarchy: clip(l.hierarchy, 30), font_alts: arr(l.font_alts, 3, 40), weight: clip(l.weight, 20).toLowerCase(), case: clip(l.case, 10).toLowerCase(), color: clip(l.color, 40), highlight: clip(l.highlight, 20).toLowerCase(), arrow: !!l.arrow }; })(),
      object_logic: clip(o.object_logic, 220), realism: clip(o.realism, 50), skeleton: clip(o.skeleton, 60),
      expression_class: clip(o.expression_class, 20).toLowerCase(), face_height_pct: Math.max(0, Math.min(100, Number(o.face_height_pct) || 0)), text_height_pct: Math.max(0, Math.min(100, Number(o.text_height_pct) || 0)), text_behind: !!o.text_behind,
    });
  }
  return out;
}

// =================================================================================================
// TREINAMENTO — 2) síntese por categoria (texto)
// =================================================================================================
export const THUMB_SYNTH_SYSTEM = `Você é diretor de criação de uma agência de thumbnails do YouTube. Recebe observações detalhadas de thumbnails de referência, agrupadas por categoria, e escreve o MANUAL DE ESTILO aprendido: padrões repetidos, o que funciona e o que evitar. Seja específico (posições, tamanhos, cores, tratamentos), nunca genérico. Não copie conteúdo de nenhuma thumbnail; descreva o padrão. Responda SEMPRE em JSON válido, em português do Brasil.`;

export interface ThumbCatAnalysis { count?: number; summary?: string; composition?: string; character?: string; expression?: string; scene?: string; palette?: string; text?: string; typography?: string; layout?: string; props?: string; object_logic?: string; realism?: string; do?: string[]; dont?: string[] }
export interface ThumbStats { fonts: [string, number][]; weights: [string, number][]; highlights: [string, number][]; arrow_pct: number; face_avg: number; text_avg: number; n: number; text_pct: number; no_person_pct: number; positions: [string, number][]; faces: [string, number][]; gaze: [string, number][]; expressions: [string, number][]; lettering: [string, number][]; skeleton: [string, number][]; realism: [string, number][]; saturation: [string, number][]; behind_pct: number }
export interface ThumbAnalysis {
  stats?: Record<string, ThumbStats>
  general?: { summary?: string; composition?: string; faces?: string; color?: string; text_policy?: string; backgrounds?: string; effects?: string; do?: string[]; dont?: string[] }
  categories?: Record<string, ThumbCatAnalysis>
}

export function thumbSynthUser(obs: { index: number; o: ThumbObs }[], groups: Record<string, number[]>): string {
  const line = (o: ThumbObs) => JSON.stringify({ resumo: o.summary, texto: o.has_text ? o.text : "sem texto", pos_texto: o.text_position, estilo_texto: o.text_style, por_que_texto: o.text_needed, pessoas: o.persons, papel: o.person_role, posicao: o.person_position, rosto: o.face_size, expressao: o.expression, olhar: o.gaze, pose: o.pose_hands, fundo: o.background, cores: o.palette, saturacao: o.saturation, luz: o.lighting, camera: o.camera, efeitos: o.effects, objetos: o.props, destaque: o.key_trait, letras: o.lettering, logica_objetos: o.object_logic, realismo: o.realism, esqueleto: o.skeleton });
  const byIdx = new Map(obs.map((x) => [x.index, x.o]));
  const blocks = Object.entries(groups).filter(([, ids]) => ids.length).map(([cat, ids]) => `## CATEGORIA ${cat} (${ids.length} thumbnails)\n${ids.map((i) => byIdx.get(i)).filter(Boolean).map((o) => `- ${line(o!)}`).join("\n")}`);
  return `OBSERVAÇÕES DAS THUMBNAILS DE REFERÊNCIA DO USUÁRIO:\n\n${blocks.join("\n\n")}\n\nEscreva o manual de estilo APRENDIDO destas referências. Para cada categoria que tem observações devolva os padrões (use números e posições concretas) e, em "general", o que é comum a TODAS. Formato:
{
  "general": { "summary": "2–3 frases sobre o gosto do conjunto", "composition": "...", "faces": "tamanho, expressão e olhar dos rostos", "color": "saturação, paletas e tratamentos de cor", "text_policy": "quando o texto aparece e quando não, tamanho e estilo", "backgrounds": "...", "effects": "...", "do": ["5–8 práticas"], "dont": ["5–8 coisas a evitar"] },
  "categories": { "<id da categoria>": { "summary": "...", "composition": "posição do personagem/objeto/texto", "character": "como o personagem aparece (papel, enquadramento, tamanho)", "expression": "...", "scene": "fundo/cenário e luz", "palette": "cores dominantes e acentos", "text": "política de texto desta categoria", "typography": "ESTILOS DE LETTERING usados (classe, fonte parecida, peso, textura, contêiner, integração), com a variedade entre as thumbnails", "layout": "esqueletos de composição recorrentes com posições em % (onde ficam pessoa, texto e prova)", "props": "objetos recorrentes", "object_logic": "como os objetos interagem com a pessoa (lógica física)", "realism": "tipo de fotografia, luz e tratamento", "do": ["3–6"], "dont": ["3–6"] } }
}`;
}

export function sanitizeThumbAnalysis(raw: unknown, counts: Record<string, number> = {}, stats?: Record<string, ThumbStats>): ThumbAnalysis {
  const r = rec(raw), g = rec(r.general), c = rec(r.categories);
  const categories: Record<string, ThumbCatAnalysis> = {};
  for (const [id, v0] of Object.entries(c)) {
    if (!catIds.has(id)) continue;
    const v = rec(v0);
    categories[id] = { count: counts[id] ?? 0, summary: clip(v.summary, 500), composition: clip(v.composition, 600), character: clip(v.character, 500), expression: clip(v.expression, 400), scene: clip(v.scene, 500), palette: clip(v.palette, 400), text: clip(v.text, 500), typography: clip(v.typography, 600), layout: clip(v.layout, 600), props: clip(v.props, 400), object_logic: clip(v.object_logic, 400), realism: clip(v.realism, 400), do: arr(v.do, 6), dont: arr(v.dont, 6) };
  }
  return { stats, general: { summary: clip(g.summary, 600), composition: clip(g.composition, 700), faces: clip(g.faces, 600), color: clip(g.color, 600), text_policy: clip(g.text_policy, 700), backgrounds: clip(g.backgrounds, 500), effects: clip(g.effects, 500), do: arr(g.do, 8), dont: arr(g.dont, 8) }, categories };
}

/** Documento de treinamento de thumbnails (o que fica salvo na pasta e é lido nas próximas criações) */
export function compileThumbSkill(o: { name: string; isBase: boolean; analysis: ThumbAnalysis | null; refs: number; version: number; extra?: string | null }): string {
  const a = o.analysis, g = a?.general;
  const L = (t: string, v?: string | string[] | null) => (Array.isArray(v) ? (v.length ? `${t}\n${v.map((x) => `- ${x}`).join("\n")}\n` : "") : v ? `${t} ${v}\n` : "");
  const lines = [
    `# TREINAMENTO DE THUMBNAILS — ${o.isBase ? "Agência (padrão para todos os canais)" : o.name} · v${o.version}`,
    `Baseado em ${o.refs} thumbnail(s) de referência${a ? " analisadas por IA de visão" : " (sem análise de IA)"}.`, "",
    g ? L("**Gosto do conjunto:**", g.summary) : "", g ? L("**Composição:**", g.composition) : "", g ? L("**Rostos:**", g.faces) : "", g ? L("**Cor e saturação:**", g.color) : "",
    g ? L("**Política de texto:**", g.text_policy) : "", g ? L("**Fundos:**", g.backgrounds) : "", g ? L("**Efeitos:**", g.effects) : "", g ? L("**Sempre:**", g.do) : "", g ? L("**Nunca:**", g.dont) : "",
  ];
  for (const [id, c] of Object.entries(a?.categories ?? {})) {
    lines.push(`## ${categoryById(id)?.label ?? id}${c.count ? ` (${c.count} refs)` : ""}`, L("**Resumo:**", c.summary), L("**Composição:**", c.composition), L("**Personagem:**", c.character), L("**Expressão:**", c.expression), L("**Cenário e luz:**", c.scene), L("**Paleta:**", c.palette), L("**Texto:**", c.text), L("**Lettering:**", c.typography), L("**Esqueleto de composição:**", c.layout), L("**Objetos:**", c.props), L("**Lógica dos objetos:**", c.object_logic), L("**Realismo:**", c.realism), L("**Sempre:**", c.do), L("**Nunca:**", c.dont));
  }
  if (a?.stats) lines.push(statsLines(a.stats));
  if (o.extra) lines.push(`**Regras extras escritas pela equipe:**\n${o.extra}\n`);
  return lines.filter((l) => l !== "").join("\n");
}

/** Trecho do que foi APRENDIDO para as categorias escolhidas (vai no prompt da ideação e, resumido, no da imagem) */
export function learnedBlock(analysis: ThumbAnalysis | null | undefined, categories: string[], full = true): string {
  if (!analysis) return "";
  const g = analysis.general, out: string[] = [];
  if (g) out.push(`GERAL: ${[g.summary, g.composition && `Composição: ${g.composition}`, g.faces && `Rostos: ${g.faces}`, g.color && `Cor: ${g.color}`, g.text_policy && `Texto: ${g.text_policy}`].filter(Boolean).join(" ")}`);
  for (const id of categories) {
    const c = analysis.categories?.[id]; if (!c) continue;
    out.push(`${(categoryById(id)?.label ?? id).toUpperCase()}: ${[c.summary, c.composition && `Composição: ${c.composition}`, c.character && `Personagem: ${c.character}`, c.expression && `Expressão: ${c.expression}`, c.scene && `Cenário: ${c.scene}`, c.palette && `Paleta: ${c.palette}`, c.text && `Texto: ${c.text}`, c.typography && `Lettering: ${c.typography}`, c.layout && `Esqueleto: ${c.layout}`, c.object_logic && `Objetos: ${c.object_logic}`, c.realism && `Realismo: ${c.realism}`, full && c.dont?.length ? `Evitar: ${c.dont.join("; ")}` : ""].filter(Boolean).join(" ")}`);
  }
  return out.join("\n");
}

// =================================================================================================
// ESTÚDIO — formulário → conceitos
// =================================================================================================
export interface ThumbCast { id: string; label: string; description?: string | null; role: string; show: string; expression?: string; gaze?: string; position?: string }
/** Ajustes finos OPCIONAIS: tudo em branco/"auto" = a IA decide pela categoria, pelo vídeo e pelas referências */
export interface ThumbDirection { text_depth: string; text_area: string; text_font: string; text_color: string; lettering: string; background: string; dominant_color: string; skeleton: string }
export const EXPRESSION_LABEL: Record<string, string> = { shock: "choque (olhos arregalados, sobrancelhas altas)", open_mouth: "BOCA ABERTA (grito/espanto, boca em 'O' ou queixo caído)", smile: "sorriso largo confiante", smirk: "sorriso de canto confiante, sobrancelha levantada", serious: "sério/desafiador", fear: "pavor/medo", anger: "raiva/dentes à mostra", think: "pensativo (mão no queixo ou na têmpora)", sad: "decepção/cansaço", doubt: "dúvida/ceticismo" };
export const GAZE_LABEL: Record<string, string> = { camera: "olhando DIRETO para a câmera", object: "olhando para o objeto/prova principal da imagem", side: "olhando de lado, para fora da cena", up: "olhando para cima", down: "olhando para baixo" };
export const POSITION_LABEL: Record<string, string> = { left: "no terço ESQUERDO da imagem", center: "no CENTRO da imagem", right: "no terço DIREITO da imagem" };
export const TEXT_DEPTH_LABEL: Record<string, string> = { behind: "ATRÁS do personagem (a cabeça/ombros cobrem parte das letras)", front: "NA FRENTE do personagem (sobre a imagem, sem cobrir olhos nem boca)" };
export const TEXT_AREA_LABEL: Record<string, string> = { left: "coluna da ESQUERDA", right: "coluna da DIREITA", top: "faixa SUPERIOR (topo)", bottom: "faixa INFERIOR (base, longe do canto direito)", center: "CENTRO" };
export const BACKGROUND_LABEL: Record<string, string> = { real: "cenário real fotográfico do tema", dark_glow: "estúdio escuro com contraluz de uma fonte plausível", light_clean: "fundo claro limpo com muito espaço negativo", illustrated: "fundo ilustrado/sketch", blur_crowd: "multidão ou ambiente desfocado/dessaturado ao fundo" };
export const SKELETON_LABEL: Record<string, string> = { A: "A · rosto de lado + prova", B: "B · palavra gigante atrás do sujeito", C: "C · dois blocos de texto em volta do rosto", D: "D · educativo claro", E: "E · plongée de provocação", F: "F · aventura cinematográfica", G: "G · painel de investigação", H: "H · comparação/VS", I: "I · indivíduo × multidão" };
export const emptyDirection = (): ThumbDirection => ({ text_depth: "auto", text_area: "auto", text_font: "", text_color: "", lettering: "", background: "auto", dominant_color: "", skeleton: "" });
const pick = (v: unknown, allowed: string[], dflt = "auto") => (allowed.includes(String(v)) ? String(v) : dflt);
export interface ThumbForm {
  title: string; brief: string; categories: string[]; cast: ThumbCast[]; text_mode: string; text_custom?: string; lang?: string
  notes?: string; avoid?: string; count?: number; channel?: string; dir?: ThumbDirection
}
export const CAST_ROLES: Record<string, string> = { owner: "DONO DO CANAL (o rosto do criador)", story: "PERSONAGEM DA HISTÓRIA (protagonista do vídeo; o dono do canal NÃO aparece por causa dele)", support: "COADJUVANTE / outra pessoa" };
export const SHOW_LABEL: Record<string, string> = { auto: "a IA decide o enquadramento", face: "só o rosto (close)", half: "meio corpo", full: "corpo inteiro" };
export const TEXT_MODES: Record<string, string> = { auto: "A IA decide se leva texto (e qual) pela categoria", none: "SEM texto na thumbnail", custom: "Use EXATAMENTE o texto indicado" };

export function sanitizeThumbForm(raw: unknown): ThumbForm {
  const r = rec(raw);
  const cast = (Array.isArray(r.cast) ? r.cast : []).map((c) => { const x = rec(c); return { id: clip(x.id, 60), label: clip(x.label, 60), description: x.description ? clip(x.description, 600) : null, role: ["owner", "story", "support"].includes(String(x.role)) ? String(x.role) : "owner", show: ["auto", "face", "half", "full"].includes(String(x.show)) ? String(x.show) : "auto", expression: pick(x.expression, ["auto", ...Object.keys(EXPRESSION_LABEL)]), gaze: pick(x.gaze, ["auto", ...Object.keys(GAZE_LABEL)]), position: pick(x.position, ["auto", ...Object.keys(POSITION_LABEL)]) }; }).filter((c) => c.label).slice(0, 5);
  const d = rec(r.dir);
  const dir: ThumbDirection = { text_depth: pick(d.text_depth, ["auto", "behind", "front"]), text_area: pick(d.text_area, ["auto", ...Object.keys(TEXT_AREA_LABEL)]), text_font: clip(d.text_font, 60), text_color: hex(d.text_color) ?? "", lettering: LET_IDS.includes(clip(d.lettering, 30)) ? clip(d.lettering, 30) : "", background: pick(d.background, ["auto", ...Object.keys(BACKGROUND_LABEL)]), dominant_color: hex(d.dominant_color) ?? "", skeleton: Object.keys(SKELETON_LABEL).includes(clip(d.skeleton, 2)) ? clip(d.skeleton, 2) : "" };
  return {
    title: clip(r.title, 140), brief: clip(r.brief, 9000), categories: cats(r.categories, 3), cast, text_mode: ["auto", "none", "custom"].includes(String(r.text_mode)) ? String(r.text_mode) : "auto",
    text_custom: clip(r.text_custom, 120), lang: clip(r.lang, 20) || "português do Brasil", notes: clip(r.notes, 800), avoid: clip(r.avoid, 400), count: Math.max(1, Math.min(8, Number(r.count) || 6)), channel: clip(r.channel, 120), dir,
  };
}

export function formBlock(f: ThumbForm): string {
  const cat = f.categories.length ? f.categories.map((c) => categoryById(c)?.label ?? c).join(" + ") : "a IA decide pelo tema";
  return [
    f.channel ? `- Canal: ${f.channel}` : "", f.title ? `- Título do vídeo: "${f.title}"` : "",
    `- Categoria: ${cat}`,
    `- Texto na thumbnail: ${TEXT_MODES[f.text_mode] ?? TEXT_MODES.auto}${f.text_mode === "custom" && f.text_custom ? `: "${f.text_custom}"` : ""} (idioma: ${f.lang || "português do Brasil"})`,
    f.cast.length ? `- Pessoas disponíveis (cada uma com foto anexada):\n${f.cast.map((c) => `   • ${c.label} — ${CAST_ROLES[c.role]}; enquadramento: ${SHOW_LABEL[c.show]}${c.expression && c.expression !== "auto" ? `; EXPRESSÃO DEFINIDA: ${EXPRESSION_LABEL[c.expression]}` : ""}${c.gaze && c.gaze !== "auto" ? `; OLHAR DEFINIDO: ${GAZE_LABEL[c.gaze]}` : ""}${c.position && c.position !== "auto" ? `; POSIÇÃO DEFINIDA: ${POSITION_LABEL[c.position]}` : ""}${c.description ? `; traços: ${c.description}` : ""}`).join("\n")}` : "- Pessoas: nenhuma foto anexada (não invente rostos reais; use cenas, objetos, silhuetas ou personagens genéricos)",
    f.avoid ? `- Evitar: ${f.avoid}` : "", f.notes ? `- Observações do usuário (OBRIGATÓRIAS; interprete-as com as referências): ${f.notes}` : "",
    directionBlock(f),
  ].filter(Boolean).join("\n");
}

/** Só o que o usuário DEFINIU. O que não aparece aqui é decisão da IA (categoria + referências + tema do vídeo). */
export function directionBlock(f: ThumbForm): string {
  const d = f.dir ?? emptyDirection(), L: string[] = [];
  const textSet = d.text_depth !== "auto" || d.text_area !== "auto" || !!d.text_font || !!d.text_color || !!d.lettering;
  if (textSet && f.text_mode !== "none") L.push("o usuário configurou o TEXTO: TODA ideia deve levar texto (headline curto), com estes ajustes");
  if (d.text_depth !== "auto") L.push(`texto ${TEXT_DEPTH_LABEL[d.text_depth]}`);
  if (d.text_area !== "auto") L.push(`texto na ${TEXT_AREA_LABEL[d.text_area]}`);
  if (d.text_font) L.push(`FONTE DO TEXTO (obrigatória): "${d.text_font}" — reproduza a anatomia real dessa tipografia`);
  if (d.text_color) L.push(`cor do texto: ${d.text_color}`);
  if (d.lettering) L.push(`estilo de lettering: ${lettering(d.lettering)?.label ?? d.lettering}`);
  if (d.background !== "auto") L.push(`fundo: ${BACKGROUND_LABEL[d.background]}`);
  if (d.dominant_color) L.push(`cor dominante da imagem: ${d.dominant_color}`);
  if (d.skeleton) L.push(`esqueleto de composição: ${SKELETON_LABEL[d.skeleton]}`);
  return L.length ? `- DIREÇÃO DEFINIDA PELO USUÁRIO (OBRIGATÓRIA, cumpra exatamente; tudo que não está aqui você decide pela categoria, pelo tema e pelas referências):\n${L.map((x) => `   • ${x}`).join("\n")}` : "- Direção: o usuário não fixou nenhum ajuste fino; decida TUDO (posição do texto, lettering, expressão, olhar, fundo, cores) pela categoria, pelo tema e pelas referências.";
}

/** Guia de fontes e uso do texto das categorias escolhidas (ou de todas, se a IA decide) */
export function typeGuideBlock(categories: string[]): string {
  const ids = categories.length ? categories : Object.keys(THUMB_TYPE_GUIDE);
  const rows = ids.filter((id) => THUMB_TYPE_GUIDE[id]).map((id) => {
    const g = THUMB_TYPE_GUIDE[id];
    return `- ${categoryById(id)?.label ?? id} [${id}] · texto: ${g.text === "none" ? "QUASE NUNCA (gere SEM texto, salvo ambiental)" : g.text === "rare" ? "raro (no máximo 1–2 símbolos)" : "sim"} · fontes: ${g.fonts.map((f) => `${f.name} ${f.weights}`).join(" / ")} · ${g.depth} · ${g.position} · ${g.case} · cores: ${g.colors} · destaque: ${g.emphasis} · setas: ${g.arrows}`;
  });
  return `# GUIA DE FONTES E USO DO TEXTO POR NICHO (regra do usuário; vem das suas thumbnails)\nSe o usuário NÃO escolheu a fonte, escolha UMA das fontes do nicho (varie entre os conceitos), preencha "font_hint" com o nome real e siga profundidade, posição, caixa, cores, destaque e setas do nicho. Nichos "sem texto" ficam SEM texto, a menos que o usuário peça texto ou configure o texto.\n${rows.join("\n")}`;
}

export function thumbIdeateSystem(o: { baseDoc?: string | null; brandDoc?: string | null; extra?: string | null; count: number; categories: string[] }): string {
  const sel = o.categories.length ? THUMB_CATEGORIES.filter((c) => o.categories.includes(c.id)) : THUMB_CATEGORIES;
  return `${THUMB_SKILL}

# MANUAIS DAS CATEGORIAS${o.categories.length ? " ESCOLHIDAS" : " (escolha as melhores para o tema)"}
${sel.map((c) => `## ${c.label} [${c.id}]\n${c.playbook}`).join("\n\n")}

${typeGuideBlock(o.categories)}

${o.baseDoc ? `# TREINAMENTO DA AGÊNCIA (aprendido das thumbnails de referência)\n${o.baseDoc}\n` : ""}${o.brandDoc ? `# TREINAMENTO DESTE CANAL\n${o.brandDoc}\n` : ""}${o.extra ? `# REGRAS EXTRAS DA AGÊNCIA\n${o.extra}\n` : ""}
# SUA TAREFA AGORA
Aplique o processo de ideação (seção 10) ao vídeo descrito e entregue ${o.count} CONCEITO(S) de thumbnail, cada um com um ângulo diferente. Decida a categoria (se o usuário não escolheu), o papel de cada personagem (dono do canal × personagem da história × sem pessoa), a expressão, a posição EXATA de cada elemento, o cenário, a paleta, a luz e se leva texto (e qual, com justificativa). Se o usuário forneceu texto exato, use-o; se escolheu "sem texto", não escreva texto. CONTROLES DO USUÁRIO: tudo que aparece em "DIREÇÃO DEFINIDA PELO USUÁRIO", nas pessoas (expressão/olhar/posição definidos) e nas observações é OBRIGATÓRIO e vale em todos os conceitos; interprete-o junto com a categoria, as referências e os exemplos reais (seção 23). O que NÃO foi definido você decide sozinho da melhor forma, sem deixar nada genérico. REGRAS DE NATURALIDADE: (1) cada conceito usa um estilo de lettering DIFERENTE (seção 15) e nunca a fonte itálica extra-pesada genérica; (2) siga os EXEMPLOS REAIS abaixo (lógica, posições e lettering de thumbnails de verdade do usuário) em vez de inventar fórmulas; (3) o image_brief NÃO pode conter nenhum texto além do headline/sub (descreva telas e painéis como formas e gráficos, sem palavras ou números extras); (4) objetos com lógica física e escala real; (5) luz com fonte plausível, pele e cenário fotográficos; (6) nada de neon espalhado nem cartões de interface flutuando. Use somente as pessoas com foto disponível, citando o nome exato.
Responda SOMENTE em JSON válido, em português do Brasil:
{
  "analysis": "2–3 frases: promessa/conflito central do vídeo, emoção dominante, categoria escolhida e por quê",
  "concepts": [ {
    "name": "nome curto da ideia",
    "angle": "rosto+prova | cenário+ameaça | conceito simbólico | contraste/multidão | curiosity gap | outro",
    "category": "id da categoria dominante",
    "hook": "por que esta imagem faz clicar (curiosidade/emoção) em 1–2 frases",
    "composition": "quem fica onde (esquerda/centro/direita), tamanho relativo, diagonais e espaço negativo",
    "characters": [ { "who": "nome exato de uma pessoa disponível | 'personagem genérico' | 'sem pessoa'", "placement": "posição e tamanho", "expression": "emoção exata", "gaze": "para onde olha", "pose": "pose e mãos", "outfit": "roupa, se relevante" } ],
    "scene": "fundo/cenário e luz",
    "elements": ["objetos e efeitos importantes e onde ficam"],
    "colors": ["#RRGGBB", "..."],
    "text": { "mode": "none | short", "headline": "texto exato (vazio se none)", "sub": "linha menor opcional", "placement": "onde fica, ancorado ao rosto (ex.: atrás da cabeça cobrindo 20% das letras, alinhado aos olhos à esquerda)",
      "style_id": "UM id da biblioteca de lettering (seção 15) — DIFERENTE dos outros conceitos", "font_hint": "fonte real parecida", "look": "peso, largura, caixa, cor, textura, contorno/sombra", "container": "none | caixa | pílula | etiqueta | pincelada", "integration": "atrás do sujeito | sobre o fundo | dentro da cena", "style": "resumo do lettering em uma frase" },
    "objects": "lógica dos objetos: cada objeto, por que está ali e como interage fisicamente com a pessoa/ambiente (segura, apoia, toca) — no máximo 1 objeto-herói + 1 de apoio",
    "skeleton": "A | B | C | D | E | F | G | H | I (esqueleto de composição da seção 17) e as posições em %",
    "text_reason": "por que leva (ou não) texto",
    "image_brief": "parágrafo de direção de fotografia/arte para o gerador: cada elemento com posição, tamanho, expressão, luz, cenário e o texto exato"
  } ]
}`;
}

/** Linhas compactas de thumbnails REAIS do usuário (observações da IA): servem de exemplo de lógica, posição e lettering */
export function exemplarsBlock(list: { obs: ThumbObs; tags: string[] }[], categories: string[], max = 6): string {
  const score = (x: { obs: ThumbObs; tags: string[] }) => (categories.length ? x.tags.filter((t) => categories.includes(t)).length * 10 : 0) + (x.obs.has_text ? 2 : 0) + Math.random();
  const picks = [...list].sort((a, b) => score(b) - score(a)).slice(0, max);
  if (!picks.length) return "";
  const line = (x: { obs: ThumbObs; tags: string[] }) => {
    const o = x.obs, l = o.lettering;
    return `- [${x.tags.join("/")}] ${o.summary} | pessoa: ${o.persons ? `${o.person_role}, ${o.person_position}, rosto ${o.face_size}${o.face_height_pct ? ` (~${o.face_height_pct}% da altura)` : ""}, ${o.expression}, olhar ${o.gaze}` : "sem pessoa"}; pose: ${o.pose_hands} | texto: ${o.has_text ? `"${o.text.join(" ")}" ${o.text_position}; lettering ${l.style_id} (${l.font_hint}: ${l.look}; ${l.container}; ${l.integration}; ${l.hierarchy})${o.text_height_pct ? `; palavra principal ~${o.text_height_pct}% da altura` : ""}${o.text_behind ? "; ATRÁS do sujeito" : ""}` : "sem texto"} | objetos: ${o.object_logic || o.props.join(", ")} | fundo: ${o.background}; luz: ${o.lighting}; câmera: ${o.camera}; ${o.realism} | esqueleto ${o.skeleton}`;
  };
  return `# EXEMPLOS REAIS (thumbnails que o usuário fez/estuda; imite a LÓGICA, as posições e a variedade de lettering, nunca o conteúdo)\n${picks.map(line).join("\n")}`;
}

export function thumbIdeateUser(o: { form: ThumbForm; inputs: { role: string; note?: string | null }[]; refine?: { previous: unknown; feedback: string } | null; used?: string[]; exemplars?: string }): string {
  const t: Record<string, string> = { competitor: "Thumbnail de OUTRO canal (referência de estrutura; faça diferente)", inspiration: "Inspiração (absorva a sensação/composição, não o conteúdo)", own: "Uma thumbnail anterior do usuário (melhore)" };
  const parts = [`# VÍDEO\n${formBlock(o.form)}\n\n# O QUE O VÍDEO VAI FALAR (explicação do usuário)\n${o.form.brief || "(não explicou)"}`];
  if (o.inputs.length) parts.push(`# IMAGENS ANEXAS PELO USUÁRIO\n${o.inputs.map((i, n) => `${n + 1}. ${t[i.role] ?? i.role}${i.note ? ` — nota: ${i.note}` : ""}`).join("\n")}`);
  if (o.exemplars) parts.push(o.exemplars);
  if (o.used?.length) parts.push(`# JÁ EXISTEM ESTES CONCEITOS (não repita)\n${o.used.map((c) => `- ${c}`).join("\n")}`);
  if (o.refine) parts.push(`# AJUSTE PEDIDO\nConceito anterior: ${JSON.stringify(o.refine.previous).slice(0, 2000)}\nO usuário pediu: ${o.refine.feedback}`);
  return parts.join("\n\n");
}

export interface ThumbConcept {
  index?: number; name: string; angle: string; category: string; hook: string; composition: string; objects?: string; skeleton?: string
  characters: { who: string; placement: string; expression: string; pose: string; outfit: string; gaze?: string }[]
  scene: string; elements: string[]; colors: string[]; text: { mode: string; headline: string; sub: string; placement: string; style: string; style_id?: string; font_hint?: string; look?: string; container?: string; integration?: string }; text_reason: string; image_brief: string
}
export function sanitizeThumbConcepts(raw: unknown, want: number, form: ThumbForm): { analysis: string; concepts: ThumbConcept[] } {
  const r = rec(raw);
  const list = (Array.isArray(r.concepts) ? r.concepts : []) as Record<string, unknown>[];
  const concepts = list.map((c, i): ThumbConcept => {
    const t = rec(c.text);
    let mode = String(t.mode) === "short" ? "short" : "none", headline = clip(t.headline, 80);
    if (form.text_mode === "none") { mode = "none"; headline = ""; }
    if (form.text_mode === "custom" && form.text_custom) { mode = "short"; headline = clip(form.text_custom, 80); }
    if (mode === "none") headline = "";
    return {
      name: clip(c.name, 60) || `Ideia ${i + 1}`, angle: clip(c.angle, 40), category: cats([c.category], 1)[0] ?? form.categories[0] ?? "", hook: clip(c.hook, 300), composition: clip(c.composition, 500),
      characters: (Array.isArray(c.characters) ? c.characters : []).map((x) => { const y = rec(x); return { who: clip(y.who, 60), placement: clip(y.placement, 160), expression: clip(y.expression, 120), gaze: clip(y.gaze, 100), pose: clip(y.pose, 160), outfit: clip(y.outfit, 120) }; }).slice(0, 5),
      scene: clip(c.scene, 400), elements: arr(c.elements, 8, 140), colors: (Array.isArray(c.colors) ? c.colors : []).map(hex).filter(Boolean).slice(0, 4) as string[],
      objects: clip(c.objects, 400), skeleton: clip(c.skeleton, 140),
      text: { mode, headline, sub: mode === "none" ? "" : clip(t.sub, 80), placement: clip(t.placement, 160), style: clip(t.style, 200), style_id: LET_IDS.includes(clip(t.style_id, 30)) ? clip(t.style_id, 30) : "", font_hint: clip(t.font_hint, 60), look: clip(t.look, 220), container: clip(t.container, 40), integration: clip(t.integration, 50) }, text_reason: clip(c.text_reason, 240), image_brief: clip(c.image_brief, 1800),
    };
  }).filter((c) => c.image_brief || c.composition).slice(0, want).map((c, i) => applyDirection(c, form, i));
  return { analysis: clip(r.analysis, 500), concepts };
}

/** Garante que o que o usuário definiu vale em TODAS as ideias, mesmo que a IA tenha esquecido (o resto continua sendo decisão dela) */
export function applyDirection(c: ThumbConcept, form: ThumbForm, i = 0): ThumbConcept {
  const d = form.dir ?? emptyDirection(), t = { ...c.text }, out = { ...c, text: t };
  // guia do nicho: nichos "sem texto" não levam texto (a menos que o usuário peça/configure) e todo texto sem fonte ganha uma fonte do nicho
  const guide = THUMB_TYPE_GUIDE[c.category];
  const textSet = d.text_depth !== "auto" || d.text_area !== "auto" || !!d.text_font || !!d.text_color || !!d.lettering;
  if (guide?.text === "none" && form.text_mode === "auto" && !textSet && t.style_id !== "ambient_painted" && t.integration !== "dentro da cena") { t.mode = "none"; t.headline = ""; t.sub = ""; }
  if (t.mode === "short" && !d.text_font && guide?.fonts.length && !t.font_hint) { const f = guide.fonts[i % guide.fonts.length]; t.font_hint = `${f.name} ${f.weights}`; }
  if (t.mode === "short") {
    if (d.text_font) { t.font_hint = d.text_font; t.style = `${t.style ? t.style + "; " : ""}fonte escolhida pelo usuário: ${d.text_font}`; }
    if (d.lettering) t.style_id = d.lettering;
    if (d.text_depth !== "auto") t.integration = d.text_depth === "behind" ? "atrás do sujeito" : "na frente do sujeito, sobre a imagem";
    if (d.text_area !== "auto" || d.text_depth !== "auto") t.placement = [d.text_area !== "auto" ? TEXT_AREA_LABEL[d.text_area] : "", d.text_depth !== "auto" ? TEXT_DEPTH_LABEL[d.text_depth] : "", d.text_area === "auto" || d.text_depth === "auto" ? t.placement : ""].filter(Boolean).join("; ");
    if (d.text_color) t.look = `${t.look ? t.look + "; " : ""}cor do texto ${d.text_color}`;
  }
  out.characters = c.characters.map((x) => {
    const cfg = form.cast.find((k) => k.label.toLowerCase() === x.who.toLowerCase());
    if (!cfg) return x;
    const y = { ...x };
    if (cfg.expression && cfg.expression !== "auto") y.expression = EXPRESSION_LABEL[cfg.expression];
    if (cfg.gaze && cfg.gaze !== "auto") y.gaze = GAZE_LABEL[cfg.gaze];
    if (cfg.position && cfg.position !== "auto") y.placement = `${POSITION_LABEL[cfg.position]}${y.placement ? `; ${y.placement}` : ""}`;
    return y;
  });
  if (d.background !== "auto") out.scene = `Fundo definido pelo usuário: ${BACKGROUND_LABEL[d.background]}. ${c.scene}`.slice(0, 400);
  if (d.dominant_color) out.colors = [d.dominant_color, ...c.colors.filter((x) => x !== d.dominant_color)].slice(0, 4);
  if (d.skeleton) out.skeleton = `${SKELETON_LABEL[d.skeleton]} (definido pelo usuário)`;
  return out;
}

// =================================================================================================
// IMAGEM
// =================================================================================================
export interface ThumbAttach { role: "cast" | "style" | "inspiration" | "competitor" | "own" | "parent"; label?: string | null; description?: string | null; castRole?: string }
export function thumbAttachmentsBlock(list: ThumbAttach[]): string {
  if (!list.length) return "";
  const lines: string[] = [];
  let i = 0;
  while (i < list.length) {
    const a = list[i], n = i + 1;
    if (a.role === "style") {
      let j = i; while (j + 1 < list.length && list[j + 1].role === "style") j++;
      lines.push(`- ${j > i ? `Imagens ${n}–${j + 1}` : `Imagem ${n}`} — THUMBNAILS DE REFERÊNCIA DE ESTILO (de outros vídeos): absorva composição, saturação, tratamento de luz, enquadramento do rosto, tipo de fundo, efeitos e uso de texto. NUNCA copie as pessoas, os rostos, os textos, as marcas nem os cenários delas.`);
      i = j + 1; continue;
    }
    if (a.role === "cast") lines.push(`- Imagem ${n} — PESSOA "${a.label || "pessoa"}" (${a.castRole === "story" ? "personagem da história" : a.castRole === "support" ? "coadjuvante" : "dono do canal"}): é a referência EXATA do rosto. Sempre que ela aparecer, use ESTA MESMA pessoa (rosto, formato do crânio, cabelo, tom de pele, idade, barba, traços marcantes). Pode mudar expressão, pose, ângulo, luz e roupa, mas NUNCA o rosto.${a.description ? ` Descrição: ${a.description}` : ""}`);
    else if (a.role === "parent") lines.push(`- Imagem ${n} — a THUMBNAIL ATUAL: base do ajuste.`);
    else if (a.role === "competitor") lines.push(`- Imagem ${n} — thumbnail de OUTRO canal: só referência de estrutura; faça DIFERENTE e não copie nada dela.`);
    else if (a.role === "own") lines.push(`- Imagem ${n} — thumbnail anterior do usuário que não ficou como ele queria: resolva o que a enfraquece.`);
    else lines.push(`- Imagem ${n} — INSPIRAÇÃO: pegue a sensação e a energia, não o conteúdo.`);
    i++;
  }
  return `## IMAGENS ANEXAS (nesta ordem)\n${lines.join("\n")}`;
}

export const THUMB_RULES = `## REGRAS DA THUMBNAIL (inegociáveis)
- Formato 16:9 horizontal (1280×720). Assunto principal fora do canto inferior direito e com ~3% de margem das bordas. Deve ser entendida a 168 px de largura: um foco dominante (o rosto com 35–60% da altura), o resto menor, mais escuro ou mais desfocado e posicionado para apontar para ele.
- FOTOGRAFIA REAL, não render: câmera 50–85 mm, nitidez nos olhos, grão sutil, pele com poros e assimetrias naturais (nada de pele de plástico/porcelana, olhos sem reflexo ou dentes perfeitos demais), roupas com dobras, cenário com profundidade e pequenas imperfeições. Grading de cinema com UMA cor dominante controlada; sem neon espalhado e sem glow sem fonte de luz.
- LUZ COM LÓGICA: uma fonte principal plausível (softbox lateral, janela, luz do cenário, brilho de tela) e contraluz leve; sombras coerentes entre pessoa e objetos.
- OBJETOS COM LÓGICA: cada objeto tem motivo ligado ao vídeo e interage fisicamente (mão que segura com os dedos contornando, objeto apoiado com sombra de contato, algo que entra pelo quadro). Escala e perspectiva reais; no máximo 1 objeto-herói + 1 de apoio. Mãos com 5 dedos, em escala natural; gesto de apontar relaxado, nunca um dedo gigante. Nada de cartões de interface flutuando no ar nem setas néon enormes.
- TEXTO: SOMENTE o indicado, UMA vez, com ortografia EXATA. Nenhuma palavra, número ou rótulo a mais (telas, painéis e objetos mostram formas e gráficos plausíveis sem palavras legíveis). O lettering segue o estilo pedido, com personalidade, textura e integração à cena, e é ancorado ao rosto (alinhado aos olhos, ao queixo ou à borda da cabeça). Se não houver texto indicado, não escreva nada. Nenhuma marca, logo ou placa com palavras inventadas.
- Cores limpas, uma dominante + um acento, sem cinza lavado nem saturação digital uniforme. Corte elementos pelas bordas como numa foto real; evite tudo centralizado e inteiro.`;

export function buildThumbPrompt(o: { form: ThumbForm; concept: ThumbConcept; index: number; total: number; attach: ThumbAttach[]; learned?: string }): string {
  const c = o.concept;
  const lt = c.text.style_id ? lettering(c.text.style_id) : null;
  const text = c.text.mode === "short" && c.text.headline
    ? `TEXTO EXATO (o ÚNICO texto da imagem): "${c.text.headline}"${c.text.sub ? ` e, bem menor, "${c.text.sub}"` : ""}. Ortografia idêntica, em ${o.form.lang || "português do Brasil"}. Posição: ${c.text.placement || "ancorado ao rosto"}.
  LETTERING (personalidade própria, NÃO a fonte padrão itálica extra-pesada de IA): ${[lt ? `estilo "${lt.label}" — ${lt.look}` : "", c.text.look && `aparência: ${c.text.look}`, (c.text.font_hint || lt?.fonts[0]) && (o.form.dir?.text_font ? `use EXATAMENTE a tipografia "${o.form.dir.text_font}" (letras com a anatomia real dessa fonte)` : `fonte parecida com ${c.text.font_hint || lt?.fonts[0]}`), c.text.container && c.text.container !== "none" && `contêiner: ${c.text.container}`, c.text.integration && `integração: ${c.text.integration}`, c.text.style].filter(Boolean).join("; ")}. Letras sem brilho plástico: se houver contorno ou sombra, são discretos e coerentes com a luz da cena.`
    : "SEM TEXTO: não escreva nenhuma palavra, letra ou número na imagem.";
  const chars = c.characters.filter((x) => x.who && !/sem pessoa/i.test(x.who)).map((x) => `- ${x.who}: ${[x.placement, x.expression && `expressão: ${x.expression}`, x.gaze && `olhar: ${x.gaze}`, x.pose && `pose: ${x.pose}`, x.outfit && `roupa: ${x.outfit}`].filter(Boolean).join("; ")}`).join("\n");
  return `# TAREFA
Você é um diretor de arte de thumbnails virais do YouTube. Crie UMA thumbnail 16:9 (conceito ${o.index} de ${o.total}) para o vídeo abaixo.

## O VÍDEO
${o.form.title ? `Título: "${o.form.title}"\n` : ""}${o.form.brief ? `Resumo: ${o.form.brief.slice(0, 900)}` : ""}

## CONCEITO: "${c.name}"${c.category ? ` · categoria ${categoryById(c.category)?.label ?? c.category}` : ""}
- Por que clica: ${c.hook}
- Composição: ${c.composition}
${chars ? `- Pessoas:\n${chars}\n` : "- Pessoas: nenhuma (conceito sem rosto)\n"}- Cenário e luz: ${c.scene}
${c.elements.length ? `- Elementos: ${c.elements.join("; ")}\n` : ""}- Cores: ${c.colors.join(", ") || "saturadas, uma dominante e um acento"}
- ${text}
${c.objects ? `- Lógica dos objetos: ${c.objects}\n` : ""}${c.skeleton ? `- Esqueleto de composição: ${c.skeleton}\n` : ""}- Direção detalhada: ${c.image_brief}
${directionBlock(o.form).startsWith("- DIREÇÃO DEFINIDA") ? `\n## ESCOLHAS DO USUÁRIO (prevalecem sobre qualquer outra instrução)\n${directionBlock(o.form).split("\n").slice(1).join("\n")}\n` : ""}

${THUMB_RULES}
${o.learned ? `\n## ESTILO APRENDIDO NO TREINAMENTO (siga)\n${o.learned}\n` : ""}${thumbAttachmentsBlock(o.attach) ? `\n${thumbAttachmentsBlock(o.attach)}\n` : ""}`.trim();
}

export function buildThumbRefinePrompt(o: { form: ThumbForm; feedback: string; attach: ThumbAttach[] }): string {
  return `# TAREFA: AJUSTAR UMA THUMBNAIL EXISTENTE
A imagem 1 é a thumbnail atual. Aplique SOMENTE a alteração pedida e mantenha TODO o resto igual: composição, rosto das pessoas (mesma pessoa, mesmos traços), cenário, cores e texto (exceto se a alteração fala deles).

## ALTERAÇÃO PEDIDA
${o.feedback}

${THUMB_RULES}
${thumbAttachmentsBlock(o.attach) ? `\n${thumbAttachmentsBlock(o.attach)}` : ""}`.trim();
}

/** Classificação rápida de thumbnails sem categoria (usada antes do treino) já vem na observação; este texto é só de apoio na tela */
export const DEFAULT_CAST_ROLE = "owner";


// =================================================================================================
// ESTATÍSTICAS (calculadas em código a partir das observações; entram no documento treinado)
// =================================================================================================
const top = (vals: string[], k = 3): [string, number][] => {
  const m = new Map<string, number>(); vals.map((v) => v.trim().toLowerCase()).filter((v) => v && v !== "none" && v !== "other" && v !== "-").forEach((v) => m.set(v, (m.get(v) ?? 0) + 1));
  const n = Math.max(1, vals.length);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([v, c]) => [v, Math.round((c / n) * 100)]);
};
export function computeThumbStats(items: { o: ThumbObs; tags: string[] }[]): Record<string, ThumbStats> {
  const groups: Record<string, ThumbObs[]> = { _todas: items.map((x) => x.o) };
  for (const x of items) for (const c of (x.tags.length ? x.tags : x.o.categories)) (groups[c] ??= []).push(x.o);
  const out: Record<string, ThumbStats> = {};
  for (const [k, list] of Object.entries(groups)) {
    const n = list.length, withP = list.filter((o) => o.persons > 0);
    out[k] = {
      n, text_pct: Math.round((list.filter((o) => o.has_text).length / n) * 100), no_person_pct: Math.round(((n - withP.length) / n) * 100),
      positions: top(withP.map((o) => o.person_position)), faces: top(withP.map((o) => o.face_size)), gaze: top(withP.map((o) => o.gaze)),
      fonts: top(list.filter((o) => o.has_text).map((o) => (o.lettering?.font_hint ?? "").split(/[ ,(]/)[0]), 4), weights: top(list.filter((o) => o.has_text).map((o) => o.lettering?.weight ?? ""), 3), highlights: top(list.filter((o) => o.has_text).map((o) => o.lettering?.highlight ?? ""), 3), arrow_pct: Math.round((list.filter((o) => o.lettering?.arrow).length / n) * 100),
      face_avg: Math.round(avg(withP.map((o) => o.face_height_pct))), text_avg: Math.round(avg(list.filter((o) => o.has_text).map((o) => o.text_height_pct))),
      expressions: top(withP.map((o) => o.expression_class || ""), 4), lettering: top(list.filter((o) => o.has_text).map((o) => o.lettering?.style_id ?? ""), 4),
      skeleton: top(list.map((o) => (o.skeleton ?? "").split(" ")[0]), 3), realism: top(list.map((o) => o.realism ?? ""), 2), saturation: top(list.map((o) => o.saturation), 3),
      behind_pct: Math.round((list.filter((o) => o.has_text && (o.text_behind || /atr[aá]s/i.test(o.lettering?.integration ?? ""))).length / n) * 100),
    };
  }
  return out;
}
const avg = (a: number[]) => { const v = a.filter((x) => x > 0); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0; };
const fmt = (a: [string, number][]) => a.map(([v, p]) => `${v} ${p}%`).join(", ");
export function statsLines(st?: Record<string, ThumbStats>): string {
  if (!st) return "";
  return `## ESTATÍSTICAS DAS SUAS THUMBNAILS (contadas pela IA de visão; use como probabilidade, não como regra fixa)\n${Object.entries(st).map(([k, v]) => `- ${k === "_todas" ? "TODAS" : categoryById(k)?.label ?? k} (${v.n}): com texto ${v.text_pct}%, sem pessoa ${v.no_person_pct}%, texto atrás do sujeito ${v.behind_pct}%; altura média do rosto ${v.face_avg || "—"}% da imagem; altura média da palavra principal ${v.text_avg || "—"}% da imagem; posição da pessoa: ${fmt(v.positions) || "—"}; rosto: ${fmt(v.faces) || "—"}; olhar: ${fmt(v.gaze) || "—"}; expressões: ${fmt(v.expressions) || "—"}; lettering: ${fmt(v.lettering) || "—"}; fontes: ${fmt(v.fonts) || "—"}; pesos: ${fmt(v.weights) || "—"}; destaque: ${fmt(v.highlights) || "—"}; com seta ${v.arrow_pct}%; esqueleto: ${fmt(v.skeleton) || "—"}; realismo: ${fmt(v.realism) || "—"}; saturação: ${fmt(v.saturation) || "—"}`).join("\n")}\n`;
}
