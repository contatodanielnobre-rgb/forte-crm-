import { chatRoute } from "@/lib/chat/api";
import { assertConversationAccess } from "@/lib/chat/core";
import { listMessages } from "@/lib/chat/queries";

export const dynamic = "force-dynamic";

/** Histórico paginado (?before=ISO) e busca de mensagens antigas (?q=texto). */
export const GET = chatRoute<{ params: Promise<{ id: string }> }>(async (user, req, ctx) => {
  const { id } = await ctx.params;
  await assertConversationAccess(user, id);
  const sp = new URL(req.url).searchParams;
  const before = sp.get("before");
  return { messages: await listMessages(id, { before: before ? new Date(before) : undefined, q: sp.get("q") ?? undefined, limit: sp.get("q") ? 100 : 60 }) };
});
