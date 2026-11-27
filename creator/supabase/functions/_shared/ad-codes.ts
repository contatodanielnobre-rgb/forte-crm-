// Biblioteca de códigos do Criador de Anúncios (os "/atalhos").
// Este arquivo é público: vai para o navegador. Só tem o código, o nome e o grupo.
// O que cada código manda o gerador fazer fica em ad-skill.ts, que roda apenas no servidor.

export interface AdCode { id: string; name: string; group: string }
export interface AdCodeGroup { id: string; label: string; hint: string }

export const AD_CODE_GROUPS: AdCodeGroup[] = [
  { id: "datas", label: "Datas e promoções", hint: "Black Friday, Natal, liquidação, cupom" },
  { id: "estrategia", label: "Estratégia que converte", hint: "O motivo para a pessoa parar e clicar" },
  { id: "layout", label: "Composição", hint: "Como as peças se organizam" },
  { id: "foto", label: "Fotografia", hint: "Câmera, enquadramento e produto" },
  { id: "luz", label: "Luz", hint: "O clima da imagem" },
  { id: "estilo", label: "Estilo visual", hint: "A linguagem da peça" },
  { id: "letras", label: "Letras", hint: "O jeito da tipografia" },
  { id: "nicho", label: "Nichos", hint: "O que um designer daquele ramo faria" },
  { id: "canal", label: "Canal e formato", hint: "Onde o anúncio vai rodar" },
  { id: "elementos", label: "Elementos", hint: "Selos, etiquetas e detalhes" },
];

const make = (group: string, list: string): AdCode[] =>
  list.split("|").map((x) => { const i = x.indexOf(":"); return { id: x.slice(0, i).trim(), name: x.slice(i + 1).trim(), group }; });

