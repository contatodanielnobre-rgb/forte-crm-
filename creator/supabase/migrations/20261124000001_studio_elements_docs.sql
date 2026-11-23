-- Estúdio: personagens, objetos e referências de concorrentes + documentos de treinamento da empresa.
-- Aplique depois de 20261123000001. Não altera dados existentes.

-- 1) studio_assets passa a guardar também personagens, objetos e posts de concorrentes
alter table public.studio_assets drop constraint if exists studio_assets_kind_check;
alter table public.studio_assets add constraint studio_assets_kind_check
  check (kind in ('reference','logo','character','object','competitor'));
alter table public.studio_assets add column if not exists label text;               -- nome curto usado no @ (ex.: "Dennis")
alter table public.studio_assets add column if not exists saved boolean not null default true; -- false = só deste post; true = fica na biblioteca da empresa
create index if not exists studio_assets_brand_kind_saved on public.studio_assets (brand_id, kind, saved);

-- 2) documentos de treinamento da empresa (PDF, formulário, imagens, reunião gravada…)
create table if not exists public.studio_brand_docs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.studio_brands(id) on delete cascade,
  kind text not null default 'document' check (kind in ('document','image','audio','video','text')),
  name text not null,
  mime_type text,
  size_bytes bigint not null default 0,
  storage_path text,                 -- null quando o arquivo original era grande demais e só a transcrição foi guardada
  extracted_text text,               -- texto extraído (docx/pptx/txt) ou transcrição de áudio/vídeo
  summary text,                      -- o que a IA concluiu deste documento
  status text not null default 'new' check (status in ('new','analyzed','error')),
  error text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists studio_brand_docs_brand on public.studio_brand_docs (brand_id, created_at desc);

alter table public.studio_brand_docs enable row level security;
drop policy if exists studio_brand_docs_all on public.studio_brand_docs;
create policy studio_brand_docs_all on public.studio_brand_docs for all
  using (public.studio_can(brand_id)) with check (public.studio_can(brand_id));
