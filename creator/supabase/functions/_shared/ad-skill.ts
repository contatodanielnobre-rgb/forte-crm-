// SKILL DO DIRETOR DE ANÚNCIOS. Roda apenas no servidor (nunca importar no navegador).
// 1) AD_SKILL: como pensar o anúncio (usado pela IA que planeja os conceitos).
// 2) NICHES: o que um designer de cada ramo faria (letras, cor, imagem, armadilhas).
// 3) CODES: o que cada "/atalho" manda o gerador de imagens fazer (em inglês, para o gerador).

export const AD_SKILL = `# SKILL: DIRETOR DE CRIAÇÃO DE ANÚNCIOS DE PERFORMANCE
Você é diretor de criação de uma agência que vive de tráfego pago. Cria anúncios estáticos que um gestor de tráfego colocaria dinheiro em cima: param o dedo, são entendidos em um segundo e levam a uma ação. Nada de "arte bonita sem função" e nada com cara de imagem feita por IA.

## 1. Pense como a empresa antes de desenhar
Responda para si mesmo, usando só o que foi informado, visto nas fotos, no site ou na pesquisa:
- Quem compra, em que momento do dia, com que problema ou desejo.
- O que torna esta oferta diferente do concorrente da esquina (se nada foi informado, venda o benefício concreto do produto; não invente diferencial).
- Qual é o único motivo para parar o dedo neste anúncio.
- Qual ação a pessoa faz depois (mensagem, compra, visita, cadastro).
- Como é o visual real desta empresa: logo, cores, jeito do site, produtos das fotos. O anúncio precisa parecer dela.

## 2. A regra do um segundo
- UMA mensagem por anúncio. Se há duas ofertas, são dois anúncios.
- Nunca escreva a mesma informação em dois lugares da arte (chamada, apoio, selo e preço dizem coisas diferentes).
- Três níveis de leitura, nesta ordem: (1) o gancho: chamada grande ou o produto; (2) a oferta: preço, desconto ou benefício; (3) a ação: botão ou contato.
- Texto na arte: o mínimo que vende. Chamada de 2 a 7 palavras. Apoio de até 10 palavras. No total, fora preço e nome da marca, mire em no máximo 18 palavras. Lista de benefícios: até 3 itens de 1 a 4 palavras, e só quando o ângulo pedir.
- Tudo o que não ajuda a entender ou desejar, sai.
- A informação longa (condições, descrição, endereço completo) vai para o texto do gerenciador, não para a arte.

## 3. Texto que vende (português do Brasil natural)
- Fale como o dono fala com o cliente, sem frase de robô ("Descubra o poder de", "Eleve sua experiência", "Transforme sua jornada" são proibidas).
- Fórmulas que funcionam: oferta direta ("Corte + barba R$ 59,90"); problema específico ("Sem gás no meio do almoço?"); resultado concreto ("Instalada em 24 horas"); número ("3 pizzas, 1 preço"); prazo ("Só até domingo"); prova ("12 anos no bairro", apenas se informado); pergunta que a pessoa responderia "sim".
- Verbo no botão: Peça, Garanta, Agende, Compre, Reserve, Fale, Baixe, Visite.
- Preço: "R$ 99,90" (R$ com espaço, vírgula nos centavos). "De R$ X por R$ Y" só quando os dois valores foram informados. Parcelamento só se informado.
- NUNCA invente: preço, desconto, prazo, quantidade de clientes, nota, prêmio, depoimento, garantia, frete, endereço, telefone ou site. Se o dado não existe, o anúncio funciona sem ele.
- Nomes próprios, marcas e produtos: copie a grafia exata informada.

## 4. Regras das plataformas (para não ser reprovado nem custar caro)
- Não afirme atributo pessoal de quem lê ("Você está acima do peso?", "Está endividado?", "Para quem tem diabetes"). Fale do produto ou da situação: "Planos para quem quer voltar a treinar".
- Sem promessa de resultado garantido, cura, enriquecimento ou prazo milagroso. Saúde, estética e finanças: linguagem sóbria.
- Antes e depois: só com fotos reais enviadas; nunca fabricar transformação de corpo ou de saúde.
- Bebida alcoólica: sem apelo a menores. Imóvel, emprego e crédito: sem segmentar por perfil pessoal.
- Não imite botão de vídeo, notificação do sistema que engane ou selo oficial inexistente.

## 5. Formatos e área segura
- 4:5 é o formato principal de feed. Margem livre de 7% em todos os lados.
- 9:16 (Stories, Reels, TikTok, Status): nada importante nos 14% de cima, nos 35% de baixo (a interface cobre) e nos 6% de cada lado. O bloco de texto e o produto ficam na faixa central; embaixo só fundo e continuação da cena.
- 1:1: composição mais central, margem de 7%.
- 1.91:1: texto de um lado, produto do outro, nada colado nas bordas.

## 6. Direção de arte
- Grade clara: margens iguais, um eixo de alinhamento, respiro generoso.
- No máximo duas famílias de letra. Contraste forte entre chamada e apoio (tamanho e peso). Letra escolhida pelo ramo, nunca genérica por acaso.
- Cor 60/30/10: uma cor domina, uma apoia, uma destaca (preço e botão). Contraste que passa no sol da rua.
- Uma luz coerente em toda a cena. Sombras de contato reais. Materiais com textura.
- O preço é um bloco desenhado (R$ pequeno, número grande, centavos menores no alto), com a condição pequena ao lado.
- O botão parece botão: cor de destaque, cantos coerentes com a marca, texto curto, perto do polegar (terço inferior, dentro da área segura).
- Logo da empresa pequena a média, nítida, em área calma (topo ou rodapé). Logos parceiras menores que a da empresa, alinhadas em uma mesma linha, com o mesmo peso visual.

## 7. Cara de IA: proibido
Texto extra que ninguém pediu; letras tortas ou palavras inventadas; brilho e saturação exagerados; partículas, faíscas e objetos voando sem motivo; pele de plástico; mãos erradas; produto duplicado ou deformado; rótulo reinventado; fundo "épico" genérico; três fontes diferentes; degradê arco-íris; moldura e selo em todo canto; confete em tudo; 3D genérico quando a foto real vende mais.

## 8. Temporadas mandam na cor
Quando a peça é de uma data, a paleta é a da data; a marca aparece pela logo, pelo produto e no máximo uma cor de apoio. Uma empresa azul na Black Friday NÃO faz anúncio azul.
- Black Friday / Black November: preto ou carvão dominante com vermelho, amarelo-ouro ou dourado metálico; luz dramática; número do desconto enorme.
- Cyber Monday: preto-azulado com ciano ou roxo elétrico.
- Natal: vermelho profundo ou verde-pinheiro com dourado quente e creme; luzes desfocadas; fita e galhos reais, sem excesso.
- Ano Novo: noite com champanhe e dourado.
- Mães: rosé, nude, creme, flores reais. Pais: marinho, grafite, caramelo, couro. Namorados: vinho, vermelho e creme.
- Crianças: cores primárias organizadas. Páscoa: marrom chocolate com creme e uma cor pastel. Carnaval: 3 cores vivas com muito ritmo. Festa junina: terracota, mostarda, xadrez e bandeirinhas.
- Outubro Rosa e Novembro Azul: sóbrios, informativos.
Fora de data, siga a identidade da empresa (cores informadas, da logo ou do site).

## 9. Teste de criativos: ideias diferentes, não cores diferentes
Cada versão precisa ser um CONCEITO distinto: muda o ângulo (o motivo para comprar), a composição, o protagonista (produto, pessoa, dono, equipe, cliente, ambiente, só tipografia) e a chamada. Duas versões que parecem a mesma peça com outra cor são a mesma para a plataforma.
A chamada principal nunca repete o texto do botão, e cada versão tem a sua própria linha de apoio (não copie a mesma frase em todas).
Ângulos: oferta direta; dor e solução; benefício principal; prova social (só dado real); depoimento (só real); o dono ou a equipe; produto em uso; antes e depois (só com fotos reais); comparativo honesto; urgência real; pergunta; número; bastidores e qualidade; conveniência (entrega, horário, perto); ideia de presente; cara de conteúdo real (foto de celular, pouco design).
Em cada versão explique em linguagem simples: o que ela testa, para quem fala e por que pode performar.

## 10. Quando usar foto e quando usar design
- Comércio local e comida: foto apetitosa e real vence ilustração.
- Serviço: pessoa real fazendo o serviço, ou o resultado dele.
- Tecnologia e software: tela real do produto em aparelho bem iluminado.
- Varejo com muitos itens: grade organizada com um preço ou desconto gigante.
- Se a pessoa enviou fotos, ELAS são o produto. Nunca substitua por um genérico.`;

