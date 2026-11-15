import { z } from "zod";
/** Helpers para campos opcionais vindos de FormData ("" → null). */
export const optStr = z.string().trim().optional().nullable().transform((v) => (v ? v : null));
export const optEmail = z.union([z.literal(""), z.email("E-mail inválido")]).optional().nullable().transform((v) => (v ? v : null));
export const optDate = z.string().optional().nullable().transform((v) => (v ? new Date(v) : null));
export const reqDate = z.string().min(1, "Informe a data").transform((v) => new Date(v));
export const money = z.union([z.string(), z.number()]).optional().nullable().transform((v) => { const n = typeof v === "number" ? v : Number(String(v ?? "0").replace(",", ".")); return Number.isFinite(n) && n >= 0 ? n : 0; });
export const intField = (def: number) => z.union([z.string(), z.number()]).optional().nullable().transform((v) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : def; });
export const fd = (f: FormData) => Object.fromEntries(f.entries()) as Record<string, string>;
