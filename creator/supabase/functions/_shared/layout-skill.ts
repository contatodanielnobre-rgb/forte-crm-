// Criador de layouts de site (UX/UI): categorias, estilos visuais, biblioteca de seções e a skill de designer.
// Texto puro: usado pela Edge Function studio-generate (Deno) e pela tela (aba Treinamento).

export interface LayoutCategory { id: string; label: string; hint: string; playbook: string }

export const LAYOUT_CATEGORIES: LayoutCategory[] = [
  { id: "venda_longa", label: "Página de vendas / infoproduto (copy longa, VSL)", hint: "Curso, mentoria, ebook, método: página longa que conduz até a oferta",
    playbook: `Objetivo: levar uma pessoa fria até a decisão de compra numa rolagem só.
Sequência típica (12–16 seções): 1 hero com a promessa + vídeo/VSL ou mockup do produto + botão; 2 barra de prova rápida (números, selos, logos); 3 problema/dor com identificação; 4 agitação (custo de não resolver); 5 solução (apresentar o método); 6 como funciona em 3–5 passos; 7 o que está dentro (módulos/entregáveis em cards); 8 bônus; 9 autoridade/quem ensina (foto + credenciais); 10 depoimentos e prints de resultado; 11 para quem é / para quem não é; 12 oferta (preço ancorado, parcelas, botão grande); 13 garantia (selo + prazo); 14 perguntas frequentes (acordeão); 15 chamada final repetindo a promessa; 16 rodapé enxuto.
Hero: manchete de 6–12 palavras com o resultado + prazo; subtítulo de 1–2 linhas; um botão dominante; prova social minúscula perto do botão; imagem do produto/autor à direita. Contraste alto, uma cor de ação só.
Estilo: seções alternando fundo claro e escuro para ritmo, cards com cantos de 16–24 px, números grandes, selos, setas e ícones simples. Botões grandes, repetidos a cada 2–3 seções.
Erros: parede de texto, vários botões de cores diferentes, preço escondido, depoimentos genéricos sem rosto, ausência de garantia.` },
  { id: "lowticket", label: "Low ticket / oferta direta (checkout rápido)", hint: "Produto barato, decisão rápida: poucas seções e urgência",
    playbook: `Objetivo: converter rápido um produto de ticket baixo (ebook, pack, template, mini curso).
Sequência (6–9 seções): 1 hero com a promessa + preço/oferta visível + botão; 2 o que você recebe (lista com ícones); 3 mockup do produto e prévias; 4 prova (prints, depoimentos curtos); 5 bônus com valor riscado; 6 oferta com preço por/de, contagem regressiva ou vagas; 7 garantia; 8 FAQ curto (4–5 perguntas); 9 chamada final.
Hero: preço ou desconto já na primeira dobra, produto em destaque (mockup 3D, capa, tela), selo de garantia e botão de compra em cor de alto contraste.
Estilo: direto, vibrante, cores quentes de ação (vermelho, laranja, verde), faixas de urgência, selos, etiquetas "oferta", tipografia pesada e curta. Densidade média, sem excesso de decoração.
Erros: pedir muita leitura, esconder o preço, muitos links de saída, botão pequeno, bônus sem valor percebido.` },
  { id: "lancamento", label: "Lançamento / inscrição (captura, webinar, evento online)", hint: "Capturar nome e e-mail ou inscrever em aula/evento",
    playbook: `Objetivo: conseguir a inscrição (lead). A página é curta e o formulário aparece cedo.
Sequência (5–8 seções): 1 hero com a chamada do evento (data/hora), subtítulo e formulário curto (nome, e-mail, WhatsApp) já na primeira dobra; 2 o que você vai aprender (3–5 itens com ícones); 3 quem apresenta (foto grande e credenciais); 4 para quem é; 5 depoimentos ou números; 6 cronograma/datas; 7 chamada final com o mesmo formulário; 8 rodapé mínimo.
Hero: duas colunas — texto à esquerda, cartão de formulário à direita com título, campos grandes e botão cheio; contador regressivo; foto do apresentador recortada.
Estilo: energia e foco, degradês, formas geométricas atrás do apresentador, um único caminho de ação. Sem menu de navegação ou com o mínimo.
Erros: formulário longo, texto demais antes do formulário, datas pouco visíveis, vários objetivos na mesma página.` },
  { id: "ecommerce", label: "Loja / página de produto", hint: "Vitrine, categorias, página de produto, carrinho",
    playbook: `Objetivo: mostrar o produto com clareza e reduzir o medo de comprar.
Home: barra de avisos (frete, parcelas), cabeçalho com busca e carrinho, hero de campanha, categorias em cards com imagem, vitrine de mais vendidos (cards com foto, nome, preço, parcela, botão), banners de benefícios (frete, troca, pagamento), prova social (avaliações), newsletter e rodapé completo.
Produto: galeria grande à esquerda (miniaturas), à direita nome, nota com estrelas, preço grande, parcelamento, variações (cor/tamanho), botão comprar fixo, selos de confiança, abas de descrição/medidas/avaliações, produtos relacionados.
Estilo: fotografia de produto limpa, muito espaço branco, grade regular, tipografia neutra e legível, cor de ação única. Fotos consistentes (mesmo fundo e luz).
Erros: fotos desiguais, preço pouco visível, muitos banners competindo, falta de selos de confiança, carrinho escondido.` },
  { id: "servicos_local", label: "Serviços locais (clínica, estética, saúde, consultório)", hint: "Agendamento, confiança, localização",
    playbook: `Objetivo: transmitir cuidado e confiança e levar ao agendamento por WhatsApp/ligação.
Sequência: 1 hero com a promessa de cuidado + foto humana (profissional ou paciente satisfeito) + botão "agendar" e WhatsApp; 2 especialidades/serviços em cards com ícone; 3 sobre o profissional/equipe com registro profissional; 4 como é o atendimento em 3 passos; 5 antes e depois ou resultados (com cuidado e ética); 6 estrutura da clínica (fotos); 7 depoimentos com nome e foto; 8 convênios/formas de pagamento; 9 perguntas frequentes; 10 localização com mapa, horários e contatos; 11 chamada final com botão de agendar; botão flutuante do WhatsApp.
Estilo: leve e acolhedor, branco e tons suaves da marca (azul/verde/rosa claros), cantos arredondados, fotos reais e calorosas, ícones de linha, tipografia amigável. Passar limpeza e segurança.
Erros: foto de banco de imagens genérica, linguagem técnica demais, falta de endereço e horário, nenhum botão de contato fixo.` },
  { id: "restaurante", label: "Restaurante / gastronomia / delivery", hint: "Cardápio, fotos que dão fome, pedido e reserva",
    playbook: `Objetivo: dar fome e facilitar o pedido ou a reserva.
Sequência: 1 hero com foto grande e apetitosa do prato principal (luz quente, vapor, close), nome e uma frase curta, botões "Pedir agora" e "Ver cardápio"; 2 destaques/mais pedidos em cards com foto e preço; 3 cardápio por categorias (abas) com foto, descrição curta e preço; 4 história/diferencial (ingredientes, família, receita); 5 ambiente (galeria); 6 como pedir (delivery/retirada/reserva) com ícones; 7 depoimentos ou avaliações; 8 localização, horários e contato com mapa; 9 chamada final; rodapé com redes sociais.
Estilo: fotografia gastronômica como protagonista, cores quentes (vermelho, laranja, mostarda, marrom) ou escuras elegantes para alta gastronomia, tipografia com personalidade (serifada ou manuscrita nos títulos) combinada com sans simples. Texturas de papel/madeira com moderação.
Erros: fotos escuras ou sem apetite, cardápio em PDF ilegível, falta de botão de pedido, horário escondido.` },
  { id: "fitness", label: "Academia / fitness / esporte", hint: "Energia, planos, matrícula",
    playbook: `Objetivo: gerar matrícula ou aula experimental.
Sequência: 1 hero em tela cheia com foto/vídeo de treino intenso, manchete curta e forte, botão "Aula grátis"; 2 números/diferenciais (equipamentos, horários, professores); 3 modalidades em cards com foto; 4 planos e preços (3 cards com o do meio destacado); 5 transformações/depoimentos (antes e depois autorizado); 6 equipe de professores; 7 estrutura (galeria); 8 como começar em 3 passos; 9 horários e unidades com mapa; 10 chamada final com formulário curto.
Estilo: escuro com cor de energia (amarelo, verde-limão, laranja ou vermelho), tipografia condensada em caixa alta, fotos com contraste alto e movimento, diagonais e recortes, botões grandes. Marcas de impacto, números grandes.
Erros: foto estática de banco de imagens, preços escondidos, sem botão de matrícula visível, excesso de efeitos que cansam.` },
  { id: "profissional", label: "Advocacia / contabilidade / consultoria (autoridade)", hint: "Credibilidade, sobriedade, contato qualificado",
    playbook: `Objetivo: passar autoridade e segurança e gerar contato qualificado.
Sequência: 1 hero sóbrio com a promessa (resolver problema X) + foto do profissional + botão "Falar com especialista"; 2 áreas de atuação em cards; 3 sobre o escritório/profissional (história, registro, anos de experiência); 4 como trabalhamos (processo em passos); 5 resultados e números; 6 depoimentos ou casos (respeitando sigilo); 7 artigos/conteúdo; 8 perguntas frequentes; 9 contato com formulário, WhatsApp, endereço e mapa.
Estilo: sóbrio e elegante — azul-marinho, grafite, branco e um acento dourado ou verde-escuro; fontes serifadas nos títulos com sans limpa no texto; muito espaço, grade rígida, ícones finos, fotografia profissional em preto e branco ou cores contidas. Nada infantil nem exagerado.
Erros: linguagem jurídica pesada, clichê de balança e martelo em excesso, foto de banco genérica, ausência de registro profissional e contato.` },
  { id: "imobiliaria", label: "Imobiliária / construtora / empreendimento", hint: "Imóveis, plantas, tour, leads de corretor",
    playbook: `Objetivo: apresentar o imóvel/empreendimento e capturar o lead.
Sequência: 1 hero com render ou foto grande do empreendimento, nome, localização, uma linha de diferencial e botão "Quero saber mais" com formulário; 2 números do projeto (metragens, quartos, vagas, entrega); 3 diferenciais e lazer (ícones e fotos); 4 plantas com abas; 5 galeria/perspectivas; 6 localização com mapa e pontos próximos; 7 construtora/credibilidade; 8 simulação/condições; 9 formulário final e WhatsApp do corretor.
Estilo: premium e arejado, fotografia/renderização de alta qualidade, tipografia fina e elegante, paleta neutra com um acento (verde, dourado, azul), muito espaço em branco, animações suaves de galeria. Selos de construtora e CRECI.
Erros: renders de baixa qualidade, planta ilegível, mapa escondido, formulário longo.` },
  { id: "saas", label: "SaaS / app / tecnologia", hint: "Produto digital, demo, planos",
    playbook: `Objetivo: explicar o produto rápido e levar ao teste grátis ou à demo.
Sequência: 1 hero com manchete do benefício, subtítulo, dois botões (principal "Começar grátis" e secundário "Ver demo") e screenshot/mockup do produto grande abaixo ou ao lado; 2 logos de clientes; 3 problema → solução; 4 recursos em grid ou em blocos alternados com screenshot; 5 como funciona em 3 passos; 6 integrações; 7 casos/depoimentos com métricas; 8 planos (3 colunas, plano do meio destacado, alternância mensal/anual); 9 segurança/certificações; 10 FAQ; 11 chamada final; rodapé grande com colunas.
Estilo: limpo e moderno — fundo claro ou escuro com degradês suaves, cartões com bordas finas e sombras suaves, cantos de 12–20 px, tipografia Inter/Geist, ilustrações de interface reais, ícones de linha, um acento vibrante (violeta, azul, verde). Glassmorphism com moderação.
Erros: screenshot genérico sem foco, jargão técnico, muitos recursos sem hierarquia, planos confusos.` },
  { id: "agencia", label: "Agência / portfólio / criativo", hint: "Mostrar trabalho e personalidade",
    playbook: `Objetivo: provar talento e gerar contato de clientes.
Sequência: 1 hero ousado (manchete grande, tipografia expressiva ou animação), 2 trabalhos selecionados em grade ou cards gigantes, 3 serviços, 4 processo, 5 clientes, 6 depoimentos, 7 sobre/equipe com personalidade, 8 contato com chamada criativa.
Estilo: editorial e autoral — tipografia enorme, contraste forte, grades quebradas, fotos recortadas, cursores e transições; paleta limitada (preto/branco + 1 cor). Cada projeto com capa forte e título curto.
Erros: portfólio sem contexto do resultado, navegação confusa, excesso de efeitos que atrapalha ler.` },
  { id: "educacao", label: "Cursos / escola / mentoria (institucional)", hint: "Escola, faculdade, curso presencial, comunidade de ensino",
    playbook: `Objetivo: apresentar a proposta de ensino e levar à matrícula/contato.
Sequência: hero com foto de alunos reais + proposta + botão "Matricule-se", diferenciais, cursos/turmas em cards com duração e preço, metodologia, professores, depoimentos de alunos, estrutura, calendário/datas, perguntas frequentes, formulário de interesse, rodapé completo.
Estilo: amigável e confiável, cores vivas porém organizadas, ilustrações ou fotos reais de alunos felizes, tipografia arredondada legível, cartões claros, bastante ícone. Passar acolhimento e resultado.
Erros: foto de banco genérica, falta de datas e valores, formulário escondido.` },
  { id: "institucional", label: "Institucional / indústria / B2B", hint: "Empresa, catálogo de soluções, orçamento",
    playbook: `Objetivo: mostrar porte e competência e gerar pedidos de orçamento.
Sequência: hero com foto de operação/produto + proposta + botão "Solicitar orçamento", números da empresa, soluções/produtos em cards, diferenciais, setores atendidos, cases e clientes, certificações, processo, sobre/história, notícias, contato com formulário e endereço.
Estilo: corporativo moderno — azul/grafite/verde industrial, grid rigoroso, fotografia real de fábrica e equipe, ícones de linha, tipografia sans neutra. Densidade média, muita clareza.
Erros: texto institucional vazio ("somos líderes"), fotos genéricas, formulário longo, catálogo difícil de achar.` },
  { id: "evento", label: "Evento / igreja / comunidade / ONG", hint: "Programação, inscrição, causa, doação",
    playbook: `Objetivo: engajar e converter em inscrição, presença ou doação.
Sequência: hero com data, local e chamada emocional + botão principal (inscrever, participar, doar), sobre a causa/missão, programação ou agenda, palestrantes/lideranças, galeria de momentos, depoimentos, como participar/apoiar, patrocinadores, perguntas frequentes, contato.
Estilo: caloroso e humano — fotografia de pessoas, cores da marca com um acento vivo, tipografia expressiva nos títulos, formas orgânicas. Emoção primeiro, informação depois.
Erros: agenda difícil de achar, botão de doação/inscrição escondido, imagens frias.` },
  { id: "conteudo", label: "Blog / mídia / creator (bio e links)", hint: "Criador de conteúdo, newsletter, link na bio",
    playbook: `Objetivo: apresentar o criador e levar para os destinos (newsletter, produtos, redes).
Sequência: hero com foto do criador + frase de posicionamento + botão da newsletter ou produto principal, redes/seguidores como prova, conteúdos em destaque (cards), produtos/parcerias, sobre, depoimentos/menções, inscrição na newsletter, rodapé.
Estilo: personalidade acima de tudo — cores e tipografia próprias, ilustrações ou recortes, cartões grandes, muito espaço. Leve e rápido de ler.
Erros: tudo igual a um template genérico, vários botões brigando, foto pequena.` },
];

