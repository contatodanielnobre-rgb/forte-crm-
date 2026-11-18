import { chatRoute } from "@/lib/chat/api";
import { assertConversationAccess, ensureChatDefaults } from "@/lib/chat/core";
import { getConversationItem, listConversations, listMessages, type ConvFilters } from "@/lib/chat/queries";
import { maybeProcess } from "@/lib/chat/tasks";

export const dynamic = "force-dynamic";

/** Atualização em tempo real (polling curto): lista de conversas + mensagens novas/alteradas da conversa aberta. */
export const GET = chatRoute(async (user, req) => {
  await ensureChatDefaults();
  void maybeProcess();
  const sp = new URL(req.url).searchParams;
  const f: ConvFilters = { q: sp.get("q") ?? "", label: sp.get("label") ?? "", assignee: sp.get("assignee") ?? "", unread: sp.get("unread") === "1", kind: (sp.get("kind") ?? "") as ConvFilters["kind"], view: (sp.get("view") ?? "todas") as ConvFilters["view"] };
  const now = new Date();
  const conversations = await listConversations(user, f);
  const c = sp.get("c");
  let messages = null, active = null;
  if (c) {
    await assertConversationAccess(user, c);
    const since = sp.get("since");
    messages = await listMessages(c, since ? { after: new Date(new Date(since).getTime() - 2000), limit: 200 } : { limit: 60 });
    active = await getConversationItem(user, c);
  }
  return { now, conversations, messages, active };
});
