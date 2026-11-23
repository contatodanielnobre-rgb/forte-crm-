-- Criação de conteúdo — parte 3: fontes preferidas por empresa e informações para o assistente de treino (IA)
-- Rode depois de 20261122000001_studio_agent.sql

alter table public.studio_brands
  add column if not exists font_prefs  jsonb not null default '{"list":[],"notes":""}'::jsonb,  -- fontes padrão da empresa: {list: ["Inter", ...], notes: "como usar"}
  add column if not exists brand_brief jsonb not null default '{}'::jsonb;                       -- o que o usuário contou à IA: {about, products, goal, audience, differentiators}

-- Análise visual (IA de visão) das referências de cada estilo: {solido: {...}, humanizado: {...}}
alter table public.studio_settings add column if not exists style_visuals jsonb not null default '{}'::jsonb;
