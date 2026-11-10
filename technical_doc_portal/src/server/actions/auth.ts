"use server";

import { and, eq, gte, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/server/db";
import { createSession, destroyAllSessionsForUser, destroySession, requestMeta } from "@/server/auth/session";
import { hashPassword, validatePasswordStrength, verifyPassword } from "@/server/auth/password";
import { getCurrentUser } from "@/server/auth/dal";
import { isStaff } from "@/lib/permissions";
import { logActivity } from "@/server/services/activity";
import type { ActionState } from "./types";

// A real hash so that unknown e-mails take as long to reject as wrong passwords.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword(crypto.randomUUID()));

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, "Enter your email address.").email("Enter a valid email address, e.g. name@company.com."),
  password: z.string().min(1, "Enter your password.").max(200),
  next: z.string().optional(),
});

/**
 * Sign-in outcome codes, so the form can show the right state:
 * validation (with `field`), invalid_credentials, inactive, rate_limited, or ok with `redirectTo`.
 */
export type LoginCode = "validation" | "invalid_credentials" | "inactive" | "rate_limited";

function safeNext(next: string | undefined) {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/api/")) return null;
  return next;
}

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue.message, data: { code: "validation", field: String(issue.path[0] ?? "") } };
  }
  const { email, password } = parsed.data;
  const { ip } = await requestMeta();

  const since = sql`now() - interval '15 minutes'`;
  const [{ byEmail }] = await db
    .select({ byEmail: sql<number>`count(*)::int` })
    .from(schema.loginAttempts)
    .where(and(eq(schema.loginAttempts.email, email), eq(schema.loginAttempts.success, false), gte(schema.loginAttempts.createdAt, since)));
  const [{ byIp }] = ip
    ? await db
        .select({ byIp: sql<number>`count(*)::int` })
        .from(schema.loginAttempts)
        .where(and(eq(schema.loginAttempts.ip, ip), eq(schema.loginAttempts.success, false), gte(schema.loginAttempts.createdAt, since)))
    : [{ byIp: 0 }];
  if (byEmail >= 5 || byIp >= 30) {
    return {
      error: "Too many unsuccessful sign-in attempts. For your security, please wait 15 minutes before trying again.",
      data: { code: "rate_limited" },
    };
  }

  const [user] = await db
    .select()
    .from(schema.users)
    .where(sql`lower(${schema.users.email}) = ${email}`)
    .limit(1);
  const ok = await verifyPassword(user?.passwordHash ?? (await getDummyHash()), password);
  if (!user || !ok || user.status !== "active") {
    await db.insert(schema.loginAttempts).values({ email, ip, success: false });
    if (user) {
      await logActivity({
        userId: user.id,
        action: "auth.login_failed",
        description: user.status !== "active" ? `Sign-in refused for suspended account ${email}` : `Failed sign-in for ${email}`,
      });
    }
    // An inactive account is only revealed to someone who knows the correct password.
    return user && ok && user.status !== "active"
      ? { error: "Your account is inactive. Please contact your NSK administrator to restore access.", data: { code: "inactive" } }
      : { error: "The email address or password is incorrect. Please check and try again.", data: { code: "invalid_credentials" } };
  }

  await db.insert(schema.loginAttempts).values({ email, ip, success: true });
  await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, user.id));
  await createSession(user.id);
  if (isStaff(user.role)) {
    await logActivity({ userId: user.id, action: "auth.login", description: `${user.fullName} signed in` });
  }
  // The form shows a short "signed in" state, then opens this page. (Pages also enforce a
  // required password change on their own, so the destination cannot skip it.)
  const redirectTo = user.mustChangePassword
    ? "/account/password?required=1"
    : (safeNext(parsed.data.next) ?? (isStaff(user.role) ? "/admin" : "/portal"));
  return { ok: true, message: `Signed in as ${user.fullName}.`, data: { redirectTo } };
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

const changeSchema = z
  .object({
    current: z.string().min(1, "Enter your current password."),
    password: z.string(),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "The new passwords do not match.", path: ["confirm"] });

export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const parsed = changeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const weak = validatePasswordStrength(parsed.data.password);
  if (weak) return { error: weak };
  if (parsed.data.password === parsed.data.current) return { error: "Choose a password different from the current one." };
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, me.id));
  if (!(await verifyPassword(u.passwordHash, parsed.data.current))) return { error: "Your current password is incorrect." };
  await db
    .update(schema.users)
    .set({ passwordHash: await hashPassword(parsed.data.password), mustChangePassword: false, updatedAt: new Date() })
    .where(eq(schema.users.id, me.id));
  // Sign out other devices, then start a fresh session here.
  await destroyAllSessionsForUser(me.id);
  await createSession(me.id);
  await logActivity({ userId: me.id, action: "auth.password_changed", description: `${me.fullName} changed their password` });
  redirect(isStaff(me.role) ? "/admin?pw=1" : "/portal/account?pw=1");
}

export async function updatePreferencesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const emailNotifications = formData.get("emailNotifications") === "on";
  await db.update(schema.users).set({ emailNotifications, updatedAt: new Date() }).where(eq(schema.users.id, me.id));
  return { ok: true, message: "Preferences saved." };
}
