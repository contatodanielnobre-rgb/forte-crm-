import { eq } from "drizzle-orm";
import { db, t } from "@/db";
import { chatRoute, HttpError } from "@/lib/chat/api";
import { canUseMedia } from "@/lib/chat/media-access";
import { readChatFile } from "@/lib/chat/storage";

export const dynamic = "force-dynamic";

/** Entrega o arquivo apenas para usuários autorizados (a URL real do armazenamento nunca vai para o navegador). */
export const GET = chatRoute<{ params: Promise<{ id: string }> }>(async (user, req, ctx) => {
  const { id } = await ctx.params;
  if (!(await canUseMedia(user, id))) throw new HttpError(404, "Arquivo não encontrado.");
  const m = await db.query.chatMedia.findFirst({ where: eq(t.chatMedia.id, id) });
  if (!m) throw new HttpError(404, "Arquivo não encontrado.");
  const data = await readChatFile(m);
  const download = new URL(req.url).searchParams.get("download") === "1";
  const total = data.length, range = req.headers.get("range");
  const headers: Record<string, string> = { "content-type": m.mimeType, "cache-control": "private, max-age=3600", "accept-ranges": "bytes", "content-disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(m.fileName)}`, "x-content-type-options": "nosniff" };
  // Range: necessário para o Safari reproduzir áudio/vídeo
  const mt = range?.match(/bytes=(\d*)-(\d*)/);
  if (mt) {
    const start = mt[1] ? Number(mt[1]) : 0, end = mt[2] ? Math.min(Number(mt[2]), total - 1) : total - 1;
    return new Response(new Uint8Array(data.subarray(start, end + 1)), { status: 206, headers: { ...headers, "content-range": `bytes ${start}-${end}/${total}`, "content-length": String(end - start + 1) } });
  }
  return new Response(new Uint8Array(data), { headers: { ...headers, "content-length": String(total) } });
});
