import { format, formatDistanceToNowStrict, isToday, isTomorrow, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";

export const num = (v: unknown): number => {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
export const brl = (v: unknown, opts: { compact?: boolean } = {}) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: opts.compact ? 1 : 2, notation: opts.compact ? "compact" : "standard" }).format(num(v));
export const pct = (v: number, digits = 1) => `${(Number.isFinite(v) ? v : 0).toFixed(digits).replace(".", ",")}%`;
export const fmtDate = (d?: Date | string | null, pattern = "dd/MM/yyyy") => (d ? format(new Date(d), pattern, { locale: ptBR }) : "—");
export const fmtDateTime = (d?: Date | string | null) => (d ? format(new Date(d), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : "—");
export const fmtTime = (d?: Date | string | null) => (d ? format(new Date(d), "HH:mm") : "—");
export const fmtRelative = (d?: Date | string | null) => { if (!d) return "—"; const diff = Date.now() - +new Date(d); if (Math.abs(diff) < 60_000) return "agora mesmo"; return formatDistanceToNowStrict(new Date(d), { locale: ptBR, addSuffix: true, unit: Math.abs(diff) < 3_600_000 ? "minute" : Math.abs(diff) < 86_400_000 ? "hour" : "day" }); };
export const fmtDay = (d: Date) => (isToday(d) ? "Hoje" : isTomorrow(d) ? "Amanhã" : isYesterday(d) ? "Ontem" : format(d, "EEEE, dd 'de' MMMM", { locale: ptBR }));
export const monthLabel = (d: Date) => format(d, "MMMM 'de' yyyy", { locale: ptBR });
export const periodKey = (d: Date) => format(d, "yyyy-MM");
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
export const toInputDate = (d?: Date | string | null) => (d ? format(new Date(d), "yyyy-MM-dd") : "");
export const toInputDateTime = (d?: Date | string | null) => (d ? format(new Date(d), "yyyy-MM-dd'T'HH:mm") : "");
