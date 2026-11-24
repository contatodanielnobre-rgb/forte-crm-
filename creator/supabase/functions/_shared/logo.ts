// Criador de logos + branding da Forte Company.
// Skills (instruções longas), prompts, leitura das respostas da IA e cenas de mockup.
// Usado pela Edge Function studio-generate (Deno) E pelo servidor de demonstração (Node): o mesmo texto vai para o modelo nos dois lugares.
// Sem imports e sem recursos exclusivos do Deno.

import { BRANDING_SKILL, LOGO_SKILL } from "./logo-skill.ts";
export { BRANDING_SKILL, LOGO_SKILL };

export const clip = (s: unknown, n: number) => String(s ?? "").trim().slice(0, n);
const hexOk = (s: unknown) => /^#[0-9a-f]{6}$/i.test(String(s ?? "").trim());
export const normHex = (s: unknown) => (hexOk(s) ? String(s).trim().toUpperCase() : null);

// =================================================================================================
// TREINAMENTO: análise de referências de logos (IA de visão) → documento do estilo
// =================================================================================================
export const LOGO_TRAIN_SYSTEM = `Você é diretor de criação de identidade visual. Analisa um conjunto de logos de referência que a agência admira e descreve, com precisão técnica, o QUE as torna boas e como reproduzir o NÍVEL de acabamento sem copiar nenhuma delas. Responda SEMPRE em JSON válido, em português do Brasil, sem comentários.`;

export const LOGO_TRAIN_PROMPT = `Analise as logos anexas (são referências de estilo e de qualidade). Devolva um JSON exatamente neste formato:
{
  "summary": "2 a 3 frases sobre o gosto do conjunto (o que ele valoriza)",
  "types": ["tipos de logo predominantes: logotipo, monograma, símbolo+nome, emblema, abstrato…"],
  "symbol_language": "como os símbolos são construídos (formas, geometria, espaço negativo, nível de detalhe)",
  "typography": "estilo das letras (classificação, peso, caixa, espaçamento, customizações marcantes)",
  "composition": "como símbolo, nome e slogan se organizam (alinhamento, proporção, respiro)",
  "color_usage": "como a cor é usada (quantidade, contraste, chapada ou degradê, fundo)",
  "craft": "detalhes de acabamento que mostram qualidade (kerning, peso de traço, raio de cantos, alinhamentos óticos)",
  "traits": ["5 a 8 traços recorrentes que definem o estilo"],
  "do": ["5 a 8 coisas que as novas logos devem fazer"],
  "dont": ["5 a 8 coisas que devem evitar para não perder esse nível"],
  "quality_bar": "uma frase descrevendo o padrão que a logo nova precisa atingir"
}
Não descreva marcas por nome; descreva o design. Não invente o que não dá para ver.`;

export interface LogoAnalysis {
  summary?: string; types?: string[]; symbol_language?: string; typography?: string; composition?: string; color_usage?: string; craft?: string
  traits?: string[]; do?: string[]; dont?: string[]; quality_bar?: string
}
const arr = (v: unknown, n = 8, len = 220): string[] => (Array.isArray(v) ? v : []).map((x) => clip(x, len)).filter(Boolean).slice(0, n);
export function sanitizeLogoAnalysis(raw: unknown): LogoAnalysis {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    summary: clip(r.summary, 600), types: arr(r.types, 6, 60), symbol_language: clip(r.symbol_language, 600), typography: clip(r.typography, 600),
    composition: clip(r.composition, 600), color_usage: clip(r.color_usage, 500), craft: clip(r.craft, 600),
    traits: arr(r.traits), do: arr(r.do), dont: arr(r.dont), quality_bar: clip(r.quality_bar, 400),
  };
}

/** Documento de treinamento de logos (o que fica salvo na pasta e é lido nas próximas criações) */
export function compileLogoSkill(o: { name: string; isBase: boolean; analysis: LogoAnalysis | null; refs: number; version: number; extra?: string | null }): string {
  const a = o.analysis;
  const L = (t: string, v?: string | string[] | null) => (Array.isArray(v) ? (v.length ? `${t}\n${v.map((x) => `- ${x}`).join("\n")}\n` : "") : v ? `${t} ${v}\n` : "");
  const lines = [
    `# TREINAMENTO DE LOGOS — ${o.isBase ? "Agência (padrão para todas as empresas)" : o.name} · v${o.version}`,
    `Baseado em ${o.refs} logo(s) de referência${a ? " analisadas por IA de visão" : " (sem análise de IA: apenas o documento)"}.`,
    "",
    a ? L("**Gosto do conjunto:**", a.summary) : "",
    a ? L("**Tipos de logo recorrentes:**", a.types) : "",
    a ? L("**Linguagem dos símbolos:**", a.symbol_language) : "",
    a ? L("**Tipografia:**", a.typography) : "",
    a ? L("**Composição:**", a.composition) : "",
    a ? L("**Uso de cor:**", a.color_usage) : "",
    a ? L("**Acabamento:**", a.craft) : "",
    a ? L("**Traços que definem o estilo:**", a.traits) : "",
    a ? L("**Sempre:**", a.do) : "",
    a ? L("**Nunca:**", a.dont) : "",
    a ? L("**Padrão de qualidade:**", a.quality_bar) : "",
    o.extra ? `**Regras extras escritas pela equipe:**\n${o.extra}\n` : "",
  ].filter((l) => l !== "");
  return lines.join("\n");
}

