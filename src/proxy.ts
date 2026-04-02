import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Route-protection proxy (Next.js 16).
 *
 * 1. Basic認証（BASIC_AUTH_USER / BASIC_AUTH_PASSWORD が設定されている場合）
 * 2. __session cookie によるルート保護
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ---- Basic Auth -----------------------------------------------------------
  const basicUser = process.env.BASIC_AUTH_USER;
  const basicPass = process.env.BASIC_AUTH_PASSWORD;

  if (basicUser && basicPass) {
    const authHeader = request.headers.get("authorization");
    if (authHeader) {
      const [scheme, encoded] = authHeader.split(" ");
      if (scheme === "Basic" && encoded) {
        const decoded = atob(encoded);
        const [user, pass] = decoded.split(":");
        if (user === basicUser && pass === basicPass) {
          // Basic認証OK → 次のチェックへ
        } else {
          return unauthorizedResponse();
        }
      } else {
        return unauthorizedResponse();
      }
    } else {
      return unauthorizedResponse();
    }
  }

  // ---- Public paths — always pass through ---------------------------------
  const isPublicPath =
    pathname === "/login" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/sitemap.xml" ||
    pathname === "/robots.txt";

  if (isPublicPath) {
    return NextResponse.next();
  }

  // ---- Session check ------------------------------------------------------
  const session = request.cookies.get("__session");

  // No session cookie → redirect to login
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Has session cookie but visiting /login → redirect to /chat
  if (session && pathname === "/login") {
    return NextResponse.redirect(new URL("/chat", request.url));
  }

  return NextResponse.next();
}

function unauthorizedResponse() {
  return new NextResponse("Unauthorized", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Restricted"' },
  });
}

export const config = {
  matcher: [
    /*
     * Match all paths except static assets and image optimisation.
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