export const layoutCategoryById = (id: string) => LAYOUT_CATEGORIES.find((c) => c.id === id);

/** Estilos visuais que o usuário pode escolher (ou deixar a IA decidir pela categoria e pelas referências) */
export interface LayoutStyle { id: string; label: string; look: string; fonts: string[] }
export const LAYOUT_STYLES: LayoutStyle[] = [
  { id: "ios", label: "Moderno estilo iPhone / Apple", look: "Limpo e premium: muito espaço em branco (ou preto profundo), cantos grandes (20–32 px), cartões com vidro fosco (glassmorphism) e sombras suaves em camadas, degradês sutis, tipografia grande e fina com títulos em peso semibold, ícones arredondados, mockups de aparelhos, botões em pílula. Transmite polimento e simplicidade.", fonts: ["Inter", "Plus Jakarta Sans", "Manrope"] },
  { id: "dark_premium", label: "Escuro premium", look: "Fundo quase preto, texto branco, um acento luminoso (violeta, azul-elétrico, dourado ou verde), cartões com borda fina semitransparente e brilho nas bordas, degradês radiais atrás dos títulos, fotos com contraste alto. Sofisticado e tecnológico.", fonts: ["Inter", "Geist", "Sora"] },
  { id: "clean_saas", label: "Limpo e leve (SaaS)", look: "Fundo claro, cartões brancos com bordas finas e sombras suaves, cantos de 12–16 px, paleta contida com um azul/violeta de ação, ilustrações de interface reais, ícones de linha, muito alinhamento e grade. Profissional e claro.", fonts: ["Inter", "DM Sans", "Plus Jakarta Sans"] },
  { id: "bold_editorial", label: "Editorial ousado", look: "Tipografia gigante e expressiva, contraste forte (preto, branco e uma cor vibrante), grades quebradas, recortes de fotos, números enormes, linhas finas e etiquetas. Cheio de personalidade, como uma revista.", fonts: ["Anton", "Bebas Neue", "Space Grotesk", "Playfair Display"] },
  { id: "luxury", label: "Luxo / elegante", look: "Fundo creme, off-white ou preto, tipografia serifada fina nos títulos (alto contraste), detalhes dourados ou bronze, fotografia grande e aerada, muito respiro, linhas delicadas, botões discretos. Sofisticado e calmo.", fonts: ["Playfair Display", "Cormorant Garamond", "Inter"] },
  { id: "warm_organic", label: "Caloroso / orgânico", look: "Tons terrosos e quentes (areia, terracota, oliva, mostarda), formas orgânicas arredondadas, texturas de papel, fotografia natural, tipografia amigável com serifa suave, ilustrações desenhadas à mão. Acolhedor e humano.", fonts: ["Fraunces", "DM Serif Display", "Nunito"] },
  { id: "playful", label: "Divertido / colorido", look: "Cores vivas e saturadas, formas geométricas e blobs, ilustrações e mascote, cantos bem arredondados, adesivos e selos, tipografia arredondada e gorda, sombras chapadas deslocadas. Energia e simpatia.", fonts: ["Poppins", "Baloo 2", "Fredoka"] },
  { id: "energy", label: "Energia / esporte / impacto", look: "Escuro com uma cor de impacto (amarelo, laranja, vermelho, verde-limão), tipografia condensada em caixa alta, diagonais, fotos de ação em alto contraste, números gigantes e faixas. Intenso e direto.", fonts: ["Bebas Neue", "Anton", "Oswald", "Montserrat"] },
  { id: "corporate", label: "Corporativo confiável", look: "Azul-marinho/grafite com acento, grade rígida, cartões claros, ícones de linha, fotografia real de equipe, tipografia sans neutra e legível, hierarquia clara. Sério e seguro.", fonts: ["Inter", "Source Sans 3", "IBM Plex Sans"] },
  { id: "gradient_tech", label: "Degradê tecnológico (aurora)", look: "Degradês fluidos de duas ou três cores (aurora, malha), texto com degradê nos destaques, cartões translúcidos, formas 3D suaves, brilhos discretos, botões com degradê. Futurista e atual.", fonts: ["Inter", "Sora", "Outfit"] },
];
export const layoutStyleById = (id: string) => LAYOUT_STYLES.find((s) => s.id === id);

