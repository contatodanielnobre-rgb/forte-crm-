import type { Provider, StudioKind } from './types'

export const BUCKET_STUDIO = 'studio'

/** Proporções prontas (o usuário também pode digitar, ex.: 1080x1350 ou 4:5) */
export const ASPECTS: { id: string; label: string; hint: string; w: number; h: number }[] = [
  { id: '4:5', label: '4:5', hint: 'Feed retrato · 1080×1350', w: 4, h: 5 },
  { id: '1:1', label: '1:1', hint: 'Feed quadrado · 1080×1080', w: 1, h: 1 },
  { id: '9:16', label: '9:16', hint: 'Stories / Reels · 1080×1920', w: 9, h: 16 },
  { id: '3:4', label: '3:4', hint: 'Retrato clássico', w: 3, h: 4 },
  { id: '2:3', label: '2:3', hint: 'Pôster / Pinterest', w: 2, h: 3 },
  { id: '16:9', label: '16:9', hint: 'Paisagem · YouTube / capa', w: 16, h: 9 },
  { id: '1.91:1', label: '1.91:1', hint: 'Link / Facebook · 1200×628', w: 1.91, h: 1 },
  { id: '3:2', label: '3:2', hint: 'Paisagem fotográfica', w: 3, h: 2 },
]

export function parseAspect(a: string): { w: number; h: number } | null {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*[:xX×/]\s*(\d+(?:[.,]\d+)?)\s*$/.exec(a)
  if (!m) return null
  const w = Number(m[1].replace(',', '.')), h = Number(m[2].replace(',', '.'))
  return w > 0 && h > 0 ? { w, h } : null
}
/** Normaliza entradas como 1080x1350 para 4:5 (mantém o formato original quando não reduz) */
export function normalizeAspect(a: string): string | null {
  const p = parseAspect(a)
  if (!p) return null
  const gcd = (x: number, y: number): number => (y ? gcd(y, x % y) : x)
  if (Number.isInteger(p.w) && Number.isInteger(p.h)) { const g = gcd(p.w, p.h); return `${p.w / g}:${p.h / g}` }
  return `${p.w}:${p.h}`
}

export interface FormatPreset {
  id: string
  name: string
  kind: StudioKind
  slides: number
  aspect: string
  desc: string
  /** papéis sugeridos por slide */
  roles: string[]
  /** dica de estrutura enviada ao planejador */
  structure: string
}

export const FORMAT_PRESETS: FormatPreset[] = [
  { id: 'edu', name: 'Carrossel educativo', kind: 'carousel', slides: 7, aspect: '4:5', desc: 'Gancho, passo a passo e CTA', roles: ['capa', 'desenvolvimento', 'desenvolvimento', 'desenvolvimento', 'desenvolvimento', 'prova', 'cta'], structure: 'Capa com promessa clara; 4-5 slides ensinando um ponto por vez; slide de resumo; CTA final.' },
  { id: 'list', name: 'Lista numerada', kind: 'carousel', slides: 6, aspect: '4:5', desc: '“5 erros…”, “7 dicas…”', roles: ['capa', 'desenvolvimento', 'desenvolvimento', 'desenvolvimento', 'desenvolvimento', 'cta'], structure: 'Capa com o número no título; cada slide é um item com título curto e uma linha de apoio; CTA no fim.' },
  { id: 'story', name: 'Storytelling', kind: 'carousel', slides: 6, aspect: '4:5', desc: 'Problema → virada → solução', roles: ['capa', 'desenvolvimento', 'desenvolvimento', 'prova', 'desenvolvimento', 'cta'], structure: 'Conta uma história em arco: situação, conflito, virada, resultado e convite.' },
  { id: 'ba', name: 'Antes e depois', kind: 'carousel', slides: 4, aspect: '4:5', desc: 'Transformação com prova', roles: ['capa', 'desenvolvimento', 'prova', 'cta'], structure: 'Capa instiga; slide do antes; slide do depois; prova/depoimento e CTA.' },
  { id: 'testi', name: 'Depoimento', kind: 'static', slides: 1, aspect: '4:5', desc: 'Prova social em um criativo', roles: ['estático'], structure: 'Aspas destacadas, nome e cargo do cliente, resultado em destaque.' },
  { id: 'promo', name: 'Oferta / promoção', kind: 'static', slides: 1, aspect: '1:1', desc: 'Preço, urgência e CTA', roles: ['estático'], structure: 'Oferta em destaque, condição, prazo e botão/CTA bem visível.' },
  { id: 'auth', name: 'Autoridade', kind: 'carousel', slides: 8, aspect: '4:5', desc: 'Dados, método e resultados', roles: ['capa', 'desenvolvimento', 'desenvolvimento', 'prova', 'desenvolvimento', 'prova', 'desenvolvimento', 'cta'], structure: 'Posiciona a marca como referência: dado forte, método, casos e convite.' },
  { id: 'launch', name: 'Lançamento', kind: 'carousel', slides: 5, aspect: '4:5', desc: 'Teaser → revelação → CTA', roles: ['capa', 'desenvolvimento', 'desenvolvimento', 'prova', 'cta'], structure: 'Teaser, revelação do produto/serviço, benefícios, prova e como comprar/agendar.' },
  { id: 'quote', name: 'Frase / manifesto', kind: 'static', slides: 1, aspect: '4:5', desc: 'Frase de impacto da marca', roles: ['estático'], structure: 'Uma frase forte, tipografia dominante, assinatura da marca.' },
  { id: 'story9', name: 'Story vertical', kind: 'static', slides: 1, aspect: '9:16', desc: 'Criativo para Stories', roles: ['estático'], structure: 'Elementos fora das zonas de interface (topo/rodapé), texto grande, CTA com adesivo/botão.' },
]

