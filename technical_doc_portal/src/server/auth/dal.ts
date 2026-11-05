import "server-only";
import { cache } from "react";
import { forbidden, redirect } from "next/navigation";
import { can, type Permission } from "@/lib/permissions";
import { readSessionUser } from "./session";

export type SessionUser = {
  id: string;
  fullName: string;
  email: string;
  role: import("@/lib/permissions").Role;
  dealerName: string | null;
  regionId: string | null;
  mustChangePassword: boolean;
  emailNotifications: boolean;
};

/** Current user for this request (memoised per request), or null. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const u = await readSessionUser();
  if (!u) return null;
  return {
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    role: u.role,
    dealerName: u.dealerName,
    regionId: u.regionId,
    mustChangePassword: u.mustChangePassword,
    emailNotifications: u.emailNotifications,
  };
});

/** For pages: redirect to /login when signed out, force password change when required. */
export async function requireUser(opts: { allowPasswordChange?: boolean } = {}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword && !opts.allowPasswordChange) redirect("/account/password?required=1");
  return user;
}

/** For pages: require a permission, rendering the 403 page otherwise. */
export async function requirePermission(permission: Permission) {
  const user = await requireUser();
  if (!can(user.role, permission)) forbidden();
  return user;
}

export class AuthError extends Error {
  constructor(public status: 401 | 403, message: string) {
    super(message);
  }
}

/** For server actions and route handlers: throws instead of redirecting. */
export async function assertPermission(permission: Permission) {
  const user = await getCurrentUser();
  if (!user) throw new AuthError(401, "Your session has expired. Please sign in again.");
  if (user.mustChangePassword) throw new AuthError(403, "You must change your password first.");
  if (!can(user.role, permission)) throw new AuthError(403, "You do not have permission to do this.");
  return user;
}
