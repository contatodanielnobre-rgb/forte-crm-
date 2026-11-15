import { asc, desc, eq, inArray, and } from "drizzle-orm";
import { Trophy, Medal, Star, Gift, Plane, Banknote, Crown, Trash2, TrendingUp } from "lucide-react";
import { db, t } from "@/db";
import { requirePage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PageHeader, Avatar, Badge, Progress, Field, SubmitButton, Empty } from "@/components/ui";
import { PeriodFilter } from "@/components/period-filter";
import { ModalButton, CloseOnDone } from "@/components/modal-button";
import { ActionButton } from "@/components/action-form";
import { RANK_PERIODS, resolvePeriod } from "@/lib/period";
import { computeRanking } from "@/lib/services/ranking";
import { brl, pct, fmtDate, periodKey } from "@/lib/format";
import { subMonths } from "date-fns";
import { createAward, deleteAward, grantAward, revokeGrant } from "./actions";
import { cn } from "@/lib/utils";

export const metadata = { title: "Ranking de Vendas" };
export const dynamic = "force-dynamic";
const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = { trophy: Trophy, medal: Medal, star: Star, gift: Gift, plane: Plane, banknote: Banknote };
const KINDS: Record<string, string> = { vendedor_mes: "Vendedor do mês", maior_faturamento: "Maior faturamento", mais_vendas: "Maior número de vendas", maior_evolucao: "Maior evolução", custom: "Personalizada" };

