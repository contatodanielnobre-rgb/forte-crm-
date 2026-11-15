import { endOfDay, endOfMonth, startOfDay, startOfMonth, subDays, subMonths, startOfQuarter, endOfQuarter, startOfYear, endOfYear } from "date-fns";

export type PeriodKey = "hoje" | "7d" | "30d" | "mes" | "3m" | "trimestre" | "semestre" | "ano" | "custom";
export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "hoje", label: "Hoje" }, { key: "7d", label: "Últimos 7 dias" }, { key: "30d", label: "Últimos 30 dias" }, { key: "mes", label: "Este mês" }, { key: "3m", label: "Últimos 3 meses" }, { key: "custom", label: "Personalizado" },
];
export const RANK_PERIODS: { key: PeriodKey; label: string }[] = [{ key: "mes", label: "Mês" }, { key: "trimestre", label: "Trimestre" }, { key: "semestre", label: "Semestre" }, { key: "ano", label: "Ano" }, { key: "custom", label: "Personalizado" }];

export function resolvePeriod(key: string | undefined, from?: string, to?: string, now = new Date()): { from: Date; to: Date; key: PeriodKey } {
  const k = (key as PeriodKey) || "mes";
  switch (k) {
    case "hoje": return { from: startOfDay(now), to: endOfDay(now), key: k };
    case "7d": return { from: startOfDay(subDays(now, 6)), to: endOfDay(now), key: k };
    case "30d": return { from: startOfDay(subDays(now, 29)), to: endOfDay(now), key: k };
    case "3m": return { from: startOfMonth(subMonths(now, 2)), to: endOfDay(now), key: k };
    case "trimestre": return { from: startOfQuarter(now), to: endOfQuarter(now), key: k };
    case "semestre": { const h = now.getMonth() < 6 ? 0 : 6; return { from: new Date(now.getFullYear(), h, 1), to: endOfMonth(new Date(now.getFullYear(), h + 5, 1)), key: k }; }
    case "ano": return { from: startOfYear(now), to: endOfYear(now), key: k };
    case "custom": return { from: from ? startOfDay(new Date(from + "T12:00:00")) : startOfMonth(now), to: to ? endOfDay(new Date(to + "T12:00:00")) : endOfDay(now), key: k };
    default: return { from: startOfMonth(now), to: endOfMonth(now), key: "mes" };
  }
}
