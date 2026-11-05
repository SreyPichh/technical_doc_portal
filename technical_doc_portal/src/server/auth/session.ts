import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { db, schema } from "@/server/db";
import { env } from "@/server/env";

export const SESSION_COOKIE = "nsk_session";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function requestMeta() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim() || null;
  return { ip, userAgent: h.get("user-agent")?.slice(0, 300) ?? null };
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 3600_000);
  const meta = await requestMeta();
  await db.insert(schema.sessions).values({ id: hashToken(token), userId, expiresAt, ...meta });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function readSessionUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const rows = await db
    .select({ user: schema.users, sessionId: schema.sessions.id, expiresAt: schema.sessions.expiresAt })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, hashToken(token)), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row || row.user.status !== "active") return null;
  return row.user;
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(schema.sessions).where(eq(schema.sessions.id, hashToken(token)));
  store.delete(SESSION_COOKIE);
}

export async function destroyAllSessionsForUser(userId: string) {
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
}

export async function purgeExpiredSessions() {
  await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date()));
}