export const AD_CODES: AdCode[] = [
  ...make("datas",
    "blackfriday:Black Friday|blacknovember:Black November|esquenta:Esquenta Black Friday|cybermonday:Cyber Monday|natal:Natal|anonovo:Ano Novo|carnaval:Carnaval|pascoa:Páscoa|diadasmaes:Dia das Mães|diadospais:Dia dos Pais|namorados:Dia dos Namorados|diadamulher:Dia da Mulher|diadascriancas:Dia das Crianças|diadoconsumidor:Dia do Consumidor|diadocliente:Dia do Cliente|festajunina:Festa Junina|voltaasaulas:Volta às aulas|verao:Verão|inverno:Inverno|primavera:Primavera|outubrorosa:Outubro Rosa|novembroazul:Novembro Azul|halloween:Halloween|independencia:7 de Setembro|diadotrabalho:Dia do Trabalho|onzeonze:11.11|aniversario:Aniversário da loja|inauguracao:Inauguração|reabertura:Reinauguração|lancamento:Lançamento|prevenda:Pré-venda|liquidacao:Liquidação|queimadeestoque:Queima de estoque|ultimodia:Último dia|relampago:Oferta relâmpago|fimdesemana:Promoção de fim de semana|promodasemana:Oferta da semana|fretegratis:Frete grátis|cupom:Cupom|desconto:Percentual de desconto|depor:De / Por|parcelado:Parcelamento|cashback:Cashback|brinde:Brinde|combo:Combo|leve3pague2:Leve 3, pague 2|apartirde:Preço a partir de"),
  ...make("estrategia",
    "ofertadireta:Oferta direta|dorsolucao:Dor e solução|beneficio:Benefício principal|listabeneficios:Lista de benefícios|provasocial:Prova social|depoimento:Depoimento|avaliacao:Avaliação com estrelas|antesdepois:Antes e depois|comparativo:Comparativo|versus:Nós x o comum|passoapasso:Passo a passo|comofunciona:Como funciona|pergunta:Pergunta que prende|numero:Número em destaque|autoridade:Autoridade|bastidores:Bastidores|fundador:O dono aparece|equipe:A equipe|cliente:Cliente usando|ugc:Cara de conteúdo real|urgencia:Urgência|escassez:Vagas ou unidades limitadas|garantia:Garantia|objecao:Quebra de objeção|mitoverdade:Mito x verdade|perguntasrespostas:Perguntas e respostas|humor:Humor|meme:Linguagem de meme|nativo:Anúncio com cara de post|conversa:Conversa de mensagem|notificacao:Notificação do celular|convite:Convite para evento|captacao:Captar contatos|materialgratis:Material grátis|aulagratis:Aula grátis|teste:Teste grátis|orcamento:Orçamento grátis|avaliacaogratis:Avaliação grátis|agendamento:Agende o horário|pedidozap:Peça no WhatsApp|delivery:Peça e receba|baixarapp:Baixe o app|assinatura:Assinatura|revendedor:Seja revendedor|vagas:Vaga aberta|marca:Reconhecimento da marca|novidade:Novidade na loja|maisvendido:O mais vendido|presente:Ideia de presente|economia:Quanto você economiza"),
  ...make("layout",
    "heroproduto:Produto herói|produtogigante:Produto gigante|levitando:Produto no ar|pedestal:Produto no pedestal|vitrine:Vitrine|flatlay:Flat lay visto de cima|knolling:Objetos alinhados|gradeprodutos:Grade de produtos|mosaico:Mosaico de fotos|cardapio:Cardápio com preços|tabelaprecos:Tabela de preços|meioameio:Metade foto, metade cor|diagonal:Corte diagonal|numerogigante:Número gigante|tipoheroi:Letra é o herói|textoatras:Texto atrás do produto|centralizado:Simétrico central|textoesquerda:Texto à esquerda|textotopo:Texto em cima|textobase:Texto embaixo|cartoes:Cartões|moldura:Moldura|poster:Pôster|revista:Capa de revista|editorial:Página editorial|outdoor:Outdoor na rua|outdoor3d:Telão 3D|mockupcelular:Tela no celular|mockupnotebook:Tela no notebook|dashboard:Painel do sistema|nasmaos:Produto na mão|emuso:Produto em uso|ambiente:Ambiente real|portal:Saindo da moldura|explosao:Ingredientes em explosão|vistaexplodida:Vista explodida|caixaaberta:Caixa abrindo|carrinho:Carrinho de compras|sacola:Sacola de compras|circulo:Destaque em círculo|faixas:Faixas em fita|colunas:Colunas|assimetrico:Assimétrico|respiro:Muito respiro|capas:Capas em leque"),
  ...make("foto",
    "packshot:Foto de catálogo|closeup:Close|macro:Macro de textura|planomedio:Plano médio|planoaberto:Plano aberto|angulobaixo:Ângulo de baixo|plongee:Ângulo de cima|zenital:Visto de cima|tresquartos:Três quartos|drone:Visão de drone|grandeangular:Grande angular|teleobjetiva:Teleobjetiva|desfoque:Fundo desfocado|bokeh:Luzes desfocadas|foodstyling:Comida de estúdio|bebidagelada:Bebida gelada|splash:Respingo de líquido|vapor:Vapor quente|fumaca:Fumaça|congelado:Movimento congelado|movimento:Rastro de movimento|beleza:Foto de beleza|retrato:Retrato profissional|corpointeiro:Corpo inteiro|olharcamera:Olhando para a câmera|candido:Momento espontâneo|maos:Detalhe das mãos|joiamacro:Joia em macro|automotivo:Foto de carro|arquitetura:Foto de ambiente|interior:Interiores|esporte:Ação esportiva|documental:Documental|celular:Cara de foto de celular|analogico:Filme analógico|pb:Preto e branco"),
  ...make("luz",
    "luzestudio:Luz de estúdio|luznatural:Luz natural|horadourada:Hora dourada|horaazul:Hora azul|noite:Noite urbana|neonluz:Luz de neon|contraluz:Contraluz|luzrecorte:Luz de recorte|chavebaixa:Escuro dramático|chavealta:Claro e leve|luzdura:Sol duro com sombra|sombrafolhas:Sombra de folhas|velas:Luz quente de velas|janela:Luz de janela|holofote:Holofote|luzdecor:Gel colorido|amanhecer:Amanhecer|nublado:Luz suave de céu nublado|vitrineluz:Luz de vitrine|brilhopiso:Reflexo no chão"),
  ...make("estilo",
    "premium:Premium|luxo:Preto e dourado|minimalista:Minimalista|clean:Limpo e claro|corporativo:Corporativo|tech:Tecnologia escuro|neon:Neon|retro:Retrô|vintage:Vintage|anos90:Anos 90|y2k:Anos 2000|suico:Grid suíço|bauhaus:Bauhaus|brutalista:Brutalista|colagem:Colagem|papel:Papel recortado|gradiente:Gradiente suave|vidro:Vidro fosco|render3d:Render 3D|massinha:Massinha|ilustracao:Ilustração plana|desenho:Desenho à mão|anime:Anime|quadrinhos:Quadrinhos|pixelart:Pixel art|aquarela:Aquarela|cinematografico:Cinematográfico|realista:Fotorrealista|urbano:Urbano de rua|esportivo:Esportivo|organico:Natural orgânico|rustico:Rústico artesanal|gourmet:Gourmet|infantil:Infantil|feminino:Delicado|masculino:Marcante sóbrio|popvibrante:Cores vivas|pastel:Tons pastel|monocromatico:Uma cor só|duotone:Duas cores|gamer:Gamer|festa:Festivo|natureza:Natureza|saude:Saúde confiável|varejo:Varejo organizado"),
  ...make("letras",
    "impacto:Condensada de impacto|serifaeditorial:Serifa editorial|manuscrita:Manuscrita elegante|geometrica:Geométrica moderna|arredondada:Arredondada amigável|displayretro:Display retrô|estencil:Estêncil|giz:Letra de giz|pincel:Pincel|dourada:Letras douradas|metalica:Letras metálicas|neonletras:Letreiro neon|letras3d:Letras 3D|esportiva:Itálica esportiva|fina:Fina e espaçada|gigante:Palavra gigante|contorno:Letra em contorno|marcatexto:Destaque de marca-texto|duaspesos:Fina + negrito|caixaalta:Tudo em caixa alta"),
  ...make("nicho",
    "barbearia:Barbearia|salao:Salão de beleza|estetica:Estética|manicure:Unhas|odontologia:Dentista|clinica:Clínica médica|psicologia:Psicologia|nutricao:Nutrição|fisioterapia:Fisioterapia|farmacia:Farmácia|otica:Ótica|academia:Academia|crossfit:Crossfit|pilates:Pilates e yoga|petshop:Pet shop|veterinaria:Veterinária|restaurante:Restaurante|hamburgueria:Hamburgueria|pizzaria:Pizzaria|japones:Comida japonesa|marmita:Marmitas|acai:Açaí e sorvete|cafeteria:Cafeteria|confeitaria:Confeitaria|padaria:Padaria|chocolate:Chocolates|bar:Bar e cervejaria|bebidas:Distribuidora de bebidas|agua:Distribuidora de água|gas:Distribuidora de gás|mercado:Mercado|acougue:Açougue|hortifruti:Hortifrúti|moda:Moda|modapraia:Moda praia|calcados:Calçados|joias:Joias|cosmeticos:Cosméticos|perfumaria:Perfumaria|imobiliaria:Imobiliária|construtora:Construtora|materiais:Material de construção|moveis:Móveis|planejados:Móveis planejados|decoracao:Decoração|energiasolar:Energia solar|carros:Loja de carros|motos:Motos|oficina:Oficina|lavacar:Lava-rápido|pneus:Pneus|provedor:Provedor de internet|telefonia:Celulares|informatica:Informática|assistencia:Assistência técnica|eletronicos:Eletrônicos|games:Loja de games|plataformajogos:Plataforma de jogos|streaming:Streaming|saas:Sistema (SaaS)|app:Aplicativo|agencia:Agência de marketing|curso:Curso online|escola:Escola|faculdade:Faculdade|idiomas:Idiomas|concurso:Concursos|advocacia:Advocacia|contabilidade:Contabilidade|credito:Crédito e financiamento|seguros:Seguros|viagens:Viagens|hotel:Hotel e pousada|eventos:Eventos|festas:Buffet e festas|fotografo:Fotografia|floricultura:Floricultura|brinquedos:Brinquedos|papelaria:Papelaria|livraria:Livraria|igreja:Igreja|agro:Agronegócio|industria:Indústria|limpeza:Limpeza|seguranca:Segurança|transporte:Transporte e mudança|lavanderia:Lavanderia|tatuagem:Tatuagem|musica:Música e estúdio"),
  ...make("canal",
    "feed:Feed 4:5|quadrado:Quadrado|story:Stories|reels:Capa de Reels|tiktok:TikTok|statuszap:Status do WhatsApp|linkface:Anúncio de link|display:Banner Google|pinterest:Pinterest|linkedin:LinkedIn|youtubeads:YouTube|panfleto:Panfleto|cartaz:Cartaz|telao:Telão|catalogo:Catálogo|bannersite:Banner de site"),
  ...make("elementos",
    "etiqueta:Etiqueta de preço|seloimpacto:Selo de desconto|selogarantia:Selo de confiança|contagem:Prazo da oferta|botao:Botão de ação|estrelas:Estrelas|aspas:Aspas de depoimento|seta:Seta de atenção|fita:Fita|confete:Confete|baloes:Balões|moedas:Moedas|presentes:Caixas de presente|icones:Ícones de benefício|parceiros:Logos parceiras|endereco:Endereço|whatsapp:Contato do WhatsApp|site:Endereço do site|arroba:Arroba da rede|qrcode:Espaço para QR code|sublinhado:Sublinhado à mão|brilhos:Brilhos discretos|particulas:Partículas|linhasluz:Linhas de luz|formas:Formas geométricas|textura:Textura de papel"),
];