// =================================================================================================
// ESTÚDIO: formulário → conceitos (texto) → imagem
// =================================================================================================
export interface LogoForm {
  company: string; segment: string; offer: string; audience?: string; city?: string
  approach: string[]            // ex.: ["minimalista"], ["criativa"], ["ideia"]
  kind: string                  // auto | wordmark | symbol_name | emblem | monogram | abstract | mascot
  colors: string[]              // hex; vazio = a IA escolhe
  mood: string[]; slogan?: string; avoid?: string; notes?: string; count?: number
}
export const APPROACHES: { id: string; label: string; hint: string }[] = [
  { id: "minimalista", label: "Minimalista", hint: "Poucas formas, muito respiro, só o essencial." },
  { id: "criativa", label: "Mais criativa", hint: "Ideia ousada, construção inesperada, personalidade forte." },
  { id: "ideia", label: "Focada na ideia da empresa", hint: "O símbolo conta exatamente o que o negócio faz ou promete." },
  { id: "tipografica", label: "Tipográfica", hint: "As letras são a marca: desenho, cortes e ligaduras." },
  { id: "classica", label: "Clássica / premium", hint: "Elegância atemporal, serifa, proporção e contenção." },
  { id: "moderna", label: "Moderna / tech", hint: "Geométrica, limpa, contemporânea." },
  { id: "amigavel", label: "Amigável / orgânica", hint: "Formas arredondadas, calor humano, proximidade." },
  { id: "forte", label: "Forte / robusta", hint: "Peso, solidez, autoridade e impacto." },
];
export const LOGO_KINDS: { id: string; label: string; hint: string }[] = [
  { id: "auto", label: "A IA escolhe", hint: "O melhor tipo para esta empresa." },
  { id: "symbol_name", label: "Símbolo + nome", hint: "O mais versátil: o símbolo funciona sozinho." },
  { id: "wordmark", label: "Só o nome (logotipo)", hint: "Letras desenhadas e personalizadas." },
  { id: "monogram", label: "Monograma", hint: "Iniciais construídas como uma forma." },
  { id: "emblem", label: "Emblema / selo", hint: "Texto e símbolo dentro de uma forma fechada." },
  { id: "abstract", label: "Abstrata", hint: "Forma geométrica com conceito." },
  { id: "mascot", label: "Mascote / ilustrada", hint: "Personagem simples e vetorial." },
];
export const MOOD_CHIPS = ["Confiável", "Premium", "Acolhedora", "Jovem", "Técnica", "Divertida", "Elegante", "Robusta", "Natural", "Ousada", "Silenciosa", "Artesanal", "Rápida", "Cuidadosa"];

const kindLabel = (id: string) => LOGO_KINDS.find((k) => k.id === id)?.label ?? id;
const apprLabel = (id: string) => APPROACHES.find((k) => k.id === id)?.label ?? id;

export function sanitizeForm(raw: unknown): LogoForm {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const list = (v: unknown, n: number, len: number) => (Array.isArray(v) ? v : []).map((x) => clip(x, len)).filter(Boolean).slice(0, n);
  return {
    company: clip(r.company, 80), segment: clip(r.segment, 120), offer: clip(r.offer, 700), audience: clip(r.audience, 300), city: clip(r.city, 80),
    approach: list(r.approach, 4, 30), kind: clip(r.kind, 20) || "auto", colors: (Array.isArray(r.colors) ? r.colors : []).map(normHex).filter(Boolean).slice(0, 5) as string[],
    mood: list(r.mood, 6, 30), slogan: clip(r.slogan, 90), avoid: clip(r.avoid, 400), notes: clip(r.notes, 900), count: Math.max(1, Math.min(6, Number(r.count) || 4)),
  };
}

export function formBlock(f: LogoForm): string {
  return [
    `- Nome da empresa (grafia EXATA): "${f.company}"`,
    `- Segmento: ${f.segment || "não informado"}`,
    f.offer ? `- O que vende / faz: ${f.offer}` : "",
    f.audience ? `- Público: ${f.audience}` : "",
    f.city ? `- Local/mercado: ${f.city}` : "",
    `- Direção desejada: ${f.approach.length ? f.approach.map(apprLabel).join(" + ") : "livre (decida pelo negócio)"}`,
    `- Tipo de logo: ${kindLabel(f.kind)}`,
    f.colors.length ? `- Cores indicadas pelo cliente (use estas): ${f.colors.join(", ")}` : "- Cores: o cliente não indicou; escolha de 1 a 3 pela personalidade e pelo segmento (e informe os códigos HEX)",
    f.mood.length ? `- Sensação / personalidade: ${f.mood.join(", ")}` : "",
    f.slogan ? `- Slogan (grafia EXATA): "${f.slogan}"` : "- Slogan: nenhum (não escreva slogan)",
    f.avoid ? `- Evitar: ${f.avoid}` : "",
    f.notes ? `- Observações do cliente: ${f.notes}` : "",
  ].filter(Boolean).join("\n");
}

