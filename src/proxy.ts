import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Route-protection proxy (Next.js 16).
 *
 * Checks for the `__session` cookie set by the AuthContext on the client.
 * If the cookie is missing the user is redirected to /login.
 * Actual token verification happens in API routes via Firebase Admin SDK.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

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

export const config = {
  matcher: [
    /*
     * Match all paths except static assets and image optimisation.
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