export const AD_CODE_IDS = new Set(AD_CODES.map((c) => c.id));

/** Códigos escritos no meio do texto ("/blackfriday") */
export function codesIn(text: string): string[] {
  const out: string[] = [];
  for (const m of String(text ?? "").matchAll(/(?:^|\s)\/([a-z0-9]{2,24})\b/gi)) {
    const id = m[1].toLowerCase();
    if (AD_CODE_IDS.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

// ---------- opções do formulário (usadas pela tela e pelo servidor) ----------
export const AD_GOALS: { id: string; label: string; hint: string; codes: string[] }[] = [
  { id: "oferta", label: "Vender uma oferta", hint: "Preço, desconto ou combo", codes: ["ofertadireta"] },
  { id: "blackfriday", label: "Black Friday", hint: "Black Friday ou Black November", codes: ["blackfriday"] },
  { id: "data", label: "Data comemorativa", hint: "Natal, Dia das Mães, Carnaval…", codes: [] },
  { id: "lancamento", label: "Lançar novidade", hint: "Produto, serviço ou loja nova", codes: ["lancamento"] },
  { id: "mensagens", label: "Receber mensagens", hint: "Chamar para o WhatsApp ou direct", codes: ["pedidozap"] },
  { id: "leads", label: "Captar contatos", hint: "Orçamento, aula, material grátis", codes: ["captacao"] },
  { id: "marca", label: "Ficar conhecido", hint: "Mostrar a marca e o diferencial", codes: ["marca"] },
  { id: "evento", label: "Divulgar evento", hint: "Convite, inauguração, aula ao vivo", codes: ["convite"] },
];

export const AD_FORMATS: { id: string; label: string; use: string; w: number; h: number; main?: boolean }[] = [
  { id: "4:5", label: "Feed 4:5", use: "Feed do Instagram e Facebook (recomendado)", w: 1080, h: 1350, main: true },
  { id: "9:16", label: "Vertical 9:16", use: "Stories, Reels, TikTok e Status do WhatsApp", w: 1080, h: 1920 },
  { id: "1:1", label: "Quadrado 1:1", use: "Feed, Marketplace e catálogo", w: 1080, h: 1080 },
  { id: "1.91:1", label: "Paisagem 1.91:1", use: "Anúncio de link e Google", w: 1200, h: 628 },
];

export const AD_CTAS = ["Peça pelo WhatsApp", "Comprar agora", "Garanta o seu", "Saiba mais", "Agende seu horário", "Pedir agora", "Quero o desconto", "Fale com a gente", "Cadastre-se", "Reserve já", "Baixe o app", "Visite a loja"];

export const AD_PHOTO_ROLES: { id: string; label: string }[] = [
  { id: "product", label: "Meu produto" },
  { id: "person", label: "Pessoa / equipe" },
  { id: "place", label: "Minha loja ou ambiente" },
  { id: "partner", label: "Logo de marca parceira" },
  { id: "style", label: "Estilo que eu gosto" },
  { id: "other", label: "Outro" },
];

/** Limite da API de imagem da OpenAI por geração; o servidor escolhe as mais importantes */
export const AD_MAX_MODEL_IMAGES = 16;
/** Quantos arquivos a pessoa pode anexar num anúncio */
export const AD_MAX_FILES = 20;
