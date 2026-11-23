// Os dois estilos de post da Forte Company — SÓLIDO e HUMANIZADO — e as regras fixas de navegação/quantidade de texto.
// Conhecimento extraído da análise de 9 carrosséis de referência (4 sólidos, 5 humanizados). Usado pelo agente (ideate) e pelo gerador de imagem.
// Sem imports: roda no Deno (Edge Function) e no Node (demo).

export type VisualStyle = "solido" | "humanizado" | null;

export const STYLE_LABEL: Record<string, string> = { solido: "Sólido", humanizado: "Humanizado" };

/** Conhecimento completo para o AGENTE (ideate): o que é, anatomia, como escrever a direção visual, erros a evitar */
export const STYLE_SOLIDO = `# ESTILO SÓLIDO (objeto ou pessoa RECORTADA sobre fundo sólido, em situação exagerada)
O QUE É: o fundo é inventado e limpo (cor chapada saturada, degradê suave, branco/cinza de estúdio, ou cor com granulação). O protagonista (uma pessoa recortada ou um objeto) é COLOCADO sobre esse fundo numa situação exagerada, simbólica ou surreal que vira a metáfora do tema. O post é uma PEÇA GRÁFICA: parece cartaz/capa de revista, não uma foto. Funciona porque para o scroll com UMA ideia visual forte.

ANATOMIA (observada nas referências):
- FUNDO: uma cor forte e plana (azul elétrico com granulação, ciano vivo com faixa branca lateral) OU neutro claro de estúdio (cinza/branco, com grade ou textura quase invisível). Jamais uma foto de ambiente real atrás.
- HERÓI: recorte limpo, com sombra de contato suave OU contorno branco grosso estilo adesivo/papel recortado (die-cut). Quatro jeitos que as referências usam: (a) brincadeira de ESCALA: homem sentado em cima da própria cabeça gigante; (b) METÁFORA LITERAL: homem curvado no computador com uma pedra enorme nas costas (o peso de ser criativo), em preto e branco com um único vermelho no texto; (c) COLAGEM 3D SURREAL: cabeça com o cérebro numa cúpula de vidro, tira de miniaturas saindo da boca, moldura barroca prateada com brilho laranja-rosa e cordas pretas trançadas cruzando o primeiro plano, iluminação de estúdio consistente; (d) PERSPECTIVA EXAGERADA: mulher fotografada de cima com óculos enormes na mesma cor do fundo e sorriso aberto. Sempre UM herói, uma escala ou ponto de vista fora do normal, luz coerente com o fundo.
- COR: paleta mínima = fundo + branco ou preto + UMA cor de destaque. O herói conversa com o fundo (óculos azuis em fundo azul; vermelho único sobre cinza e P&B).
- TIPOGRAFIA: título GIGANTE em grotesca condensada ou extranegrito, caixa alta, entrelinha apertada, ocupando perto de metade do quadro (empilhado à esquerda, ou no topo). Contraste de escala na mesma frase: uma linha pequena e leve + uma linha enorme e pesada. 1 ou 2 palavras de destaque em outra cor, em degradê (magenta→laranja), em caixa marca-texto (palavra branca sobre retângulo vermelho/azul) ou em script fino de pincel.
- RABISCOS À MÃO: sublinhado, círculo na palavra-chave, seta, faíscas/raios, na cor de destaque. NO MÁXIMO 1 por slide e não em todos os slides.
- MICROTEXTO: cabeçalho/rodapé minúsculos (categoria, @handle, tagline) só como acabamento, nunca informação importante, e só na capa e no fim.
- COMPOSIÇÃO: texto e herói dividem o quadro em blocos (texto ~50% à esquerda e herói sangrando à direita; ou título no topo e herói embaixo). O herói pode sobrepor parte do texto para criar profundidade. Muito respiro no fundo.
- SLIDES INTERNOS: mesma cor de fundo (mesma família), herói menor ou outra variação da mesma cena/objeto, título curto + 1–2 frases em coluna limpa e UM destaque. Nunca um muro de texto.

COMO ESCREVER O CAMPO "visual" DE UM SLIDE SÓLIDO: diga (1) a cor/textura exata do fundo; (2) quem/o quê é o herói e a CENA exagerada concreta (ex.: "homem de terno curvado sobre um monitor antigo com uma rocha gigante nas costas, P&B"); (3) onde fica o título e qual linha é enorme; (4) qual palavra vira destaque e como (caixa vermelha, script, degradê); (5) no máximo um rabisco. A metáfora tem que nascer do TEMA do slide.
ERROS A EVITAR: fundo com foto real de ambiente; mais de um herói; vários rabiscos; texto em parágrafo; muitas cores; herói genérico sem conceito; recorte mal feito sem sombra/borda; mesma cena repetida em todos os slides sem variação.`;

