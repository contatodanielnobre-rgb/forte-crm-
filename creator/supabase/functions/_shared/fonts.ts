// LEITOR DE FONTES (skill): identifica, em cada imagem do treino, a fonte (Google Fonts) MAIS PARECIDA com as letras e resume por categoria.
// Como funciona: o navegador desenha o texto da imagem em dezenas de fontes candidatas numa folha numerada; a IA de visão compara a folha com
// a imagem e escolhe a mais parecida. Não precisa achar a fonte exata do Photoshop: basta uma muito parecida.
// Usado pela Edge Function studio-generate (Deno) e pelo navegador (folha de candidatas e telas).

export interface FontEntry { family: string; cls: string; weights: number[] }
export const FONT_CLASSES: Record<string, string> = {
  condensed: "Condensada alta (impacto)", sans: "Sem serifa (grotesca/geométrica)", display_heavy: "Display pesada (gordas e chamativas)", serif: "Serifada (contraste, elegante)",
  slab: "Serifa grossa (slab)", rounded: "Arredondada", script: "Manuscrita/script", stencil_grunge: "Stencil/militar/desgastada", tech: "Tecnológica/futurista", mono: "Monoespaçada",
};

const F = (cls: string, weights: number[], names: string[]): FontEntry[] => names.map((family) => ({ family, cls, weights }));
export const FONT_LIBRARY: FontEntry[] = [
  ...F("condensed", [400, 700], ["Anton", "Bebas Neue", "Oswald", "League Gothic", "Fjalla One", "Barlow Condensed", "Antonio", "Pathway Gothic One", "Big Shoulders Display", "Teko", "Saira Extra Condensed", "Archivo Narrow", "Roboto Condensed", "Staatliches", "Squada One", "Sofia Sans Extra Condensed"]),
  ...F("sans", [300, 400, 600, 800], ["Inter", "Montserrat", "Poppins", "Open Sans", "Roboto", "Lato", "Work Sans", "DM Sans", "Plus Jakarta Sans", "Manrope", "Sora", "Outfit", "Space Grotesk", "Syne", "Lexend", "Rubik", "Nunito Sans", "Source Sans 3", "IBM Plex Sans", "Public Sans", "Figtree", "Urbanist", "Be Vietnam Pro", "Archivo", "Raleway", "Mulish", "Albert Sans", "Epilogue", "Red Hat Display", "Barlow", "Kanit", "Prompt", "Hanken Grotesk", "Instrument Sans", "Onest", "Schibsted Grotesk"]),
  ...F("display_heavy", [400], ["Archivo Black", "Paytone One", "Titan One", "Lilita One", "Passion One", "Bowlby One", "Luckiest Guy", "Bangers", "Russo One", "Righteous", "Sigmar One", "Chango", "Rammetto One", "Dela Gothic One", "Rubik Mono One", "Black Han Sans"]),
  ...F("serif", [400, 700, 900], ["Playfair Display", "Cinzel", "Cormorant Garamond", "DM Serif Display", "Libre Baskerville", "Bodoni Moda", "Abril Fatface", "Prata", "Marcellus", "Lora", "Merriweather", "EB Garamond", "Fraunces", "Gloock", "Rufina", "Old Standard TT", "Instrument Serif", "Young Serif", "Cinzel Decorative", "Spectral", "Libre Caslon Text", "Noto Serif Display", "Cormorant", "Trirong"]),
  ...F("slab", [400, 700, 900], ["Alfa Slab One", "Roboto Slab", "Arvo", "Zilla Slab", "Rokkitt", "Bitter", "Bevan", "Ultra", "Josefin Slab", "Crete Round"]),
  ...F("rounded", [400, 700, 800], ["Fredoka", "Baloo 2", "Nunito", "Quicksand", "Varela Round", "Comfortaa", "M PLUS Rounded 1c"]),
  ...F("script", [400], ["Pacifico", "Lobster", "Permanent Marker", "Caveat", "Dancing Script", "Kaushan Script", "Rock Salt", "Patrick Hand", "Shadows Into Light", "Sacramento", "Yellowtail"]),
  ...F("stencil_grunge", [400], ["Black Ops One", "Stardos Stencil", "Saira Stencil One", "Special Elite", "Rubik Distressed", "Metal Mania", "Creepster", "Pirata One", "UnifrakturCook", "Rubik Dirt"]),
  ...F("tech", [400, 700], ["Orbitron", "Rajdhani", "Chakra Petch", "Exo 2", "Audiowide", "Michroma", "Oxanium", "Aldrich", "Syncopate", "Russo One"]),
  ...F("mono", [400, 700], ["Space Mono", "JetBrains Mono", "IBM Plex Mono", "Roboto Mono"]),
];
const byFamily = new Map(FONT_LIBRARY.map((f) => [f.family.toLowerCase(), f]));
export const fontEntry = (family: string) => byFamily.get(family.trim().toLowerCase());
const PREFERRED: Record<string, number[]> = { condensed: [400, 700], sans: [800, 700, 400], display_heavy: [400], serif: [900, 700, 400], slab: [700, 400], rounded: [800, 700], script: [400], stencil_grunge: [400], tech: [700, 400], mono: [700, 400] };
const WORD_W: Record<string, number> = { thin: 100, extralight: 200, light: 300, regular: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900, heavy: 900 };
export const weightOf = (w: unknown, dflt = 700): number => { const n = Number(w); if (Number.isFinite(n) && n >= 100 && n <= 900) return Math.round(n / 100) * 100; return WORD_W[String(w ?? "").toLowerCase().replace(/[\s_-]/g, "")] ?? dflt; };

