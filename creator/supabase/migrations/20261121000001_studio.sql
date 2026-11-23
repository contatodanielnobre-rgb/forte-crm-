-- =====================================================================
-- FORTE COMPANY CLIENTES — Criação de conteúdo (Estúdio de IA)
-- Marcas (skill base + uma pasta por cliente), biblioteca de referências,
-- catálogo de modelos de imagem, gerações/slides com versões e chaves de API.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Configurações globais (linha única)
-- ---------------------------------------------------------------------
create table public.studio_settings (
  id int primary key default 1 check (id = 1),
  max_bytes bigint not null default 1073741824,        -- 1 GB por pasta de marca
  max_refs int not null default 100,                    -- imagens de referência por pasta
  text_model text not null default 'gpt-4.1',           -- modelo de texto/visão (planejar, melhorar prompt, analisar)
  default_model text not null default 'gpt-image-2.5',
  onboarding_done boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.studio_settings default values;

-- ---------------------------------------------------------------------
-- Marcas: id fixo "is_base" = Skill base da Forte; as demais = pasta de cada cliente
-- ---------------------------------------------------------------------
create table public.studio_brands (
  id uuid primary key default gen_random_uuid(),
  client_id uuid ,
  name text not null check (char_length(trim(name)) between 2 and 120),
  is_base boolean not null default false,
  handle text,                                   -- @ do Instagram
  segment text,
  website text,
  logo_asset_id uuid,
  colors jsonb not null default '[]',            -- [{hex, name, role}]
  fonts jsonb not null default '{}',             -- {title, body, accent}
  hashtags text[] not null default '{}',
  cta text,
  voice text,
  tone_tags text[] not null default '{}',
  style_tags text[] not null default '{}',
  style_notes text,
  rules_do text[] not null default '{}',
  rules_dont text[] not null default '{}',
  carousel_spec jsonb not null default '{}',     -- {slides, cover, closing, density, notes}
  static_spec jsonb not null default '{}',
  skill_doc text,                                -- "documento de treinamento" compilado
  style_analysis jsonb,                          -- análise visual das referências (IA)
  skill_version int not null default 0,
  training_status text not null default 'draft' check (training_status in ('draft','training','ready','error')),
  trained_at timestamptz,
  dirty boolean not null default true,           -- há mudanças ainda não treinadas
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index studio_one_base on public.studio_brands (is_base) where is_base;
create index on public.studio_brands (client_id);
create trigger trg_studio_brands_touch before update on public.studio_brands for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Biblioteca (referências, logos)
-- ---------------------------------------------------------------------
create table public.studio_assets (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.studio_brands(id) on delete cascade,
  kind text not null default 'reference' check (kind in ('reference','logo')),
  name text not null,
  storage_path text not null,
  thumb_path text,
  mime_type text not null default 'image/png',
  size_bytes bigint not null default 0,
  width int,
  height int,
  tags text[] not null default '{}',
  favorite boolean not null default false,       -- favoritas pesam mais no treino
  caption text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.studio_assets (brand_id, kind, created_at desc);
alter table public.studio_brands add constraint studio_brands_logo_fk foreign key (logo_asset_id) references public.studio_assets(id) on delete set null;

-- ---------------------------------------------------------------------
-- Catálogo de modelos e chaves (a chave nunca é lida pelo navegador)
-- ---------------------------------------------------------------------
create table public.studio_models (
  id text primary key,
  provider text not null,                        -- openai | google | fal | ideogram | stability | recraft | custom
  name text not null,
  description text,
  api_model text not null,                       -- identificador na API do provedor (editável)
  capabilities jsonb not null default '{}',      -- {edit, mask, refs, text}
  sort int not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.studio_provider_keys (
  provider text primary key,
  api_key text not null,                         -- criptografada pela Edge Function quando STUDIO_ENC_KEY existe
  last4 text,
  base_url text,                                 -- provedor "custom" (compatível com OpenAI)
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Gerações e imagens (cada slide pode ter várias versões)
-- ---------------------------------------------------------------------
create table public.studio_generations (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.studio_brands(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  model_id text references public.studio_models(id) on delete set null,
  kind text not null default 'carousel' check (kind in ('carousel','static')),
  aspect text not null default '4:5',
  input_mode text not null default 'text' check (input_mode in ('text','slides')),
  input_text text,
  format_preset text,
  quality text not null default 'high',
  caption text,
  hashtags text[] not null default '{}',
  status text not null default 'running' check (status in ('running','done','partial','error')),
  error text,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.studio_generations (brand_id, created_at desc);

create table public.studio_images (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid not null references public.studio_generations(id) on delete cascade,
  brand_id uuid not null references public.studio_brands(id) on delete cascade,
  slide_index int not null default 1,
  slide_text text,
  slide_notes text,
  role text,                                     -- capa | desenvolvimento | cta | estático
  prompt text,
  version int not null default 1,
  parent_id uuid references public.studio_images(id) on delete set null,
  is_current boolean not null default true,
  edit_markers jsonb,                            -- [{x,y,r,note}] em % da imagem
  edit_note text,
  ref_asset_ids uuid[] not null default '{}',
  status text not null default 'queued' check (status in ('queued','running','done','error')),
  error text,
  storage_path text,
  width int,
  height int,
  favorite boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.studio_images (generation_id, slide_index, version);
create index on public.studio_images (brand_id, created_at desc);

-- ---------------------------------------------------------------------
-- Permissões: só equipe; marca de cliente respeita os clientes liberados
-- ---------------------------------------------------------------------
create or replace function public.studio_can(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_staff() and coalesce((
    select case when sb.client_id is null then true else public.can_access_client(sb.client_id) end
      from public.studio_brands sb where sb.id = b), false)
$$;

alter table public.studio_settings enable row level security;
alter table public.studio_brands enable row level security;
alter table public.studio_assets enable row level security;
alter table public.studio_models enable row level security;
alter table public.studio_provider_keys enable row level security;      -- sem policies: só service role (Edge Functions)
alter table public.studio_generations enable row level security;
alter table public.studio_images enable row level security;

create policy studio_settings_select on public.studio_settings for select using (public.is_staff());
create policy studio_settings_update on public.studio_settings for update using (public.is_admin()) with check (public.is_admin());

create policy studio_brands_select on public.studio_brands for select using (public.studio_can(id));
create policy studio_brands_insert on public.studio_brands for insert with check (
  public.is_staff() and (client_id is null and public.is_admin() or client_id is not null and public.can_access_client(client_id)));
create policy studio_brands_update on public.studio_brands for update using (public.studio_can(id)) with check (public.studio_can(id));
create policy studio_brands_delete on public.studio_brands for delete using (public.is_admin() and not is_base);

create policy studio_assets_all on public.studio_assets for all using (public.studio_can(brand_id)) with check (public.studio_can(brand_id));
create policy studio_models_select on public.studio_models for select using (public.is_staff());
create policy studio_models_update on public.studio_models for update using (public.is_admin()) with check (public.is_admin());
create policy studio_models_insert on public.studio_models for insert with check (public.is_admin());
create policy studio_models_delete on public.studio_models for delete using (public.is_admin());
create policy studio_generations_all on public.studio_generations for all using (public.studio_can(brand_id)) with check (public.studio_can(brand_id));
create policy studio_images_all on public.studio_images for all using (public.studio_can(brand_id)) with check (public.studio_can(brand_id));

-- Só uma marca "base"; só admin cria a base
create or replace function public.studio_brand_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is null then new.created_by := auth.uid(); end if;
  if new.is_base then new.client_id := null; end if;
  return new;
end $$;
create trigger trg_studio_brand_guard before insert on public.studio_brands for each row execute function public.studio_brand_guard();

-- Limites da pasta: bytes e quantidade de referências (configuráveis em studio_settings)
create or replace function public.studio_assets_limits() returns trigger
language plpgsql security definer set search_path = public as $$
declare s public.studio_settings; v_bytes bigint; v_refs int;
begin
  select * into s from public.studio_settings where id = 1;
  select coalesce(sum(size_bytes),0), count(*) filter (where kind = 'reference') into v_bytes, v_refs
    from public.studio_assets where brand_id = new.brand_id;
  if v_bytes + new.size_bytes > s.max_bytes then
    raise exception 'Limite de armazenamento da pasta atingido (% MB).', (s.max_bytes / 1048576);
  end if;
  if new.kind = 'reference' and v_refs + 1 > s.max_refs then
    raise exception 'Limite de % imagens de referência por pasta atingido.', s.max_refs;
  end if;
  if new.created_by is null then new.created_by := auth.uid(); end if;
  return new;
end $$;
create trigger trg_studio_assets_limits before insert on public.studio_assets for each row execute function public.studio_assets_limits();

-- Qualquer mudança no cadastro da marca (exceto o treino) marca "há mudanças a treinar"
create or replace function public.studio_brand_dirty() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.skill_version is not distinct from old.skill_version and new.trained_at is not distinct from old.trained_at
     and new.skill_doc is not distinct from old.skill_doc and new.style_analysis is not distinct from old.style_analysis
     and new.training_status is not distinct from old.training_status then
    new.dirty := true;
  end if;
  return new;
end $$;
create trigger trg_studio_brand_dirty before update on public.studio_brands for each row execute function public.studio_brand_dirty();

-- Status das chaves para o navegador (nunca devolve a chave)
create or replace function public.studio_provider_status()
returns table(provider text, last4 text, base_url text, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select k.provider, k.last4, k.base_url, k.updated_at from public.studio_provider_keys k where public.is_staff()
$$;
revoke execute on function public.studio_provider_status() from public, anon;
grant execute on function public.studio_provider_status() to authenticated;

-- Uso de armazenamento por marca
create or replace function public.studio_usage()
returns table(brand_id uuid, refs bigint, bytes bigint)
language sql stable security invoker set search_path = public as $$
  select a.brand_id, count(*) filter (where a.kind = 'reference'), coalesce(sum(a.size_bytes),0) from public.studio_assets a group by a.brand_id
$$;

-- ---------------------------------------------------------------------
-- Storage privado "studio": {brand_id}/...
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('studio', 'studio', false, 26214400, array['image/jpeg','image/png','image/webp','image/gif','image/avif','image/svg+xml'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "studio_read" on storage.objects for select to authenticated using (
  bucket_id = 'studio' and public.studio_can(public.storage_client_id(name)));
create policy "studio_insert" on storage.objects for insert to authenticated with check (
  bucket_id = 'studio' and public.studio_can(public.storage_client_id(name)));
create policy "studio_delete" on storage.objects for delete to authenticated using (
  bucket_id = 'studio' and public.studio_can(public.storage_client_id(name)));

alter publication supabase_realtime add table public.studio_images, public.studio_generations, public.studio_brands;

-- ---------------------------------------------------------------------
-- Catálogo inicial de modelos de imagem (api_model é editável na tela "Modelos e APIs")
-- ---------------------------------------------------------------------
insert into public.studio_models (id, provider, name, description, api_model, capabilities, sort) values
 ('gpt-image-2.5', 'openai', 'GPT Image 2.5', 'Modelo principal: melhor texto dentro da imagem, seguimento de instruções e edição com máscara.', 'gpt-image-2.5', '{"edit":true,"mask":true,"refs":true,"text":true}', 1),
 ('gpt-image-2', 'openai', 'GPT Image 2', 'Versão anterior da linha GPT Image 2.', 'gpt-image-2', '{"edit":true,"mask":true,"refs":true,"text":true}', 2),
 ('gpt-image-1.5', 'openai', 'GPT Image 1.5', 'Rápido e consistente para carrosséis.', 'gpt-image-1.5', '{"edit":true,"mask":true,"refs":true,"text":true}', 3),
 ('gpt-image-1', 'openai', 'GPT Image 1', 'Primeira geração do GPT Image.', 'gpt-image-1', '{"edit":true,"mask":true,"refs":true,"text":true}', 4),
 ('nano-banana-pro', 'google', 'Nano Banana Pro', 'Gemini 3 Pro Image: texto nítido e edição por conversa.', 'gemini-3-pro-image-preview', '{"edit":true,"mask":false,"refs":true,"text":true}', 5),
 ('nano-banana-2', 'google', 'Nano Banana 2', 'Gemini Flash Image de nova geração (rápido).', 'gemini-3.1-flash-image-preview', '{"edit":true,"mask":false,"refs":true,"text":true}', 6),
 ('nano-banana', 'google', 'Nano Banana', 'Gemini 2.5 Flash Image: rápido e barato.', 'gemini-2.5-flash-image', '{"edit":true,"mask":false,"refs":true,"text":true}', 7),
 ('imagen-4', 'google', 'Imagen 4', 'Fotorrealismo de alta qualidade (sem referências).', 'imagen-4.0-generate-001', '{"edit":false,"mask":false,"refs":false,"text":true}', 8),
 ('seedream-4.5', 'fal', 'Seedream 4.5', 'ByteDance via fal.ai: ótimo para peças editoriais.', 'fal-ai/bytedance/seedream/v4.5/text-to-image', '{"edit":true,"mask":false,"refs":false,"text":true}', 9),
 ('flux-2-pro', 'fal', 'FLUX.2 Pro', 'Black Forest Labs via fal.ai.', 'fal-ai/flux-2-pro', '{"edit":true,"mask":false,"refs":false,"text":true}', 10),
 ('flux-kontext', 'fal', 'FLUX.1 Kontext', 'Edição guiada por referência (fal.ai).', 'fal-ai/flux-pro/kontext', '{"edit":true,"mask":false,"refs":true,"text":true}', 11),
 ('qwen-image', 'fal', 'Qwen-Image', 'Bom para texto em português e chinês (fal.ai).', 'fal-ai/qwen-image', '{"edit":false,"mask":false,"refs":false,"text":true}', 12),
 ('ideogram-3', 'ideogram', 'Ideogram 3.0', 'Tipografia e tipografia criativa.', 'ideogram-v3', '{"edit":false,"mask":false,"refs":false,"text":true}', 13),
 ('recraft-v3', 'recraft', 'Recraft V3', 'Design gráfico, vetores e ilustração.', 'recraftv3', '{"edit":false,"mask":false,"refs":false,"text":true}', 14),
 ('sd-3.5', 'stability', 'Stable Diffusion 3.5', 'Stability AI (Large).', 'sd3.5-large', '{"edit":false,"mask":false,"refs":false,"text":false}', 15),
 ('custom', 'custom', 'Modelo personalizado', 'Qualquer API compatível com OpenAI Images (informe a URL base e o modelo).', 'my-image-model', '{"edit":false,"mask":false,"refs":false,"text":true}', 99);