export const STYLE_HUMANIZADO = `# ESTILO HUMANIZADO (foto real inteira de fundo + texto por cima)
O QUE É: o fundo é UMA FOTOGRAFIA REAL de tela cheia, SEM recorte, sem objetos ou pessoas adicionados em colagem (se há pessoas e objetos, são os da própria foto). O design é só TIPOGRAFIA posta POR CIMA e, às vezes, parcialmente POR TRÁS do sujeito. Sensação: conversa, bastidor, pessoa de verdade, "momento". Menos peça gráfica, mais fotografia com voz.

ANATOMIA (observada nas referências):
- FOTO: aparência de câmera de celular/editorial, cena vivida: homem filmando num home studio com softbox e monitor; mulher de jaqueta de couro tomando café numa cafeteria escura; nutricionista sorrindo numa poltrona com uma cesta de frutas; pessoa caminhando numa ciclofaixa verde com linhas de fuga fortes; homem com MacBook num sofá chesterfield. Luz natural ou de ambiente, textura de pele, grão leve, imperfeições, cenário com objetos reais. Tratamento: grade de cor sutil (azulado, verde-azulado, âmbar quente) e degradê/vinheta escura só onde o texto precisa de leitura.
- TEXTO: POUCAS palavras, em 3 ou 4 blocos curtos de tamanhos diferentes, em tom de fala ("eu sou nutri, mas eu também…", "é assim que você vai viralizar o seu primeiro conteúdo"). A frase é QUEBRADA em linhas e espalhada pelo espaço negativo da foto acompanhando a cena (acima da cabeça, ao lado do monitor, no ponto de fuga da rua, na área vazia da parede). Entrelinha apertada. Nunca cobre o rosto.
- TROCA DE FONTES (marca registrada): na mesma frase, UMA palavra-chave vira serifada itálica de alto contraste (Didone), script de pincel ou condensada gigante; o resto em sans geométrica limpa (leve + negrito). 2 ou 3 famílias, ritmo claro: palavra de ÊNFASE grande e dramática, palavras de apoio pequenas. É isso que tira a cara de IA e dá cara de design de agência.
- COR DO TEXTO: branco/creme + UMA cor retirada da própria foto (dourado do couro, laranja da faixa da ciclofaixa, caramelo da poltrona, verde-menta). Nunca uma cor aleatória.
- PROFUNDIDADE: a palavra grande pode ficar parcialmente ATRÁS da cabeça ou do ombro do sujeito (camadas), sem esconder o rosto.
- EXTRAS (opcionais, no máximo 1 por slide): cartão de vidro fosco com 3–6 palavras, círculo ou borrão sobre uma letra, seta fina, retângulo de realce. Sem ícones, selos, stickers nem molduras.
- CABEÇALHO/RODAPÉ: micro texto espaçado (ex.: "O GUIA DEFINITIVO PARA CRIAR CONTEÚDO" com uma palavra em negrito) e assinatura pequena, só na capa e no fim; logo da marca discreta quando existir.
- SLIDES INTERNOS: outras fotos da mesma sessão/estética (mesma grade de cor e luz, ângulos diferentes) ou o mesmo enquadramento recortado (zoom); texto um pouco maior (título + 1 frase) sobre área escura/desfocada ou cartão translúcido. Capa e CTA ficam com as palavras mais enxutas.

COMO ESCREVER O CAMPO "visual" DE UM SLIDE HUMANIZADO: diga (1) a FOTO exata: quem, o que faz, onde, luz, enquadramento, clima; (2) o espaço negativo onde cada bloco de texto vai; (3) qual palavra vira destaque e em que tipo de fonte (serifada itálica, script, condensada) e a cor puxada da foto; (4) o degradê/vinheta necessário; (5) no máximo um extra.
ERROS A EVITAR: recortar a pessoa e pôr em fundo sólido (isso é o Sólido); inserir objetos ou pessoas que não estão na foto; texto em muitas linhas ou parágrafo; todo o texto na mesma fonte; texto sobre o rosto; foto com cara de banco de imagem, de render ou de IA (pele plástica, simetria perfeita, luz de estúdio perfeita).`;