export default async function RankingPage({ searchParams }: { searchParams: Promise<{ p?: string; de?: string; ate?: string }> }) {
  const user = await requirePage("ranking.view");
  const sp = await searchParams; const period = resolvePeriod(sp.p ?? "mes", sp.de, sp.ate);
  const [rows, prevRows, rules, awards, grants, sellers] = await Promise.all([
    computeRanking(period.from, period.to),
    computeRanking(subMonths(period.from, 1), subMonths(period.to, 1)),
    db.select().from(t.scoringRules),
    db.select().from(t.awards).where(eq(t.awards.active, true)).orderBy(asc(t.awards.name)),
    db.query.awardGrants.findMany({ orderBy: [desc(t.awardGrants.grantedAt)], limit: 40, with: { award: true, user: { columns: { id: true, name: true, avatarUrl: true } } } }),
    db.select({ id: t.users.id, name: t.users.name }).from(t.users).where(and(eq(t.users.active, true), inArray(t.users.role, ["COMERCIAL", "GESTOR", "ADMIN"]))).orderBy(asc(t.users.name)),
  ]);
  const canManage = can(user.role, "awards.manage");
  const podium = rows.slice(0, 3); const rest = rows.slice(3);
  const evo = rows.map((r) => ({ ...r, prev: prevRows.find((p) => p.user.id === r.user.id)?.revenue ?? 0 })).map((r) => ({ ...r, growth: r.prev ? ((r.revenue - r.prev) / r.prev) * 100 : r.revenue > 0 ? 100 : 0 }));
  const highlights = [
    { label: "Vendedor do período", row: rows[0], icon: Crown, tone: "text-gold" },
    { label: "Maior faturamento", row: [...rows].sort((a, b) => b.revenue - a.revenue)[0], icon: Banknote, tone: "text-emerald-500" },
    { label: "Mais vendas", row: [...rows].sort((a, b) => b.sales - a.sales)[0], icon: Trophy, tone: "text-brand" },
    { label: "Maior evolução", row: [...evo].sort((a, b) => b.growth - a.growth)[0], icon: TrendingUp, tone: "text-blue-500", extra: (r: (typeof evo)[number]) => `${r.growth >= 0 ? "+" : ""}${r.growth.toFixed(0)}% vs. período anterior` },
  ];
  const medal = ["from-gold/30 to-gold/5 border-gold/40", "from-silver/30 to-silver/5 border-silver/40", "from-bronze/30 to-bronze/5 border-bronze/40"];
  const medalEmoji = ["🥇", "🥈", "🥉"];
  const order = [1, 0, 2];

  return (
    <div className="space-y-5">
      <PageHeader title="Ranking de Vendas" subtitle={`Pontuação e desempenho · ${fmtDate(period.from)} a ${fmtDate(period.to)}`} actions={<PeriodFilter periods={RANK_PERIODS} value={period.key} />} />
      {rows.length === 0 ? <div className="card"><Empty icon={Trophy} title="Nenhum vendedor ativo" hint="Cadastre vendedores em Configurações." /></div> : (
        <div className="grid sm:grid-cols-3 gap-3 items-end">
          {order.map((i) => podium[i] && (
            <div key={podium[i].user.id} className={cn("card p-5 text-center bg-gradient-to-b border animate-fadeUp", medal[i], i === 0 && "sm:-translate-y-4 sm:py-7")}>
              <p className="text-3xl mb-1">{medalEmoji[i]}</p>
              <Avatar name={podium[i].user.name} src={podium[i].user.avatarUrl} size={i === 0 ? 72 : 56} className="mx-auto ring-4 ring-surface" />
              <p className="font-semibold mt-2">{podium[i].user.name}</p>
              <p className="text-xs text-muted">{i + 1}º lugar · {i === 0 ? "Ouro" : i === 1 ? "Prata" : "Bronze"}</p>
              <p className="text-2xl font-semibold mt-2 tabular-nums">{podium[i].points} <span className="text-sm text-muted font-normal">pts</span></p>
              <div className="grid grid-cols-2 gap-2 mt-3 text-xs"><div className="rounded-lg bg-surface/70 p-2"><p className="text-muted">Vendas</p><p className="font-semibold">{podium[i].sales}</p></div><div className="rounded-lg bg-surface/70 p-2"><p className="text-muted">Faturamento</p><p className="font-semibold">{brl(podium[i].revenue, { compact: true })}</p></div></div>
              <Progress value={podium[i].goalPct} className="mt-3" tone={podium[i].goalPct >= 100 ? "green" : "gold"} /><p className="text-[11px] text-muted mt-1">{pct(podium[i].goalPct, 0)} da meta ({brl(podium[i].goal, { compact: true })})</p>
            </div>
          ))}
        </div>
      )}
      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 card overflow-x-auto">
          <p className="p-4 border-b border-line font-medium">Classificação geral</p>
          <table className="table"><thead><tr><th>#</th><th>Vendedor</th><th>Pontos</th><th>Vendas</th><th>Valor vendido</th><th>Recebido</th><th>Reuniões</th><th>Conversão</th><th>Meta</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.user.id} className={r.user.id === user.id ? "bg-brand/5" : ""}><td className="font-semibold text-muted">{r.position}º</td><td><span className="flex items-center gap-2"><Avatar name={r.user.name} src={r.user.avatarUrl} size={26} /><span className="font-medium">{r.user.name}</span></span></td><td><Badge tone="gold">{r.points}</Badge></td><td>{r.sales}</td><td className="tabular-nums">{brl(r.revenue)}</td><td className="tabular-nums text-muted">{brl(r.received)}</td><td>{r.meetings}</td><td>{pct(r.conversion, 0)}</td><td className="min-w-[120px]"><div className="flex items-center gap-2"><Progress value={r.goalPct} className="w-16" tone={r.goalPct >= 100 ? "green" : "brand"} /><span className="text-xs tabular-nums">{pct(r.goalPct, 0)}</span></div></td></tr>)}{rest.length === 0 && rows.length > 0 && null}</tbody>
          </table>
        </div>
        <div className="space-y-5">
          <div className="card p-4"><p className="font-medium mb-3">Como pontuar</p><ul className="space-y-2 text-sm">{rules.map((r) => <li key={r.key} className="flex items-center justify-between gap-2"><span>{r.label}<span className="block text-[11px] text-muted">{r.description}</span></span><Badge tone="gold">+{r.points}</Badge></li>)}</ul><p className="text-[11px] text-muted mt-3">Pontos são registrados apenas por ações verificáveis no sistema (venda fechada no pipeline, reunião comercial marcada como realizada, metas calculadas sobre vendas registradas).</p></div>
          <div className="card p-4"><p className="font-medium mb-3">Destaques do período</p><ul className="space-y-3">{highlights.filter((h) => h.row).map((h) => <li key={h.label} className="flex items-center gap-3 text-sm"><h.icon size={18} className={h.tone} /><div className="min-w-0 flex-1"><p className="text-xs text-muted">{h.label}</p><p className="font-medium truncate">{h.row!.user.name}</p></div><span className="text-xs text-muted">{h.extra ? h.extra(h.row as never) : h.label.includes("vendas") ? `${h.row!.sales} vendas` : h.label.includes("fatur") ? brl(h.row!.revenue, { compact: true }) : `${h.row!.points} pts`}</span></li>)}</ul></div>
        </div>
      </div>
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="card"><div className="flex items-center justify-between p-4 border-b border-line"><p className="font-medium">Premiações disponíveis</p>{canManage && <ModalButton label="Nova premiação" title="Cadastrar premiação" className="btn-primary btn-sm" size="sm">
          <CloseOnDone action={createAward} success="Premiação criada." className="space-y-3">
            <Field label="Nome"><input name="name" className="input" required placeholder="Ex.: Vendedor do mês" /></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="Categoria"><select name="kind" className="input">{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field><Field label="Ícone"><select name="icon" className="input"><option value="trophy">Troféu</option><option value="medal">Medalha</option><option value="star">Estrela</option><option value="gift">Presente</option><option value="plane">Viagem</option><option value="banknote">Bônus</option></select></Field></div>
            <Field label="Recompensa"><input name="value" className="input" placeholder="Ex.: Bônus R$ 500, vale-presente, viagem" /></Field>
            <Field label="Descrição / critério"><textarea name="description" className="input" rows={2} /></Field>
            <div className="flex justify-end"><SubmitButton>Salvar</SubmitButton></div>
          </CloseOnDone></ModalButton>}</div>
          <ul className="divide-y divide-line">{awards.map((a) => { const I = ICONS[a.icon] ?? Trophy; return <li key={a.id} className="p-3 flex items-center gap-3 text-sm"><span className="w-9 h-9 rounded-xl bg-gold/15 text-gold grid place-items-center"><I size={18} /></span><div className="flex-1 min-w-0"><p className="font-medium">{a.name} {a.value && <span className="text-muted font-normal">· {a.value}</span>}</p><p className="text-xs text-muted">{KINDS[a.kind]}{a.description ? ` · ${a.description}` : ""}</p></div>
            {canManage && <><ModalButton label="Conceder" title={`Conceder: ${a.name}`} className="btn-secondary btn-sm" size="sm"><CloseOnDone action={grantAward} success="Premiação concedida." className="space-y-3"><input type="hidden" name="awardId" value={a.id} /><Field label="Vendedor"><select name="userId" className="input" required><option value="">Selecione...</option>{sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field><Field label="Período (AAAA-MM)"><input name="period" className="input" defaultValue={periodKey(new Date())} /></Field><Field label="Observação"><input name="notes" className="input" /></Field><div className="flex justify-end"><SubmitButton>Conceder</SubmitButton></div></CloseOnDone></ModalButton><ActionButton className="btn-ghost btn-icon h-8 w-8 text-muted" confirm="Remover premiação?" action={deleteAward.bind(null, a.id)}><Trash2 size={13} /></ActionButton></>}</li>; })}{awards.length === 0 && <li className="p-6 text-sm text-muted text-center">Nenhuma premiação cadastrada.</li>}</ul>
        </div>
        <div className="card"><p className="p-4 border-b border-line font-medium">Histórico de premiações e conquistas</p>
          <ul className="divide-y divide-line">{grants.map((g) => { const I = ICONS[g.award.icon] ?? Trophy; return <li key={g.id} className="p-3 flex items-center gap-3 text-sm"><I size={18} className="text-gold" /><Avatar name={g.user.name} src={g.user.avatarUrl} size={26} /><div className="flex-1 min-w-0"><p className="font-medium">{g.user.name} <span className="text-muted font-normal">· {g.award.name}</span></p><p className="text-xs text-muted">{g.period}{g.award.value ? ` · ${g.award.value}` : ""}{g.notes ? ` · ${g.notes}` : ""}</p></div>{canManage && <ActionButton className="btn-ghost btn-icon h-7 w-7 text-muted" confirm="Remover esta concessão?" action={revokeGrant.bind(null, g.id)}><Trash2 size={12} /></ActionButton>}</li>; })}{grants.length === 0 && <li className="p-6 text-sm text-muted text-center">Nenhuma premiação concedida ainda.</li>}</ul>
        </div>
      </div>
    </div>
  );
}
