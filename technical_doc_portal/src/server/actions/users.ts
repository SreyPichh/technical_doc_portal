"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/server/db";
import { assertPermission, AuthError, type SessionUser } from "@/server/auth/dal";
import { generatePassword, hashPassword } from "@/server/auth/password";
import { destroyAllSessionsForUser } from "@/server/auth/session";
import { logActivity } from "@/server/services/activity";
import { can, ROLES, ROLE_LABELS, type Role } from "@/lib/permissions";
import type { ActionState } from "./types";

const u = schema.users;

const userSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the person's name.").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid e-mail address.").max(200),
  dealerName: z
    .string()
    .trim()
    .max(160)
    .optional()
    .transform((v) => v || null),
  regionId: z
    .string()
    .optional()
    .transform((v) => v || null)
    .pipe(z.string().uuid().nullable()),
  role: z.enum(ROLES).default("dealer"),
});

function fail(e: unknown): ActionState {
  if (e instanceof AuthError) return { error: e.message };
  const code = (e as { code?: string; cause?: { code?: string } })?.cause?.code ?? (e as { code?: string })?.code;
  if (code === "23505") return { error: "An account with this e-mail address already exists." };
  console.error(e);
  return { error: "Could not save the account." };
}

/** Dealer-type roles can be managed with dealers.manage; staff roles need admins.manage. */
function assertRoleAllowed(actor: SessionUser, role: Role) {
  const dealerRoles: Role[] = ["dealer"];
  if (!dealerRoles.includes(role) && !can(actor.role, "admins.manage"))
    throw new AuthError(403, "Only super administrators can create or change staff accounts.");
}

function refresh() {
  revalidatePath("/admin", "layout");
}

export async function createUserAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const actor = await assertPermission("dealers.manage");
    const r = userSchema.safeParse(Object.fromEntries(fd));
    if (!r.success) return { error: r.error.issues[0].message };
    assertRoleAllowed(actor, r.data.role);
    if (r.data.role === "dealer" && !r.data.dealerName) return { error: "Enter the dealer company name." };
    const temp = generatePassword();
    const [row] = await db
      .insert(u)
      .values({ ...r.data, passwordHash: await hashPassword(temp), mustChangePassword: true, createdBy: actor.id })
      .returning();
    await logActivity({
      userId: actor.id,
      action: "user.created",
      entityType: "user",
      entityId: row.id,
      description: `Created ${ROLE_LABELS[row.role].toLowerCase()} account for ${row.fullName} <${row.email}>${row.dealerName ? ` (${row.dealerName})` : ""}`,
    });
    refresh();
    return { ok: true, message: "Account created.", data: { email: row.email, password: temp } };
  } catch (e) {
    return fail(e);
  }
}

export async function updateUserAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const actor = await assertPermission("dealers.manage");
    const r = userSchema.safeParse(Object.fromEntries(fd));
    if (!r.success) return { error: r.error.issues[0].message };
    const [before] = await db.select().from(u).where(eq(u.id, id));
    if (!before) return { error: "Account not found." };
    assertRoleAllowed(actor, before.role);
    assertRoleAllowed(actor, r.data.role);
    if (before.id === actor.id && r.data.role !== before.role) return { error: "You cannot change your own role." };
    const changes = (Object.keys(r.data) as (keyof typeof r.data)[]).filter((k) => (before[k] ?? null) !== (r.data[k] ?? null));
    await db.update(u).set({ ...r.data, updatedAt: new Date() }).where(eq(u.id, id));
    // Access-relevant changes take effect immediately: end existing sessions.
    if (changes.includes("role") || changes.includes("regionId") || changes.includes("email")) await destroyAllSessionsForUser(id);
    await logActivity({
      userId: actor.id,
      action: "user.updated",
      entityType: "user",
      entityId: id,
      description: changes.length
        ? `Updated account ${r.data.email}: ${changes.join(", ")}${changes.includes("role") ? ` (${ROLE_LABELS[before.role]} → ${ROLE_LABELS[r.data.role]})` : ""}`
        : `Saved account ${r.data.email} (no changes)`,
      metadata: { before: Object.fromEntries(changes.map((k) => [k, before[k]])), after: Object.fromEntries(changes.map((k) => [k, r.data[k]])) },
    });
    refresh();
    return { ok: true, message: "Account saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function setUserStatusAction(id: string, status: "active" | "suspended"): Promise<ActionState> {
  try {
    const actor = await assertPermission("dealers.manage");
    const [target] = await db.select().from(u).where(eq(u.id, id));
    if (!target) return { error: "Account not found." };
    assertRoleAllowed(actor, target.role);
    if (target.id === actor.id) return { error: "You cannot suspend your own account." };
    if (status === "suspended" && target.role === "super_admin") {
      const [{ n }] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(u)
        .where(sql`${u.role} = 'super_admin' and ${u.status} = 'active'`);
      if (n <= 1) return { error: "At least one active super administrator is required." };
    }
    await db.update(u).set({ status, updatedAt: new Date() }).where(eq(u.id, id));
    if (status === "suspended") await destroyAllSessionsForUser(id);
    await logActivity({
      userId: actor.id,
      action: "user.status_changed",
      entityType: "user",
      entityId: id,
      description: `${status === "suspended" ? "Suspended" : "Reactivated"} access for ${target.fullName} <${target.email}>`,
    });
    refresh();
    return { ok: true, message: status === "suspended" ? "Access suspended. The user has been signed out." : "Access restored." };
  } catch (e) {
    return fail(e);
  }
}

export async function resetPasswordAction(id: string): Promise<ActionState> {
  try {
    const actor = await assertPermission("dealers.manage");
    const [target] = await db.select().from(u).where(eq(u.id, id));
    if (!target) return { error: "Account not found." };
    assertRoleAllowed(actor, target.role);
    const temp = generatePassword();
    await db
      .update(u)
      .set({ passwordHash: await hashPassword(temp), mustChangePassword: true, updatedAt: new Date() })
      .where(eq(u.id, id));
    await destroyAllSessionsForUser(id);
    await logActivity({
      userId: actor.id,
      action: "user.password_reset",
      entityType: "user",
      entityId: id,
      description: `Reset password for ${target.fullName} <${target.email}> (must change at next sign-in)`,
    });
    return { ok: true, message: "Temporary password generated.", data: { email: target.email, password: temp } };
  } catch (e) {
    return fail(e);
  }
}