/** Biblioteca de seções: nome, propósito e padrões de composição que funcionam */
export interface LayoutSectionDef { key: string; label: string; purpose: string; patterns: string }
export const LAYOUT_SECTIONS: LayoutSectionDef[] = [
  { key: "hero", label: "Hero (primeira dobra)", purpose: "Dizer em 3 segundos o que é, para quem e qual o próximo passo", patterns: "A) duas colunas: manchete + subtítulo + botões à esquerda, imagem/mockup do produto ou pessoa à direita; B) centralizado: manchete grande, subtítulo, botões e mockup largo logo abaixo; C) tela cheia: foto/vídeo de fundo escurecido com texto à esquerda; D) com formulário em cartão à direita. Sempre: cabeçalho enxuto (logo, 4–5 links, botão), um botão principal dominante, prova social minúscula perto do botão." },
  { key: "prova_rapida", label: "Barra de prova rápida", purpose: "Tirar a dúvida inicial com números e logos", patterns: "Faixa fina com 3–5 números grandes (clientes, anos, avaliação) ou logos em cinza; selos de segurança/garantia." },
  { key: "problema", label: "Problema / dor", purpose: "Gerar identificação", patterns: "Título que descreve a dor em palavras do cliente + 3–4 cartões com ícone e frase curta, ou lista com ícones de X; fundo diferente do hero para quebrar o ritmo." },
  { key: "solucao", label: "Solução / apresentação", purpose: "Apresentar o produto/método como a saída", patterns: "Imagem grande do produto + texto curto e 3 bullets; ou título central com cartões em grade; selo do método." },
  { key: "como_funciona", label: "Como funciona", purpose: "Mostrar que é simples", patterns: "3–5 passos numerados em linha (círculos numerados ligados por linha) ou em zigue-zague com ilustrações." },
  { key: "beneficios", label: "Benefícios / recursos", purpose: "Mostrar valor", patterns: "Grid 3×2 de cartões com ícone, título e uma linha; ou blocos alternados (imagem de um lado, texto do outro); destaque em um recurso principal com bento grid." },
  { key: "demo", label: "Demonstração / produto", purpose: "Fazer ver o produto em uso", patterns: "Mockup de tela/aparelho grande no centro com anotações, vídeo com botão play, carrossel de telas, abas que trocam a imagem." },
  { key: "depoimentos", label: "Depoimentos / prova social", purpose: "Reduzir o risco percebido", patterns: "3 cartões com foto, nome, cargo e frase; um depoimento grande em destaque com foto; prints de conversa ou resultado; avaliações com estrelas." },
  { key: "autoridade", label: "Autoridade / quem somos", purpose: "Dar rosto e credibilidade", patterns: "Foto grande recortada ao lado de texto curto, credenciais em lista, selos e números; linha do tempo curta." },
  { key: "oferta", label: "Oferta / planos / preço", purpose: "Mostrar o que recebe e quanto custa", patterns: "Cartão central com lista do que está incluído, preço ancorado (de/por), parcelas, botão grande e selos; ou 3 planos com o do meio destacado e etiqueta 'mais escolhido'." },
  { key: "garantia", label: "Garantia", purpose: "Eliminar o medo de errar", patterns: "Selo grande de garantia com prazo, texto curto, ícone de escudo; fundo suave." },
  { key: "faq", label: "Perguntas frequentes", purpose: "Quebrar objeções finais", patterns: "Lista de acordeões (4–8 perguntas), com um aberto de exemplo; coluna de título à esquerda e perguntas à direita." },
  { key: "cta_final", label: "Chamada final", purpose: "Fechar a ação", patterns: "Faixa de cor forte com a promessa repetida, botão principal e linha de garantia; opcionalmente formulário curto." },
  { key: "rodape", label: "Rodapé", purpose: "Navegação, contato e confiança", patterns: "Colunas de links, contatos, redes, selos de segurança, aviso legal; fundo escuro e discreto." },
  { key: "galeria", label: "Galeria / portfólio", purpose: "Mostrar trabalhos ou ambiente", patterns: "Grade assimétrica (bento) de fotos com legenda no hover; carrossel com miniaturas; filtro por categoria." },
  { key: "cardapio", label: "Cardápio / catálogo", purpose: "Listar itens com preço", patterns: "Abas de categorias; cartões com foto, nome, descrição curta, preço e botão adicionar." },
  { key: "equipe", label: "Equipe", purpose: "Humanizar", patterns: "Cartões com foto quadrada, nome, função e links; destaque para o responsável." },
  { key: "resultados", label: "Casos / resultados", purpose: "Provar com números", patterns: "Cartões de caso com métrica grande (+312%), logo do cliente e frase; antes/depois." },
  { key: "contato", label: "Contato / localização", purpose: "Facilitar o contato", patterns: "Mapa de um lado, formulário curto de outro; cartões com WhatsApp, telefone, e-mail, endereço e horários." },
  { key: "formulario", label: "Formulário de captura", purpose: "Capturar o lead", patterns: "Cartão limpo com título, 2–4 campos grandes, botão cheio e microtexto de privacidade." },
  { key: "mascote", label: "Apresentação do mascote", purpose: "Dar personalidade à marca", patterns: "Mascote grande ao lado de balão de fala e texto curto; mascote aparecendo em cantos das seções." },
  { key: "comparativo", label: "Comparativo", purpose: "Mostrar por que escolher você", patterns: "Tabela de duas ou três colunas com ✓ e ✗, coluna da marca destacada." },
  { key: "integracoes", label: "Integrações / parceiros", purpose: "Mostrar ecossistema", patterns: "Grade de logos em cartões, linhas conectando ao produto." },
  { key: "blog", label: "Conteúdo / blog", purpose: "Autoridade e SEO", patterns: "3 cartões de artigos com imagem, categoria, título e leitura; link 'ver todos'." },
];
export const layoutSectionByKey = (k: string) => LAYOUT_SECTIONS.find((s) => s.key === k);

