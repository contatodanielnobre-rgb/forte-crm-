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

## SALES COP AI — o policial de vendas com inteligência artificial

Módulo independente dentro do FORTE CRM (menu **SALES COP AI**) que **fiscaliza, investiga, planeja e executa** a operação comercial sobre os dados reais do CRM. Nada é simulado: sem credenciais externas, o agente trabalha só com as regras e informa o que falta configurar.

| Aba | O que faz |
| --- | --- |
| Central de Comando | KPIs da operação, **Índice de Saúde Comercial** (0–100, verde/amarelo/vermelho, critérios e pesos configuráveis), Relatório de Inteligência e chat com o agente |
| Plano de Ação | Plano diário gerado a partir das pendências reais; aprovar/editar/rejeitar; a aprovação cria **tarefas reais** (`tasks.source = salescop`, vinculadas ao lead) |
| Fiscalização Comercial | Regras 1–6 (primeiro contato, follow-up, leads parados, reuniões, propostas, responsabilidade) + sem movimentação, risco de perda e vendedores inativos; histórico de irregularidades |
| Desempenho da Equipe | Métricas individuais, ranking (40% produtividade + 60% resultado) e sinais de atenção |
| Investigação de Gargalos | Funil de 90 dias, queda entre etapas, fatos × hipóteses e recomendações |
| Relatórios Inteligentes | Diário, semanal, mensal, por vendedor, conversão, produtividade e gargalos (com narrativa da IA quando ativa) |
| Configurações do Agente | Nível de autonomia (Observador / Operacional / Gerente autônomo), regras, pesos do índice, rotina, IA, WhatsApp, log de execução |

**Permissões:** `salescop.view` (Admin, Gestor, Comercial — o Comercial vê só o próprio recorte), `salescop.manage` (Admin, Gestor), `salescop.settings` (Admin). O agente nunca exclui leads, altera financeiro, metas ou permissões.

**Banco:** migração `drizzle/0001_sales_cop_ai.sql` — tabelas `ai_action_plans`, `ai_plan_items`, `ai_findings`, `ai_execution_logs`, `ai_reports`, `whatsapp_messages`; colunas novas `leads.stage_entered_at`, `appointments.confirmed_at`, `tasks.lead_id/priority/source/plan_item_id`. Configurações em `settings.key = "salescop"`. O sistema é single-tenant (uma empresa por instância); o isolamento é por banco/deploy.

**Variáveis de ambiente (todas opcionais — o módulo degrada com aviso):**

| Variável | Uso |
| --- | --- |
| `OPENAI_API_KEY` | IA (chat, narrativa dos relatórios, function calling sobre o CRM). Chamadas só no backend. |
| `CRON_SECRET` | Protege `/api/salescop/routine`. Vercel Cron envia `Authorization: Bearer <CRON_SECRET>` automaticamente. |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN` | WhatsApp Business Cloud API (Meta). Webhook: `https://<seu-dominio>/api/salescop/whatsapp`. |
| `WHATSAPP_TEMPLATE_DAILY` | Template aprovado (1 parâmetro de texto) para iniciar conversa fora da janela de 24h. |

**Rotina automática** (horários configuráveis): 08:00 investigação · 08:15 plano · 10:00 fiscalização · 12:00 parcial · 14:00 oportunidades · 16:00 fiscalização · 17:30 encerramento. O `vercel.json` agenda `GET /api/salescop/routine` a cada 15 min em dias úteis (UTC 11–21h = 8–18h em Fortaleza); o endpoint executa apenas os passos cujo horário já passou e que ainda não rodaram no dia (idempotente). No plano Hobby da Vercel os crons são limitados a 1×/dia — use n8n ou outro agendador chamando o mesmo endpoint (`?step=plano` força um passo).

**WhatsApp:** os usuários são identificados pelo telefone cadastrado no perfil. Mensagens recebidas são respondidas pelo agente (com IA, ou pelas regras). Ative a integração e os avisos em *Configurações do Agente*.
