-- Editor de vídeo na nuvem (VPS): fila de pedidos, estilos de edição (skills) e estado do worker.
-- Aplique depois de 20261124000001. Não altera dados existentes.
--
-- Fluxo: o portal cria uma linha em video_jobs (status 'queued') e sobe os vídeos no bucket "videos";
-- o worker da VPS (service role) pega o pedido, edita e devolve o MP4 no mesmo bucket.

-- 1) Estilos de edição: cada um é uma "skill" (regras em texto) que a IA segue ao editar
create table if not exists public.video_styles (
  id uuid primary key default gen_random_uuid(),
  slug text unique,                                   -- só os estilos que já vêm no sistema têm slug
  brand_id uuid references public.studio_brands(id) on delete cascade,  -- null = vale para todas as empresas
  name text not null check (char_length(trim(name)) between 2 and 120),
  description text,
  engine text not null default 'edit' check (engine in ('edit','saas','hyperframes')),
  caption_variant text not null default 'karaoke' check (caption_variant in ('stacked','karaoke','single','boxed','none')),
  sfx boolean not null default true,
  rules text not null default '',
  builtin boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists video_styles_brand on public.video_styles (brand_id);

-- 2) Pedidos de vídeo
create table if not exists public.video_jobs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.studio_brands(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  parent_id uuid references public.video_jobs(id) on delete set null,   -- ajuste de uma versão anterior
  kind text not null default 'edit' check (kind in ('edit','analyze')),  -- analyze = aprender estilo de uma referência
  title text not null default 'Vídeo',
  status text not null default 'queued' check (status in ('queued','running','done','error','canceled')),
  stage text,                                    -- etapa em texto simples (Transcrevendo, Renderizando…)
  progress int not null default 0 check (progress between 0 and 100),
  instruction text not null default '',
  format text not null default '9:16' check (format in ('9:16','16:9','1:1','4:5')),
  engine text not null default 'auto' check (engine in ('auto','edit','saas','hyperframes')),
  style_id uuid references public.video_styles(id) on delete set null,
  style_name text,
  options jsonb not null default '{}'::jsonb,    -- cut_silence, captions, sfx, outro, max_seconds
  brand jsonb not null default '{}'::jsonb,      -- cópia dos dados da empresa no momento do pedido (nome, cores, fontes, logo…)
  inputs jsonb not null default '[]'::jsonb,     -- [{path,name,mime,size,role:'main'|'reference'|'narration'|'logo'}]
  ref_urls text[] not null default '{}',         -- links de referência (baixados com yt-dlp)
  feedback text,                                 -- o que o usuário pediu para mudar nesta versão
  plan jsonb,                                    -- plano de edição decidido pela IA
  analysis jsonb,                                -- resultado quando kind = analyze
  output_path text,
  thumb_path text,
  output_size bigint,
  duration_sec numeric,
  error text,
  worker text,
  log text,
  cost_usd numeric,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index if not exists video_jobs_brand on public.video_jobs (brand_id, created_at desc);
create index if not exists video_jobs_queue on public.video_jobs (status, created_at) where status in ('queued','running');

-- 3) Batimento do worker (mostra "VPS online" no portal)
create table if not exists public.video_workers (
  id text primary key,
  last_seen timestamptz not null default now(),
  info jsonb not null default '{}'::jsonb
);

-- 4) Permissões: mesma regra do estúdio (equipe; empresa de cliente respeita os clientes liberados)
alter table public.video_styles enable row level security;
alter table public.video_jobs enable row level security;
alter table public.video_workers enable row level security;

drop policy if exists video_styles_select on public.video_styles;
create policy video_styles_select on public.video_styles for select
  using (public.is_staff() and (brand_id is null or public.studio_can(brand_id)));
drop policy if exists video_styles_write on public.video_styles;
create policy video_styles_write on public.video_styles for all
  using (public.is_staff() and ((brand_id is null and public.is_admin() and not builtin) or (brand_id is not null and public.studio_can(brand_id) and not builtin)))
  with check (public.is_staff() and ((brand_id is null and public.is_admin() and not builtin) or (brand_id is not null and public.studio_can(brand_id) and not builtin)));

drop policy if exists video_jobs_all on public.video_jobs;
create policy video_jobs_all on public.video_jobs for all
  using (public.studio_can(brand_id)) with check (public.studio_can(brand_id));

