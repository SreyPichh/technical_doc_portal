import "server-only";
import { NextResponse } from "next/server";
import { AuthError } from "@/server/auth/dal";
import { env } from "@/server/env";

export function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export function handleRouteError(e: unknown) {
  if (e instanceof AuthError) return jsonError(e.status, e.message);
  console.error(e);
  return jsonError(500, "Something went wrong. Please try again.");
}

/** CSRF defence for cookie-authenticated POST route handlers: require a same-origin request. */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) throw new AuthError(403, "Missing origin.");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let ok = false;
  try {
    const o = new URL(origin);
    ok = o.host === host || o.origin === new URL(env.APP_URL).origin;
  } catch {
    ok = false;
  }
  if (!ok) throw new AuthError(403, "Cross-origin request blocked.");
}

export function contentDisposition(type: "inline" | "attachment", filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export const PRIVATE_FILE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
} as const;
