import { asc, desc, eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { CheckCircle2, XCircle, ShieldCheck, Webhook, Clock3, Tags, SlidersHorizontal } from "lucide-react";
import { db, t } from "@/db";
import { requirePage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSetting } from "@/lib/bootstrap";
import { cloudConfigured, GRAPH_VERSION, integrationStatus } from "@/lib/chat/cloud-api";
import { ensureChatDefaults, getChatSettings } from "@/lib/chat/core";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import { LabelsManager, SettingsForm } from "./client";

export const metadata = { title: "FORTE CHAT — Integração" };
export const dynamic = "force-dynamic";

export default async function ChatConfigPage() {
  const user = await requirePage("chat.view");
  await ensureChatDefaults();
  const manage = can(user.role, "chat.manage");
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const status = integrationStatus();
  const [labels, settings, sched, [lastIn], [lastOut], [counts]] = await Promise.all([
    db.select().from(t.chatLabels).orderBy(asc(t.chatLabels.order), asc(t.chatLabels.name)),
    getChatSettings(),
    getSetting<{ at: string; sent: number; failed: number; manual: number } | null>("chat_scheduler", null),
    db.select({ at: t.chatMessages.createdAt }).from(t.chatMessages).where(eq(t.chatMessages.direction, "IN")).orderBy(desc(t.chatMessages.createdAt)).limit(1),
    db.select({ at: t.chatMessages.sentAt }).from(t.chatMessages).where(eq(t.chatMessages.status, "ENVIADA")).orderBy(desc(t.chatMessages.createdAt)).limit(1),
    db.select({ convs: sql<number>`(select count(*)::int from chat_conversations)`, msgs: sql<number>`(select count(*)::int from chat_messages)`, pending: sql<number>`(select count(*)::int from chat_scheduled_tasks where status = 'AGENDADA')` }).from(sql`(select 1) x`),
  ]);
  const ready = cloudConfigured();
  return (
    <div className="h-full overflow-y-auto pb-8 space-y-4 max-w-5xl">
      <div className={`card p-4 flex items-start gap-3 ${ready ? "border-emerald-500/30" : "border-amber-500/40"}`}>
        {ready ? <CheckCircle2 className="text-emerald-500 shrink-0" /> : <XCircle className="text-amber-500 shrink-0" />}
        <div className="text-sm"><p className="font-semibold">{ready ? "WhatsApp Business Platform (Cloud API) conectado" : "Integração oficial com o WhatsApp ainda não configurada"}</p><p className="text-muted mt-0.5">{ready ? `Envio e recebimento reais pela API oficial da Meta (Graph ${GRAPH_VERSION()}).` : "Enquanto as credenciais não forem cadastradas, o FORTE CHAT não envia nem recebe mensagens — nada é simulado. Abaixo está exatamente o que falta."}</p></div>
      </div>

      <section className="card p-5">
        <h2 className="font-semibold flex items-center gap-2 mb-3"><ShieldCheck size={18} className="text-gold" /> Checklist da integração</h2>
        <ul className="divide-y divide-line text-sm">{status.map((s) => <li key={s.key} className="py-2 flex items-center gap-3">{s.ok ? <CheckCircle2 size={16} className="text-emerald-500" /> : <XCircle size={16} className={s.required ? "text-red-500" : "text-muted"} />}<span className="flex-1">{s.label}{!s.required && <span className="text-muted"> (opcional)</span>}</span><code className="text-xs text-muted">{s.key}</code></li>)}</ul>
        <p className="text-xs text-muted mt-3">As variáveis ficam no painel da Vercel (Settings → Environment Variables) e nunca são exibidas aqui. Depois de salvar, faça um novo deploy.</p>
      </section>

      <section className="card p-5 space-y-3 text-sm">
        <h2 className="font-semibold flex items-center gap-2"><Webhook size={18} className="text-gold" /> Webhook (Meta → CRM)</h2>
        <div className="grid sm:grid-cols-[160px_1fr] gap-x-3 gap-y-1.5">
          <span className="text-muted">URL de callback</span><code className="break-all">{origin}/api/salescop/whatsapp</code>
          <span className="text-muted">Alternativa</span><code className="break-all">{origin}/api/chat/whatsapp</code>
          <span className="text-muted">Campos assinados</span><span><code>messages</code> (inclui status de envio, entrega e leitura)</span>
          <span className="text-muted">Segurança</span><span>Token de verificação (<code>WHATSAPP_VERIFY_TOKEN</code>) + assinatura HMAC <code>X-Hub-Signature-256</code> com o App Secret.</span>
        </div>
        <p className="text-xs text-muted">Um único webhook atende os dois módulos: mensagens de membros da equipe (telefone cadastrado no perfil) seguem para o SALES COP AI; mensagens de leads e clientes entram no FORTE CHAT.</p>
        <ol className="list-decimal pl-5 space-y-1 text-muted text-xs">
          <li>No Meta for Developers, crie um app do tipo Business e adicione o produto WhatsApp.</li>
          <li>No WhatsApp Manager, registre o número da empresa e copie o <b>Phone Number ID</b> e o <b>WhatsApp Business Account ID</b>.</li>
          <li>Em Configurações do Negócio → Usuários do sistema, gere um token permanente com <code>whatsapp_business_messaging</code> e <code>whatsapp_business_management</code>.</li>
          <li>Em App → Configurações → Básico, copie o <b>App Secret</b>.</li>
          <li>Em WhatsApp → Configuração, cadastre a URL de callback acima e o token de verificação e assine o campo <code>messages</code>.</li>
          <li>Crie e aprove ao menos um modelo (template) para iniciar conversas fora da janela de 24h.</li>
        </ol>
      </section>

      <section className="card p-5 text-sm space-y-2">
        <h2 className="font-semibold flex items-center gap-2"><Clock3 size={18} className="text-gold" /> Agendamentos e atividade</h2>
        <div className="grid sm:grid-cols-4 gap-3">
          <Stat label="Conversas" value={counts.convs} /><Stat label="Mensagens salvas" value={counts.msgs} /><Stat label="Envios agendados" value={counts.pending} />
          <Stat label="Último processamento" value={sched ? fmtRelative(sched.at) : "nunca"} />
        </div>
        <p className="text-muted text-xs">Última mensagem recebida: {lastIn ? fmtDateTime(lastIn.at) : "nenhuma"} · último envio confirmado pela Meta: {lastOut?.at ? fmtDateTime(lastOut.at) : "nenhum"}.</p>
        <p className="text-xs text-muted">Para que os envios agendados aconteçam com o CRM fechado, cadastre um agendador externo gratuito (ex.: cron-job.org) chamando a cada 1–5 minutos <code className="break-all">{origin}/api/chat/scheduler</code> com o header <code>Authorization: Bearer &lt;CRON_SECRET&gt;</code>. O processador trava cada tarefa no banco antes de enviar, então chamadas repetidas nunca duplicam envios.</p>
      </section>

      <section className="card p-5">
        <h2 className="font-semibold flex items-center gap-2 mb-3"><Tags size={18} className="text-gold" /> Etiquetas</h2>
        <LabelsManager labels={labels.map((l) => ({ id: l.id, name: l.name, color: l.color }))} canManage={manage} />
      </section>

      {manage && <section className="card p-5"><h2 className="font-semibold flex items-center gap-2 mb-3"><SlidersHorizontal size={18} className="text-gold" /> Regras do chat</h2><SettingsForm settings={settings} /></section>}
    </div>
  );
}
function Stat({ label, value }: { label: string; value: React.ReactNode }) { return <div className="rounded-xl bg-surface-2 p-3"><p className="text-xs text-muted">{label}</p><p className="font-semibold text-lg">{value}</p></div>; }