/** Classe provável a partir do que a observação anterior disse (nome da fonte, estilo, descrição) */
export function guessClass(hint: string): string {
  const t = hint.toLowerCase();
  const e = fontEntry(t.split(/[,;(]/)[0].replace(/\b(thin|light|regular|medium|semibold|bold|extrabold|black|italic)\b/g, "").trim());
  if (e) return e.cls;
  if (/serif(?!a)|serifad|bodoni|didone|garamond|trajan|romana|clássic|classic/.test(t) && !/sans/.test(t)) return /slab|grossa/.test(t) ? "slab" : "serif";
  if (/slab/.test(t)) return "slab";
  if (/condens|estreit|alta e fina|impact/.test(t)) return "condensed";
  if (/script|manuscri|cursiv|caligraf/.test(t)) return "script";
  if (/stencil|militar|desgast|grunge|carimbo/.test(t)) return "stencil_grunge";
  if (/redond|rounded|bubble/.test(t)) return "rounded";
  if (/tech|futur|digital|pixel/.test(t)) return "tech";
  if (/mono/.test(t)) return "mono";
  return "sans";
}

const GENERIC = /\b(sans|serif|condens\w*|italic|font|fonte|similar|parecid\w*|tipo|estilo|geom\w*|grotesc\w*|script|manuscrit\w*|pesad\w*|fin[ao]s?|alt[ao]s?)\b/i;
/** Nome de família plausível (não uma descrição como "sans-serif condensada") */
const SYSTEM_FONTS = /^(arial|helvetica|impact|verdana|tahoma|georgia|times|courier|trebuchet|calibri|cambria|segoe|comic|futura|gotham|proxima|din|avenir)/i; // fontes de sistema/pagas: não existem no Google Fonts
export const plausibleFamily = (f: string) => /^[A-Za-zÀ-ÿ0-9][A-Za-z0-9 ]{2,28}$/.test(f.trim()) && !GENERIC.test(f.trim()) && !SYSTEM_FONTS.test(f.trim());
export interface Cand { n: number; family: string; weight: number }
/** Candidatas para a folha: as palpites da observação, vizinhas da mesma classe e uma amostra de classes diferentes (até n) */
export function pickCandidates(o: { guesses?: { family: string; weight?: number }[]; cls?: string; weight?: number; n?: number; exclude?: Set<string>; wide?: boolean }): Cand[] {
  const n = o.n ?? 24, ex = o.exclude ?? new Set<string>(), out: { family: string; weight: number }[] = [];
  const add = (family: string, weight: number, force = false) => { const k = `${family.toLowerCase()}|${weight}`; if ((force || !ex.has(k)) && !out.some((x) => `${x.family.toLowerCase()}|${x.weight}` === k)) out.push({ family, weight }); };
  const best = (e: FontEntry, w?: number) => { const pref = [w ?? 0, ...(PREFERRED[e.cls] ?? [700])].filter(Boolean); return pref.find((x) => e.weights.includes(x)) ?? e.weights[e.weights.length - 1]; };
  for (const g of o.guesses ?? []) {
    const e = fontEntry(g.family);
    if (e) { add(e.family, best(e, g.weight ?? o.weight), true); if (e.weights.length > 1) add(e.family, best(e, (g.weight ?? o.weight ?? 700) >= 700 ? 400 : 800), true); }
    else if (plausibleFamily(g.family)) add(g.family.trim(), g.weight ?? o.weight ?? 700, true); // fora da biblioteca: tenta no Google Fonts; se não existir, o navegador descarta
  }
  const cls = o.cls ?? (o.guesses?.[0] ? fontEntry(o.guesses[0].family)?.cls : undefined);
  if (cls) for (const e of FONT_LIBRARY.filter((f) => f.cls === cls)) { if (out.length >= (o.wide ? Math.floor(n * 0.55) : n)) break; add(e.family, best(e, o.weight)); }
  const classes = Object.keys(FONT_CLASSES).filter((c) => c !== cls);
  for (let r = 0; out.length < n && r < 6; r++) for (const c of classes) { const list = FONT_LIBRARY.filter((f) => f.cls === c); const e = list[r]; if (e && out.length < n) add(e.family, best(e, o.weight)); }
  return out.slice(0, n).map((x, i) => ({ n: i + 1, ...x }));
}

// ------------------------------------------------------------------------------------------------ prompt da IA leitora
export const FONT_ANALYZE_SYSTEM = `Você é um tipógrafo especialista em identificar fontes pelo DESENHO das letras: terminais, contraste entre traços grossos e finos, largura, altura-x, serifas, abertura das curvas, e o formato de letras-chave (a, g, R, G, Q, S, C, 1). Compara com candidatas desenhadas e aponta a MAIS PARECIDA. Não precisa ser a fonte exata do designer: basta uma muito parecida. Ignore cor, sombra, contorno, brilho, textura e efeitos. Responda SEMPRE em JSON válido.`;

export function fontAnalyzePrompt(o: { text: string; cands: Cand[]; hint?: string }): string {
  return `A imagem 1 é a arte (thumbnail, post ou site) que contém texto${o.text ? `; o texto principal dela é "${o.text}"` : ""}. A imagem 2 é uma FOLHA NUMERADA (1 a ${o.cands.length}) com o mesmo texto desenhado em fontes candidatas. Compare o desenho das letras do TEXTO PRINCIPAL da imagem 1 (a maior palavra ou o título; ignore efeitos) com cada candidata e diga quais são as mais parecidas.${o.hint ? ` Palpite anterior (pode estar errado): ${o.hint}.` : ""}
Classes: ${Object.keys(FONT_CLASSES).join(" | ")}.
Responda SOMENTE JSON:
{ "has_text": true,
  "best": { "n": 7, "confidence": 0.0 a 1.0, "why": "o que bate no desenho (ex.: mesmo 'R' com perna reta, mesma largura)" },
  "alts": [ { "n": 3, "confidence": 0.0 a 1.0 }, { "n": 12, "confidence": 0.0 a 1.0 } ],
  "class": "uma das classes",
  "case": "upper | lower | mixed", "weight": "thin | light | regular | medium | semibold | bold | extrabold | black",
  "width": "condensed | normal | wide", "contrast": "low | high", "serif": "none | serif | slab",
  "none_matches": false, "closest_description": "se nenhuma candidata for parecida, descreva a fonte em palavras (ex.: serifada de alto contraste estilo Trajan)" }`;
}

export interface FontMatch { family: string; weight: number; cls: string; case: string; width: string; contrast: string; serif: string; confidence: number; alts: { family: string; weight: number; confidence: number }[]; text: string; note: string; uncertain: boolean }
const clip = (s: unknown, n: number) => String(s ?? "").trim().slice(0, n);
const rec = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const conf = (v: unknown) => Math.max(0, Math.min(1, Number(v) || 0));
export function sanitizeFontMatch(raw: unknown, cands: Cand[], text = ""): FontMatch | null {
  const r = rec(raw);
  if (r.has_text === false) return null;
  const pick = (x: unknown) => cands.find((c) => c.n === Number(rec(x).n));
  const b = pick(r.best);
  const bc = conf(rec(r.best).confidence);
  const cls = Object.keys(FONT_CLASSES).includes(clip(r.class, 20)) ? clip(r.class, 20) : (b ? (fontEntry(b.family)?.cls ?? "sans") : "sans");
  if (!b) return { family: "", weight: weightOf(r.weight), cls, case: clip(r.case, 8).toLowerCase(), width: clip(r.width, 10), contrast: clip(r.contrast, 6), serif: clip(r.serif, 6), confidence: 0, alts: [], text, note: clip(r.closest_description, 200), uncertain: true };
  return {
    family: b.family, weight: b.weight, cls, case: ["upper", "lower", "mixed"].includes(clip(r.case, 8).toLowerCase()) ? clip(r.case, 8).toLowerCase() : "mixed", width: clip(r.width, 10), contrast: clip(r.contrast, 6), serif: clip(r.serif, 6),
    confidence: bc, alts: (Array.isArray(r.alts) ? r.alts : []).map((x) => { const c = pick(x); return c ? { family: c.family, weight: c.weight, confidence: conf(rec(x).confidence) } : null; }).filter(Boolean).slice(0, 3) as FontMatch["alts"],
    text, note: clip(rec(r.best).why, 200) || clip(r.closest_description, 200), uncertain: bc < 0.45 || r.none_matches === true,
  };
}

// ------------------------------------------------------------------------------------------------ perfil por categoria
export interface FontUse { family: string; weight: number; pct: number; count: number; cls: string; case: string }
export interface FontProfile { n: number; text_n: number; text_pct: number; fonts: FontUse[]; classes: [string, number][]; cases: [string, number][] }
const topPct = (vals: string[], k = 3): [string, number][] => { const m = new Map<string, number>(); vals.filter(Boolean).forEach((v) => m.set(v, (m.get(v) ?? 0) + 1)); const n = Math.max(1, vals.length); return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([v, c]) => [v, Math.round((c / n) * 100)]); };
/** itens: uma entrada por imagem do treino (tags = categorias, hasText = tem texto, fm = fonte identificada) */
export function computeFontProfile(items: { tags: string[]; hasText: boolean; fm?: FontMatch | null }[]): Record<string, FontProfile> {
  const groups: Record<string, typeof items> = { _todas: items };
  for (const x of items) for (const t of x.tags) (groups[t] ??= []).push(x);
  const out: Record<string, FontProfile> = {};
  for (const [k, list] of Object.entries(groups)) {
    const textItems = list.filter((x) => x.hasText), ok = textItems.filter((x) => x.fm && x.fm.family && x.fm.confidence >= 0.45);
    const m = new Map<string, { family: string; weight: number; count: number; cls: string; cases: string[] }>();
    for (const x of ok) { const f = x.fm!, key = `${f.family}|${f.weight}`; const e = m.get(key) ?? { family: f.family, weight: f.weight, count: 0, cls: f.cls, cases: [] }; e.count++; e.cases.push(f.case); m.set(key, e); }
    out[k] = {
      n: list.length, text_n: textItems.length, text_pct: Math.round((textItems.length / Math.max(1, list.length)) * 100),
      fonts: [...m.values()].sort((a, b) => b.count - a.count).slice(0, 8).map((e) => ({ family: e.family, weight: e.weight, count: e.count, pct: Math.round((e.count / Math.max(1, ok.length)) * 100), cls: e.cls, case: topPct(e.cases, 1)[0]?.[0] ?? "mixed" })),
      classes: topPct(ok.map((x) => x.fm!.cls), 3), cases: topPct(ok.map((x) => x.fm!.case), 2),
    };
  }
  return out;
}
const WNAME: Record<number, string> = { 100: "Thin", 200: "ExtraLight", 300: "Light", 400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold", 800: "ExtraBold", 900: "Black" };
export const fontLabel = (f: { family: string; weight: number }) => `${f.family} ${WNAME[f.weight] ?? f.weight}`;
const CASE_PT: Record<string, string> = { upper: "caixa alta", lower: "minúsculas", mixed: "caixa mista" };

/** Linhas para o documento de treino */
export function fontProfileLines(fp?: Record<string, FontProfile>, label: (id: string) => string = (x) => x): string {
  if (!fp) return "";
  const lines = Object.entries(fp).filter(([, v]) => v.fonts.length).map(([k, v]) => `- ${k === "_todas" ? "TODAS" : label(k)} (${v.text_n} com texto de ${v.n}): ${v.fonts.slice(0, 5).map((f) => `${fontLabel(f)} ${f.pct}% (${CASE_PT[f.case] ?? f.case})`).join("; ")}; classes: ${v.classes.map(([c, p]) => `${FONT_CLASSES[c] ?? c} ${p}%`).join(", ")}`);
  return lines.length ? `## FONTES LIDAS DAS SUAS IMAGENS (a mais parecida de cada uma, por categoria; é a tipografia que o usuário realmente usa)\n${lines.join("\n")}\n` : "";
}

/** Bloco do prompt de ideação: as fontes aprendidas (o que a IA deve usar em vez de inventar) */
export function learnedFontsBlock(fp: Record<string, FontProfile> | null | undefined, categories: string[], label: (id: string) => string = (x) => x): string {
  if (!fp) return "";
  const ids = (categories.length ? categories : Object.keys(fp).filter((k) => k !== "_todas")).filter((c) => fp[c]?.fonts.length);
  if (!ids.length) return "";
  const rows = ids.map((c) => { const v = fp[c]; return `- ${label(c)}: ${v.fonts.slice(0, 6).map((f) => `"${fontLabel(f)}" (${f.pct}%)`).join(", ")} · ${v.classes.map(([k, p]) => `${FONT_CLASSES[k] ?? k} ${p}%`).join(", ")} · ${v.cases.map(([k, p]) => `${CASE_PT[k] ?? k} ${p}%`).join(", ")} · aparece texto em ${v.text_pct}% das imagens`; });
  return `# FONTES APRENDIDAS DO TREINO DO USUÁRIO (leitor de fontes: a mais parecida de cada imagem real)\nPara o texto, USE APENAS fontes desta lista da categoria do conceito (varie entre elas de uma ideia para outra) e escreva em "font_hint" exatamente "Família Peso" como aparece abaixo. Não invente outra fonte. Se a categoria quase não usa texto (porcentagem baixa), prefira SEM texto.\n${rows.join("\n")}`;
}
export function learnedFontList(fp: Record<string, FontProfile> | null | undefined, category: string): FontUse[] {
  return (fp?.[category]?.fonts ?? []).filter((f) => f.family);
}