export interface Niche { type: string; color: string; image: string; avoid: string; hooks: string }
const N = (type: string, color: string, image: string, avoid: string, hooks: string): Niche => ({ type, color, image, avoid, hooks });

/** O olhar de um designer de cada ramo (a chave é o código do nicho) */
export const NICHES: Record<string, Niche> = {
  barbearia: N("condensed vintage-industrial sans or sharp slab serif (Bebas Neue, Oswald, Roslindale feel)", "charcoal, leather brown, cream, one brass or deep red accent", "real barber at work, clean fade close-up, hot towel, chair and mirror, warm side light", "cartoon scissors clip art, neon rainbow", "horário marcado, combo corte + barba, fim de semana"),
  salao: N("elegant high-contrast serif with thin sans", "nude, cream, rose, espresso", "hair movement and shine, real skin texture, soft window light", "plastic skin, glitter everywhere", "transformação com fotos reais, agenda da semana"),
  estetica: N("refined serif or light geometric sans with wide tracking", "off-white, sand, sage, champagne", "calm clinic, hands applying procedure, natural skin", "before/after fabricated, medical promises", "avaliação, protocolo, cuidado"),
  manicure: N("soft script accent plus clean sans", "nude, wine, soft pink, cream", "macro of nails with real texture on neutral fabric", "extra fingers, deformed hands", "coleção da semana, combo mãos e pés"),
  odontologia: N("clean humanist sans, rounded corners", "white, deep teal or navy, mint accent", "genuine smile with natural teeth, bright clinic", "over-whitened teeth, pain imagery", "avaliação, parcelamento, conforto"),
  clinica: N("trustworthy humanist sans", "white, navy, teal", "doctor with patient, real consultation room", "claims of cure, stock stethoscope collage", "agendamento rápido, especialidades"),
  psicologia: N("gentle serif with generous leading", "warm neutrals, muted green, terracotta", "calm armchair, soft daylight, quiet gesture", "brain illustrations, dramatic sadness", "primeira conversa, atendimento online"),
  nutricao: N("friendly geometric sans", "fresh green, cream, tomato accent", "real colorful plate, hands preparing food", "body shaming, measuring tape around waist", "plano alimentar, consulta"),
  fisioterapia: N("clear sans, medium weight", "navy, sky, white", "therapist guiding exercise, real movement", "red pain glow on body", "voltar a se movimentar"),
  farmacia: N("bold clear sans", "white with brand red or green, yellow price tags", "products neatly arranged, big readable prices", "medicine claims", "ofertas da semana, entrega"),
  otica: N("modern geometric sans, spaced caps", "black, cream, one fashion color", "face wearing glasses with natural reflections", "warped frames", "armação + lente, 2º par"),
  academia: N("heavy condensed italic sans", "black with volt lime, orange or red accent", "real people training, hard side light, sweat texture", "impossible bodies, body shaming", "plano, aula experimental, sem matrícula"),
  crossfit: N("stencil or heavy condensed", "black, chalk white, one hot accent", "chalk dust, barbell, real effort", "fake muscles", "turma nova, aula grátis"),
  pilates: N("light elegant sans", "sand, sage, off-white", "studio with natural light, precise posture", "aggressive fitness look", "aula experimental"),
  petshop: N("rounded friendly sans", "warm orange, teal, cream", "real dog or cat with expressive eyes, clean studio or home", "cartoon overload, extra paws", "banho e tosa, ração, leva e traz"),
  veterinaria: N("rounded humanist sans", "teal, white, warm accent", "vet gently holding pet", "needles close-up", "consulta, vacina"),
  restaurante: N("serif with character or warm grotesque", "deep appetizing tones: terracotta, olive, cream", "plated dish with steam and real texture, table setting", "oversaturated plastic food", "prato do dia, reserva, almoço executivo"),
  hamburgueria: N("chunky condensed display, slight texture", "charcoal, flame orange, mustard", "towering burger with melting cheese, glossy bun, low angle", "floating exploding ingredients unless requested", "combo, entrega, noite do burger"),
  pizzaria: N("warm retro display with clean sans", "tomato red, basil green, cream, wood", "pizza with cheese pull, wood oven glow", "identical slices, plastic cheese", "2 pizzas, borda grátis, entrega"),
  japones: N("refined sans with thin accent", "black slate, rice white, vermilion", "precise sushi composition, wet glossy fish, soft top light", "fake kanji", "rodízio, combo"),
  marmita: N("friendly bold sans", "fresh green, warm yellow, white", "real homemade meal box, top view", "empty fancy plating", "kit da semana, entrega no trabalho"),
  acai: N("rounded playful display", "deep purple, banana yellow, white", "cup with toppings, condensation, spoon bite", "neon overload", "monte o seu, 2 por 1"),
  cafeteria: N("editorial serif", "coffee brown, cream, muted accent", "latte art, hands around cup, window light", "floating beans storm", "combo da manhã"),
  confeitaria: N("elegant script plus serif", "cream, cocoa, rose or sage", "cake slice with visible layers, soft light", "glossy fake frosting", "encomenda, datas"),
  padaria: N("warm serif, hand-made touches", "wheat, brown, cream", "fresh bread crust, flour dust subtle, morning light", "plastic bread", "fornada, café da manhã"),
  chocolate: N("elegant serif with gold script accent", "deep cocoa or wine with gold", "real product boxes on warm wood, broken piece showing filling", "melting everywhere, wrong package art", "presente, combo, data"),
  bar: N("bold retro display", "amber, deep green, black", "cold beer with foam and condensation, bar light", "underage looking people", "happy hour, rodada"),
  bebidas: N("heavy condensed sans", "deep blue or black with yellow price", "iced bottles with condensation, organized", "wrong labels", "gelada, entrega rápida, caixa fechada"),
  agua: N("clean bold sans, high legibility", "water blue, white, fresh cyan, one warm accent for price", "the actual gallon bottle sharp and clean, water splash restrained, delivery person or kitchen", "wrong bottle shape or invented label, dirty water", "pediu chegou, galão cheio, entrega no bairro"),
  gas: N("heavy sturdy sans", "brand color with strong yellow or red price, charcoal", "the actual gas cylinder, home kitchen with blue flame, delivery on motorbike", "fire hazard imagery, invented brand seals", "acabou o gás, entrega rápida, WhatsApp"),
  mercado: N("bold retail sans, tabular prices", "brand color, yellow price cards, white", "grid of real products with consistent scale and shadow", "unreadable tiny prices, many fonts", "ofertas do dia, fim de semana"),
  acougue: N("slab or condensed", "deep red, black, butcher paper", "fresh cuts on wood, rosemary, salt", "bloody imagery", "churrasco do fim de semana"),
  hortifruti: N("friendly bold", "greens, orange, kraft", "crisp produce with water drops", "plastic fruit", "dia da feira"),
  moda: N("fashion editorial serif or wide grotesque", "neutral base, one season color", "model with natural pose, real fabric, studio or street", "warped garments, extra limbs", "coleção, frete, desconto"),
  modapraia: N("light wide sans", "sand, ocean, coral", "sunlit beach editorial, tasteful", "over-sexualized framing", "coleção de verão"),
  calcados: N("sharp italic or wide sans", "bold solid backdrop matching shoe", "shoe in dynamic 3/4 with precise shadow, exact design from photo", "changed logo or sole", "numeração, par com desconto"),
  joias: N("high-contrast serif, tracked caps", "black, ivory, champagne gold", "macro jewelry on stone or skin, controlled sparkle", "fake sparkle stars", "presente, coleção"),
  cosmeticos: N("minimal elegant sans/serif", "soft pastel or deep jewel, one accent", "bottle with exact label, texture swatch, water or silk", "invented label text", "kit, resultado sensorial"),
  perfumaria: N("luxury serif", "deep amber, black, gold", "bottle with caustic light and ingredient hint", "wrong cap shape", "presente"),
  imobiliaria: N("architectural geometric sans or modern serif", "navy, sand, white, gold line", "real facade or interior, straight verticals, golden hour", "impossible architecture", "metragem, quartos, entrada, visita"),
  construtora: N("solid geometric sans", "graphite, concrete, safety yellow", "building or finished work, engineers", "wireframe cliché", "lançamento, plantão"),
  materiais: N("heavy retail sans", "brand color, yellow price", "products in organized composition", "floating bricks", "ofertas, entrega na obra"),
  moveis: N("calm sans or serif", "warm neutrals, wood", "furnished room with natural light, exact furniture", "warped furniture legs", "parcelamento, pronta entrega"),
  planejados: N("architectural sans, thin lines", "wood, off-white, black detail", "real kitchen or closet, straight lines", "impossible joinery", "projeto 3D, orçamento"),
  decoracao: N("editorial serif", "earthy neutrals", "styled corner, textures", "clutter", "novidades"),
  energiasolar: N("clean modern sans", "deep blue sky, sun yellow, white", "real panels on roof with family or house, clear sky", "guaranteed savings numbers not provided", "simulação de economia, orçamento"),
  carros: N("wide italic or extended sans", "black, graphite, one accent red or blue", "car 3/4 front, glossy reflections, showroom or road at dusk, exact model", "wrong badges, deformed wheels", "entrada, parcelas, seminovos"),
  motos: N("aggressive condensed italic", "black, red", "motorcycle low angle, road", "deformed wheels", "entrada, revisão"),
  oficina: N("industrial condensed", "graphite, orange or yellow", "mechanic hands, car on lift, tools", "grease cartoon", "revisão, check-up"),
  lavacar: N("bold clean", "blue, white, cyan", "glossy car with water beading", "foam covering everything", "lavagem + cera"),
  pneus: N("heavy condensed", "black, yellow", "tires with real tread, stacked", "fake tread", "4 pneus parcelados"),
  provedor: N("modern bold geometric sans", "deep navy or brand color with electric accent", "happy people streaming at home, router, clear speed number as hero; partner streaming logos in a neat row", "invented speed or invented partners, cheesy globe and cables", "velocidade, streaming incluso, instalação"),
  telefonia: N("modern sans", "brand color, black", "phones with exact model from photo", "wrong camera layout", "parcelas, brinde"),
  informatica: N("tech sans", "dark with blue accent", "devices on desk with screen glow", "fake keyboards", "upgrade, garantia"),
  assistencia: N("clear bold sans", "navy, yellow", "technician repairing phone, macro tools", "broken-screen gore", "conserto no dia, orçamento grátis"),
  eletronicos: N("clean wide sans", "black with neon accent", "precise product flat lay on dark surface with rim light", "invented ports or logos", "ofertas, parcelamento"),
  games: N("extended aggressive display or bold rounded", "deep navy/black with vivid accent", "game covers fanned with real proportions, console controllers with accurate shape, glowing but controlled", "fake gibberish game titles; if covers are not attached render only the titles the user named", "desconto em jogos, pré-venda, troca"),
  plataformajogos: N("bold geometric display", "dark brand color with one electric accent", "grid of game cover cards around a giant discount number", "cover soup that hides the offer", "até X% off, cashback"),
  streaming: N("cinematic sans", "deep black, brand accent", "screen with poster wall, living room glow", "invented titles", "catálogo, preço mensal"),
  saas: N("product sans (Inter/Manrope feel)", "dark or very light base with one brand accent", "real interface in laptop/phone, one metric highlighted", "unreadable fake dashboards", "teste grátis, problema que resolve"),
  app: N("friendly product sans", "brand colors", "phone in hand with real screen", "gibberish UI", "baixe grátis"),
  agencia: N("bold contemporary grotesque", "black, off-white, electric accent", "work samples, team, big statement type", "rocket clip art", "diagnóstico, resultado real"),
  curso: N("bold clear sans with serif accent", "deep base with one energetic accent", "instructor real photo, materials, device with lesson", "income promises, wall of text", "aula grátis, turma, certificado"),
  escola: N("friendly sans", "brand colors, warm accent", "real students engaged", "stiff stock poses", "matrículas abertas"),
  faculdade: N("confident serif/sans", "navy, gold", "campus and students", "guaranteed job", "vestibular, bolsa"),
  idiomas: N("playful sans", "brand colors", "conversation scene", "flag soup", "aula experimental"),
  concurso: N("strong condensed sans", "navy, yellow", "organized study material, one clear price", "rainbow clutter, five boxes of text", "material, aprovação sem promessa"),
  advocacia: N("classic serif", "navy, ivory, bronze", "sober office, lawyer portrait", "gavels and scales cliché, promises of winning, price offers (OAB rules: informative tone only)", "informação, contato"),
  contabilidade: N("trust sans/serif", "navy, green", "accountant with client", "money rain", "abrir empresa, regularização"),
  credito: N("clear sans", "green or navy, white", "person relieved in real life, simple score or card", "guaranteed approval claims, targeting debt", "simulação"),
  seguros: N("humanist sans", "navy, warm accent", "family or object protected, calm", "disaster imagery", "cotação"),
  viagens: N("airy wide sans with script accent", "sky, sunset, sand", "destination photo with person", "fake landmarks", "pacote, parcelas, datas"),
  hotel: N("elegant serif", "warm neutrals, deep green", "room or view at golden hour", "impossible pools", "diária, reserva direta"),
  eventos: N("expressive display", "event identity", "crowd, stage light, date as hero", "unreadable date", "data, local, ingresso"),
  festas: N("playful rounded", "festive but limited palette", "decorated party scene", "balloon chaos", "datas disponíveis"),
  fotografo: N("minimal serif", "neutral", "the work itself full bleed", "camera clip art", "agenda, ensaio"),
  floricultura: N("delicate serif/script", "cream, green, bloom color", "fresh bouquet, soft light", "plastic flowers", "entrega hoje"),
  brinquedos: N("rounded bold", "primary colors organized", "child playing, product exact", "invented box art", "dia das crianças"),
  papelaria: N("friendly sans", "pastel", "flat lay of items", "clutter", "kit escolar"),
  livraria: N("literary serif", "paper tones", "books stacked, real covers attached", "gibberish spines", "lançamento"),
  igreja: N("serene serif", "deep blue, gold, white", "community gathering, soft light", "commercial urgency", "convite, horário"),
  agro: N("solid sans", "green, earth, yellow", "field, machine, producer", "fake machinery", "safra, entrega"),
  industria: N("technical sans", "graphite, safety accent", "factory detail, product", "generic gears", "orçamento"),
  limpeza: N("fresh sans", "aqua, white", "sparkling clean result", "foam overload", "agendamento"),
  seguranca: N("sturdy sans", "black, red or blue", "camera installed, calm home", "fear imagery", "monitoramento, orçamento"),
  transporte: N("bold sans", "brand color, yellow", "truck and team", "damaged boxes", "orçamento"),
  lavanderia: N("clean rounded", "blue, white", "folded fresh linen", "bubbles everywhere", "leva e traz"),
  tatuagem: N("gothic or hand-drawn display", "black, bone, red", "artist at work, healed art", "fresh bleeding skin", "agenda, flash"),
  musica: N("expressive sans", "dark with warm light", "instruments, studio", "random notes floating", "aulas, estúdio"),
};