export interface IdeateInput {
  form: LogoForm; baseDoc?: string | null; brandDoc?: string | null; extra?: string | null
  inputs: { role: string; note?: string | null }[]; refine?: { previous: unknown; feedback: string } | null; count: number; usedConcepts?: string[]
}
export function logoIdeateSystem(o: { baseDoc?: string | null; brandDoc?: string | null; extra?: string | null; count: number }): string {
  return `${LOGO_SKILL}

${o.baseDoc ? `# TREINAMENTO DE LOGOS DA AGÊNCIA\n${o.baseDoc}\n` : ""}${o.brandDoc ? `# TREINAMENTO DE LOGOS DESTA EMPRESA\n${o.brandDoc}\n` : ""}${o.extra ? `# REGRAS EXTRAS DA AGÊNCIA\n${o.extra}\n` : ""}
# SUA TAREFA AGORA
Aplique o processo (seção 1) ao briefing do usuário e entregue ${o.count} CONCEITO(S) de logo, cada um de um território diferente. Para cada conceito escreva a grande ideia, o símbolo (se houver), a tipografia, a composição, as cores e um "image_brief": instruções visuais concretas para o gerador de imagens (formas, proporções, construção, desenho das letras), obedecendo às regras da seção 7 (sem cara de IA) e da seção 11 (entrega em fundo branco, cores chapadas).
REFERÊNCIAS VISUAIS: você está VENDO logos reais do treino do usuário, numeradas (REF n). Para cada conceito escolha de 1 a 3 REFs e diga em "refs" o que emular de cada uma (nível de acabamento, construção, peso do traço, equilíbrio entre símbolo e nome, espaçamento), variando as escolhas entre os conceitos. NUNCA copie as formas, letras ou símbolos delas: copie o nível e o rigor.
Responda SOMENTE em JSON válido, em português do Brasil, neste formato:
{
  "positioning": "1 a 2 frases: posicionamento e personalidade da marca (3 adjetivos concretos + arquétipo)",
  "cliches": ["clichês do segmento que você decidiu evitar"],
  "concepts": [
    { "name": "nome curto do conceito", "territory": "literal-inteligente | abstrato-geométrico | tipográfico | emblema | monograma | ...",
      "big_idea": "UMA frase: o símbolo/forma é X e comunica Y porque Z",
      "symbol": "descrição objetiva da forma (ou 'sem símbolo')",
      "typography": "como o nome é desenhado (estilo, peso, caixa, detalhe personalizado)",
      "layout": "empilhada | horizontal | só nome | emblema | monograma",
      "colors": ["#RRGGBB", "..."],
      "color_logic": "função de cada cor",
      "refs": [ { "ref": 2, "take": "o que emular desta REF: acabamento | construção do símbolo | peso do traço | equilíbrio símbolo/nome | tipografia | espaçamento" } ],
      "image_brief": "parágrafo com instruções visuais precisas para desenhar esta logo" }
  ]
}`;
}

export function logoIdeateUser(o: IdeateInput): string {
  const lines = [`# BRIEFING\n${formBlock(o.form)}`];
  const roleTxt: Record<string, string> = { competitor: "Logo de CONCORRENTE (diferencie-se dela)", attempt: "Tentativa anterior que NÃO ficou como o cliente queria (corrija o que incomoda)", inspiration: "Inspiração (absorva a sensação, não o desenho)" };
  if (o.inputs.length) lines.push(`# IMAGENS ANEXAS PELO USUÁRIO\n${o.inputs.map((i, n) => `${n + 1}. ${roleTxt[i.role] ?? i.role}${i.note ? ` — nota: ${i.note}` : ""}`).join("\n")}\nAs imagens seguem anexadas nesta ordem.`);
  if (o.usedConcepts?.length) lines.push(`# JÁ EXISTEM ESTES CONCEITOS (não repita nenhum)\n${o.usedConcepts.map((c) => `- ${c}`).join("\n")}`);
  if (o.refine) lines.push(`# AJUSTE PEDIDO\nConceito anterior: ${JSON.stringify(o.refine.previous).slice(0, 1800)}\nO usuário pediu: ${o.refine.feedback}\nDevolva ${o.count} conceito(s) que resolvam isso, mantendo o que não foi criticado.`);
  return lines.join("\n\n");
}

