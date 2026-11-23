-- Criador de thumbnails virais (Criação de conteúdo).
-- Aplique depois de 20261126000001. Não altera dados existentes.
--
-- Fluxo: o usuário sobe thumbnails de referência (treino, com categorias) → treina → no estúdio explica o vídeo (texto ou voz),
-- escolhe categoria e personagens (fotos já existentes em studio_assets, kind = 'character') → a IA propõe conceitos → gera as imagens.

-- 1) Thumbnails de referência entram na biblioteca existente; "meta" guarda a análise de cada uma
alter table public.studio_assets drop constraint if exists studio_assets_kind_check;
alter table public.studio_assets add constraint studio_assets_kind_check
  check (kind in ('reference','logo','character','object','competitor','logo_ref','thumb_ref'));
alter table public.studio_assets add column if not exists meta jsonb;               -- thumb_ref: observação da IA (posição, expressão, texto, paleta…)

-- 2) Treinamento de thumbnails por pasta (a pasta "base" vale para toda a agência)
alter table public.studio_brands add column if not exists thumb_skill_doc text;
alter table public.studio_brands add column if not exists thumb_analysis jsonb;      -- {general, categories:{id:{…}}}
alter table public.studio_brands add column if not exists thumb_skill_version int not null default 0;
alter table public.studio_brands add column if not exists thumb_trained_at timestamptz;
alter table public.studio_brands add column if not exists thumb_trained_refs int not null default 0;
alter table public.studio_brands add column if not exists thumb_notes text;

-- 3) Projetos de thumbnail (um por vídeo)
create table if not exists public.thumb_projects (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.studio_brands(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  name text not null default 'Thumbnail' check (char_length(trim(name)) between 1 and 160),
  form jsonb not null default '{}'::jsonb,            -- título, explicação do vídeo, categorias, personagens e papéis, texto…
  inputs jsonb not null default '[]'::jsonb,          -- imagens extras: [{path,name,role:'competitor'|'inspiration'|'own',note}]
  analysis text,                                      -- leitura do vídeo pela IA (promessa, emoção, categoria)
  model_id text,
  quality text not null default 'medium',
  status text not null default 'draft' check (status in ('draft','generating','ready','approved')),
  approved_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists thumb_projects_brand on public.thumb_projects (brand_id, created_at desc);
drop trigger if exists trg_thumb_projects_touch on public.thumb_projects;
create trigger trg_thumb_projects_touch before update on public.thumb_projects for each row execute function public.touch_updated_at();

-- 4) Versões / conceitos gerados
create table if not exists public.thumb_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.thumb_projects(id) on delete cascade,
  brand_id uuid not null references public.studio_brands(id) on delete cascade,
  parent_id uuid references public.thumb_versions(id) on delete set null,   -- ajuste de uma versão anterior
  number int not null default 1,
  concept jsonb not null default '{}'::jsonb,          -- ideia, composição, personagens, texto, image_brief…
  feedback text,
  prompt text,
  status text not null default 'idea' check (status in ('idea','queued','running','done','error')),   -- idea = só o conceito, ainda sem imagem
  error text,
  storage_path text,
  width int,
  height int,
  favorite boolean not null default false,
  usage jsonb,
  cost_usd numeric,
  created_at timestamptz not null default now()
);
create index if not exists thumb_versions_project on public.thumb_versions (project_id, created_at);
alter table public.thumb_projects drop constraint if exists thumb_projects_approved_fk;
alter table public.thumb_projects add constraint thumb_projects_approved_fk foreign key (approved_version_id) references public.thumb_versions(id) on delete set null;

-- 5) Permissões: as mesmas das pastas de empresa
alter table public.thumb_projects enable row level security;
alter table public.thumb_versions enable row level security;
drop policy if exists thumb_projects_all on public.thumb_projects;
drop policy if exists thumb_versions_all on public.thumb_versions;
create policy thumb_projects_all on public.thumb_projects for all using (public.studio_can(brand_id)) with check (public.studio_can(brand_id));
create policy thumb_versions_all on public.thumb_versions for all using (public.studio_can(brand_id)) with check (public.studio_can(brand_id));

-- 6) Limites por pasta (inclui as logos de referência da migração anterior)
create or replace function public.studio_assets_limits() returns trigger
language plpgsql security definer set search_path = public as $$
declare s public.studio_settings; v_bytes bigint; v_refs int; v_logos int; v_thumbs int;
begin
  select * into s from public.studio_settings where id = 1;
  select coalesce(sum(size_bytes),0), count(*) filter (where kind = 'reference'), count(*) filter (where kind = 'logo_ref'), count(*) filter (where kind = 'thumb_ref')
    into v_bytes, v_refs, v_logos, v_thumbs from public.studio_assets where brand_id = new.brand_id;
  if v_bytes + new.size_bytes > s.max_bytes then
    raise exception 'Limite de armazenamento da pasta atingido (% MB).', (s.max_bytes / 1048576);
  end if;
  if new.kind = 'reference' and v_refs + 1 > s.max_refs then
    raise exception 'Limite de % imagens de referência por pasta atingido.', s.max_refs;
  end if;
  if new.kind = 'logo_ref' and v_logos + 1 > 100 then
    raise exception 'Limite de 100 logos de referência por pasta atingido.';
  end if;
  if new.kind = 'thumb_ref' and v_thumbs + 1 > 300 then
    raise exception 'Limite de 300 thumbnails de referência por pasta atingido.';
  end if;
  if new.created_by is null then new.created_by := auth.uid(); end if;
  return new;
end $$;

-- 7) Treinar thumbnails/logos não marca "há mudanças a treinar" no treinamento de carrosséis
create or replace function public.studio_brand_dirty() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.skill_version is not distinct from old.skill_version and new.trained_at is not distinct from old.trained_at
     and new.skill_doc is not distinct from old.skill_doc and new.style_analysis is not distinct from old.style_analysis
     and new.training_status is not distinct from old.training_status
     and new.logo_skill_doc is not distinct from old.logo_skill_doc and new.logo_analysis is not distinct from old.logo_analysis
     and new.logo_skill_version is not distinct from old.logo_skill_version and new.logo_trained_at is not distinct from old.logo_trained_at
     and new.logo_trained_refs is not distinct from old.logo_trained_refs and new.logo_notes is not distinct from old.logo_notes
     and new.thumb_skill_doc is not distinct from old.thumb_skill_doc and new.thumb_analysis is not distinct from old.thumb_analysis
     and new.thumb_skill_version is not distinct from old.thumb_skill_version and new.thumb_trained_at is not distinct from old.thumb_trained_at
     and new.thumb_trained_refs is not distinct from old.thumb_trained_refs and new.thumb_notes is not distinct from old.thumb_notes then
    new.dirty := true;
  end if;
  return new;
end $$;

-- 8) Tempo real
do $$ begin
  begin alter publication supabase_realtime add table public.thumb_versions; exception when duplicate_object then null; end;
end $$;
