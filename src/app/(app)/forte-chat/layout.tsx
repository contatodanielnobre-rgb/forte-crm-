import { requirePage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { ChatTabs } from "./tabs";

export default async function ForteChatLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePage("chat.view");
  return (
    <div className="flex flex-col gap-3 h-[calc(100dvh-4rem-2rem)] sm:h-[calc(100dvh-4rem-3rem)] min-h-[520px]">
      <ChatTabs canManage={can(user.role, "chat.manage")} />
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}
