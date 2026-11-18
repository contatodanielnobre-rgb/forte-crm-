import { chatRoute } from "@/lib/chat/api";
import { cloudTemplates } from "@/lib/chat/cloud-api";

export const dynamic = "force-dynamic";
export const GET = chatRoute(async () => ({ templates: await cloudTemplates() }));