/** Versão curta e imperativa para o GERADOR DE IMAGEM (vai junto no prompt de cada slide) */
export const STYLE_SOLIDO_IMAGE = `ESTILO SÓLIDO: fundo limpo e SÓLIDO (cor chapada saturada ou degradê suave, ou branco/cinza de estúdio, com leve granulação), SEM foto de ambiente atrás. O protagonista é um RECORTE (pessoa ou objeto) com contorno limpo e sombra de contato suave ou borda branca estilo adesivo, numa situação exagerada/surreal que vira metáfora do tema (escala impossível, objeto gigante, peso literal, colagem 3D). UMA só ideia visual. Título GIGANTE em grotesca condensada/extranegrito, caixa alta, ocupando quase metade do quadro, com 1–2 palavras de destaque em outra cor, caixa marca-texto ou script fino. Paleta: fundo + branco/preto + UMA cor de destaque. No máximo UM rabisco à mão (sublinhado, círculo ou seta). O protagonista pode sobrepor parte do texto para dar profundidade.`;

export const STYLE_HUMANIZADO_IMAGE = `ESTILO HUMANIZADO: o fundo é UMA FOTOGRAFIA REAL em tela cheia, sem recorte e sem pessoas ou objetos adicionados em colagem: cena cotidiana/editorial, luz natural, textura de pele, grão leve, imperfeições reais, cenário vivido. Aparência de foto de celular/câmera, NÃO de render nem de IA (sem pele plástica, sem simetria perfeita, mãos naturais, sem luz de estúdio perfeita). Só uma grade de cor sutil e um degradê/vinheta escuro onde o texto precisa de leitura. O design é só TIPOGRAFIA por cima (e às vezes um pouco por trás do sujeito): poucas palavras em 3–4 blocos de tamanhos diferentes, no espaço negativo da foto, acompanhando a cena, NUNCA sobre o rosto. Troque de fonte na palavra-chave (serifada itálica de alto contraste, script de pincel ou condensada gigante) e use sans geométrica limpa no resto. Cor do texto: branco/creme + UMA cor retirada da própria foto. No máximo UM extra: cartão de vidro fosco, círculo ou seta fina.`;

export function styleBlock(s: VisualStyle | undefined): string {
  if (s === "solido") return STYLE_SOLIDO;
  if (s === "humanizado") return STYLE_HUMANIZADO;
  return `# ESTILO VISUAL: ESCOLHA ENTRE SÓLIDO E HUMANIZADO\nO usuário não escolheu. Decida qual funciona melhor para o tema (e informe em "visual_style"); use UM estilo no carrossel inteiro. Os dois estilos da Forte:\n\n${STYLE_SOLIDO}\n\n${STYLE_HUMANIZADO}`;
}

