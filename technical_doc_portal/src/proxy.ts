import { NextResponse, type NextRequest } from "next/server";

/**
 * Runs before every page and API request.
 *
 * 1. Optimistic sign-in check: requests to protected areas without a session cookie are sent to
 *    /login (pages) or answered 401 (API). Real authentication and authorisation happen in the data
 *    access layer (src/server/auth/dal.ts) on every page, server action and route handler.
 * 2. Content-Security-Policy with a fresh nonce for every page: only scripts that Next.js itself
 *    renders with that nonce (and what they load) may run, which blocks injected scripts (XSS).
 *    See node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md.
 */
const PROTECTED = ["/portal", "/admin", "/account", "/print", "/api/files", "/api/admin", "/api/assets"];

function isProtected(pathname: string) {
  return pathname === "/" || PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function contentSecurityPolicy(nonce: string) {
  const dev = process.env.NODE_ENV === "development";
  const https = (process.env.APP_URL ?? "").startsWith("https://");
  return [
    "default-src 'self'",
    // 'wasm-unsafe-eval': PDF.js image decoders are WebAssembly. 'unsafe-eval' only in development (React debugging).
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ""}`,
    // Inline style attributes are used by the PDF viewer and the document editor.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "connect-src 'self'",
    "media-src 'self'",
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (isProtected(pathname) && !req.cookies.has("nsk_session")) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/api/")) return NextResponse.next();

  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  matcher: [
    // Everything except build assets and public static files (PDF.js assets, logos, icons).
    "/((?!_next/static|_next/image|pdfjs/|brand/|favicon.ico|icon.svg|apple-icon.png|robots.txt).*)",
  ],
};
