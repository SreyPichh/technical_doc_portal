import "server-only";
import { and, count, countDistinct, eq, gt, inArray, max } from "drizzle-orm";
import { db, schema } from "@/server/db";
import type { SessionUser } from "@/server/auth/dal";
import { isStaff } from "@/lib/permissions";

const v = schema.documentViews;

/** A dealer re-opening the same revision within this time counts as one view (refreshes, back/forward).
 *  Opening it again after a new revision is published counts as a new view. */
const REPEAT_WINDOW_MS = 30 * 60 * 1000;

/**
 * Records that a dealer opened a document page. Staff views are not counted.
 * Views belong to the document, so the count carries on when a new revision is published;
 * the revision shown is kept as well for the per-revision breakdown.
 */
export async function recordDocumentView(user: SessionUser, documentId: string, revisionId: string) {
  if (isStaff(user.role)) return;
  const since = new Date(Date.now() - REPEAT_WINDOW_MS);
  const [recent] = await db
    .select({ id: v.id })
    .from(v)
    .where(and(eq(v.userId, user.id), eq(v.documentId, documentId), eq(v.revisionId, revisionId), gt(v.createdAt, since)))
    .limit(1);
  if (recent) return;
  await db.insert(v).values({ userId: user.id, documentId, revisionId });
}

/** Total views and distinct dealers for each document (for the document table). */
export async function viewCounts(documentIds: string[]) {
  const out = new Map<string, { views: number; viewers: number }>();
  if (!documentIds.length) return out;
  const rows = await db
    .select({ documentId: v.documentId, views: count(), viewers: countDistinct(v.userId) })
    .from(v)
    .where(inArray(v.documentId, documentIds))
    .groupBy(v.documentId);
  for (const r of rows) out.set(r.documentId, { views: r.views, viewers: r.viewers });
  return out;
}

/** Views of one document: total, distinct dealers, last view and the count per revision. */
export async function documentViewStats(documentId: string) {
  const [totals] = await db
    .select({ views: count(), viewers: countDistinct(v.userId), lastViewedAt: max(v.createdAt) })
    .from(v)
    .where(eq(v.documentId, documentId));
  const perRevision = await db
    .select({ revisionId: v.revisionId, views: count() })
    .from(v)
    .where(eq(v.documentId, documentId))
    .groupBy(v.revisionId);
  return {
    views: totals?.views ?? 0,
    viewers: totals?.viewers ?? 0,
    lastViewedAt: totals?.lastViewedAt ?? null,
    byRevision: new Map(perRevision.map((r) => [r.revisionId, r.views])),
  };
}
