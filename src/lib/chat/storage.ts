import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { createId } from "@/lib/id";

/**
 * Armazenamento dos arquivos do chat.
 * Produção: Vercel Blob em modo privado (fallback para público com nome aleatório não adivinhável se o store for público).
 * Local: pasta ./uploads/chat. Em ambos os casos o navegador só acessa via /api/chat/media/[id], que checa sessão e permissão.
 */
export type Stored = { storageUrl: string; storageAccess: "local" | "private" | "public" };

const safeName = (n: string) => n.normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(-120) || "arquivo";

export async function storeChatFile(data: Buffer, fileName: string, mimeType: string): Promise<Stored> {
  const key = `chat/${new Date().toISOString().slice(0, 7)}/${createId(16)}-${safeName(fileName)}`;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    try {
      const b = await put(key, data, { access: "private", contentType: mimeType, addRandomSuffix: true });
      return { storageUrl: b.url, storageAccess: "private" };
    } catch {
      const b = await put(key, data, { access: "public", contentType: mimeType, addRandomSuffix: true });
      return { storageUrl: b.url, storageAccess: "public" };
    }
  }
  const abs = path.join(process.cwd(), "uploads", key);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, data);
  return { storageUrl: key, storageAccess: "local" };
}

export async function readChatFile(m: { storageUrl: string; storageAccess: string }): Promise<Buffer> {
  if (m.storageAccess === "local") {
    if (m.storageUrl.includes("..")) throw new Error("Caminho inválido.");
    return fs.readFile(path.join(process.cwd(), "uploads", m.storageUrl));
  }
  if (m.storageAccess === "private") {
    const { get } = await import("@vercel/blob");
    const r = await get(m.storageUrl, { access: "private" });
    if (!r || r.statusCode !== 200 || !("stream" in r) || !r.stream) throw new Error("Arquivo não encontrado no armazenamento.");
    return Buffer.from(await new Response(r.stream as ReadableStream).arrayBuffer());
  }
  const r = await fetch(m.storageUrl, { cache: "no-store" });
  if (!r.ok) throw new Error("Arquivo não encontrado no armazenamento.");
  return Buffer.from(await r.arrayBuffer());
}

export function isBlobUrl(u: string) {
  try { const h = new URL(u).hostname; return h.endsWith(".blob.vercel-storage.com"); } catch { return false; }
}
