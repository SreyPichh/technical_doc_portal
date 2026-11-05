/**
 * Role → permission map. This is the single source of truth for authorisation;
 * the server checks permissions (never roles) before every protected read or
 * write. To introduce a new role, add it to the `user_role` enum in the schema
 * and give it a permission set here.
 */
export const PERMISSIONS = [
  "portal.view", // browse/preview/download published documents
  "admin.access", // open the admin dashboard
  "documents.view_all", // see drafts, archived, withdrawn, all revisions
  "documents.upload",
  "documents.edit_metadata",
  "documents.author", // create/edit rich-text documents
  "documents.publish", // approve & publish revisions, unpublish
  "documents.archive", // archive / withdraw / reinstate
  "revisions.restore",
  "revisions.correct", // controlled correction of published revision metadata
  "categories.manage",
  "dealers.view",
  "dealers.manage",
  "admins.manage",
  "activity.view",
  "settings.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLES = [
  "super_admin",
  "admin",
  "technical_reviewer",
  "regional_admin",
  "dealer_manager",
  "dealer",
] as const;
export type Role = (typeof ROLES)[number];

const ADMIN_CORE: Permission[] = [
  "portal.view",
  "admin.access",
  "documents.view_all",
  "documents.upload",
  "documents.edit_metadata",
  "documents.author",
  "documents.publish",
  "documents.archive",
  "revisions.restore",
  "categories.manage",
  "dealers.view",
  "dealers.manage",
  "activity.view",
  "settings.manage",
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  super_admin: [...ADMIN_CORE, "revisions.correct", "admins.manage"],
  admin: ADMIN_CORE,
  // Future roles — defined now so they can be enabled without code changes elsewhere.
  technical_reviewer: ["portal.view", "admin.access", "documents.view_all", "documents.publish", "activity.view"],
  regional_admin: ["portal.view", "admin.access", "documents.view_all", "dealers.view", "dealers.manage"],
  dealer_manager: ["portal.view", "admin.access", "dealers.view", "dealers.manage"],
  dealer: ["portal.view"],
};

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Administrator",
  admin: "Administrator",
  technical_reviewer: "Technical Reviewer",
  regional_admin: "Regional Administrator",
  dealer_manager: "Dealer Manager",
  dealer: "Dealer",
};

export function can(role: Role | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function isStaff(role: Role | undefined | null) {
  return can(role, "admin.access");
}
