import { promises as fs } from "fs";
import path from "path";
import { createId } from "./id";

/** Salva um arquivo. Usa Vercel Blob quando BLOB_READ_WRITE_TOKEN existe; senão, ./uploads local. */
export async function saveFile(file: File, folder = "geral"): Promise<{ url: string; size: number; mimeType: string; name: string }> {
  const safe = file.name.replace(/[^\w.\-]+/g, "_");
  const key = `${folder}/${createId(10)}-${safe}`;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const blob = await put(key, file, { access: "public", addRandomSuffix: false });
    return { url: blob.url, size: file.size, mimeType: file.type, name: file.name };
  }
  const dir = path.join(process.cwd(), "uploads", folder);
  await fs.mkdir(dir, { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(process.cwd(), "uploads", key), buf);
  return { url: `/api/uploads/${key}`, size: file.size, mimeType: file.type, name: file.name };
}