export interface Concept { name: string; territory: string; big_idea: string; symbol: string; typography: string; layout: string; colors: string[]; color_logic: string; image_brief: string; refs?: { n: number; id?: string; take: string }[] }
export function sanitizeConcepts(raw: unknown, want: number, form: LogoForm, maxRef = 0): { positioning: string; cliches: string[]; concepts: Concept[] } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const list = (Array.isArray(r.concepts) ? r.concepts : []) as Record<string, unknown>[];
  const concepts = list.map((c, i): Concept => ({
    name: clip(c.name, 60) || `Conceito ${i + 1}`, territory: clip(c.territory, 60), big_idea: clip(c.big_idea, 400), symbol: clip(c.symbol, 500),
    typography: clip(c.typography, 400), layout: clip(c.layout, 40), colors: (Array.isArray(c.colors) ? c.colors : []).map(normHex).filter(Boolean).slice(0, 4) as string[],
    color_logic: clip(c.color_logic, 300), image_brief: clip(c.image_brief, 1400),
    refs: (Array.isArray(c.refs) ? c.refs : []).map((x) => { const y = (x && typeof x === "object" ? x : {}) as Record<string, unknown>; return { n: Number(y.ref ?? y.n) || 0, take: clip(y.take, 160) }; }).filter((x) => x.n > 0 && (maxRef === 0 || x.n <= maxRef)).slice(0, 3),
  })).filter((c) => c.big_idea || c.image_brief).slice(0, want);
  // cores do cliente prevalecem sobre qualquer sugestão da IA
  if (form.colors.length) concepts.forEach((c) => { c.colors = form.colors.slice(0, 4); });
  return { positioning: clip(r.positioning, 500), cliches: arr(r.cliches, 8, 120), concepts };
}

export interface LogoAttach { role: "style" | "competitor" | "attempt" | "inspiration" | "parent"; note?: string | null }
export function logoAttachmentsBlock(list: LogoAttach[]): string {
  if (!list.length) return "";
  const t: Record<string, string> = {
    style: "LOGO REAL DO TREINO da agência: absorva o nível de acabamento, o rigor e o gosto (construção, peso do traço, equilíbrio, espaçamento); NÃO copie formas, letras nem símbolos",
    competitor: "LOGO DE CONCORRENTE: estude e FAÇA DIFERENTE; a nova logo não pode ser confundida com ela",
    attempt: "TENTATIVA ANTERIOR que o cliente não aprovou: resolva o que a incomoda, não apenas varie",
    inspiration: "INSPIRAÇÃO do cliente: aproveite a sensação (ritmo, geometria, contraste), não o desenho",
    parent: "LOGO ATUAL: é a base do ajuste",
  };
  return `## IMAGENS ANEXAS (nesta ordem)\n${list.map((a, i) => `- Imagem ${i + 1}: ${t[a.role]}${a.note ? ` (${a.role === "style" ? "emular" : "nota"}: ${a.note})` : ""}`).join("\n")}`;
}

export const RENDER_RULES = `## REGRAS DE ENTREGA (inegociáveis)
- UMA logo apenas, centralizada, em fundo BRANCO PURO (#FFFFFF) chapado. Margem generosa: a logo ocupa cerca de 60% da largura da imagem.
- Arte vetorial plana: cores CHAPADAS (no máximo 3, além do branco), bordas nítidas e limpas, traço consistente. SEM degradê, sem sombra, sem brilho, sem 3D, sem textura, sem chanfro, sem reflexo, sem moldura, sem mockup, sem cenário, sem marca d'água.
- Texto: escreva SOMENTE o nome da empresa e o slogan informados, com a grafia EXATA (acentos e cedilha corretos). Nenhuma outra palavra, sigla, número, ano ou letra extra.
- Letras desenhadas com cuidado: kerning ótico, alinhamento, peso coerente com o símbolo. Nada de letras derretidas ou inventadas.
- A logo precisa funcionar em 16 px, em uma só cor e em fundo escuro: evite detalhes finos.`;

export const ANTI_AI = `## SEM CARA DE IA
Proibido: brilho/3D/cromado/vidro, degradês coloridos, orbes luminosos, símbolo cheio de detalhes finos, clichês do segmento (lâmpada com cérebro, engrenagens, globo, hexágono tech, folha genérica, swoosh sem motivo, escudo genérico, cruz com coração, coroa solta), composição de "banco de logos" (círculo + nome genérico sem relação), pseudo-palavras. Faça como um designer humano: UMA ideia clara, uma decisão de design marcante (corte, ângulo, espaço negativo, proporção incomum) e respiro.`;