export const STYLE_CHIPS = ['Minimalista', 'Luxo', 'Vibrante', 'Editorial', 'Fotográfico', 'Ilustrado', 'Tipográfico', 'Futurista', 'Retrô', 'Orgânico', 'Corporativo', 'Jovem', 'Premium', 'Brutalista']
export const TONE_CHIPS = ['Direto', 'Inspirador', 'Técnico', 'Divertido', 'Acolhedor', 'Autoridade', 'Provocativo', 'Elegante', 'Urgente', 'Educativo']
export const FONT_SUGGESTIONS = ['Inter', 'Sora', 'Poppins', 'Montserrat', 'Playfair Display', 'DM Serif Display', 'Bebas Neue', 'Oswald', 'Anton', 'Space Grotesk', 'Plus Jakarta Sans', 'Lora', 'Archivo Black', 'Raleway', 'Cormorant Garamond']
export const COLOR_ROLES: { id: string; label: string }[] = [
  { id: 'primary', label: 'Principal' }, { id: 'secondary', label: 'Secundária' }, { id: 'accent', label: 'Destaque' },
  { id: 'background', label: 'Fundo' }, { id: 'text', label: 'Texto' }, { id: 'other', label: 'Apoio' },
]

export const PROVIDERS: Record<Provider, { name: string; hint: string; keyUrl: string; color: string }> = {
  openai: { name: 'OpenAI', hint: 'GPT Image 2.5 / 2 / 1.5 / 1 e modelo de texto para planejar, melhorar e analisar.', keyUrl: 'https://platform.openai.com/api-keys', color: '#10a37f' },
  google: { name: 'Google AI (Gemini)', hint: 'Nano Banana, Nano Banana Pro e Imagen.', keyUrl: 'https://aistudio.google.com/apikey', color: '#4285f4' },
  fal: { name: 'fal.ai', hint: 'Seedream, FLUX, Qwen-Image e outros modelos abertos.', keyUrl: 'https://fal.ai/dashboard/keys', color: '#8b5cf6' },
  ideogram: { name: 'Ideogram', hint: 'Ideogram 3.0 — tipografia criativa.', keyUrl: 'https://ideogram.ai/manage-api', color: '#f97316' },
  stability: { name: 'Stability AI', hint: 'Stable Diffusion 3.5.', keyUrl: 'https://platform.stability.ai/account/keys', color: '#6366f1' },
  recraft: { name: 'Recraft', hint: 'Recraft V3 — design gráfico e vetores.', keyUrl: 'https://www.recraft.ai/profile/api', color: '#ec4899' },
  custom: { name: 'Personalizado (OpenAI-compatível)', hint: 'Qualquer API que siga o formato do OpenAI Images: informe a URL base.', keyUrl: '', color: '#71717a' },
}
export const PROVIDER_ORDER: Provider[] = ['openai', 'google', 'fal', 'ideogram', 'recraft', 'stability', 'custom']

export const ROLE_LABEL: Record<string, string> = { capa: 'Capa', desenvolvimento: 'Conteúdo', prova: 'Prova', cta: 'CTA', 'estático': 'Criativo' }

