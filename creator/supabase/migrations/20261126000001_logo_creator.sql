-- Criador de logos + branding (Criação de conteúdo).
-- Aplique depois de 20261125000001. Não altera dados existentes.
--
-- Fluxo: o usuário sobe logos de referência (treinamento, por empresa ou da agência) → treina → abre o estúdio de logos,
-- responde o formulário e a IA gera conceitos → aprova uma → edita cores/layout no navegador (sem IA) → "Ver em branding" gera mockups.
-- As imagens ficam no bucket "studio" (primeiro nível = id da pasta da empresa; as policies atuais já cobrem).

-- 1) Logos de referência (treinamento) entram na biblioteca existente
alter table public.studio_assets drop constraint if exists studio_assets_kind_check;
alter table public.studio_assets add constraint studio_assets_kind_check
  check (kind in ('reference','logo','character','object','competitor','logo_ref'));

-- 2) Treinamento de logos por pasta (a pasta "base" vale para toda a agência)
alter table public.studio_brands add column if not exists logo_skill_doc text;
alter table public.studio_brands add column if not exists logo_analysis jsonb;
alter table public.studio_brands add column if not exists logo_skill_version int not null default 0;
alter table public.studio_brands add column if not exists logo_trained_at timestamptz;
alter table public.studio_brands add column if not exists logo_trained_refs int not null default 0;   -- quantas referências existiam no último treino
alter table public.studio_brands add column if not exists logo_notes text;                            -- regras extras escritas pela equipe

-- 3) Projetos de logo (um por pedido do formulário)
create table if not exists public.logo_projects (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.studio_brands(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  name text not null default 'Logo' check (char_length(trim(name)) between 1 and 120),
  form jsonb not null default '{}'::jsonb,            -- nome, segmento, o que vende, direção, cores, sensação, slogan…
  inputs jsonb not null default '[]'::jsonb,          -- imagens extras: [{path,name,role:'competitor'|'attempt'|'inspiration',note}]
  positioning text,
  cliches jsonb not null default '[]'::jsonb,
  model_id text,
  quality text not null default 'medium',
  status text not null default 'draft' check (status in ('draft','generating','ready','approved')),
  approved_version_id uuid,
  inspect jsonb,                                       -- leitura da logo aprovada (descrição, fonte parecida, cores)
  branding jsonb not null default '{}'::jsonb,         -- plano de cenas, textos da apresentação
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists logo_projects_brand on public.logo_projects (brand_id, created_at desc);
drop trigger if exists trg_logo_projects_touch on public.logo_projects;
create trigger trg_logo_projects_touch before update on public.logo_projects for each row execute function public.touch_updated_at();

-- 4) Versões / conceitos gerados
create table if not exists public.logo_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.logo_projects(id) on delete cascade,
  brand_id uuid not null references public.studio_brands(id) on delete cascade,
  parent_id uuid references public.logo_versions(id) on delete set null,   -- ajuste de uma versão anterior
  number int not null default 1,
  concept jsonb not null default '{}'::jsonb,          -- {name, big_idea, symbol, typography, colors, image_brief…}
  feedback text,
  prompt text,
  status text not null default 'queued' check (status in ('queued','running','done','error')),
  error text,
  storage_path text,
  width int,
  height int,
  favorite boolean not null default false,
  edit jsonb not null default '{}'::jsonb,             -- estado do painel: cortes, layout, cores e o kit salvo
  usage jsonb,
  cost_usd numeric,
  created_at timestamptz not null default now()
);
create index if not exists logo_versions_project on public.logo_versions (project_id, created_at);
alter table public.logo_projects drop constraint if exists logo_projects_approved_fk;
alter table public.logo_projects add constraint logo_projects_approved_fk foreign key (approved_version_id) references public.logo_versions(id) on delete set null;

