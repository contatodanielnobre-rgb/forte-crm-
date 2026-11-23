-- Criação de conteúdo — parte 2: agente "designer" (criador de prompts), catálogo GPT Image 2.6 e custo por imagem
-- Rode depois de 20261121000001_studio.sql

-- 1) Configurações do agente e do custo
alter table public.studio_settings
  add column if not exists agent_playbook   text,                              -- manual do "designer" treinado (gerado no passo Treinar do Começar)
  add column if not exists agent_version    int not null default 0,
  add column if not exists agent_trained_at timestamptz,
  add column if not exists agent_notes      jsonb not null default '{}'::jsonb, -- respostas do questionário (objetivo, linguagem, público…)
  add column if not exists default_quality  text not null default 'high',
  add column if not exists refs_per_slide   int  not null default 3 check (refs_per_slide between 0 and 8); -- menos referências = menos custo de entrada

alter table public.studio_settings alter column text_model set default 'gpt-6-luna';
alter table public.studio_settings alter column default_model set default 'gpt-image-2.6-sunburst';
update public.studio_settings set text_model = 'gpt-6-luna' where text_model in ('gpt-4.1', 'gpt-4o');
update public.studio_settings set default_model = 'gpt-image-2.6-sunburst' where default_model = 'gpt-image-2.5';

-- 2) Custo real de cada imagem (calculado a partir do "usage" devolvido pela OpenAI)
alter table public.studio_images
  add column if not exists cost_usd numeric(10, 4),
  add column if not exists usage jsonb;

-- 3) Catálogo: nomes oficiais da OpenAI (a 2.5 e a 2.6 existem nas variantes "sunburst" e "flare")
update public.studio_models set
  name = 'GPT Image 2.5 Sunburst', api_model = 'gpt-image-2.5-sunburst',
  description = 'Qualidade/detalhe. Mesmo preço por token da 2.6; costuma ficar mais barata em qualidade baixa/média.', sort = 3
where id = 'gpt-image-2.5';

insert into public.studio_models (id, provider, name, description, api_model, capabilities, sort) values
 ('gpt-image-2.6-sunburst', 'openai', 'GPT Image 2.6 Sunburst', 'Principal: acabamento e consistência em edições. Use qualidade alta para texto na arte.', 'gpt-image-2.6-sunburst', '{"edit":true,"mask":true,"refs":true,"text":true}', 1),
 ('gpt-image-2.6-flare',    'openai', 'GPT Image 2.6 Flare',    'Rápido (rascunhos, variações e layouts). Mesmo preço por token da Sunburst.', 'gpt-image-2.6-flare', '{"edit":true,"mask":true,"refs":true,"text":true}', 2),
 ('gpt-image-2.5-flare',    'openai', 'GPT Image 2.5 Flare',    'Rápido e barato em qualidade baixa/média.', 'gpt-image-2.5-flare', '{"edit":true,"mask":true,"refs":true,"text":true}', 4)
on conflict (id) do nothing;

update public.studio_models set sort = 5 where id = 'gpt-image-2';
-- gpt-image-1 foi encerrada e a 1.5 sai em 01/12/2026: ficam desativadas
update public.studio_models set enabled = false, description = 'Descontinuada pela OpenAI.', sort = 90 where id in ('gpt-image-1', 'gpt-image-1.5');

-- 4) Só o modelo recomendado fica LIGADO por padrão (a chave liga/desliga na tela Modelos e APIs; ligar não gera cobrança, só aparece na lista do estúdio)
update public.studio_models set enabled = (id = 'gpt-image-2.6-sunburst');
update public.studio_settings set default_model = 'gpt-image-2.6-sunburst', text_model = 'gpt-6-luna';
