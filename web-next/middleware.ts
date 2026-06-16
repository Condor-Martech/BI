import { NextResponse, type NextRequest } from "next/server";

import { ACCESS_COOKIE } from "@/lib/auth/cookies";
import { isJwtExpired } from "@/lib/auth/jwt";

/** Public paths — gate everything else behind the cookie check. */
const PUBLIC_EXACT = new Set([
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/set-password",
]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname.startsWith("/favicon")) return true;
  // /set-password/<token> — fluxo de convite, sem cookie ainda.
  if (pathname.startsWith("/set-password/")) return true;
  // PATCH /api/users/forget/pass/<email> — reset de senha pelo usuário deslogado.
  // Backend marca o handler com @SkipAuth(); sem este whitelist o middleware
  // redireciona ao /login antes de chegar ao backend e o reset nunca dispara.
  if (pathname.startsWith("/api/users/forget/pass/")) return true;
  return false;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const token = req.cookies.get(ACCESS_COOKIE)?.value;
  if (!token || isJwtExpired(token)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname + req.nextUrl.search);
    const res = NextResponse.redirect(url);
    if (token) res.cookies.delete(ACCESS_COOKIE);
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Run on everything except static assets and Next internals.
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