export function buildLogoPrompt(o: { form: LogoForm; concept: Concept; index: number; total: number; analysis?: LogoAnalysis | null; skillSummary?: string | null; attach: LogoAttach[]; positioning?: string }): string {
  const a = o.analysis;
  const learned = a ? `## PADRÃO APRENDIDO NO TREINAMENTO (nível de qualidade que a logo deve atingir)\n${[a.quality_bar, a.craft, a.symbol_language && `Símbolos: ${a.symbol_language}`, a.typography && `Tipografia: ${a.typography}`, a.dont?.length ? `Evitar: ${a.dont.join("; ")}` : ""].filter(Boolean).join("\n")}` : "";
  return `# TAREFA
Você é um designer de logos profissional. Desenhe UMA logo para a empresa abaixo, seguindo o conceito ${o.index} de ${o.total}.

## A EMPRESA
${formBlock(o.form)}
${o.positioning ? `\nPosicionamento: ${o.positioning}` : ""}

## CONCEITO A DESENHAR: "${o.concept.name}"
- Grande ideia: ${o.concept.big_idea}
- Símbolo: ${o.concept.symbol || "conforme a ideia"}
- Tipografia do nome: ${o.concept.typography}
- Composição: ${o.concept.layout || "a que melhor funcionar"}
- Cores: ${(o.concept.colors.length ? o.concept.colors : o.form.colors).join(", ") || "1 a 3 cores coerentes com a personalidade"}${o.concept.color_logic ? ` (${o.concept.color_logic})` : ""}
- Instruções visuais: ${o.concept.image_brief}

${RENDER_RULES}

${ANTI_AI}
${learned ? `\n${learned}\n` : ""}${logoAttachmentsBlock(o.attach) ? `\n${logoAttachmentsBlock(o.attach)}\n` : ""}${o.skillSummary ? `\n${o.skillSummary}\n` : ""}`.trim();
}

export function buildLogoRefinePrompt(o: { form: LogoForm; feedback: string; attach: LogoAttach[] }): string {
  return `# TAREFA: AJUSTAR UMA LOGO EXISTENTE
A imagem 1 é a logo atual da empresa "${o.form.company}". Aplique SOMENTE a alteração pedida abaixo e mantenha TODO o resto idêntico: desenho do símbolo, fonte e desenho das letras, proporções, espaçamentos, composição e cores (a menos que a alteração fale delas).

## ALTERAÇÃO PEDIDA
${o.feedback}

${RENDER_RULES}
- O nome continua escrito exatamente "${o.form.company}"${o.form.slogan ? ` e o slogan "${o.form.slogan}"` : ""}.
${logoAttachmentsBlock(o.attach) ? `\n${logoAttachmentsBlock(o.attach)}` : ""}`.trim();
}

// =================================================================================================
// Leitura da logo aprovada (IA de visão): descrição fiel + sugestão de fonte parecida
// =================================================================================================
export const LOGO_INSPECT_SYSTEM = `Você é especialista em tipografia e identidade visual. Descreve uma logo com fidelidade técnica para que outro designer consiga reproduzi-la sem alterá-la. Responda SEMPRE em JSON válido, em português do Brasil.`;
export const LOGO_INSPECT_PROMPT = `Analise a logo anexa e devolva JSON:
{
  "name_text": "o nome escrito na logo, exatamente como aparece",
  "slogan_text": "o slogan escrito (vazio se não houver)",
  "layout": "empilhada | horizontal | só nome | emblema | monograma",
  "has_symbol": true,
  "description": "2 a 3 frases descrevendo a logo com fidelidade (forma do símbolo, estilo das letras, cores)",
  "symbol_description": "descrição objetiva do símbolo (vazio se não houver)",
  "font": { "family": "a fonte do Google Fonts MAIS PARECIDA com as letras do nome", "alt": ["2 alternativas do Google Fonts"], "category": "sans | serif | display | script | mono", "weight": 400, "uppercase": true },
  "slogan_font": { "family": "fonte do Google Fonts mais parecida com o slogan (ou a mesma do nome)", "weight": 400 },
  "colors": [ { "hex": "#RRGGBB", "role": "principal | apoio | neutra" } ]
}
Use apenas fontes que existem no Google Fonts.`;
export interface LogoInspect { name_text: string; slogan_text: string; layout: string; has_symbol: boolean; description: string; symbol_description: string; font: { family: string; alt: string[]; category: string; weight: number; uppercase: boolean }; slogan_font: { family: string; weight: number }; colors: { hex: string; role: string }[] }
export function sanitizeInspect(raw: unknown): LogoInspect {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const f = (r.font ?? {}) as Record<string, any>, sf = (r.slogan_font ?? {}) as Record<string, any>;
  return {
    name_text: clip(r.name_text, 100), slogan_text: clip(r.slogan_text, 120), layout: clip(r.layout, 30), has_symbol: r.has_symbol !== false,
    description: clip(r.description, 600), symbol_description: clip(r.symbol_description, 400),
    font: { family: clip(f.family, 60) || "Montserrat", alt: arr(f.alt, 3, 60), category: clip(f.category, 20) || "sans", weight: [100, 200, 300, 400, 500, 600, 700, 800, 900].includes(Number(f.weight)) ? Number(f.weight) : 400, uppercase: !!f.uppercase },
    slogan_font: { family: clip(sf.family, 60) || clip(f.family, 60) || "Montserrat", weight: [300, 400, 500, 600, 700].includes(Number(sf.weight)) ? Number(sf.weight) : 400 },
    colors: (Array.isArray(r.colors) ? r.colors : []).map((c: any) => ({ hex: normHex(c?.hex) ?? "", role: clip(c?.role, 20) })).filter((c: { hex: string }) => c.hex).slice(0, 5),
  };
}

