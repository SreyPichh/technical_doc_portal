import "server-only";
import { and, eq, isNotNull, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { can } from "@/lib/permissions";
import type { SessionUser } from "@/server/auth/dal";

const d = schema.documents;

/**
 * The single definition of "documents this user may see in the dealer portal".
 * Every portal query and every file request goes through this condition.
 *
 *  - only published documents that have an approved current revision,
 *  - documents restricted to regions are visible only to dealers in those regions
 *    (staff bypass the region restriction so they can check what dealers see).
 */
export function portalVisibilityCondition(user: SessionUser): SQL {
  const base = and(eq(d.status, "published"), isNotNull(d.currentRevisionId))!;
  if (can(user.role, "documents.view_all")) return base;
  const regionCheck = user.regionId
    ? or(
        eq(d.visibility, "all_dealers"),
        sql`exists (select 1 from ${schema.documentRegions} dr where dr.document_id = ${d.id} and dr.region_id = ${user.regionId})`,
      )!
    : eq(d.visibility, "all_dealers");
  return and(base, regionCheck)!;
}

/**
 * Whether `user` may read the file of `revisionId`.
 *  - staff with documents.view_all: any revision (drafts, history),
 *  - everyone else: only the current published revision of a document visible to them.
 */
export async function getAccessibleRevision(user: SessionUser, revisionId: string) {
  const rows = await db
    .select({ revision: schema.documentRevisions, document: d })
    .from(schema.documentRevisions)
    .innerJoin(d, eq(d.id, schema.documentRevisions.documentId))
    .where(eq(schema.documentRevisions.id, revisionId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (can(user.role, "documents.view_all")) return row;
  if (!can(user.role, "portal.view")) return null;
  if (row.document.currentRevisionId !== row.revision.id) return null;
  const visible = await db
    .select({ id: d.id })
    .from(d)
    .where(and(eq(d.id, row.document.id), portalVisibilityCondition(user)))
    .limit(1);
  return visible.length ? row : null;
}

export async function canViewDocumentInPortal(user: SessionUser, documentId: string) {
  const rows = await db
    .select({ id: d.id })
    .from(d)
    .where(and(eq(d.id, documentId), portalVisibilityCondition(user)))
    .limit(1);
  return rows.length > 0;
}