/** Cada "/atalho" vira uma instrução para o gerador de imagens */
export const CODES: Record<string, string> = {
  // datas e promoções
  blackfriday: "Black Friday campaign: near-black dominant background with intense red or metallic gold accents, dramatic hard light, one gigantic offer figure, premium retail energy. Brand colors give way to the season; keep the logo intact.",
  blacknovember: "Black November: dark premium base with one electric accent, sense of a month-long event, small 'BLACK NOVEMBER' tag above the headline.",
  esquenta: "Black Friday warm-up: dark base with a single hot accent, teaser mood, anticipation rather than final urgency.",
  cybermonday: "Cyber Monday: deep blue-black, cyan and violet electric accents, clean tech light.",
  natal: "Christmas: deep red or pine green with warm gold and cream, soft out-of-focus fairy lights, a few real natural decorations framing the corners, elegant script accent allowed.",
  anonovo: "New Year: midnight base, champagne gold, restrained confetti, celebratory but elegant.",
  carnaval: "Carnival: three vivid colors with rhythm, serpentine used sparingly, joyful real people.",
  pascoa: "Easter: chocolate browns with cream and one pastel, real chocolate textures.",
  diadasmaes: "Mother's Day: rosé, nude and cream, real flowers, warm affectionate light.",
  diadospais: "Father's Day: navy, graphite, caramel leather, side light, understated.",
  namorados: "Valentine's (Brazil): wine, red and cream, intimate light, one romantic detail.",
  diadamulher: "Women's Day: dignified, confident portrait energy, plum and coral, no cliché pink clutter.",
  diadascriancas: "Children's Day: organized primary colors, playful shapes, genuine joy.",
  diadoconsumidor: "Consumer Day: bold retail layout, one saturated brand color, clear benefit.",
  diadocliente: "Customer Day: warm gratitude mood, brand colors, personal touch.",
  festajunina: "Brazilian June festival: terracotta, mustard, check pattern and small bunting, warm night light.",
  voltaasaulas: "Back to school: fresh colors, organized school items, optimistic morning light.",
  verao: "Summer: bright sun, hard clean shadows, ocean and coral palette.",
  inverno: "Winter: cozy low warm light, deep blues and wool textures.",
  primavera: "Spring: fresh florals, light airy palette.",
  outubrorosa: "Pink October: sober, respectful, soft pink with white, informative tone.",
  novembroazul: "Blue November: sober navy and light blue, respectful and informative.",
  halloween: "Halloween: dark violet and pumpkin orange, playful not gory.",
  independencia: "Brazil Independence Day: refined green, yellow and blue accents, not a flag collage.",
  diadotrabalho: "Labor Day: honest working hands or team, warm solid colors.",
  onzeonze: "11.11 sale: giant '11.11' typographic hero with energetic accent.",
  aniversario: "Store anniversary: celebratory but premium, brand colors, one balloon or ribbon element at most, years only if provided.",
  inauguracao: "Grand opening: real storefront or space as hero, ribbon accent, date and place very clear.",
  reabertura: "Reopening: renewed space as hero, welcoming light.",
  lancamento: "Product launch: single hero under a defined spotlight, generous negative space, 'NEW' cue small and elegant.",
  prevenda: "Pre-order: teaser lighting, product partly revealed, clear reservation cue.",
  liquidacao: "Clearance sale: bold flat color field, huge discount figure, organized products.",
  queimadeestoque: "Stock clearance: high energy warm palette, big price, stacked real products, still legible.",
  ultimodia: "Last day: urgent single message, strong accent, a clear 'last day' tag.",
  relampago: "Flash sale: one diagonal energy accent, time window in a clean tag.",
  fimdesemana: "Weekend deal: relaxed upbeat mood, weekend tag.",
  promodasemana: "Weekly deal: repeatable retail template, price card dominant.",
  fretegratis: "Free shipping: delivery cue (box or courier) and a clear free-shipping tag.",
  cupom: "Coupon: ticket-shaped card with perforated notches holding the code or value provided.",
  desconto: "Discount-led: the percentage is the largest element on the canvas, set in heavy type with tight tracking.",
  depor: "Was/now pricing: old value small and struck through above a much larger new value (only with both values provided).",
  parcelado: "Installments: monthly value large, number of installments clear and legible.",
  cashback: "Cashback: coin or return cue, benefit stated plainly.",
  brinde: "Free gift: show the gift item next to the main product with a small 'gift' tag.",
  combo: "Bundle: all items of the bundle together on one surface, one combined price.",
  leve3pague2: "Buy 3 pay 2: three identical products in a row, third one highlighted as free.",
  apartirde: "Starting price: small 'a partir de' label stacked over a large value.",
  // estratégia
  ofertadireta: "Direct offer: product plus price, nothing competes with them.",
  dorsolucao: "Problem/solution: headline names the concrete problem; image shows the product solving it.",
  beneficio: "Single benefit: one strong promise, image proves it visually.",
  listabeneficios: "Three short benefits as a clean aligned list with small consistent icons.",
  provasocial: "Social proof: only the real numbers or quotes provided, set as a trustworthy card.",
  depoimento: "Testimonial: real quote provided, in a clean card with quotation marks and the person's photo if attached.",
  avaliacao: "Star rating card using only the rating provided.",
  antesdepois: "Honest before/after split using only attached real photos, identical framing, small labels.",
  comparativo: "Comparison: two columns, ours highlighted, short factual rows.",
  versus: "Versus layout: common solution dimmed on one side, the product bright on the other.",
  passoapasso: "Three numbered steps in a clear vertical flow.",
  comofunciona: "How it works: simple three-part visual sequence.",
  pergunta: "Question hook: large question as the first reading, answer cue below.",
  numero: "Number hero: one big figure carries the ad.",
  autoridade: "Authority: expert or owner portrait with credential only if provided.",
  bastidores: "Behind the scenes: candid documentary shot of the real process.",
  fundador: "Founder-led: the owner (attached photo) looks at camera, genuine, headline beside.",
  equipe: "Team shot, natural and proud, brand uniform if visible in photos.",
  cliente: "A customer enjoying the product, genuine moment.",
  ugc: "Looks like authentic phone content: natural light, slight imperfection, minimal design, one native-style caption block.",
  urgencia: "Real deadline shown as a clean tag; strong contrast.",
  escassez: "Limited units or spots tag, only with the number provided.",
  garantia: "Trust seal with only the guarantee provided.",
  objecao: "Handles the main objection in the headline.",
  mitoverdade: "Myth vs fact split with crossed and checked markers.",
  perguntasrespostas: "FAQ style: one question bubble and one answer.",
  humor: "Light, relatable humor in the image situation; keep the offer clear.",
  meme: "Native meme-like framing with a bold simple caption; no copyrighted meme characters.",
  nativo: "Native organic post feel, little design, believable scene.",
  conversa: "Chat conversation mockup with two or three short believable bubbles written exactly as given.",
  notificacao: "A single clean notification-style card (generic design, not imitating a real operating system alert).",
  convite: "Invitation: event name, date, time and place in a clear stack.",
  captacao: "Lead capture: what the person receives is shown physically (guide, quote, class) with one button.",
  materialgratis: "Free material shown as a booklet or screen mockup with a 'free' tag.",
  aulagratis: "Free class: instructor and screen, date tag.",
  teste: "Free trial: product screen and 'free trial' tag with only the period provided.",
  orcamento: "Free quote: service in action, button to request.",
  avaliacaogratis: "Free assessment: professional with client, clear tag.",
  agendamento: "Booking: calendar cue and booking button.",
  pedidozap: "Order by WhatsApp: green messaging button with a generic chat glyph, number only if provided.",
  delivery: "Delivery: product packed and on its way, courier cue.",
  baixarapp: "App download: phone with the app, download button, no store badges unless attached.",
  assinatura: "Subscription: recurring box or plan card with monthly value if provided.",
  revendedor: "Reseller recruitment: product line and a person starting to sell, no income promises.",
  vagas: "Job opening: role name large, team photo, clear apply cue.",
  marca: "Brand awareness: strong single visual metaphor of what the company does, logo given more presence, minimal text.",
  novidade: "New arrival: fresh product reveal with a small 'new' tag.",
  maisvendido: "Best seller: hero product with a restrained best-seller tag (only if stated).",
  presente: "Gift idea: product wrapped or being given, warm moment.",
  economia: "Savings: amount saved as hero, only if provided.",
  // composição
  heroproduto: "Single hero product occupying 45-60% of the canvas, centered or on a third, grounded with a real contact shadow.",
  produtogigante: "Oversized product dwarfing the environment, believable perspective and shadow.",
  levitando: "Product floating at a slight angle with soft shadow below, few relevant elements around.",
  pedestal: "Product on a clean geometric pedestal with studio backdrop.",
  vitrine: "Shop window presentation with soft glass reflections.",
  flatlay: "Top-down flat lay with intentional spacing and a clear focal item.",
  knolling: "Knolling: items aligned at right angles with equal gaps, top view.",
  gradeprodutos: "Clean product grid, equal cells, consistent scale, one shared offer block.",
  mosaico: "Editorial photo mosaic with varied tile sizes and thin even gutters.",
  cardapio: "Menu layout: items with prices aligned in a precise column, only items provided.",
  tabelaprecos: "Price table with two or three options, one highlighted.",
  meioameio: "Split layout: one half photograph, other half solid brand color with type.",
  diagonal: "A single diagonal cut dividing image and type.",
  numerogigante: "The number fills the width of the canvas, product overlapping it slightly.",
  tipoheroi: "Typography is the hero: huge, well-kerned headline with a small product accent.",
  textoatras: "Giant word placed behind the hero subject, partially hidden for depth, still readable.",
  centralizado: "Symmetrical centered composition on a single vertical axis.",
  textoesquerda: "Type column aligned left, subject on the right.",
  textotopo: "Headline block at top, subject below.",
  textobase: "Image breathes on top, text block anchored at the bottom inside the safe area.",
  cartoes: "Information in two or three rounded cards with consistent radius and padding.",
  moldura: "Thin elegant inner frame guiding the eye.",
  poster: "Poster composition with bold title and one monumental image.",
  revista: "Magazine cover look with masthead-sized title and refined cover lines.",
  editorial: "Editorial spread feel: refined grid, caption-sized details.",
  outdoor: "The ad shown on a street billboard in a realistic city photo.",
  outdoor3d: "3D corner digital billboard with the product breaking out of the screen.",
  mockupcelular: "Product screen inside a realistic phone held or standing, screen straight and legible.",
  mockupnotebook: "Screen inside a realistic laptop on a desk.",
  dashboard: "One clean interface panel with a highlighted metric.",
  nasmaos: "A real hand holding the product, correct anatomy.",
  emuso: "Product being used by a person in its natural context.",
  ambiente: "Product placed in a believable real environment.",
  portal: "Subject emerging from a frame or card edge, convincing depth.",
  explosao: "Ingredients bursting around the product, frozen mid-air, controlled and appetizing.",
  vistaexplodida: "Exploded view with layers separated along one axis, small labels only if given.",
  caixaaberta: "Box opening revealing the product with warm light.",
  carrinho: "Shopping cart holding the products.",
  sacola: "Branded shopping bag with products.",
  circulo: "A circular spotlight inset showing a detail.",
  faixas: "One or two clean ribbon bands carrying short text.",
  colunas: "Column grid with equal gutters.",
  assimetrico: "Confident asymmetric balance with large negative space.",
  respiro: "At least 45% of the canvas left calm and empty.",
  capas: "Cover cards fanned around the central offer, consistent size and slight rotation.",
  // fotografia
  packshot: "Catalog packshot: accurate product, seamless backdrop, soft reflections.",
  closeup: "Tight close-up emphasizing texture.",
  macro: "Macro detail with shallow depth of field.",
  planomedio: "Medium shot from the waist up.",
  planoaberto: "Wide shot establishing the place.",
  angulobaixo: "Low camera angle making the subject imposing.",
  plongee: "High angle looking down.",
  zenital: "Directly overhead camera.",
  tresquartos: "Three-quarter product angle.",
  drone: "Aerial drone viewpoint.",
  grandeangular: "Wide-angle lens with controlled distortion.",
  teleobjetiva: "Telephoto compression, 85-135mm look.",
  desfoque: "Subject sharp, background softly blurred.",
  bokeh: "Warm bokeh lights in the background.",
  foodstyling: "Professional food styling: glossy highlights, steam, crumbs, appetizing and real.",
  bebidagelada: "Cold drink with condensation, ice and backlight.",
  splash: "Frozen liquid splash, restrained and physically plausible.",
  vapor: "Natural steam rising.",
  fumaca: "Subtle smoke for atmosphere.",
  congelado: "Action frozen with fast shutter.",
  movimento: "Directional motion blur on background only.",
  beleza: "Beauty photography with true skin texture.",
  retrato: "Professional portrait, 85mm, soft key light.",
  corpointeiro: "Full body framing with feet fully visible.",
  olharcamera: "Subject looks straight into the camera.",
  candido: "Candid unposed moment.",
  maos: "Focus on hands at work, correct anatomy.",
  joiamacro: "Jewelry macro with precise highlights.",
  automotivo: "Automotive studio lighting with long softbox reflections.",
  arquitetura: "Architectural photo with straight verticals.",
  interior: "Interior photography, natural and tidy.",
  esporte: "Sports action with energy and sharp subject.",
  documental: "Documentary realism.",
  celular: "Shot-on-phone realism.",
  analogico: "Analog film grain and gentle color.",
  pb: "Black and white with rich tonal range and one accent color for the offer.",
  // luz
  luzestudio: "Controlled softbox studio lighting.",
  luznatural: "Natural daylight.",
  horadourada: "Golden hour low warm sun.",
  horaazul: "Blue hour ambient with warm practicals.",
  noite: "Urban night with practical lights.",
  neonluz: "Two-color neon lighting, controlled.",
  contraluz: "Strong backlight with soft fill.",
  luzrecorte: "Rim light separating the subject.",
  chavebaixa: "Low-key dramatic lighting.",
  chavealta: "High-key bright and airy.",
  luzdura: "Hard sunlight with crisp graphic shadows.",
  sombrafolhas: "Dappled leaf shadows across the backdrop.",
  velas: "Warm candlelight.",
  janela: "Side window light.",
  holofote: "Single spotlight cone.",
  luzdecor: "Colored gel lighting in brand colors.",
  amanhecer: "Soft sunrise glow.",
  nublado: "Soft overcast diffusion.",
  vitrineluz: "Display-case lighting.",
  brilhopiso: "Subtle glossy floor reflection.",
  // estilo
  premium: "Premium restraint: deep tones, generous space, fine details.",
  luxo: "Black and gold luxury, real metal reflections, no glitter noise.",
  minimalista: "Minimalism: few elements, flat calm background, precise type.",
  clean: "Clean light design, white space, soft shadows.",
  corporativo: "Corporate clarity, structured grid.",
  tech: "Dark tech aesthetic with subtle grid and one glow accent.",
  neon: "Neon accents on dark, limited to two hues.",
  retro: "Retro print aesthetic.",
  vintage: "Vintage paper, muted inks.",
  anos90: "1990s retail nostalgia, bold shapes.",
  y2k: "Y2K chrome and gradients, tasteful.",
  suico: "Swiss international grid, grotesque type, flush left.",
  bauhaus: "Bauhaus geometry and primary accents.",
  brutalista: "Brutalist big type and raw blocks.",
  colagem: "Art-directed paper collage with cut-out photography.",
  papel: "Layered paper cut depth.",
  gradiente: "Smooth soft two-color gradient background.",
  vidro: "Frosted glass panels over the photo.",
  render3d: "High-quality 3D render with realistic materials.",
  massinha: "Clay 3D style.",
  ilustracao: "Flat vector illustration with limited palette.",
  desenho: "Hand-drawn accents over photography.",
  anime: "Original anime style character, no existing franchise.",
  quadrinhos: "Comic panels with halftone.",
  pixelart: "Crisp pixel art.",
  aquarela: "Watercolor textures.",
  cinematografico: "Cinematic grade and anamorphic mood.",
  realista: "Strict photorealism indistinguishable from a real shoot.",
  urbano: "Street urban textures.",
  esportivo: "Sporty slanted shapes and energy.",
  organico: "Organic natural materials, earth tones.",
  rustico: "Rustic craft wood and kraft.",
  gourmet: "Gourmet dark slate elegance.",
  infantil: "Child-friendly rounded shapes, safe bright colors.",
  feminino: "Delicate refined palette.",
  masculino: "Strong sober palette.",
  popvibrante: "Vivid pop color blocking with only two or three hues.",
  pastel: "Soft pastel harmony.",
  monocromatico: "Monochrome in the brand color.",
  duotone: "Duotone treatment.",
  gamer: "Gaming energy: dark base, angular frames, one electric accent.",
  festa: "Festive but organized.",
  natureza: "Nature backdrop with real foliage.",
  saude: "Calm trustworthy health look.",
  varejo: "Organized retail hierarchy with price cards.",
  // letras
  impacto: "Headline in a tall heavy condensed sans, tight leading.",
  serifaeditorial: "Headline in a high-contrast editorial serif.",
  manuscrita: "Elegant script for one or two words, perfectly legible, paired with a clean sans.",
  geometrica: "Modern geometric sans.",
  arredondada: "Rounded friendly sans.",
  displayretro: "Retro display lettering with one outline or drop shadow.",
  estencil: "Stencil industrial lettering.",
  giz: "Chalk lettering on board.",
  pincel: "Confident brush lettering for the key word.",
  dourada: "Metallic gold lettering with realistic bevel, legible.",
  metalica: "Brushed metal lettering.",
  neonletras: "Real neon tube sign lettering.",
  letras3d: "Dimensional 3D letters with one consistent light.",
  esportiva: "Heavy italic sports lettering.",
  fina: "Thin widely tracked capitals for a premium voice.",
  gigante: "One enormous word spanning the width.",
  contorno: "Outline type paired with a filled word.",
  marcatexto: "Marker highlight behind the key word.",
  duaspesos: "Same family: light line plus extra-bold key line.",
  caixaalta: "All caps with careful tracking.",
  // canal
  feed: "Designed for the 4:5 feed, thumb-stopping at small size.",
  quadrado: "Square feed composition, central weight.",
  story: "Vertical story: keep the top 14% and bottom 35% free of text and logos.",
  reels: "Reels cover: central subject and short title inside the safe area.",
  tiktok: "TikTok native feel, vertical, right side and bottom kept clear.",
  statuszap: "WhatsApp Status: vertical, large simple message, top and bottom clear.",
  linkface: "Landscape link ad: text one side, subject other.",
  display: "Display banner: extremely simple, headline, product, button.",
  pinterest: "Tall pin with inspiring image and short title.",
  linkedin: "Professional business feed look.",
  youtubeads: "Landscape with high contrast and short text.",
  panfleto: "Printed flyer hierarchy, still uncluttered.",
  cartaz: "Poster for reading at distance, huge type.",
  telao: "LED screen: very high contrast, few words.",
  catalogo: "Catalog tile: product clean, price clear.",
  bannersite: "Website hero banner with room for the button.",
  // elementos
  etiqueta: "A tangible price tag element carrying the price.",
  seloimpacto: "One discount badge, well placed, not overlapping the product's face or label.",
  selogarantia: "Small trust badge with the provided wording.",
  contagem: "Clean deadline tag.",
  botao: "A clear call-to-action button in the accent color with high contrast.",
  estrelas: "Five-star row, only with a provided rating.",
  aspas: "Large elegant quotation marks.",
  seta: "One hand-drawn arrow pointing to the offer.",
  fita: "A single ribbon accent.",
  confete: "Very sparse confetti at the edges.",
  baloes: "A few real balloons at one corner.",
  moedas: "A few realistic coins, only if money is the benefit.",
  presentes: "One or two wrapped gift boxes.",
  icones: "Consistent thin line icons for benefits.",
  parceiros: "Partner logos in one aligned row with a small label.",
  endereco: "Address line small at the bottom, only if provided.",
  whatsapp: "WhatsApp contact line with the number provided.",
  site: "Website address small at the bottom, only if provided.",
  arroba: "Social handle small, only if provided.",
  qrcode: "Reserve a clean empty white square for a QR code to be added later; do not draw a fake QR pattern.",
  sublinhado: "Hand-drawn underline under the key word.",
  brilhos: "Two or three tiny sparkle accents.",
  particulas: "Very subtle particles for depth.",
  linhasluz: "One or two light streaks.",
  formas: "A few geometric shapes from the brand language.",
  textura: "Subtle paper or grain texture.",
};

/** O que olhar na hora de dar a nota */
export const SCORE_CRITERIA: { id: string; label: string; weight: number; ask: string }[] = [
  { id: "parar", label: "Para o dedo", weight: 18, ask: "contraste, foco e surpresa no primeiro instante no feed" },
  { id: "clareza", label: "Entendido em 1 segundo", weight: 18, ask: "uma única mensagem, óbvia o que é vendido" },
  { id: "leitura", label: "Leitura no celular", weight: 14, ask: "hierarquia, tamanho das letras, contraste, pouco texto" },
  { id: "oferta", label: "Oferta e motivo", weight: 14, ask: "benefício, preço ou razão concreta para agir" },
  { id: "acao", label: "Chamada para ação", weight: 10, ask: "botão ou contato claro" },
  { id: "marca", label: "Cara da empresa", weight: 8, ask: "logo nítida, cores e produto reconhecíveis" },
  { id: "real", label: "Parece real e profissional", weight: 10, ask: "sem sinais de imagem artificial, deformações ou excesso" },
  { id: "regras", label: "Regras das plataformas", weight: 8, ask: "área segura do formato, sem atributo pessoal nem promessa proibida" },
];
