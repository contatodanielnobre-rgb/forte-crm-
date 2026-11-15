# FORTE CRM

Sistema de gestão comercial e operacional da **Forte Company** — leads, pipeline, clientes, jornada de entrega, financeiro, agenda, reuniões, ranking, relatórios e configurações, em uma única plataforma integrada.

## Stack

| Camada | Tecnologia |
| --- | --- |
| Framework | Next.js 15 (App Router, Server Actions) + React 19 + TypeScript |
| Banco de dados | PostgreSQL (Supabase, Neon, Railway ou local) via Drizzle ORM |
| Autenticação | E-mail/senha (bcrypt) + sessão JWT em cookie httpOnly; permissões verificadas no servidor |
| UI | Tailwind CSS, lucide-react, Recharts, dnd-kit (Kanban), next-themes (claro/escuro) |
| Arquivos | Vercel Blob em produção (opcional) ou pasta `uploads/` local |
| Exportações | Excel (exceljs) e PDF (pdfkit) |

## Rodando localmente

```bash
npm install
cp .env.example .env          # ajuste DATABASE_URL e AUTH_SECRET
npm run db:migrate            # cria as tabelas
npm run dev                   # http://localhost:3000
```

No primeiro acesso o sistema abre `/setup` para criar o administrador. Etapas do pipeline, tipos de reunião, origens, motivos de perda e regras de pontuação padrão são criados automaticamente (editáveis em **Configurações**).

### Dados de demonstração

Em **Configurações → Dados de demonstração** você pode carregar (e depois remover com um clique) um conjunto de registros fictícios — todos marcados com a etiqueta `demo`. Também é possível semear pelo terminal:

```bash
npm run db:seed    # cria admin@fortecompany.com.br / forte1234 (se não existir) + dados demo
SKIP_DEMO=1 ADMIN_EMAIL=voce@empresa.com ADMIN_PASSWORD=suasenha npm run db:seed   # só o admin
```

Usuários demo usam a senha `demo1234` (ex.: `rafael.demo@fortecompany.com.br` — Comercial, `marina.demo@…` — Gestor, `camila.demo@…` — Operacional).

## Deploy (Vercel + Supabase/Neon)

1. Crie um banco PostgreSQL (Supabase: use a *connection string* do **pooler em modo transaction**; Neon: a string padrão).
2. Importe o repositório na Vercel e configure as variáveis de ambiente:
   - `DATABASE_URL` — string de conexão do Postgres
   - `AUTH_SECRET` — chave aleatória longa (`openssl rand -base64 48`)
   - `APP_TZ` — `America/Fortaleza` (fuso horário; `TZ` é reservada na Vercel)
   - `BLOB_READ_WRITE_TOKEN` — (recomendado) crie um Blob Store em *Storage* na Vercel para anexos persistentes. Sem ele, uploads vão para o disco, que não persiste em serverless.
3. As migrações rodam automaticamente no build (`npm run db:migrate && next build`). Para rodar manualmente: `DATABASE_URL=... npm run db:migrate`
4. Acesse a URL e conclua o `/setup`.

Qualquer outro host Node (Railway, Render, VPS com `npm run build && npm start`) funciona da mesma forma.

## Estrutura

```
src/
  app/(auth)/login, setup        autenticação e configuração inicial
  app/(app)/                      área logada (layout com menu lateral + topo)
    dashboard, pipeline, clientes/[id], financeiro, agenda, jornada,
    reunioes, relatorios, ranking, configuracoes, perfil
  app/api/relatorios/export       exportação PDF/Excel
  app/api/uploads/[...path]       serve anexos locais (autenticado)
  db/schema.ts                    modelo de dados (Drizzle)
  lib/auth.ts, permissions.ts     sessão, perfis e matriz de permissões
  lib/services/                   regras de negócio: leads (automações), jornada,
                                  financeiro (parcelas/status), ranking (pontos), métricas, relatórios
  lib/demo.ts                     dados de demonstração (carregar/remover)
drizzle/                          migrações SQL
scripts/migrate.ts, seed.ts
```

## Perfis de acesso

| Perfil | Acesso |
| --- | --- |
| Administrador | Tudo: equipe, metas, pontuação, premiações, financeiro, configurações |
| Gestor | Pipeline e clientes de toda a equipe, indicadores, financeiro (leitura), jornada |
| Comercial | Seus leads e pipeline, agenda, reuniões, ranking e desempenho |
| Operacional | Clientes atribuídos, etapas de entrega, reuniões, tarefas e relatórios |

As verificações acontecem no servidor (`requirePermission` nas actions e `requirePage` nas páginas) — não apenas na interface.

## Automações implementadas

- Venda fechada no pipeline → cria o cliente, o contrato inicial, as parcelas e a jornada de entrega; pontua o vendedor e verifica bônus de meta.
- Contrato marcado como assinado → conclui a etapa *Contrato* da jornada (e vice-versa).
- Onboarding concluído → cliente passa de *Onboarding* para *Ativo*.
- Reunião comercial realizada → pontos no ranking; reunião de cliente realizada → etapa *Reuniões semanais* fica ativa; permite registrar ata e tarefas.
- Relatório entregue → etapa *Relatórios* fica ativa (recorrente).
- Parcelas vencidas → status *Em atraso* e destaque no financeiro; etapas fora do prazo → alertas na jornada e no dashboard.
- Notificações internas para atribuições, vendas e premiações.
