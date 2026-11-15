import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC = ["/login", "/setup", "/api/health"];
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p)) || pathname.startsWith("/_next") || pathname.startsWith("/brand") || pathname === "/favicon.ico") return NextResponse.next();
  const token = req.cookies.get("forte_session")?.value;
  if (token) {
    try { await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret-change-me")); return NextResponse.next(); } catch { /* fallthrough */ }
  }
  const url = req.nextUrl.clone(); url.pathname = "/login"; url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|brand).*)"] };
