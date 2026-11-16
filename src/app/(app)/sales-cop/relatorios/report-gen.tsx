"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { useToast } from "@/components/toast";
import { AI_REPORT_TYPES, type AiReportKind } from "@/lib/salescop/report-types";
import { generateReport } from "../actions";

export function ReportGenerator({ sellers, canManage, aiOn }: { sellers: { id: string; name: string }[]; canManage: boolean; aiOn: boolean }) {
  const [kind, setKind] = React.useState<AiReportKind>(canManage ? "diario" : "vendedor");
  const [userId, setUserId] = React.useState(sellers[0]?.id ?? "");
  const [withAi, setWithAi] = React.useState(aiOn);
  const [pending, start] = React.useTransition();
  const toast = useToast(); const router = useRouter();
  return (
    <form className="card p-4 space-y-3" onSubmit={(e) => { e.preventDefault(); start(async () => { try { const id = await generateReport(kind, kind === "vendedor" ? userId || null : null, withAi); toast.push("Relatório gerado."); router.push(`/sales-cop/relatorios?id=${id}`); } catch (err) { toast.push((err as Error).message, "error"); } }); }}>
      <p className="font-medium">Gerar relatório</p>
      <select className="input" value={kind} onChange={(e) => setKind(e.target.value as AiReportKind)}>{AI_REPORT_TYPES.filter((r) => canManage || r.key === "vendedor").map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select>
      {kind === "vendedor" && canManage && <select className="input" value={userId} onChange={(e) => setUserId(e.target.value)}>{sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
      <label className={`flex items-center gap-2 text-xs ${aiOn ? "" : "opacity-50"}`}><input type="checkbox" checked={withAi && aiOn} disabled={!aiOn} onChange={(e) => setWithAi(e.target.checked)} /> <Sparkles size={12} className="text-brand" /> Incluir análise narrativa da IA</label>
      <button className="btn-primary w-full" disabled={pending}>{pending ? <><Loader2 size={16} className="animate-spin" /> Gerando…</> : "Gerar agora"}</button>
    </form>
  );
}