export function styleImageBrief(s: VisualStyle | undefined): string {
  return s === "solido" ? STYLE_SOLIDO_IMAGE : s === "humanizado" ? STYLE_HUMANIZADO_IMAGE : "";
}

/** Regras fixas (valem para qualquer marca e situação) */
export const NAV_RULE = `## NAVEGAÇÃO (REGRA FIXA, vale para qualquer marca e situação)
- Indicadores de navegação ("deslize", "arraste", "passe pro lado", seta de próximo, "continua →") só podem existir da CAPA até o PENÚLTIMO slide, e de preferência só na capa. NUNCA no ÚLTIMO slide nem em criativo estático: não há para onde deslizar. O último slide ENCERRA: CTA e assinatura.
- Não repita cabeçalho, selo ou indicador em todos os slides: no máximo um cabeçalho discreto na capa e a assinatura no último.
- Rabiscos, setas e sublinhados à mão: no máximo 1 por slide e não em todos os slides.`;

const CUE = /(desliz|arrast|passe\s+(pro|para\s+o)\s+lado|passa\s+pro\s+lado|swipe|pr[óo]ximo\s+slide|continua\s*(→|>|›))/i;

/** Remove frases com chamada para deslizar/arrastar (usado no último slide e nos estáticos, por garantia) */
export function stripSwipe(s: string): string {
  return (s ?? "").split(/\n/).map((line) => line.split(/(?<=[.!?…])\s+/).filter((p) => !CUE.test(p)).join(" ").trim()).filter(Boolean).join("\n");
}

/** Garante as regras fixas na resposta do agente, mesmo que o modelo escorregue */
export function sanitizeSlides<T extends { text?: string; visual?: string; typography?: string }>(slides: T[], isStatic: boolean): T[] {
  return slides.map((s, i) => {
    const last = isStatic || i === slides.length - 1;
    if (!last) return s;
    return { ...s, text: stripSwipe(s.text ?? "") || (s.text ?? ""), visual: stripSwipe(s.visual ?? "") };
  });
}

export const STYLE_VISION_SYSTEM = "Você é diretor de arte sênior. Analisa referências reais de carrosséis de Instagram para ensinar uma IA a recriar o estilo com fidelidade.";
export function styleVisionPrompt(s: "solido" | "humanizado"): string {
  const def = s === "solido"
    ? "SÓLIDO: pessoa ou objeto recortado sobre fundo sólido, em situação exagerada/metafórica, com título gigante."
    : "HUMANIZADO: foto real inteira de fundo (sem recorte nem colagem) com tipografia por cima, trocando de fonte na palavra-chave.";
  return `Estas imagens são referências reais do estilo ${def} Analise o que elas têm EM COMUM (e o que varia). Seja concreto e específico (cores, posições, famílias de fonte aproximadas, quantidade de palavras). Responda SOMENTE JSON: {"summary":"parágrafo","background":"como é o fundo","hero_or_photo":"o protagonista/foto e a cena","typography":"estilos/famílias, tamanhos, troca de fontes, posição do texto","color":"paleta e como a cor de destaque é escolhida","composition":"como texto e imagem dividem o quadro","text_amount":"palavras e blocos de texto por imagem","accents":"rabiscos, caixas, selos, extras e quantos","what_makes_it_work":["..."],"mistakes_to_avoid":["..."]}`;
}
export function styleVisualsBlock(v: Record<string, unknown> | null | undefined, s: VisualStyle | undefined): string {
  if (!v) return "";
  const keys = s ? [s] : ["solido", "humanizado"];
  const parts = keys.filter((k) => v[k]).map((k) => `## ${STYLE_LABEL[k].toUpperCase()}\n${JSON.stringify(v[k]).slice(0, 3200)}`);
  return parts.length ? `# ANÁLISE VISUAL DAS REFERÊNCIAS REAIS (feita por IA de visão sobre as imagens que a agência enviou; complementa o que está acima)\n${parts.join("\n\n")}` : "";
}