// =================================================================================================
// BRANDING: cenas, plano e prompt de mockup
// =================================================================================================
export interface Scene { key: string; title: string; scene: string; aspect: "1:1" | "4:5" | "16:9" | "9:16"; variant: "color" | "white" | "black" | "symbol"; category: string }

/** Ambiente e objetos típicos por segmento (usado para o plano de cenas quando não há IA, e como pista para a IA) */
export const NICHES: { match: RegExp; place: string; hero: string[]; props: string }[] = [
  { match: /carro|auto|veícul|veicul|moto|concession|oficina|mecân|mecan|lava.?jato|estético automotiv/i, place: "loja de carros / oficina", hero: ["chaveiro e documento de venda do veículo", "carro com adesivo na lateral", "camiseta com um carro ao fundo"], props: "carros, pátio, ferramentas, chaves, placas de pátio" },
  { match: /restaur|lanch|hambur|pizza|cafe|café|padaria|confeit|bar |cervej|açaí|acai|sorvet|doce|delivery|comida|gastr/i, place: "restaurante / alimentação", hero: ["cardápio", "embalagem de delivery e sacola", "avental e copo"], props: "balcão, mesas, pratos, embalagens, copos, avental" },
  { match: /cl[ií]nica|saúde|saude|médic|medic|odonto|dent|fisio|psic|nutri|estétic|estetic|hospital|laborat|vet/i, place: "clínica / consultório", hero: ["recepção com logo na parede", "jaleco", "receituário e papelaria"], props: "recepção, jaleco, receituário, sala de atendimento" },
  { match: /advoc|jur[ií]d|contab|consultor|escrit[óo]rio|seguro|financ|invest|imobili|corretor/i, place: "escritório", hero: ["porta com placa de acrílico", "papel timbrado e cartão", "pasta e envelope"], props: "sala de reunião, mesa de madeira, papelaria premium" },
  { match: /academia|fitness|crossfit|treino|esporte|pilates|yoga|personal/i, place: "academia / estúdio", hero: ["parede da academia", "camiseta e toalha", "garrafa e bolsa esportiva"], props: "equipamentos, piso emborrachado, toalha, garrafa" },
  { match: /moda|roupa|vestu|boutique|calçad|calcad|joia|joalh|acess[óo]r|bijut/i, place: "loja de moda", hero: ["sacola e caixa de presente", "etiqueta e tag", "vitrine e fachada"], props: "sacolas, etiquetas, embalagens, vitrine, cabides" },
  { match: /tecnolog|software|saas|app|sistema|startup|digital|ag[êe]ncia|marketing|dev/i, place: "empresa de tecnologia", hero: ["tela de site em notebook", "perfil de rede social no celular", "crachá e camiseta"], props: "notebook, celular, escritório moderno, crachá" },
  { match: /constru|engenh|arquitet|reforma|obra|material|marcenar|m[óo]veis|decora/i, place: "construção / arquitetura", hero: ["capacete e colete", "placa de obra", "caminhonete adesivada"], props: "obra, capacete, placa de obra, planta, caminhonete" },
  { match: /escola|curso|educa|faculdade|treinamento|mentoria|idioma/i, place: "escola / curso", hero: ["uniforme e mochila", "caderno e material impresso", "fachada da escola"], props: "sala de aula, caderno, mochila, certificado" },
  { match: /pet|animal|ração|racao|banho e tosa/i, place: "pet shop", hero: ["coleira e plaquinha", "sacola e ração", "fachada colorida"], props: "coleiras, potes, ração, banho e tosa" },
  { match: /beleza|sal[ãa]o|barbear|cabelo|manicure|spa|maquiag|cosm[ée]t/i, place: "salão / beleza", hero: ["espelho com logo", "capa de corte e toalha", "embalagem de produto"], props: "espelho, cadeira, toalhas, frascos de produto" },
];

