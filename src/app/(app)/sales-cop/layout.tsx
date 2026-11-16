import { requirePage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSalesCopSettings, MODE_LABEL, integrationStatus } from "@/lib/salescop/settings";
import { CopShield, CopWordmark, SLOGAN } from "@/components/salescop/brand";
import { CopTabs } from "./tabs";

export const metadata = { title: "SALES COP AI" };
export const dynamic = "force-dynamic";

export default async function SalesCopLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePage("salescop.view");
  const settings = await getSalesCopSettings();
  const integ = integrationStatus();
  const tabs = [
    { href: "/sales-cop", label: "Central de Comando" },
    { href: "/sales-cop/plano", label: "Plano de Ação" },
    { href: "/sales-cop/fiscalizacao", label: "Fiscalização Comercial" },
    { href: "/sales-cop/equipe", label: "Desempenho da Equipe" },
    { href: "/sales-cop/gargalos", label: "Investigação de Gargalos" },
    { href: "/sales-cop/relatorios", label: "Relatórios Inteligentes" },
    ...(can(user.role, "salescop.settings") ? [{ href: "/sales-cop/configuracoes", label: "Configurações do Agente" }] : []),
  ];
  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl bg-[#0a0a0c] text-white border border-white/5">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(217,30,58,.22),transparent_55%)]" />
        <div className="absolute -right-10 -top-10 w-56 h-56 rounded-full bg-brand/10 blur-3xl" />
        <div className="relative p-5 sm:p-6 flex flex-wrap items-center gap-4 justify-between">
          <div className="flex items-center gap-4">
            <CopShield size={56} />
            <div>
              <CopWordmark />
              <p className="text-[11px] sm:text-xs font-semibold tracking-[0.25em] text-brand mt-2">{SLOGAN}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="px-2.5 py-1 rounded-lg border border-white/10 bg-white/5 text-white/80">{MODE_LABEL[settings.mode]}</span>
            <span className={`px-2.5 py-1 rounded-lg border ${integ.openai && settings.ai.enabled ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-white/5 text-white/50"}`}>IA {integ.openai && settings.ai.enabled ? "ativa" : "desativada"}</span>
            <span className={`px-2.5 py-1 rounded-lg border ${integ.whatsapp && settings.whatsapp.enabled ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-white/5 text-white/50"}`}>WhatsApp {integ.whatsapp && settings.whatsapp.enabled ? "conectado" : "não configurado"}</span>
            <span className={`px-2.5 py-1 rounded-lg border ${settings.routine.enabled && integ.cron ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-white/5 text-white/50"}`}>Rotina {settings.routine.enabled && integ.cron ? "ativa" : "manual"}</span>
          </div>
        </div>
        <CopTabs tabs={tabs} />
      </div>
      {children}
    </div>
  );
}
