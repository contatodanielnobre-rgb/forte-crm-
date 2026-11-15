import Link from "next/link";
import { asc } from "drizzle-orm";
import { Building2, Target, Users, KanbanSquare, Trophy, ListChecks, Database, Trash2, ArrowUp, ArrowDown, Pencil, Plus } from "lucide-react";
import { db, t } from "@/db";
import { requirePage } from "@/lib/auth";
import { PageHeader, Field, SubmitButton, Badge, Avatar } from "@/components/ui";
import { ActionForm, ActionButton } from "@/components/action-form";
import { ModalButton, CloseOnDone } from "@/components/modal-button";
import { getSetting } from "@/lib/bootstrap";
import { demoStats } from "@/lib/demo";
import { ROLE_LABEL } from "@/lib/permissions";
import { JOURNEY_STEPS } from "@/lib/services/journey";
import { cn } from "@/lib/utils";
import { saveCompany, saveGoals, createUser, updateUser, addListItem, removeListItem, toggleTypeCommercial, saveStage, moveStage, deleteStage, saveScoring, loadDemo, clearDemo } from "./actions";

export const metadata = { title: "Configurações" };
export const dynamic = "force-dynamic";
const SECTIONS = [["empresa", "Empresa", Building2], ["metas", "Metas e prazos", Target], ["equipe", "Equipe e permissões", Users], ["pipeline", "Pipeline", KanbanSquare], ["pontuacao", "Pontuação", Trophy], ["listas", "Listas e tipos", ListChecks], ["demo", "Dados de demonstração", Database]] as const;

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  await requirePage("settings.manage");
  const { s = "empresa" } = await searchParams;
  const [company, goals, journey, users, stages, rules, sources, loss, cats, types, demo] = await Promise.all([
    getSetting<Record<string, string>>("company", { name: "Forte Company" }), getSetting<{ monthly: number }>("goals", { monthly: 0 }), getSetting<{ stepDays: Record<string, number> }>("journey", { stepDays: {} }),
    db.select().from(t.users).orderBy(asc(t.users.name)), db.select().from(t.pipelineStages).orderBy(asc(t.pipelineStages.order)), db.select().from(t.scoringRules),
    db.select().from(t.leadSources).orderBy(asc(t.leadSources.name)), db.select().from(t.lossReasons).orderBy(asc(t.lossReasons.name)), db.select().from(t.financeCategories).orderBy(asc(t.financeCategories.name)), db.select().from(t.appointmentTypes).orderBy(asc(t.appointmentTypes.name)), demoStats(),
  ]);

  const UserForm = ({ u }: { u?: (typeof users)[number] }) => (
    <CloseOnDone action={u ? updateUser.bind(null, u.id) : createUser} success={u ? "Usuário atualizado." : "Usuário criado."} className="grid sm:grid-cols-2 gap-3">
      <Field label="Nome" className="sm:col-span-2"><input name="name" className="input" defaultValue={u?.name} required /></Field>
      <Field label="E-mail"><input name="email" type="email" className="input" defaultValue={u?.email} required /></Field>
      <Field label="Telefone"><input name="phone" className="input" defaultValue={u?.phone ?? ""} /></Field>
      <Field label="Perfil de acesso"><select name="role" className="input" defaultValue={u?.role ?? "COMERCIAL"}>{Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      <Field label="Meta mensal individual (R$)" hint="0 = usa a meta global"><input name="monthlyGoal" type="number" step="0.01" className="input" defaultValue={u ? Number(u.monthlyGoal) : 0} /></Field>
      <Field label={u ? "Nova senha (opcional)" : "Senha inicial"}><input name="password" type="password" className="input" minLength={6} required={!u} autoComplete="new-password" /></Field>
      {u && <Field label="Situação"><select name="active" className="input" defaultValue={u.active ? "on" : "off"}><option value="on">Ativo</option><option value="off">Inativo (sem acesso)</option></select></Field>}
      <div className="sm:col-span-2 flex justify-end"><SubmitButton>{u ? "Salvar" : "Criar usuário"}</SubmitButton></div>
    </CloseOnDone>
  );
  const SimpleList = ({ title, kind, items }: { title: string; kind: "sources" | "loss" | "categories"; items: { id: string; name: string }[] }) => (
    <div className="card p-4"><p className="font-medium mb-3">{title}</p>
      <ul className="flex flex-wrap gap-2 mb-3">{items.map((i) => <li key={i.id} className="badge bg-surface-2 border-line gap-2 py-1">{i.name}<ActionButton className="text-muted hover:text-red-500" confirm={`Remover "${i.name}"?`} action={removeListItem.bind(null, kind, i.id)}><Trash2 size={11} /></ActionButton></li>)}</ul>
      <ActionForm action={addListItem.bind(null, kind)} reset success="Adicionado." className="flex gap-2"><input name="name" className="input h-9" placeholder="Novo item..." required /><SubmitButton className="btn-secondary btn-sm h-9"><Plus size={14} /></SubmitButton></ActionForm>
    </div>
  );

  return (
    <div>
      <PageHeader title="Configurações" subtitle="Personalização do FORTE CRM — somente administradores" />
      <div className="grid lg:grid-cols-[240px_1fr] gap-5">
        <nav className="card p-2 h-fit">{SECTIONS.map(([k, l, I]) => <Link key={k} href={`?s=${k}`} className={cn("flex items-center gap-2 px-3 py-2 rounded-xl text-sm", s === k ? "bg-brand/10 text-brand font-medium" : "text-muted hover:text-fg hover:bg-surface-2")}><I size={16} />{l}</Link>)}</nav>
        <div className="space-y-5">
          {s === "empresa" && <div className="card p-5"><p className="font-medium mb-4">Dados da empresa</p>
            <ActionForm action={saveCompany} success="Dados salvos." className="grid sm:grid-cols-2 gap-4">
              <Field label="Nome"><input name="name" className="input" defaultValue={company.name} /></Field><Field label="Slogan"><input name="tagline" className="input" defaultValue={company.tagline ?? ""} /></Field>
              <Field label="CNPJ"><input name="cnpj" className="input" defaultValue={company.cnpj ?? ""} /></Field><Field label="Telefone"><input name="phone" className="input" defaultValue={company.phone ?? ""} /></Field>
              <Field label="E-mail"><input name="email" type="email" className="input" defaultValue={company.email ?? ""} /></Field><Field label="Endereço"><input name="address" className="input" defaultValue={company.address ?? ""} /></Field>
              <div className="sm:col-span-2 flex justify-end"><SubmitButton>Salvar</SubmitButton></div>
            </ActionForm></div>}

          {s === "metas" && <div className="card p-5"><p className="font-medium mb-1">Metas comerciais e prazos da jornada</p><p className="text-sm text-muted mb-4">A meta global vale para quem não tem meta individual. Os prazos definem quando uma etapa da jornada passa a contar como atrasada (dias após o fechamento).</p>
            <ActionForm action={saveGoals} success="Metas salvas." className="space-y-5">
              <Field label="Meta mensal global (R$)"><input name="monthly" type="number" step="0.01" className="input max-w-xs" defaultValue={goals.monthly} /></Field>
              <div><p className="label">Metas individuais (R$ / mês)</p><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{users.filter((u) => u.active && u.role !== "OPERACIONAL").map((u) => <div key={u.id} className="flex items-center gap-2"><Avatar name={u.name} src={u.avatarUrl} size={26} /><span className="text-sm flex-1 truncate">{u.name}</span><input name={`goal_${u.id}`} type="number" step="0.01" className="input h-9 w-32" defaultValue={Number(u.monthlyGoal)} /></div>)}</div></div>
              <div><p className="label">Prazos das etapas (dias após fechamento)</p><div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{JOURNEY_STEPS.filter((x) => !x.recurring).map((x) => <Field key={x.key} label={x.label}><input name={`d_${x.key}`} type="number" min={0} className="input" defaultValue={journey.stepDays?.[x.key] ?? 7} /></Field>)}</div></div>
              <div className="flex justify-end"><SubmitButton>Salvar metas</SubmitButton></div>
            </ActionForm></div>}

          {s === "equipe" && <div className="card"><div className="flex items-center justify-between p-4 border-b border-line"><div><p className="font-medium">Equipe</p><p className="text-xs text-muted">Administrador: acesso total · Gestor: acompanha equipe, pipeline e indicadores · Comercial: seus leads, pipeline e desempenho · Operacional: clientes atribuídos, entregas e reuniões</p></div><ModalButton label="Novo usuário" title="Novo usuário" className="btn-primary btn-sm" icon={<Plus size={14} />}><UserForm /></ModalButton></div>
            <table className="table"><thead><tr><th>Usuário</th><th>Perfil</th><th>Meta</th><th>Status</th><th></th></tr></thead><tbody>{users.map((u) => <tr key={u.id}><td><span className="flex items-center gap-2"><Avatar name={u.name} src={u.avatarUrl} size={28} /><span><span className="font-medium">{u.name}</span>{u.isDemo && <Badge tone="amber" className="ml-2">demo</Badge>}<span className="block text-xs text-muted">{u.email}</span></span></span></td><td><Badge tone={u.role === "ADMIN" ? "brand" : u.role === "GESTOR" ? "purple" : u.role === "COMERCIAL" ? "blue" : "gray"}>{ROLE_LABEL[u.role]}</Badge></td><td className="tabular-nums">{Number(u.monthlyGoal) ? `R$ ${Number(u.monthlyGoal).toLocaleString("pt-BR")}` : <span className="text-muted">global</span>}</td><td>{u.active ? <Badge tone="green">Ativo</Badge> : <Badge tone="red">Inativo</Badge>}</td><td className="text-right"><ModalButton label="Editar" title={`Editar ${u.name}`} className="btn-secondary btn-sm" icon={<Pencil size={13} />}><UserForm u={u} /></ModalButton></td></tr>)}</tbody></table></div>}

          {s === "pipeline" && <div className="card"><div className="flex items-center justify-between p-4 border-b border-line"><div><p className="font-medium">Etapas do pipeline</p><p className="text-xs text-muted">“Venda Fechada” e “Perdido” são fixas no fim e disparam as automações.</p></div><ModalButton label="Nova etapa" title="Nova etapa" className="btn-primary btn-sm" icon={<Plus size={14} />} size="sm"><CloseOnDone action={saveStage.bind(null, null)} success="Etapa criada." className="space-y-3"><Field label="Nome"><input name="name" className="input" required /></Field><Field label="Cor"><input name="color" type="color" className="input h-10 w-20 p-1" defaultValue="#3B82F6" /></Field><div className="flex justify-end"><SubmitButton>Criar</SubmitButton></div></CloseOnDone></ModalButton></div>
            <ul className="divide-y divide-line">{stages.map((st, i) => <li key={st.id} className="p-3 flex items-center gap-3"><span className="w-3 h-3 rounded-full" style={{ background: st.color }} /><span className="text-sm font-medium flex-1">{st.order}. {st.name} {st.isDefault && <Badge className="ml-1">entrada</Badge>}{st.isWon && <Badge tone="green" className="ml-1">ganho</Badge>}{st.isLost && <Badge tone="red" className="ml-1">perda</Badge>}</span>
              {!st.isWon && !st.isLost && <><ActionButton className="btn-ghost btn-icon h-8 w-8" action={moveStage.bind(null, st.id, -1)}><ArrowUp size={14} /></ActionButton><ActionButton className="btn-ghost btn-icon h-8 w-8" action={moveStage.bind(null, st.id, 1)}><ArrowDown size={14} /></ActionButton></>}
              <ModalButton label="" title="Editar etapa" className="btn-ghost btn-icon h-8 w-8" icon={<Pencil size={14} />} size="sm"><CloseOnDone action={saveStage.bind(null, st.id)} success="Etapa salva." className="space-y-3"><Field label="Nome"><input name="name" className="input" defaultValue={st.name} required /></Field><Field label="Cor"><input name="color" type="color" className="input h-10 w-20 p-1" defaultValue={st.color} /></Field><div className="flex justify-end"><SubmitButton>Salvar</SubmitButton></div></CloseOnDone></ModalButton>
              {!st.isWon && !st.isLost && !st.isDefault && <ActionButton className="btn-ghost btn-icon h-8 w-8 text-muted hover:text-red-500" confirm={`Excluir etapa "${st.name}"?`} action={deleteStage.bind(null, st.id)}><Trash2 size={14} /></ActionButton>}{i < 0 && null}</li>)}</ul></div>}

          {s === "pontuacao" && <div className="card p-5"><p className="font-medium mb-1">Sistema de pontuação</p><p className="text-sm text-muted mb-4">Pontos contam apenas por ações registradas e verificáveis no sistema. Alterações valem para novos registros.</p>
            <ActionForm action={saveScoring} success="Pontuação salva." className="space-y-3">{rules.map((r) => <div key={r.key} className="flex items-center gap-3"><div className="flex-1"><p className="text-sm font-medium">{r.label}</p><p className="text-xs text-muted">{r.description}</p></div><input name={`pts_${r.key}`} type="number" min={0} className="input w-28" defaultValue={r.points} /><span className="text-xs text-muted w-8">pts</span></div>)}<div className="flex justify-end pt-2"><SubmitButton>Salvar pontuação</SubmitButton></div></ActionForm></div>}

          {s === "listas" && <div className="grid md:grid-cols-2 gap-5">
            <SimpleList title="Origens de lead" kind="sources" items={sources} /><SimpleList title="Motivos de perda" kind="loss" items={loss} /><SimpleList title="Categorias financeiras / serviços" kind="categories" items={cats} />
            <div className="card p-4"><p className="font-medium mb-3">Tipos de reunião</p>
              <ul className="space-y-2 mb-3">{types.map((x) => <li key={x.id} className="flex items-center gap-2 text-sm"><span className="w-3 h-3 rounded-full" style={{ background: x.color }} /><span className="flex-1">{x.name}</span><ActionButton className={cn("btn-sm", x.isCommercial ? "btn-primary" : "btn-secondary")} action={toggleTypeCommercial.bind(null, x.id, !x.isCommercial)}>{x.isCommercial ? "Pontua no ranking" : "Não pontua"}</ActionButton><ActionButton className="text-muted hover:text-red-500" confirm={`Remover "${x.name}"?`} action={removeListItem.bind(null, "types", x.id)}><Trash2 size={13} /></ActionButton></li>)}</ul>
              <ActionForm action={addListItem.bind(null, "types")} reset success="Tipo adicionado." className="flex gap-2 items-center"><input name="name" className="input h-9" placeholder="Novo tipo..." required /><input name="color" type="color" className="input h-9 w-12 p-1" defaultValue="#3B82F6" /><label className="text-xs text-muted flex items-center gap-1 whitespace-nowrap"><input type="checkbox" name="isCommercial" /> comercial</label><SubmitButton className="btn-secondary btn-sm h-9"><Plus size={14} /></SubmitButton></ActionForm>
            </div>
          </div>}

          {s === "demo" && <div className="card p-5 space-y-4"><div><p className="font-medium">Dados de demonstração</p><p className="text-sm text-muted">Registros fictícios para você conhecer o sistema. Todos são marcados com a etiqueta <Badge tone="amber">demo</Badge> e nunca se misturam com dados reais: usuários, leads, clientes e compromissos demo podem ser removidos de uma vez.</p></div>
            <div className="rounded-xl bg-surface-2 p-4 text-sm grid grid-cols-3 gap-3 text-center"><div><p className="text-2xl font-semibold">{demo.users}</p><p className="text-xs text-muted">usuários demo</p></div><div><p className="text-2xl font-semibold">{demo.leads}</p><p className="text-xs text-muted">leads demo</p></div><div><p className="text-2xl font-semibold">{demo.clients}</p><p className="text-xs text-muted">clientes demo</p></div></div>
            <div className="flex flex-wrap gap-2">{!demo.hasDemo && <ActionButton className="btn-primary" action={loadDemo} success="Dados de demonstração carregados.">Carregar dados de demonstração</ActionButton>}{demo.hasDemo && <ActionButton className="btn-danger" confirm="Remover TODOS os dados de demonstração? Dados reais não são afetados." action={clearDemo} success="Dados de demonstração removidos."><Trash2 size={14} /> Remover dados de demonstração</ActionButton>}</div>
            <p className="text-xs text-muted">Usuários demo entram com a senha <code>demo1234</code> (ex.: rafael.demo@fortecompany.com.br — Comercial; marina.demo@… — Gestor; camila.demo@… — Operacional).</p></div>}
        </div>
      </div>
    </div>
  );
}