-- 5) Mockups de branding
create table if not exists public.logo_brandings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.logo_projects(id) on delete cascade,
  brand_id uuid not null references public.studio_brands(id) on delete cascade,
  version_id uuid references public.logo_versions(id) on delete set null,
  scene_key text not null default 'cena',
  title text not null default 'Cena',
  scene text not null default '',
  aspect text not null default '4:5',
  variant text not null default 'color',                -- color | white | black | symbol
  logo_path text,                                       -- arquivo da logo (ou variante) enviado como referência
  feedback text,
  prompt text,
  status text not null default 'queued' check (status in ('queued','running','done','error')),
  error text,
  storage_path text,
  width int,
  height int,
  approved boolean not null default false,
  sort int not null default 0,
  usage jsonb,
  cost_usd numeric,
  created_at timestamptz not null default now()
);
create index if not exists logo_brandings_project on public.logo_brandings (project_id, sort, created_at);

-- 6) Permissões: as mesmas das pastas de empresa
alter table public.logo_projects enable row level security;
alter table public.logo_versions enable row level security;
alter table public.logo_brandings enable row level security;
drop policy if exists logo_projects_all on public.logo_projects;
drop policy if exists logo_versions_all on public.logo_versions;
drop policy if exists logo_brandings_all on public.logo_brandings;
create policy logo_projects_all on public.logo_projects for all using (public.studio_can(brand_id)) with check (public.studio_can(brand_id));
create policy logo_versions_all on public.logo_versions for all using (public.studio_can(brand_id)) with check (public.studio_can(brand_id));
create policy logo_brandings_all on public.logo_brandings for all using (public.studio_can(brand_id)) with check (public.studio_can(brand_id));

-- 7) Limite de logos de referência por pasta (além do limite de armazenamento que já existe)
create or replace function public.studio_assets_limits() returns trigger
language plpgsql security definer set search_path = public as $$
declare s public.studio_settings; v_bytes bigint; v_refs int; v_logos int;
begin
  select * into s from public.studio_settings where id = 1;
  select coalesce(sum(size_bytes),0), count(*) filter (where kind = 'reference'), count(*) filter (where kind = 'logo_ref')
    into v_bytes, v_refs, v_logos from public.studio_assets where brand_id = new.brand_id;
  if v_bytes + new.size_bytes > s.max_bytes then
    raise exception 'Limite de armazenamento da pasta atingido (% MB).', (s.max_bytes / 1048576);
  end if;
  if new.kind = 'reference' and v_refs + 1 > s.max_refs then
    raise exception 'Limite de % imagens de referência por pasta atingido.', s.max_refs;
  end if;
  if new.kind = 'logo_ref' and v_logos + 1 > 100 then
    raise exception 'Limite de 100 logos de referência por pasta atingido.';
  end if;
  if new.created_by is null then new.created_by := auth.uid(); end if;
  return new;
end $$;

-- 8) Treinar logos não deve marcar "há mudanças a treinar" no treinamento de carrosséis
create or replace function public.studio_brand_dirty() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.skill_version is not distinct from old.skill_version and new.trained_at is not distinct from old.trained_at
     and new.skill_doc is not distinct from old.skill_doc and new.style_analysis is not distinct from old.style_analysis
     and new.training_status is not distinct from old.training_status
     and new.logo_skill_doc is not distinct from old.logo_skill_doc and new.logo_analysis is not distinct from old.logo_analysis
     and new.logo_skill_version is not distinct from old.logo_skill_version and new.logo_trained_at is not distinct from old.logo_trained_at
     and new.logo_trained_refs is not distinct from old.logo_trained_refs and new.logo_notes is not distinct from old.logo_notes then
    new.dirty := true;
  end if;
  return new;
end $$;

-- 9) Tempo real: o estúdio atualiza sozinho enquanto as imagens são geradas
do $$ begin
  begin alter publication supabase_realtime add table public.logo_versions; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.logo_brandings; exception when duplicate_object then null; end;
end $$;