// ---------------------------------------------------------------------------------
// Custos (estimativas — o custo REAL de cada imagem OpenAI é gravado a partir do "usage" da API)
// Fontes: tabela de tokens de developers.openai.com/api/docs/pricing (consultada em 21/11/2026) e
// calculadora de tokens da OpenAI reproduzida por terceiros. A OpenAI não publica preço fixo por imagem.
// ---------------------------------------------------------------------------------
export const USD_BRL_DEFAULT = 5.87 // fechamento de 18/11/2026 (varia todo dia — editável na tela de custos)

/** Custo de SAÍDA por imagem em US$ (retrato ~1024×1280, 4:5): tokens de saída × US$ 30 / 1M */
const OUT_PRICE: { match: RegExp; low: number; medium: number; high: number }[] = [
  { match: /^gpt-image-2\.6/, low: 0.022, medium: 0.037, high: 0.045 },
  { match: /^gpt-image-2\.5/, low: 0.005, medium: 0.011, high: 0.045 },
  { match: /^gpt-image-2$/, low: 0.004, medium: 0.034, high: 0.135 },
]
export const hasPrice = (apiModel: string) => OUT_PRICE.some((p) => p.match.test(apiModel))

export interface CostAssumptions { promptTokens: number; refTokens: number; refsPerSlide: number }
/** Suposições de ENTRADA (a OpenAI cobra o prompt a US$ 5/1M e cada imagem enviada a US$ 8/1M) */
export const COST_ASSUMPTIONS: CostAssumptions = { promptTokens: 3500, refTokens: 1000, refsPerSlide: 3 }

export function imageCost(apiModel: string, quality: string, a: CostAssumptions = COST_ASSUMPTIONS, withRefs = true) {
  const row = OUT_PRICE.find((p) => p.match.test(apiModel))
  if (!row) return null
  const q = (quality === 'low' || quality === 'medium' ? quality : 'high') as 'low' | 'medium' | 'high'
  const out = row[q]
  const imgs = withRefs ? a.refsPerSlide + 2 : 0 // logo + N referências + slide 1 (continuidade)
  const input = (a.promptTokens * 5 + imgs * a.refTokens * 8) / 1e6
  return { out, input, total: out + input }
}

export interface AgentModel { id: string; name: string; inUsd: number; outUsd: number; tag: string; tier: 'budget' | 'balanced' | 'premium'; desc: string }
/** Modelos de texto/agente (preços por 1M de tokens, página oficial de preços da OpenAI) */
export const AGENT_MODELS: AgentModel[] = [
  { id: 'gpt-6-luna', name: 'GPT-6 Luna', inUsd: 0.1, outUsd: 0.5, tag: 'Mais barato · recomendado', tier: 'budget', desc: 'Camada barata do GPT-6: ideal para pensar o post, dividir slides e escrever legenda todo dia por centavos.' },
  { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', inUsd: 0.2, outUsd: 1.2, tag: 'Barato', tier: 'budget', desc: 'Geração anterior da família Luna.' },
  { id: 'gpt-6.1-terra', name: 'GPT-6.1 Terra', inUsd: 1, outUsd: 5, tag: 'Equilíbrio', tier: 'balanced', desc: 'Meio-termo entre custo e raciocínio, bom para roteiros mais difíceis.' },
  { id: 'gpt-6-sol', name: 'GPT-6 Sol', inUsd: 2, outUsd: 10, tag: 'Mais inteligente', tier: 'balanced', desc: 'Raciocínio forte para ganchos e estratégia; ainda barato perto das imagens.' },
  { id: 'gpt-6-astra', name: 'GPT-6 Astra', inUsd: 10, outUsd: 50, tag: 'Máxima qualidade', tier: 'premium', desc: 'Topo de linha. Só vale para briefings muito complexos.' },
]
export const AGENT_IO = { inTokens: 8000, outTokens: 2200 } // uma ideação típica: manual + skill + ideia → slides + legenda
export const agentCallUsd = (m: AgentModel) => (AGENT_IO.inTokens * m.inUsd + AGENT_IO.outTokens * m.outUsd) / 1e6

export const fmtUsd = (n: number) => `US$ ${n.toFixed(n < 0.1 ? 4 : 2)}`
export const fmtBrl = (usd: number, rate: number) => `R$ ${(usd * rate).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export const getRate = () => { try { const v = Number(localStorage.getItem('fcc-usd-brl')); return v > 0 ? v : USD_BRL_DEFAULT } catch { return USD_BRL_DEFAULT } }
export const setRate = (v: number) => { try { localStorage.setItem('fcc-usd-brl', String(v)) } catch { /* noop */ } }
