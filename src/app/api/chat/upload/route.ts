import { chatRoute, HttpError } from "@/lib/chat/api";
import { createMediaFromBuffer, validateForWhatsApp } from "@/lib/chat/messages";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BLOCKED = /\.(exe|bat|cmd|com|msi|scr|js|vbs|ps1|sh|jar|apk|dll)$/i;

/** Upload direto (até ~4 MB na Vercel). Arquivos maiores usam /api/chat/blob (upload do navegador direto para o Blob). */
export const POST = chatRoute(async (user, req) => {
  const fd = await req.formData();
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) throw new HttpError(400, "Nenhum arquivo enviado.");
  if (BLOCKED.test(file.name)) throw new HttpError(400, "Tipo de arquivo bloqueado por segurança.");
  const mime = (file.type || "application/octet-stream").toLowerCase();
  validateForWhatsApp(mime, file.size);
  const duration = Number(fd.get("durationSec")) || null;
  const m = await createMediaFromBuffer(Buffer.from(await file.arrayBuffer()), file.name || "arquivo", mime, user.id, { durationSec: duration ? Math.round(duration) : null });
  return { media: { id: m.id, fileName: m.fileName, mimeType: m.mimeType, size: m.size, durationSec: m.durationSec, kind: m.kind } };
});
