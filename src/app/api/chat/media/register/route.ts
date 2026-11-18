import { z } from "zod";
import { db, t } from "@/db";
import { chatRoute, HttpError } from "@/lib/chat/api";
import { isBlobUrl } from "@/lib/chat/storage";
import { validateForWhatsApp } from "@/lib/chat/messages";
import { waKindFor } from "@/lib/chat/cloud-api";

export const dynamic = "force-dynamic";

/** Registra um arquivo enviado direto ao Blob pelo navegador. */
export const POST = chatRoute(async (user, req) => {
  const p = z.object({ url: z.string().url(), access: z.enum(["private", "public"]), fileName: z.string().min(1).max(200), mimeType: z.string().min(3), size: z.number().int().positive() }).safeParse(await req.json().catch(() => ({})));
  if (!p.success || !isBlobUrl(p.data.url)) throw new HttpError(400, "Upload inválido.");
  validateForWhatsApp(p.data.mimeType, p.data.size);
  const [m] = await db.insert(t.chatMedia).values({ storageUrl: p.data.url, storageAccess: p.data.access, fileName: p.data.fileName, mimeType: p.data.mimeType, size: p.data.size, kind: waKindFor(p.data.mimeType), uploadedById: user.id }).returning();
  return { media: { id: m.id, fileName: m.fileName, mimeType: m.mimeType, size: m.size, durationSec: m.durationSec, kind: m.kind } };
});
