import "server-only";
import { db, schema, type Tx } from "@/server/db";
import { requestMeta } from "@/server/auth/session";

export type ActivityAction =
  | "auth.login"
  | "auth.login_failed"
  | "auth.password_changed"
  | "document.created"
  | "document.metadata_updated"
  | "document.published"
  | "document.unpublished"
  | "document.archived"
  | "document.withdrawn"
  | "document.reinstated"
  | "revision.uploaded"
  | "revision.updated"
  | "revision.published"
  | "revision.rejected"
  | "revision.restored"
  | "revision.corrected"
  | "revision.ocr"
  | "category.created"
  | "category.updated"
  | "category.reordered"
  | "category.status_changed"
  | "document_type.changed"
  | "region.changed"
  | "user.created"
  | "user.updated"
  | "user.status_changed"
  | "user.password_reset"
  | "settings.updated"
  | "notification.email";

export async function logActivity(
  entry: {
    userId: string | null;
    action: ActivityAction;
    description: string;
    documentId?: string | null;
    entityType?: string;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
  },
  tx?: Tx,
) {
  let ip: string | null = null;
  try {
    ip = (await requestMeta()).ip;
  } catch {
    /* outside a request (scripts) */
  }
  await (tx ?? db).insert(schema.activityLogs).values({
    userId: entry.userId,
    action: entry.action,
    description: entry.description,
    documentId: entry.documentId ?? null,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    metadata: entry.metadata,
    ip,
  });
}
