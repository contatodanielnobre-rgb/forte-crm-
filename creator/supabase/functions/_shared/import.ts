// Importação de documentos da empresa (PDF de briefing, formulário, imagens, reuniões…) → campos do treinamento.
// Roda no Deno (Edge Function) e no Node (demo).

import { BRAND_SCHEMA, brandBuilderSystem, clip, type AgentNotes, type SiteSummary } from "./prompts.ts";

export const IMPORT_RULES = `# TAREFA: PREENCHER OS CAMPOS DA EMPRESA A PARTIR DE DOCUMENTOS
Você recebe o material de uma empresa-cliente (formulário de briefing respondido, PDFs, apresentações, transcrição de reuniões, fotos, logos e, às vezes, o site) e deve PREENCHER os campos do cadastro de treinamento dela.
- Extraia SOMENTE o que está no material. Campo sem informação = "" (ou []) e anote em "missing". Nunca invente nome, número, produto, cliente ou cor.
- Respostas explícitas do cliente (formulário, reunião) valem mais que qualquer inferência. Copie fielmente o que ele disse sobre cores, fontes, tom, o que NÃO quer, concorrentes, metas.
- name / handle / website: como estão escritos no material (handle começa com @; website sem espaços).
- brief: about = o que a empresa faz e para quem; products = produtos e serviços; goal = objetivo do negócio/dos posts; audience = quem compra; differentiators = diferenciais e como quer ser percebida.
- colors: SOMENTE com HEX literal escrito no material ou no site, e copie em "quote" o trecho exato que traz o HEX. Cor citada só por NOME (sem código) NÃO entra em "colors": liste em "missing" (ex.: "Cores citadas sem código HEX: azul-marinho e dourado").
- Fontes: nomes de famílias citados; se o material não citar, sugira 3 a 5 reais coerentes e avise em "missing" que são sugestões.
- images: para CADA imagem anexada (use o índice indicado na mensagem) classifique "kind": logo (marca/logotipo da empresa; "variant": principal | positiva | negativa | icone | outra), character (foto de PESSOA que representa a marca: dono, sócio, porta-voz; "label" = o nome se aparecer no material), object (produto, veículo ou objeto da empresa em destaque; "label" = nome curto), reference (peça de Instagram/material visual que mostra o estilo da marca), ignore (irrelevante, documento escaneado, print). "label" curto e "description" factual em 1 frase.
- sources: uma linha por arquivo dizendo o que foi tirado dele.
- Português do Brasil.`;

export function importSchema(): string {
  const s = JSON.parse(BRAND_SCHEMA) as Record<string, unknown>;
  const out = {
    name: "nome da empresa", handle: "@instagram", website: "site",
    brief: { about: "", products: "", goal: "", audience: "", differentiators: "" },
    ...s,
    colors: [{ hex: "#RRGGBB", name: "", role: "primary|secondary|accent|background|text|other", quote: "trecho literal do material com o HEX" }],
    images: [{ index: 0, kind: "logo|character|object|reference|ignore", variant: "principal|positiva|negativa|icone|outra", label: "", description: "" }],
    sources: ["arquivo → o que foi extraído"],
  };
  return JSON.stringify(out);
}

export function brandImportSystem(o: { baseDoc?: string | null; notes?: AgentNotes | null }): string {
  return brandBuilderSystem({ baseDoc: o.baseDoc, notes: o.notes, extra: IMPORT_RULES, schema: importSchema() });
}

export interface ImportDoc { n: number; name: string; kind: string; text?: string | null }

/** Texto de abertura da mensagem (os arquivos em si — PDFs e imagens — vão como partes separadas) */
export function brandImportIntro(o: { name: string; website?: string | null; segment?: string | null; handle?: string | null; docs: ImportDoc[]; site?: SiteSummary | null; hasImages: boolean }): string {
  const parts = [
    `EMPRESA (cadastro atual): ${o.name}`,
    o.segment ? `Segmento informado: ${o.segment}` : "",
    o.handle ? `Instagram informado: ${o.handle}` : "",
    o.website ? `Site informado: ${o.website}` : "",
    `ARQUIVOS RECEBIDOS:\n${o.docs.map((d) => `- [${d.n}] ${d.name} (${d.kind})`).join("\n")}`,
  ];
  for (const d of o.docs) if (d.text?.trim()) parts.push(`--- TEXTO DO ARQUIVO [${d.n}] ${d.name} ---\n${clip(d.text, 24000)}`);
  if (o.site) parts.push(`--- MATERIAL LIDO DO SITE (${o.site.url}) ---\nTítulo: ${o.site.title}\nDescrição: ${o.site.description}\nCores encontradas (HEX): ${o.site.colors.join(", ") || "nenhuma"}\nFontes encontradas: ${o.site.fonts.join(", ") || "nenhuma"}\nTexto da página:\n${o.site.text}`);
  parts.push(o.hasImages ? "As imagens vêm a seguir, cada uma precedida do seu índice." : "Não há imagens neste envio.");
  return parts.filter(Boolean).join("\n\n");
}

/** A IA só pode usar cores com HEX que realmente existam no material (texto extraído, site ou o trecho citado por ela) */
export function filterImportColors(colors: unknown, ctx: { siteColors: string[]; texts: string[] }): { hex: string; name: string; role: string }[] {
  const hay = ctx.texts.join("\n").toUpperCase();
  const site = new Set(ctx.siteColors.map((c) => c.toUpperCase()));
  const seen = new Set<string>();
  const out: { hex: string; name: string; role: string }[] = [];
  for (const c of Array.isArray(colors) ? colors : []) {
    const hex = String(c?.hex ?? "").toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(hex) || seen.has(hex)) continue;
    const quote = String(c?.quote ?? "").toUpperCase();
    if (site.has(hex) || hay.includes(hex) || quote.includes(hex)) { seen.add(hex); out.push({ hex, name: String(c?.name ?? ""), role: String(c?.role ?? "other") }); }
  }
  return out;
}
