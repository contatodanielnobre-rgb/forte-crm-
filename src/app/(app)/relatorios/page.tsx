import Link from "next/link";
import { FileSpreadsheet, FileDown, BarChart3 } from "lucide-react";
import { requirePage } from "@/lib/auth";
import { PageHeader, Empty } from "@/components/ui";
import { PeriodFilter } from "@/components/period-filter";
import { PERIODS, resolvePeriod } from "@/lib/period";
import { buildReport, REPORT_TYPES, type ReportKey } from "@/lib/services/reports";
import { cn } from "@/lib/utils";

export const metadata = { title: "Relatórios" };
export const dynamic = "force-dynamic";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ tipo?: string; p?: string; de?: string; ate?: string }> }) {
  await requirePage("reports.view");
  const sp = await searchParams;
  const key = (REPORT_TYPES.some((r) => r.key === sp.tipo) ? sp.tipo : "vendas_vendedor") as ReportKey;
  const period = resolvePeriod(sp.p ?? "mes", sp.de, sp.ate);
  const data = await buildReport(key, period.from, period.to);
  const qs = new URLSearchParams({ tipo: key, p: period.key, ...(sp.de ? { de: sp.de } : {}), ...(sp.ate ? { ate: sp.ate } : {}) }).toString();
  const link = (k: string) => `?${new URLSearchParams({ tipo: k, p: period.key, ...(sp.de ? { de: sp.de } : {}), ...(sp.ate ? { ate: sp.ate } : {}) })}`;
  return (
    <div className="space-y-5">
      <PageHeader title="Relatórios" subtitle="Visão gerencial com exportação em PDF e Excel" actions={<PeriodFilter periods={[...PERIODS.slice(0, 5), { key: "ano", label: "Este ano" }, PERIODS[5]]} value={period.key} />} />
      <div className="grid lg:grid-cols-[240px_1fr] gap-5">
        <nav className="card p-2 h-fit">{REPORT_TYPES.map((r) => <Link key={r.key} href={link(r.key)} className={cn("block px-3 py-2 rounded-xl text-sm", key === r.key ? "bg-brand/10 text-brand font-medium" : "text-muted hover:text-fg hover:bg-surface-2")}>{r.label}</Link>)}</nav>
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 p-4 border-b border-line"><div><p className="font-medium">{data.title}</p><p className="text-xs text-muted">{data.subtitle} · {data.rows.length} registros</p></div>
            <div className="flex gap-2"><a href={`/api/relatorios/export?${qs}&formato=xlsx`} className="btn-secondary btn-sm"><FileSpreadsheet size={14} /> Excel</a><a href={`/api/relatorios/export?${qs}&formato=pdf`} className="btn-primary btn-sm"><FileDown size={14} /> PDF</a></div></div>
          {data.rows.length === 0 ? <Empty icon={BarChart3} title="Sem registros no período" /> : (
            <div className="overflow-x-auto"><table className="table"><thead><tr>{data.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead><tbody>{data.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={typeof c === "number" ? "tabular-nums" : ""}>{c}</td>)}</tr>)}{data.totals && <tr className="bg-brand/5 font-semibold">{data.totals.map((c, j) => <td key={j}>{c}</td>)}</tr>}</tbody></table></div>
          )}
        </div>
      </div>
    </div>
  );
}
