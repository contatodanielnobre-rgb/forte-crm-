import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC = ["/login", "/setup", "/api/health", "/api/salescop/routine", "/api/salescop/whatsapp", "/api/chat/whatsapp", "/api/chat/scheduler"]; // rotas do SALES COP/FORTE CHAT são protegidas por segredo próprio (CRON_SECRET / WHATSAPP_VERIFY_TOKEN)
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p)) || pathname.startsWith("/_next") || pathname.startsWith("/brand") || pathname.startsWith("/chat/") || pathname === "/favicon.ico") return NextResponse.next();
  const token = req.cookies.get("forte_session")?.value;
  if (token) {
    try { await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret-change-me")); return NextResponse.next(); } catch { /* fallthrough */ }
  }
  if (pathname.startsWith("/api/chat/")) return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });
  const url = req.nextUrl.clone(); url.pathname = "/login"; url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|brand|chat/).*)"] };