drop policy if exists video_workers_select on public.video_workers;
create policy video_workers_select on public.video_workers for select using (public.is_staff());
-- escrita do worker: service role (ignora RLS)

-- 5) Bucket privado "videos": {brand_id}/{job_id}/arquivo. Sem limite de tipo; 2 GB por arquivo
--    (se o seu plano do Supabase limitar menos, o painel mostra o teto real em Storage > Settings)
insert into storage.buckets (id, name, public, file_size_limit)
values ('videos', 'videos', false, 2147483648)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "videos_read" on storage.objects;
create policy "videos_read" on storage.objects for select to authenticated using (
  bucket_id = 'videos' and public.studio_can(public.storage_client_id(name)));
drop policy if exists "videos_insert" on storage.objects;
create policy "videos_insert" on storage.objects for insert to authenticated with check (
  bucket_id = 'videos' and public.studio_can(public.storage_client_id(name)));
drop policy if exists "videos_delete" on storage.objects;
create policy "videos_delete" on storage.objects for delete to authenticated using (
  bucket_id = 'videos' and public.studio_can(public.storage_client_id(name)));

do $$ begin alter publication supabase_realtime add table public.video_jobs; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.video_workers; exception when duplicate_object then null; end $$;

-- 6) Estilos que já vêm no sistema (gerados a partir de supabase/functions/_shared/video.ts)
insert into public.video_styles (slug, name, description, engine, caption_variant, sfx, rules, builtin) values ('fala-dinamica', 'Fala para câmera — dinâmico', 'Cortes secos sem respiro, punch-in alternado, legenda karaokê e efeitos sutis nas viradas.', 'edit', 'karaoke', true, 'Formato vertical 1080x1920, 30 fps. Topo (~250 px) e rodapé (~400 px) livres de informação crítica.
Corte todo silêncio e respiro longo; ritmo de Reels. Remova erros de fala e repetições (use cut.remove).
Legenda karaokê: 3–5 palavras por bloco, a palavra falada acende. Destaque 1 palavra de impacto por frase (captions.emphasis).
Punch-in alternado entre cortes (look.punch_in = true) e 2–5 zooms de ênfase nos pontos fortes.
Palavras-chave na tela só nos 3–6 momentos mais importantes, sincronizadas com a fala (overlays tipo keyword).
Efeitos sonoros: whoosh/swoosh nas viradas e nos overlays; pop/click discretos. Nunca mais de 1 efeito a cada ~2 s.
Sem emoji, sem badges em pílula, sem gradiente roxo. Cor de destaque = a da marca.', true)
on conflict (slug) do update set name = excluded.name, description = excluded.description, engine = excluded.engine, caption_variant = excluded.caption_variant, sfx = excluded.sfx, rules = excluded.rules;
insert into public.video_styles (slug, name, description, engine, caption_variant, sfx, rules, builtin) values ('reels-pianista', 'Reels Pianista — motion + legenda empilhada', 'Estilo da Agência Pianista: legenda empilhada (linha pequena + palavra de impacto), palavras-chave animadas, sem cara de IA.', 'edit', 'stacked', false, 'Vertical 1080x1920, 30 fps. Cada vídeo precisa parecer diferente do anterior: varie fonte, cor de destaque e tipo de transição.
Legenda EMPILHADA para pessoa falando para a câmera: linha pequena em caixa alta + palavra de impacto grande em fonte de destaque (itálica serifada é permitida só aqui).
Em vídeo narrado (voz em off) use a legenda ''boxed'': palavra falada em branco sobre tarja colorida de cantos quase retos.
Palavras-chave sincronizadas com a fala, com ícone que se desenha; complementam a legenda, não a substituem.
NÃO use: badges/etiquetas decorativas no canto, degradê roxo, orbes, emoji, cards idênticos, copy genérica, legenda padrão solta de editor.
Cortes pelo áudio (energia da fala), com folga no fim de cada trecho — nunca cortar o final de uma palavra.
SFX só se o usuário pedir. Identidade do cliente manda: fontes, cores e logo dele; a logo não é redesenhada.
Não invente número, preço, depoimento ou nome que não esteja na fala ou no briefing.', true)
on conflict (slug) do update set name = excluded.name, description = excluded.description, engine = excluded.engine, caption_variant = excluded.caption_variant, sfx = excluded.sfx, rules = excluded.rules;
insert into public.video_styles (slug, name, description, engine, caption_variant, sfx, rules, builtin) values ('narrado-boxed', 'Narrado com legenda em tarja (CIAMP)', 'Vídeo com voz em off: legenda frase a frase, palavra falada em branco sobre tarja colorida; palavras-chave com ícone.', 'edit', 'boxed', false, 'Legenda falada frase a frase (2–5 palavras): palavra falada em BRANCO sobre tarja colorida (cor da marca) de cantos quase retos; palavras já ditas brancas, próximas mais fracas; no terço inferior.
Texto da tela = fala (grafia correta). Palavras-chave com ícone sincronizadas com a fala.
Final com cartão de logo parado ~4 s (outro.enabled = true) e a chamada para ação da marca.
Transições limpas (sem flash); ritmo calmo e profissional. Sem emoji.', true)
on conflict (slug) do update set name = excluded.name, description = excluded.description, engine = excluded.engine, caption_variant = excluded.caption_variant, sfx = excluded.sfx, rules = excluded.rules;
insert into public.video_styles (slug, name, description, engine, caption_variant, sfx, rules, builtin) values ('saas-google', 'Produto SaaS — estilo apresentação Google', 'Texto palavra por palavra, janelas de interface animadas, cursor, barra de progresso, confete e logo animada (motor saas-video).', 'saas', 'none', true, 'Use engine = saas e preencha ''storyboard'' com o vocabulário do motor (cenas swap, title, ui, chips, progress, stat, media, cta, logo).
Uma ideia por cena; no máximo ~7 palavras na tela; título em até 2 linhas; *palavra* destaca com a cor da marca; sem CAIXA ALTA gritante, sem emoji.
Tema: light-fluid (produtividade/B2B amigável), dark-minimal (dev/design, lançamento seco) ou google-bright (IA/consumo). Neutro + UMA cor de marca.
Estrutura 30–60 s: gancho em até 3 s → problema/promessa → demonstração (ui) → recursos (chips) → prova (stat/progress) → CTA → logo + URL.
Texto nunca com corte seco; cada cena de 2,5–5 s (ui até 5,5 s). Português correto, com acentos revisados.
Não invente número ou prova. Se faltar dado, use cenas sem número.', true)
on conflict (slug) do update set name = excluded.name, description = excluded.description, engine = excluded.engine, caption_variant = excluded.caption_variant, sfx = excluded.sfx, rules = excluded.rules;
insert into public.video_styles (slug, name, description, engine, caption_variant, sfx, rules, builtin) values ('motion-tipografico', 'Motion tipográfico (HyperFrames)', 'Vídeo de texto animado, ritmado, com fundo gradiente da marca — HTML + GSAP renderizado pelo HyperFrames.', 'hyperframes', 'none', true, 'Use engine = hyperframes e preencha ''scenes'' (title, bullets, stat, quote, cta). Cada cena de 2–4 s, texto curto (≤ 8 palavras).
Fundo com gradiente suave da cor da marca; uma única fonte de destaque. Texto entra palavra por palavra e sai por dissolve.
Se houver vídeo enviado, ele entra como camada de fundo (scenes.type = ''video'') com legendas por cima.
SFX: whoosh na troca de cena e pop quando entra cada item.', true)
on conflict (slug) do update set name = excluded.name, description = excluded.description, engine = excluded.engine, caption_variant = excluded.caption_variant, sfx = excluded.sfx, rules = excluded.rules;
insert into public.video_styles (slug, name, description, engine, caption_variant, sfx, rules, builtin) values ('corte-podcast', 'Cortes de podcast / entrevista', 'Seleciona os melhores trechos, remove vazios e erros, legenda grande em tarja e barra de progresso.', 'edit', 'boxed', false, 'Se o material for longo, use cut.remove para ficar só com os trechos mais fortes (gancho nos primeiros 3 s, fechamento com conclusão).
Remova pausas > 0,4 s, ''né'', ''hã'' e repetições. Velocidade 1.0 a 1.08.
Legenda boxed grande no terço inferior; destaque a palavra mais forte de cada bloco.
Barra de progresso fina no topo (overlays tipo progress) e título com o tema nos primeiros 2 s (overlay title).', true)
on conflict (slug) do update set name = excluded.name, description = excluded.description, engine = excluded.engine, caption_variant = excluded.caption_variant, sfx = excluded.sfx, rules = excluded.rules;

