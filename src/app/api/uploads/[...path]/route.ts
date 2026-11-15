import { promises as fs } from "fs";
import path from "path";
import { getSession } from "@/lib/auth";

export async function GET(_: Request, ctx: { params: Promise<{ path: string[] }> }) {
  if (!(await getSession())) return new Response("Não autorizado", { status: 401 });
  const { path: parts } = await ctx.params;
  const rel = parts.join("/");
  if (rel.includes("..")) return new Response("Inválido", { status: 400 });
  const abs = path.join(process.cwd(), "uploads", rel);
  try {
    const data = await fs.readFile(abs);
    return new Response(data, { headers: { "Content-Disposition": `inline; filename="${path.basename(abs)}"` } });
  } catch { return new Response("Arquivo não encontrado", { status: 404 }); }
}
