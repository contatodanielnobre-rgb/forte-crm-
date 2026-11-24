-- Criador de layouts de site (UX/UI) (Criação de conteúdo).
-- Aplique depois de 20261127000001. Não altera dados existentes.
--
-- Fluxo: o usuário sobe prints/PDF/vídeo de sites (treino) → a IA lê cada site e separa por categorias → treina →
-- no estúdio descreve o negócio e sobe o site atual → a IA lê o site, propõe um plano (sistema de design + páginas e seções)
-- → gera uma imagem por seção (hero primeiro).

-- 1) Prints de sites entram na biblioteca existente (cada recorte de página é um asset do tipo site_ref)
alter table public.studio_assets drop constraint if exists studio_assets_kind_check;
alter table public.studio_assets add constraint studio_assets_kind_check
  check (kind in ('reference','logo','character','object','competitor','logo_ref','thumb_ref','site_ref'));

-- 2) Sites de referência (um por site; os recortes ficam em studio_assets.site_id)
create table if not exists public.layout_sites (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.studio_brands(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  name text not null default 'Site' check (char_length(trim(name)) between 1 and 200),
  url text,
  categories text[] not null default '{}',            -- ids das categorias (a IA sugere, o usuário corrige)
  notes text,
  observation jsonb,                                  -- leitura da IA: segmento, estilo, paleta, tipografia, seções…
  observed_at timestamptz,
  favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists layout_sites_brand on public.layout_sites (brand_id, created_at desc);
drop trigger if exists trg_layout_sites_touch on public.layout_sites;
create trigger trg_layout_sites_touch before update on public.layout_sites for each row execute function public.touch_updated_at();

alter table public.studio_assets add column if not exists site_id uuid references public.layout_sites(id) on delete cascade;
alter table public.studio_assets add column if not exists site_order int not null default 0;
create index if not exists studio_assets_site on public.studio_assets (site_id, site_order);

-- 3) Treinamento de layouts por pasta (a pasta "base" vale para toda a agência)
alter table public.studio_brands add column if not exists layout_skill_doc text;
alter table public.studio_brands add column if not exists layout_analysis jsonb;
alter table public.studio_brands add column if not exists layout_skill_version int not null default 0;
alter table public.studio_brands add column if not exists layout_trained_at timestamptz;
alter table public.studio_brands add column if not exists layout_trained_refs int not null default 0;   -- nº de sites no último treino
alter table public.studio_brands add column if not exists layout_notes text;

-- 4) Projetos de layout (um por site a criar/redesenhar)
create table if not exists public.layout_projects (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.studio_brands(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  name text not null default 'Site' check (char_length(trim(name)) between 1 and 160),
  form jsonb not null default '{}'::jsonb,            -- negócio, tipo de site, objetivo, estilo, páginas, mascote, links…
  inputs jsonb not null default '[]'::jsonb,          -- recortes enviados: [{path,name,role:'current'|'competitor'|'inspiration',page,order,note}]
  analysis jsonb,                                     -- leitura do site atual pela IA
  plan jsonb,                                         -- sistema de design + páginas + seções (editável)
  model_id text,
  quality text not null default 'medium',
  status text not null default 'draft' check (status in ('draft','analyzing','planned','generating','ready','approved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists layout_projects_brand on public.layout_projects (brand_id, created_at desc);
drop trigger if exists trg_layout_projects_touch on public.layout_projects;
create trigger trg_layout_projects_touch before update on public.layout_projects for each row execute function public.touch_updated_at();

-- 5) Seções geradas (guia de estilo, mascote e uma imagem por seção; cada ajuste vira uma nova versão)
create table if not exists public.layout_sections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.layout_projects(id) on delete cascade,
  brand_id uuid not null references public.studio_brands(id) on delete cascade,
  kind text not null default 'section' check (kind in ('system','mascot','section')),
  page_key text not null default 'home',
  page_name text not null default 'Home',
  section_key text not null default 'hero',
  name text not null default 'Seção',
  position int not null default 0,
  version int not null default 1,
  is_current boolean not null default true,
  parent_id uuid references public.layout_sections(id) on delete set null,
  concept jsonb not null default '{}'::jsonb,          -- o que a seção mostra (copy, componentes, composição)
  feedback text,
  prompt text,
  status text not null default 'plan' check (status in ('plan','queued','running','done','error')),
  error text,
  storage_path text,
  width int,
  height int,
  favorite boolean not null default false,
  approved boolean not null default false,
  usage jsonb,
  cost_usd numeric,
  created_at timestamptz not null default now()
);
create index if not exists layout_sections_project on public.layout_sections (project_id, position, version);

-- 6) Permissões: as mesmas das pastas de empresa
alter table public.layout_sites enable row level security;
alter table public.layout_projects enable row level security;
alter table public.layout_sections enable row level security;
drop policy if exists layout_sites_all on public.layout_sites;
drop policy if exists layout_projects_all on public.layout_projects;
drop policy if exists layout_sections_all on public.layout_sections;
create policy layout_sites_all on public.layout_sites for all using (public.studio_can(brand_id)) with check (public.studio_can(brand_id));
create policy layout_projects_all on public.layout_projects for all using (public.studio_can(brand_id)) with check (public.studio_can(brand_id));
create policy layout_sections_all on public.layout_sections for all using (public.studio_can(brand_id)) with check (public.studio_can(brand_id));

-- 7) Limites por pasta (recortes de sites: até 1500 por pasta)
create or replace function public.studio_assets_limits() returns trigger
language plpgsql security definer set search_path = public as $$
declare s public.studio_settings; v_bytes bigint; v_refs int; v_logos int; v_thumbs int; v_sites int;
begin
  select * into s from public.studio_settings where id = 1;
  select coalesce(sum(size_bytes),0), count(*) filter (where kind = 'reference'), count(*) filter (where kind = 'logo_ref'), count(*) filter (where kind = 'thumb_ref'), count(*) filter (where kind = 'site_ref')
    into v_bytes, v_refs, v_logos, v_thumbs, v_sites from public.studio_assets where brand_id = new.brand_id;
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
  if new.kind = 'site_ref' and v_sites + 1 > 1500 then
    raise exception 'Limite de 1500 recortes de sites por pasta atingido.';
  end if;
  if new.created_by is null then new.created_by := auth.uid(); end if;
  return new;
end $$;

-- 8) Treinar layouts não marca "há mudanças a treinar" no treinamento de carrosséis
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
     and new.thumb_trained_refs is not distinct from old.thumb_trained_refs and new.thumb_notes is not distinct from old.thumb_notes
     and new.layout_skill_doc is not distinct from old.layout_skill_doc and new.layout_analysis is not distinct from old.layout_analysis
     and new.layout_skill_version is not distinct from old.layout_skill_version and new.layout_trained_at is not distinct from old.layout_trained_at
     and new.layout_trained_refs is not distinct from old.layout_trained_refs and new.layout_notes is not distinct from old.layout_notes then
    new.dirty := true;
  end if;
  return new;
end $$;

-- 9) Tempo real
do $$ begin
  begin alter publication supabase_realtime add table public.layout_sections; exception when duplicate_object then null; end;
end $$;
