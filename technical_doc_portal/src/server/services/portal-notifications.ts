import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import type { SessionUser } from "@/server/auth/dal";
import { getSettings } from "./settings";
import { portalUpdates } from "./documents";

export type BellItem = {
  id: string;
  type: "new" | "updated" | "restored" | "withdrawn" | "archived";
  documentId: string;
  documentNumber: string;
  title: string;
  revisionNumber: string | null;
  createdAt: string;
  unread: boolean;
};

/** Publication events after this moment count as unread for the user. */
export async function unreadSince(user: SessionUser) {
  const [[me], settings] = await Promise.all([
    db.select({ seenAt: schema.users.notificationsSeenAt }).from(schema.users).where(eq(schema.users.id, user.id)),
    getSettings(),
  ]);
  return me?.seenAt ?? new Date(Date.now() - settings.newLabelDays * 86_400_000);
}

/**
 * The latest publication events this user can see, for the header bell.
 * Events newer than the user's last look at the bell count as unread; before the
 * first look, events inside the NEW-label window count as unread.
 */
export async function bellUpdates(user: SessionUser, limit = 8) {
  const [since, { rows }] = await Promise.all([unreadSince(user), portalUpdates(user, 1, limit)]);
  const items: BellItem[] = rows.map((e) => ({
    id: e.id,
    type: e.type,
    documentId: e.documentId,
    documentNumber: e.documentNumber,
    title: e.docTitle,
    revisionNumber: e.revisionNumber,
    createdAt: e.createdAt.toISOString(),
    unread: e.createdAt > since,
  }));
  return { items, unread: items.filter((i) => i.unread).length };
}
