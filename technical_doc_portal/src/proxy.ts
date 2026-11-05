import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic check only: bounce requests without a session cookie to /login.
 * Real authentication and authorisation happen in the data access layer
 * (src/server/auth/dal.ts) on every page, server action and route handler.
 */
export function proxy(req: NextRequest) {
  const hasSession = req.cookies.has("nsk_session");
  const { pathname, search } = req.nextUrl;
  if (!hasSession) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/portal/:path*", "/admin/:path*", "/account/:path*", "/api/files/:path*", "/api/admin/:path*", "/api/assets/:path*"],
};
