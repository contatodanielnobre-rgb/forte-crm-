import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/** Gera o token para upload direto do navegador ao Vercel Blob (arquivos grandes: PDFs, apresentações). Sessão obrigatória. */
export async function POST(req: Request) {
  const user = await getSession();
  if (!user || !can(user.role, "chat.view")) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: "Armazenamento (BLOB_READ_WRITE_TOKEN) não configurado." }, { status: 503 });
  const body = (await req.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body, request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith("chat/")) throw new Error("Caminho inválido.");
        return { maximumSizeInBytes: 100 * 1024 * 1024, addRandomSuffix: true, tokenPayload: user.id };
      },
    });
    return NextResponse.json(json);
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