const SCENE_LIBRARY: { key: string; title: string; category: string; aspect: Scene["aspect"]; variant: Scene["variant"]; tpl: string }[] = [
  { key: "fachada", title: "Fachada da loja", category: "externo", aspect: "16:9", variant: "color", tpl: "Fachada de {place} de dia, letreiro grande com a logo na parte superior e vitrine ao lado, calçada limpa, perspectiva de rua em ângulo levemente elevado, arquitetura coerente com o segmento, luz natural suave." },
  { key: "totem-noite", title: "Placa luminosa à noite", category: "externo", aspect: "4:5", variant: "white", tpl: "Totem/placa luminosa com a logo em LED iluminando a entrada de {place} ao entardecer, fundo escuro e levemente desfocado, brilho realista sem exagero." },
  { key: "parede-interna", title: "Parede interna", category: "interno", aspect: "16:9", variant: "white", tpl: "Interior de {place}: parede de fundo com a logo em relevo (acrílico/metal escovado/neon discreto) acima do balcão, iluminação indireta, profundidade de campo realista, {props} ao redor." },
  { key: "camiseta", title: "Camiseta / uniforme", category: "uniforme", aspect: "4:5", variant: "color", tpl: "Pessoa de costas ou de perfil usando camiseta/uniforme com a logo bordada ou estampada no peito, em ambiente de {place}, foco no tecido e no acabamento da logo, luz natural." },
  { key: "papelaria", title: "Cartão e papelaria", category: "papelaria", aspect: "4:5", variant: "color", tpl: "Composição vista de cima com cartões de visita, papel timbrado e envelope sobre uma mesa de {place}, a logo bem nítida em todos, cores da marca no fundo, sombras suaves de estúdio." },
  { key: "embalagem", title: "Sacola e embalagem", category: "objeto", aspect: "1:1", variant: "white", tpl: "Sacola de papel e embalagem do segmento ({hero0}) com a logo em destaque, sobre bancada limpa, estilo de fotografia de produto, cores da marca nos materiais." },
  { key: "cardapio", title: "Cardápio / material impresso", category: "papelaria", aspect: "4:5", variant: "color", tpl: "Material impresso principal de {place} ({hero1}) aberto sobre uma mesa, com a logo no cabeçalho e conteúdo genérico em português com hierarquia limpa, textura de papel real." },
  { key: "outdoor", title: "Outdoor", category: "midia", aspect: "16:9", variant: "color", tpl: "Outdoor em avenida movimentada com a logo grande e uma chamada curta e genérica, céu limpo, perspectiva realista, fotografia de rua." },
  { key: "banner", title: "Banner / roll-up", category: "midia", aspect: "9:16", variant: "color", tpl: "Roll-up e bandeira com a logo na recepção de um evento de {place}, ambiente corporativo, chão reflexivo discreto, luz de estúdio." },
  { key: "veiculo", title: "Veículo adesivado", category: "veiculo", aspect: "16:9", variant: "color", tpl: "Veículo utilitário/carro adesivado com a logo e as cores da marca, estacionado em frente a {place}, vista 3/4 frontal, luz de fim de tarde." },
  { key: "digital", title: "Site e redes sociais", category: "digital", aspect: "16:9", variant: "color", tpl: "Notebook e celular sobre uma mesa mostrando a página inicial do site e o perfil do Instagram de {place}, com a logo no topo e a paleta da marca, composição limpa de estúdio." },
  { key: "brindes", title: "Brindes", category: "objeto", aspect: "1:1", variant: "white", tpl: "Kit de brindes (caneca, caneta, ecobag, chaveiro) com a logo, organizados sobre superfície neutra, vista de cima, cores da marca." },
  { key: "copo", title: "Copo / garrafa", category: "objeto", aspect: "1:1", variant: "color", tpl: "Copo ou garrafa térmica com a logo estampada sobre bancada de {place}, fundo desfocado, luz lateral suave." },
  { key: "cracha", title: "Crachá e identificação", category: "uniforme", aspect: "4:5", variant: "color", tpl: "Crachá com cordão e cartão de identificação com a logo sobre mesa de escritório, foco raso." },
];

export function nicheOf(segment: string, offer = ""): (typeof NICHES)[number] | null {
  const t = `${segment} ${offer}`;
  return NICHES.find((n) => n.match.test(t)) ?? null;
}

/** Cenas padrão adaptadas ao segmento (plano de reserva e base de comparação) */
export function defaultScenes(segment: string, offer = "", count = 12): Scene[] {
  const n = nicheOf(segment, offer);
  const place = n?.place ?? (segment || "empresa");
  const fill = (s: string) => s.replaceAll("{place}", place).replaceAll("{props}", n?.props ?? "mobiliário e objetos do dia a dia do negócio").replaceAll("{hero0}", n?.hero[0] ?? "produto principal").replaceAll("{hero1}", n?.hero[1] ?? "material impresso");
  const lib = SCENE_LIBRARY.map((s): Scene => ({ key: s.key, title: s.title, scene: fill(s.tpl), aspect: s.aspect, variant: s.variant, category: s.category }));
  // cenas específicas do nicho entram na frente
  const heroes = (n?.hero ?? []).slice(0, 3).map((h, i): Scene => ({ key: `nicho-${i + 1}`, title: h.charAt(0).toUpperCase() + h.slice(1), scene: `Cena típica de ${place}: ${h}, com a logo aplicada de forma bem visível e realista, ambiente do segmento (${n?.props}), fotografia profissional de mockup, luz coerente.`, aspect: i % 2 ? "4:5" : "1:1", variant: "color", category: "objeto" }));
  return [...heroes, ...lib].slice(0, count);
}