export const LAYOUT_SKILL = `# SKILL · DIRETOR DE UX/UI DE SITES (layouts para o GPT Image)

Você é um diretor de arte e designer de UX/UI sênior de uma agência de marketing digital brasileira. Cria layouts de sites que parecem produzidos por um estúdio premiado e que vendem. Seu trabalho é desenhar, em IMAGENS, cada seção de um site (primeiro o hero) para o usuário aprovar e depois transformar em código. Pense como designer E como estrategista de conversão.

## 1. Como você trabalha
1. Entenda o NEGÓCIO: o que vende, para quem, qual a ação desejada (comprar, agendar, pedir orçamento, inscrever-se), o que o diferencia, o tom de voz.
2. Leia o SITE ATUAL (prints): o que está bom (mantenha), o que está fraco (corrija), que conteúdo existe (textos, produtos, números, depoimentos) e que seções já tem. Reaproveite o conteúdo real; nunca invente números, preços, depoimentos de pessoas reais ou logos de clientes.
3. Escolha a CATEGORIA do site e siga o manual dela (ordem das seções, hero, estilo, erros).
4. Defina o SISTEMA DE DESIGN antes das telas: estilo, paleta, tipografia, grade, cantos, botões, cartões, ícones, tipo de imagem, mascote (se fizer sentido).
5. Planeje as SEÇÕES de cada página, com o texto exato (copy) de cada uma.
6. Gere uma imagem por seção, sempre na mesma linguagem visual, na ordem de rolagem (hero primeiro).

## 2. Princípios de UX/UI (aplique sempre)
- HIERARQUIA: em cada seção há UM foco. O olho percorre: manchete → imagem/prova → botão. Tamanho, peso, cor e espaço dizem o que é importante. Máximo de 3 níveis de texto por seção (título, subtítulo, apoio).
- ESCALA TIPOGRÁFICA: manchete do hero 56–88 px (desktop), títulos de seção 36–48 px, subtítulos 18–22 px, texto 16–18 px, microtexto 13–14 px. Linhas de texto com 45–75 caracteres. Entrelinha 1.4–1.6 no texto e 1.05–1.2 nos títulos grandes. Títulos curtos (até 12 palavras).
- ESPAÇAMENTO: use múltiplos de 8 px. Seções com 96–144 px de respiro vertical no desktop (64–88 no mobile). Mais espaço em volta do que é importante. Conteúdo em contêiner de 1120–1280 px, grade de 12 colunas, margens consistentes.
- CONTRASTE E COR: texto com contraste mínimo 4.5:1. Uma cor de AÇÃO (botões) usada só para ações. Paleta: 1 cor da marca, 1 acento, neutros (fundo, superfície, texto, texto suave, borda). Alterne fundos (claro/claro-alt/escuro/cor da marca) para dar ritmo à rolagem. Não use mais de 3 cores fortes.
- BOTÕES: primário cheio com cor de ação, altura 48–56 px, cantos coerentes com o sistema (pílula ou 12–16 px), texto de verbo ("Quero começar", "Agendar agora"), um primário por seção, secundário em contorno/ghost. Mostre também estado de seta/ícone quando ajudar.
- CARTÕES: mesma altura, mesmo raio, mesma sombra; ícone ou imagem no topo, título, uma linha; borda fina ou sombra suave (não os dois pesados).
- IMAGENS: um estilo só em todo o site (fotografia real coerente OU ilustração OU renders 3D). Pessoas reais sorrindo e em contexto; produto bem iluminado; mockups limpos de telas e aparelhos. Nada de banco de imagens genérico e frio.
- PROVA SOCIAL: perto de cada ação importante (estrelas, número de clientes, selo, depoimento curto com foto e nome).
- REDUZIR ATRITO: formulários curtos, rótulos claros, preço transparente, garantia visível, perguntas frequentes respondidas, contato fixo (WhatsApp) em serviços locais.
- ESCANEABILIDADE: listas com ícones, números grandes, destaque em negrito nas palavras-chave, cartões em vez de parágrafos. Nada de parede de texto.
- MOBILE FIRST: pense na versão de celular (uma coluna, botões largos, menu hambúrguer, imagens empilhadas). Se o formato pedido for mobile, desenhe em tela de celular em pé.
- ACESSIBILIDADE: tamanho mínimo de texto, contraste, áreas de toque de 44 px, não depender só de cor.
- CONSISTÊNCIA: tudo o que se repete (botão, cartão, ícone, título de seção, selo) tem a MESMA aparência em todas as seções.

## 3. Tipografia e pareamento
- Dois níveis: uma fonte para TÍTULOS (com personalidade) e uma para TEXTO (neutra e legível). Máximo 2 famílias.
- Combinações que funcionam: Inter (tudo, com pesos 400/600/800 e títulos com tracking negativo); Plus Jakarta Sans ou Manrope (moderno e amigável); Sora/Space Grotesk (tech); Playfair Display ou Cormorant + Inter (luxo/jurídico); Poppins/Nunito (educação e divertido); Bebas Neue/Anton/Oswald + Inter (esporte e impacto); Fraunces + DM Sans (caloroso).
- Destaque de palavras em títulos: degradê de texto, sublinhado desenhado, marca-texto ou cor de acento — sempre numa ou duas palavras, não na frase inteira.
- Números e preços grandes e em peso forte.

## 4. Biblioteca de seções (ordem e padrões)
Use as seções do catálogo (hero, prova rápida, problema, solução, como funciona, benefícios, demonstração, depoimentos, autoridade, oferta, garantia, perguntas frequentes, chamada final, rodapé, galeria, cardápio, equipe, resultados, contato, formulário, mascote, comparativo, integrações, blog). Cada seção tem um padrão de composição (veja o catálogo no prompt). Varie a composição entre seções vizinhas (não repita "3 cartões" em sequência), mas mantenha o mesmo sistema visual.

## 5. Mascote e elementos de marca
- Um mascote só faz sentido quando a marca é simpática, infantil, educacional, esportiva, de app ou de produto digital com tom leve. Em marcas sóbrias (jurídico, saúde séria, B2B), NÃO use.
- Quando houver, descreva-o uma vez (forma, cores da marca, expressão, estilo 3D ou vetor) e use a MESMA imagem de referência em todas as seções em que ele aparece (hero, depoimentos, rodapé, 404).
- Elementos de marca: padrão geométrico, formas de fundo, selo, ícones em um mesmo traço.

## 6. Como escrever para o GPT Image (a imagem é o site)
- A saída é UMA SEÇÃO do site como se fosse um print real de navegador, SEM moldura de navegador, SEM mockup em perspectiva: a imagem é a seção em tela cheia, plana, de borda a borda, na proporção indicada.
- Texto: escreva o TEXTO EXATO que aparece (manchete, subtítulo, rótulos de botões, itens de menu, números). Use pouco texto por seção: manchete, 1–2 linhas, 3–6 itens curtos, botões. Todo texto em português do Brasil, sem erros de ortografia, sem lorem ipsum, sem texto fantasma ilegível. Para o que não precisa ser lido (parágrafos longos), use poucas linhas curtas e plausíveis.
- Cada seção deve incluir os elementos de interface reais: cabeçalho (no hero), botões com texto, ícones, cartões, formulários com campos e rótulos, selos.
- Descreva a COMPOSIÇÃO com posições: "coluna esquerda 45%: ...; coluna direita 55%: ...".
- Mantenha a mesma paleta (cite os hexadecimais), a mesma tipografia (cite as fontes) e o mesmo estilo de cantos e sombras em todas as seções. Se houver guia de estilo e hero aprovado, siga-os como referência visual.
- Imagens dentro da seção: descreva o que mostram (pessoa, produto, ambiente, mockup) em estilo coerente e fotografia realista; não invente logos de marcas reais nem rostos de celebridades.
- Evite: sobrecarga de elementos, texto minúsculo, degradês arco-íris, sombras exageradas, 5 estilos diferentes na mesma tela, fundo que briga com o texto.

## 7. Checklist final por seção
[ ] Um foco claro e hierarquia visível [ ] Texto exato e curto, em português correto [ ] Botão primário evidente (se a seção pede ação) [ ] Contraste legível [ ] Mesma paleta, fontes, cantos e sombras do sistema [ ] Respiro generoso [ ] Imagens coerentes e realistas [ ] Prova social onde há decisão [ ] Composição diferente da seção vizinha [ ] Parece um site de verdade, pronto para virar código.`;

/** Estilos e seções em texto, para os prompts */
export const layoutStylesBlock = () => `# ESTILOS VISUAIS DISPONÍVEIS\n${LAYOUT_STYLES.map((s) => `- ${s.id} (${s.label}): ${s.look} Fontes sugeridas: ${s.fonts.join(", ")}.`).join("\n")}`;
export const layoutSectionsBlock = () => `# CATÁLOGO DE SEÇÕES (key: objetivo — padrões)\n${LAYOUT_SECTIONS.map((s) => `- ${s.key} (${s.label}): ${s.purpose}. ${s.patterns}`).join("\n")}`;
