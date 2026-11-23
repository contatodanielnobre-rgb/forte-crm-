// Opções do formulário do estúdio de logos (espelham as de supabase/functions/_shared/logo.ts)
export const APPROACHES: { id: string; label: string; hint: string }[] = [
  { id: 'minimalista', label: 'Minimalista', hint: 'Poucas formas, muito respiro, só o essencial.' },
  { id: 'criativa', label: 'Mais criativa', hint: 'Ideia ousada, construção inesperada, personalidade forte.' },
  { id: 'ideia', label: 'Focada na ideia da empresa', hint: 'O símbolo conta exatamente o que o negócio faz ou promete.' },
  { id: 'tipografica', label: 'Tipográfica', hint: 'As letras são a marca: desenho, cortes e ligaduras.' },
  { id: 'classica', label: 'Clássica / premium', hint: 'Elegância atemporal, serifa, proporção e contenção.' },
  { id: 'moderna', label: 'Moderna / tech', hint: 'Geométrica, limpa, contemporânea.' },
  { id: 'amigavel', label: 'Amigável / orgânica', hint: 'Formas arredondadas, calor humano, proximidade.' },
  { id: 'forte', label: 'Forte / robusta', hint: 'Peso, solidez, autoridade e impacto.' },
]
export const LOGO_KINDS: { id: string; label: string; hint: string }[] = [
  { id: 'auto', label: 'A IA escolhe', hint: 'O melhor tipo para esta empresa.' },
  { id: 'symbol_name', label: 'Símbolo + nome', hint: 'O mais versátil: o símbolo funciona sozinho.' },
  { id: 'wordmark', label: 'Só o nome', hint: 'Letras desenhadas e personalizadas.' },
  { id: 'monogram', label: 'Monograma', hint: 'Iniciais construídas como uma forma.' },
  { id: 'emblem', label: 'Emblema / selo', hint: 'Texto e símbolo dentro de uma forma fechada.' },
  { id: 'abstract', label: 'Abstrata', hint: 'Forma geométrica com conceito.' },
  { id: 'mascot', label: 'Mascote', hint: 'Personagem simples e vetorial.' },
]
export const MOOD_CHIPS = ['Confiável', 'Premium', 'Acolhedora', 'Jovem', 'Técnica', 'Divertida', 'Elegante', 'Robusta', 'Natural', 'Ousada', 'Silenciosa', 'Artesanal', 'Rápida', 'Cuidadosa']
export const INPUT_ROLES: { id: 'competitor' | 'attempt' | 'inspiration'; label: string; hint: string }[] = [
  { id: 'competitor', label: 'Concorrente', hint: 'A IA entende e faz diferente' },
  { id: 'attempt', label: 'Não ficou como eu queria', hint: 'A IA corrige o que incomoda' },
  { id: 'inspiration', label: 'Inspiração', hint: 'A IA pega a sensação, não o desenho' },
]
export const QUALITIES: { id: string; label: string; hint: string }[] = [
  { id: 'low', label: 'Rascunho', hint: 'Mais barato, bom para explorar' },
  { id: 'medium', label: 'Normal', hint: 'Equilíbrio entre custo e nitidez' },
  { id: 'high', label: 'Alta', hint: 'Mais nítido, mais caro' },
]
export const VARIANT_LABEL: Record<string, string> = { color: 'Logo colorida', white: 'Logo branca', black: 'Logo preta', symbol: 'Só o símbolo' }