export function brandingPlanSystem(o: { extra?: string | null; count: number }): string {
  return `${BRANDING_SKILL}
${o.extra ? `\n# REGRAS EXTRAS DA AGÊNCIA\n${o.extra}\n` : ""}
# SUA TAREFA AGORA
Planeje ${o.count} cenas de mockup para a logo aprovada abaixo, adaptadas ao SEGMENTO e ao NEGÓCIO dele (seção 1, regra 3), com variedade (seção 1, regra 5). Responda SOMENTE em JSON válido:
{ "intro": "1 frase sobre o conceito do material de branding", "scenes": [ { "key": "slug-curto", "title": "título curto", "scene": "descrição visual detalhada em português", "aspect": "1:1|4:5|16:9|9:16", "variant": "color|white|black|symbol", "category": "externo|interno|objeto|uniforme|papelaria|digital|veiculo|midia" } ] }`;
}
export function brandingPlanUser(o: { form: LogoForm; inspect?: LogoInspect | null; palette: string[]; count: number }): string {
  const n = nicheOf(o.form.segment, o.form.offer);
  return `# EMPRESA\n${formBlock(o.form)}\n\n# LOGO APROVADA\n${o.inspect ? `${o.inspect.description}\nLayout: ${o.inspect.layout}. Símbolo: ${o.inspect.symbol_description || "sem símbolo"}.` : "(sem descrição)"}\nPaleta da marca: ${o.palette.join(", ") || "não definida"}\n\n# PISTAS DO SEGMENTO\n${n ? `Ambiente: ${n.place}. Objetos típicos: ${n.props}. Cenas fortes: ${n.hero.join("; ")}.` : "Sem pistas: deduza pelo segmento e pelo que a empresa vende."}\n\nPlaneje ${o.count} cenas.`;
}
export function sanitizeScenes(raw: unknown, count: number, fallback: Scene[]): { intro: string; scenes: Scene[] } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const aspects = ["1:1", "4:5", "16:9", "9:16"], variants = ["color", "white", "black", "symbol"];
  const seen = new Set<string>();
  const scenes = (Array.isArray(r.scenes) ? r.scenes : []).map((s: any, i): Scene => {
    let key = clip(s?.key, 40).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || `cena-${i + 1}`;
    while (seen.has(key)) key += "-b";
    seen.add(key);
    return { key, title: clip(s?.title, 60) || `Cena ${i + 1}`, scene: clip(s?.scene, 900), aspect: (aspects.includes(s?.aspect) ? s.aspect : "4:5") as Scene["aspect"], variant: (variants.includes(s?.variant) ? s.variant : "color") as Scene["variant"], category: clip(s?.category, 20) || "objeto" };
  }).filter((s) => s.scene.length > 20).slice(0, count);
  return { intro: clip(r.intro, 300), scenes: scenes.length >= 3 ? scenes : fallback.slice(0, count) };
}

export function buildMockupPrompt(o: { scene: Scene | { title: string; scene: string; aspect: string; variant: string }; company: string; segment: string; palette: string[]; logoDescription?: string | null; extra?: string | null; feedback?: string | null; hasBase?: boolean }): string {
  const variantTxt: Record<string, string> = { color: "a logo nas cores originais (como na imagem anexa)", white: "a logo em BRANCO (versão negativa), sobre superfície escura ou colorida", black: "a logo em PRETO (versão monocromática), sobre superfície clara", symbol: "apenas o SÍMBOLO da logo (sem o nome), como ícone" };
  return `# TAREFA: MOCKUP DE BRANDING
A imagem anexa é a logo APROVADA da empresa "${o.company}"${o.segment ? ` (${o.segment})` : ""}. Crie uma fotografia de apresentação de marca (mockup realista) aplicando essa logo na situação descrita.

## CENA: ${o.scene.title}
${o.scene.scene}

## REGRAS
- Use ${variantTxt[o.scene.variant] ?? variantTxt.color}.
- REPRODUZA A LOGO EXATAMENTE como na imagem anexa: mesmas letras, mesmo desenho do símbolo, mesmas proporções e espaçamentos. Não redesenhe, não complete, não estilize e não troque nenhuma letra. Só aplique perspectiva, escala e o relevo/material realista da superfície.
- A logo precisa estar nítida, inteira e legível.
- Não adicione outras marcas, logotipos conhecidos, slogans ou textos além do natural da peça (se precisar de texto, use português simples e correto e genérico).
- Aparência de foto profissional: luz coerente, materiais reais, profundidade de campo, sem cara de ilustração ou render plástico, sem distorções de mãos/rostos.
${o.palette.length ? `- Use a paleta da marca nos materiais e fundos, de forma harmônica: ${o.palette.join(", ")}.` : ""}
${o.logoDescription ? `- Sobre a logo: ${o.logoDescription}` : ""}
${o.extra ? `- Regras extras da agência: ${o.extra}` : ""}
${o.feedback ? `\n## AJUSTE PEDIDO PELO USUÁRIO\n${o.feedback}` : ""}`.trim();
}

/** Estima o custo da etapa de texto (em tokens aproximados) — usado só para exibir ordem de grandeza */
export const approxTokens = (s: string) => Math.ceil(s.length / 3.6);
