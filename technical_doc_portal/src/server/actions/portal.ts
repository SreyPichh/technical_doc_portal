"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/server/db";
import { assertPermission } from "@/server/auth/dal";
import { canViewDocumentInPortal } from "@/server/services/access";

export async function toggleSavedAction(documentId: string) {
  const user = await assertPermission("portal.view");
  if (!(await canViewDocumentInPortal(user, documentId))) return { saved: false, error: "Document not available." };
  const where = and(eq(schema.savedDocuments.userId, user.id), eq(schema.savedDocuments.documentId, documentId));
  const existing = await db.select().from(schema.savedDocuments).where(where);
  if (existing.length) {
    await db.delete(schema.savedDocuments).where(where);
  } else {
    await db.insert(schema.savedDocuments).values({ userId: user.id, documentId }).onConflictDoNothing();
  }
  revalidatePath("/portal/saved");
  return { saved: !existing.length };
}
