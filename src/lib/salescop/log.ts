import { db, t } from "@/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { startOfDay } from "date-fns";

type LogInput = { kind: "rotina" | "ia" | "acao" | "whatsapp" | "sistema"; action: string; status?: "OK" | "ERRO" | "BLOQUEADO" | "IGNORADO"; summary: string; input?: unknown; output?: unknown; tokensIn?: number; tokensOut?: number; durationMs?: number; actorId?: string | null };

/** Registra toda execução do agente (auditoria própria do SALES COP). Nunca lança. */
export async function logExecution(e: LogInput) {
  try {
    await db.insert(t.aiExecutionLogs).values({ kind: e.kind, action: e.action, status: e.status ?? "OK", summary: e.summary.slice(0, 2000), input: e.input as never, output: e.output as never, tokensIn: e.tokensIn, tokensOut: e.tokensOut, durationMs: e.durationMs, actorId: e.actorId ?? null });
  } catch (err) { console.error("salescop log", err); }
}

/** Quantidade de chamadas de IA feitas hoje (controle de consumo). */
export async function aiCallsToday() {
  const [{ c }] = await db.select({ c: sql<number>`count(*)::int` }).from(t.aiExecutionLogs).where(and(eq(t.aiExecutionLogs.kind, "ia"), gte(t.aiExecutionLogs.createdAt, startOfDay(new Date()))));
  return c;
}
