import "server-only";
import { after } from "next/server";
import { and, desc, eq, inArray, isNull, lt, max, sql } from "drizzle-orm";
import { db, schema, type Tx } from "@/server/db";
import { storage, newKey } from "@/server/storage";
import { analyzePdf } from "@/server/pdf/analyze";
import type { SessionUser } from "@/server/auth/dal";
import { logActivity } from "./activity";
import { rebuildSearchText } from "./documents";
import { recordPublicationEvent, sendNotificationEmails } from "./notifications";

const d = schema.documents;
const r = schema.documentRevisions;

/** An error whose message is safe to show to the administrator. */
export class ServiceError extends Error {}

/* ------------------------------------------------------------------ */
/* Staged uploads                                                      */
/* ------------------------------------------------------------------ */

export async function stageUpload(buf: Buffer, originalFilename: string, user: SessionUser) {
  const analysis = await analyzePdf(buf);
  const key = newKey("uploads", "pdf");
  await storage.put(key, buf, "application/pdf");
  const [row] = await db
    .insert(schema.uploads)
    .values({
      fileKey: key,
      originalFilename: originalFilename.slice(0, 250),
      fileSize: buf.length,
      sha256: analysis.sha256,
      pageCount: analysis.pageCount,
      extractedText: analysis.text,
      textChars: analysis.textChars,
      uploadedBy: user.id,
    })
    .returning();

  const duplicates = await db
    .select({ documentId: d.id, documentNumber: d.documentNumber, revisionNumber: r.revisionNumber })
    .from(r)
    .innerJoin(d, eq(d.id, r.documentId))
    .where(eq(r.sha256, analysis.sha256))
    .limit(3);

  // Opportunistic clean-up of abandoned staged uploads (> 2 days old).
  after(() => purgeStaleUploads().catch(() => {}));

  return {
    uploadId: row.id,
    filename: row.originalFilename,
    fileSize: row.fileSize,
    pageCount: analysis.pageCount,
    textChars: analysis.textChars,
    likelyScanned: analysis.likelyScanned,
    suggestions: analysis.suggestions,
    duplicates,
  };
}

async function purgeStaleUploads() {
  const stale = await db
    .select()
    .from(schema.uploads)
    .where(and(isNull(schema.uploads.consumedAt), lt(schema.uploads.createdAt, sql`now() - interval '2 days'`)));
  for (const u of stale) {
    await storage.delete(u.fileKey);
    await db.delete(schema.uploads).where(eq(schema.uploads.id, u.id));
  }
}

async function consumeUpload(tx: Tx, uploadId: string, user: SessionUser) {
  const [u] = await tx.select().from(schema.uploads).where(eq(schema.uploads.id, uploadId)).for("update");
  if (!u) throw new ServiceError("The uploaded file was not found. Please upload it again.");
  if (u.consumedAt) throw new ServiceError("This upload has already been used. Please upload the file again.");
  if (u.uploadedBy !== user.id) throw new ServiceError("This upload belongs to another administrator.");
  await tx.update(schema.uploads).set({ consumedAt: new Date() }).where(eq(schema.uploads.id, uploadId));
  return u;
}

/* ------------------------------------------------------------------ */
/* Create document / add revision                                      */
/* ------------------------------------------------------------------ */

export type DocumentMetadataInput = {
  title: string;
  documentNumber: string;
  description: string | null;
  categoryId: string;
  subcategoryId: string | null;
  productModels: string[];
  documentTypeId: string;
  language: string;
  source: string;
  visibility: "all_dealers" | "regions";
  regionIds: string[];
};

export type RevisionInput = {
  revisionNumber: string;
  releaseDate: string | null;
  revisionNotes: string | null;
};

async function assertCategoryPair(tx: Tx, categoryId: string, subcategoryId: string | null) {
  const [c] = await tx.select().from(schema.categories).where(eq(schema.categories.id, categoryId));
  if (!c || c.parentId) throw new ServiceError("Please choose a valid main category.");
  if (subcategoryId) {
    const [s] = await tx.select().from(schema.categories).where(eq(schema.categories.id, subcategoryId));
    if (!s || s.parentId !== categoryId) throw new ServiceError("The subcategory does not belong to the chosen category.");
  }
}

async function assertUniqueNumber(tx: Tx, documentNumber: string, exceptId?: string) {
  const rows = await tx
    .select({ id: d.id })
    .from(d)
    .where(sql`lower(${d.documentNumber}) = lower(${documentNumber})`);
  if (rows.some((x) => x.id !== exceptId))
    throw new ServiceError(
      `Document number ${documentNumber} already exists. To publish a newer version, use “Upload New Revision” on that document.`,
    );
}

async function setRegions(tx: Tx, documentId: string, visibility: "all_dealers" | "regions", regionIds: string[]) {
  await tx.delete(schema.documentRegions).where(eq(schema.documentRegions.documentId, documentId));
  if (visibility === "regions") {
    if (!regionIds.length) throw new ServiceError("Select at least one region, or make the document visible to all dealers.");
    await tx.insert(schema.documentRegions).values(regionIds.map((regionId) => ({ documentId, regionId })));
  }
}

export async function createDocumentFromUpload(
  input: { uploadId: string; meta: DocumentMetadataInput; revision: RevisionInput; publish: boolean; notify: boolean },
  user: SessionUser,
) {
  const result = await db.transaction(async (tx) => {
    await assertCategoryPair(tx, input.meta.categoryId, input.meta.subcategoryId);
    await assertUniqueNumber(tx, input.meta.documentNumber);
    const upload = await consumeUpload(tx, input.uploadId, user);
    const { regionIds, ...meta } = input.meta;
    const [doc] = await tx
      .insert(d)
      .values({ ...meta, kind: "uploaded_pdf", status: "draft", createdBy: user.id })
      .returning();
    await setRegions(tx, doc.id, meta.visibility, regionIds);
    const [rev] = await tx
      .insert(r)
      .values({
        documentId: doc.id,
        revisionNumber: input.revision.revisionNumber,
        sequence: 1,
        releaseDate: input.revision.releaseDate,
        revisionNotes: input.revision.revisionNotes,
        fileKey: upload.fileKey,
        originalFilename: upload.originalFilename,
        fileSize: upload.fileSize,
        mimeType: "application/pdf",
        sha256: upload.sha256,
        pageCount: upload.pageCount,
        extractedText: upload.extractedText,
        textSource: upload.textChars > 0 ? "pdf" : "none",
        ocrStatus: upload.textChars < upload.pageCount * 40 ? "recommended" : "not_needed",
        uploadedBy: user.id,
      })
      .returning();
    await rebuildSearchText(tx, doc.id);
    await logActivity(
      {
        userId: user.id,
        action: "document.created",
        documentId: doc.id,
        entityType: "document",
        entityId: doc.id,
        description: `Uploaded new document ${doc.documentNumber} “${doc.title}” (${rev.revisionNumber}, ${upload.originalFilename})`,
      },
      tx,
    );
    let notificationId: string | null = null;
    if (input.publish) notificationId = await publishInTx(tx, rev.id, user);
    return { documentId: doc.id, revisionId: rev.id, notificationId };
  });
  if (result.notificationId && input.notify) scheduleEmails(result.notificationId, user.id);
  return result;
}

export async function addRevisionFromUpload(
  input: { documentId: string; uploadId: string; revision: RevisionInput; publish: boolean; notify: boolean },
  user: SessionUser,
) {
  const result = await db.transaction(async (tx) => {
    const [doc] = await tx.select().from(d).where(eq(d.id, input.documentId)).for("update");
    if (!doc) throw new ServiceError("Document not found.");
    if (doc.kind !== "uploaded_pdf") throw new ServiceError("This is an application-authored document. Edit it in the editor instead.");
    const pending = await tx
      .select({ id: r.id, n: r.revisionNumber })
      .from(r)
      .where(and(eq(r.documentId, doc.id), eq(r.approvalStatus, "draft")));
    if (pending.length)
      throw new ServiceError(
        `Revision ${pending[0].n} is still awaiting review. Publish or reject it before uploading another revision.`,
      );
    await assertRevisionNumberFree(tx, doc.id, input.revision.revisionNumber);
    const upload = await consumeUpload(tx, input.uploadId, user);
    const [{ seq }] = await tx.select({ seq: max(r.sequence) }).from(r).where(eq(r.documentId, doc.id));
    const [rev] = await tx
      .insert(r)
      .values({
        documentId: doc.id,
        revisionNumber: input.revision.revisionNumber,
        sequence: (seq ?? 0) + 1,
        releaseDate: input.revision.releaseDate,
        revisionNotes: input.revision.revisionNotes,
        fileKey: upload.fileKey,
        originalFilename: upload.originalFilename,
        fileSize: upload.fileSize,
        mimeType: "application/pdf",
        sha256: upload.sha256,
        pageCount: upload.pageCount,
        extractedText: upload.extractedText,
        textSource: upload.textChars > 0 ? "pdf" : "none",
        ocrStatus: upload.textChars < upload.pageCount * 40 ? "recommended" : "not_needed",
        uploadedBy: user.id,
      })
      .returning();
    await tx.update(d).set({ updatedAt: new Date() }).where(eq(d.id, doc.id));
    await logActivity(
      {
        userId: user.id,
        action: "revision.uploaded",
        documentId: doc.id,
        entityType: "revision",
        entityId: rev.id,
        description: `Uploaded revision ${rev.revisionNumber} of ${doc.documentNumber} (${upload.originalFilename}) — awaiting review`,
      },
      tx,
    );
    let notificationId: string | null = null;
    if (input.publish) notificationId = await publishInTx(tx, rev.id, user);
    return { documentId: doc.id, revisionId: rev.id, notificationId };
  });
  if (result.notificationId && input.notify) scheduleEmails(result.notificationId, user.id);
  return result;
}

async function assertRevisionNumberFree(tx: Tx, documentId: string, revisionNumber: string, exceptId?: string) {
  const rows = await tx
    .select({ id: r.id })
    .from(r)
    .where(and(eq(r.documentId, documentId), sql`lower(${r.revisionNumber}) = lower(${revisionNumber})`));
  if (rows.some((x) => x.id !== exceptId))
    throw new ServiceError(`Revision ${revisionNumber} already exists for this document.`);
}

/* ------------------------------------------------------------------ */
/* Publish / reject / restore                                          */
/* ------------------------------------------------------------------ */

/**
 * Approves a draft revision and makes it the dealer-facing current revision.
 * The previously published revision is kept (marked superseded) — never overwritten.
 */
async function publishInTx(tx: Tx, revisionId: string, user: SessionUser) {
  const [rev] = await tx.select().from(r).where(eq(r.id, revisionId)).for("update");
  if (!rev) throw new ServiceError("Revision not found.");
  if (rev.approvalStatus !== "draft") throw new ServiceError(`Revision ${rev.revisionNumber} is not awaiting approval.`);
  if (!rev.fileKey) throw new ServiceError("This revision has no PDF file yet.");
  const [doc] = await tx.select().from(d).where(eq(d.id, rev.documentId)).for("update");
  const now = new Date();

  // Supersede the previous published revision (if any) — the file and record are preserved.
  await tx
    .update(r)
    .set({ approvalStatus: "superseded", supersededAt: now })
    .where(and(eq(r.documentId, doc.id), eq(r.approvalStatus, "published")));
  await tx.update(r).set({ approvalStatus: "published", publishedAt: now, approvedBy: user.id }).where(eq(r.id, rev.id));

  const isFirstPublication = doc.firstPublishedAt === null;
  await tx
    .update(d)
    .set({
      currentRevisionId: rev.id,
      status: "published",
      firstPublishedAt: doc.firstPublishedAt ?? now,
      lastPublishedAt: now,
      lastPublishEvent: isFirstPublication ? "new" : "updated",
      statusChangedAt: now,
      statusReason: null,
      updatedAt: now,
    })
    .where(eq(d.id, doc.id));
  await rebuildSearchText(tx, doc.id);
  await logActivity(
    {
      userId: user.id,
      action: "revision.published",
      documentId: doc.id,
      entityType: "revision",
      entityId: rev.id,
      description: isFirstPublication
        ? `Published ${doc.documentNumber} ${rev.revisionNumber} (first publication — labelled NEW)`
        : `Published ${doc.documentNumber} ${rev.revisionNumber} as the current revision (labelled UPDATED)`,
    },
    tx,
  );
  return recordPublicationEvent(tx, {
    documentId: doc.id,
    revisionId: rev.id,
    type: isFirstPublication ? "new" : "updated",
    userId: user.id,
  });
}

function scheduleEmails(notificationId: string, userId: string) {
  after(() => sendNotificationEmails(notificationId, userId).catch((e) => console.error("[notify]", e)));
}

export async function publishRevision(revisionId: string, user: SessionUser, notify: boolean) {
  const notificationId = await db.transaction((tx) => publishInTx(tx, revisionId, user));
  if (notify) scheduleEmails(notificationId, user.id);
}

export async function rejectRevision(revisionId: string, reason: string, user: SessionUser) {
  await db.transaction(async (tx) => {
    const [rev] = await tx.select().from(r).where(eq(r.id, revisionId)).for("update");
    if (!rev || rev.approvalStatus !== "draft") throw new ServiceError("Only draft revisions can be rejected.");
    const [doc] = await tx.select().from(d).where(eq(d.id, rev.documentId));
    await tx
      .update(r)
      .set({
        approvalStatus: "rejected",
        revisionNotes: [rev.revisionNotes, `Rejected: ${reason}`].filter(Boolean).join("\n"),
      })
      .where(eq(r.id, rev.id));
    await logActivity(
      {
        userId: user.id,
        action: "revision.rejected",
        documentId: doc.id,
        entityType: "revision",
        entityId: rev.id,
        description: `Rejected draft revision ${rev.revisionNumber} of ${doc.documentNumber}: ${reason}`,
      },
      tx,
    );
  });
}

export async function updateDraftRevision(revisionId: string, input: RevisionInput, user: SessionUser) {
  await db.transaction(async (tx) => {
    const [rev] = await tx.select().from(r).where(eq(r.id, revisionId)).for("update");
    if (!rev) throw new ServiceError("Revision not found.");
    if (rev.publishedAt) {
      // Published revisions: only notes may be edited here.
      await tx.update(r).set({ revisionNotes: input.revisionNotes }).where(eq(r.id, rev.id));
    } else {
      await assertRevisionNumberFree(tx, rev.documentId, input.revisionNumber, rev.id);
      await tx
        .update(r)
        .set({ revisionNumber: input.revisionNumber, releaseDate: input.releaseDate, revisionNotes: input.revisionNotes })
        .where(eq(r.id, rev.id));
    }
    await logActivity(
      {
        userId: user.id,
        action: "revision.updated",
        documentId: rev.documentId,
        entityType: "revision",
        entityId: rev.id,
        description: rev.publishedAt
          ? `Edited notes of revision ${rev.revisionNumber}`
          : `Edited draft revision ${rev.revisionNumber} → ${input.revisionNumber}`,
      },
      tx,
    );
  });
}

/**
 * Controlled correction of a published revision's label/date (super administrators only).
 * The database trigger blocks this unless app.revision_correction is set for the transaction.
 */
export async function correctPublishedRevision(revisionId: string, input: RevisionInput & { reason: string }, user: SessionUser) {
  await db.transaction(async (tx) => {
    const [rev] = await tx.select().from(r).where(eq(r.id, revisionId)).for("update");
    if (!rev?.publishedAt) throw new ServiceError("Only published revisions need the correction procedure.");
    await assertRevisionNumberFree(tx, rev.documentId, input.revisionNumber, rev.id);
    await tx.execute(sql`select set_config('app.revision_correction', 'on', true)`);
    await tx
      .update(r)
      .set({ revisionNumber: input.revisionNumber, releaseDate: input.releaseDate })
      .where(eq(r.id, rev.id));
    await tx.execute(sql`select set_config('app.revision_correction', 'off', true)`);
    await rebuildSearchText(tx, rev.documentId);
    await logActivity(
      {
        userId: user.id,
        action: "revision.corrected",
        documentId: rev.documentId,
        entityType: "revision",
        entityId: rev.id,
        description: `Corrected published revision record: ${rev.revisionNumber} (${rev.releaseDate ?? "no date"}) → ${input.revisionNumber} (${input.releaseDate ?? "no date"}). Reason: ${input.reason}`,
        metadata: { before: { revisionNumber: rev.revisionNumber, releaseDate: rev.releaseDate }, after: input },
      },
      tx,
    );
  });
}

/**
 * Restores a previous revision by creating a NEW draft revision that carries a
 * copy of the old file. History stays linear and nothing is overwritten; the
 * restored copy then goes through the normal review → publish step.
 */
export async function restoreRevision(revisionId: string, newRevisionNumber: string, reason: string, user: SessionUser) {
  return db.transaction(async (tx) => {
    const [old] = await tx.select().from(r).where(eq(r.id, revisionId));
    if (!old) throw new ServiceError("Revision not found.");
    if (old.approvalStatus !== "superseded" && old.approvalStatus !== "rejected")
      throw new ServiceError("Only previous (superseded or rejected) revisions can be restored.");
    const [doc] = await tx.select().from(d).where(eq(d.id, old.documentId)).for("update");
    const pending = await tx
      .select({ id: r.id })
      .from(r)
      .where(and(eq(r.documentId, doc.id), eq(r.approvalStatus, "draft")));
    if (pending.length) throw new ServiceError("Another revision is awaiting review. Publish or reject it first.");
    await assertRevisionNumberFree(tx, doc.id, newRevisionNumber);
    let fileKey = old.fileKey;
    if (old.fileKey) {
      fileKey = newKey("revisions", "pdf");
      await storage.copy(old.fileKey, fileKey);
    }
    const [{ seq }] = await tx.select({ seq: max(r.sequence) }).from(r).where(eq(r.documentId, doc.id));
    const [rev] = await tx
      .insert(r)
      .values({
        documentId: doc.id,
        revisionNumber: newRevisionNumber,
        sequence: (seq ?? 0) + 1,
        releaseDate: old.releaseDate,
        fileKey,
        originalFilename: old.originalFilename,
        fileSize: old.fileSize,
        mimeType: old.mimeType,
        sha256: old.sha256,
        pageCount: old.pageCount,
        extractedText: old.extractedText,
        textSource: old.textSource,
        ocrStatus: old.ocrStatus,
        authoredContent: old.authoredContent,
        uploadedBy: user.id,
        restoredFromId: old.id,
        revisionNotes: `Restored from revision ${old.revisionNumber}. Reason: ${reason}`,
      })
      .returning();
    await logActivity(
      {
        userId: user.id,
        action: "revision.restored",
        documentId: doc.id,
        entityType: "revision",
        entityId: rev.id,
        description: `Restored revision ${old.revisionNumber} of ${doc.documentNumber} as new draft ${newRevisionNumber}: ${reason}`,
      },
      tx,
    );
    return rev.id;
  });
}

/* ------------------------------------------------------------------ */
/* Metadata & lifecycle                                                */
/* ------------------------------------------------------------------ */

export async function updateDocumentMetadata(documentId: string, meta: DocumentMetadataInput, user: SessionUser) {
  await db.transaction(async (tx) => {
    const [doc] = await tx.select().from(d).where(eq(d.id, documentId)).for("update");
    if (!doc) throw new ServiceError("Document not found.");
    await assertCategoryPair(tx, meta.categoryId, meta.subcategoryId);
    await assertUniqueNumber(tx, meta.documentNumber, doc.id);
    const { regionIds, ...fields } = meta;
    const changes: string[] = [];
    for (const k of Object.keys(fields) as (keyof typeof fields)[]) {
      const before = JSON.stringify(doc[k] ?? null);
      const afterV = JSON.stringify(fields[k] ?? null);
      if (before !== afterV) changes.push(k);
    }
    await tx
      .update(d)
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(d.id, doc.id));
    await setRegions(tx, doc.id, meta.visibility, regionIds);
    await rebuildSearchText(tx, doc.id);
    await logActivity(
      {
        userId: user.id,
        action: "document.metadata_updated",
        documentId: doc.id,
        entityType: "document",
        entityId: doc.id,
        description: changes.length
          ? `Edited metadata of ${meta.documentNumber}: ${changes.join(", ")}`
          : `Saved metadata of ${meta.documentNumber} (no field changes)`,
        metadata: {
          before: Object.fromEntries(changes.map((k) => [k, doc[k as keyof typeof doc]])),
          after: Object.fromEntries(changes.map((k) => [k, fields[k as keyof typeof fields]])),
        },
      },
      tx,
    );
  });
}

export type LifecycleAction = "unpublish" | "republish" | "archive" | "withdraw" | "reinstate";

export async function changeDocumentStatus(
  documentId: string,
  action: LifecycleAction,
  reason: string | null,
  user: SessionUser,
  notify: boolean,
) {
  const notificationId = await db.transaction(async (tx) => {
    const [doc] = await tx.select().from(d).where(eq(d.id, documentId)).for("update");
    if (!doc) throw new ServiceError("Document not found.");
    const now = new Date();
    let status: typeof doc.status;
    let logAction: Parameters<typeof logActivity>[0]["action"];
    let desc: string;
    let event: "withdrawn" | "archived" | "restored" | null = null;
    switch (action) {
      case "unpublish":
        if (doc.status !== "published") throw new ServiceError("Only published documents can be unpublished.");
        status = "draft";
        logAction = "document.unpublished";
        desc = `Unpublished ${doc.documentNumber} (hidden from dealers)`;
        break;
      case "republish":
        if (doc.status !== "draft" || !doc.currentRevisionId)
          throw new ServiceError("This document has no approved revision to republish. Publish a revision instead.");
        status = "published";
        logAction = "document.published";
        desc = `Republished ${doc.documentNumber} (current revision unchanged — no NEW/UPDATED label)`;
        break;
      case "archive":
        if (doc.status === "archived") throw new ServiceError("Already archived.");
        status = "archived";
        logAction = "document.archived";
        desc = `Archived ${doc.documentNumber}`;
        event = doc.status === "published" ? "archived" : null;
        break;
      case "withdraw":
        if (doc.status === "withdrawn") throw new ServiceError("Already withdrawn.");
        if (!reason) throw new ServiceError("A reason is required to withdraw a document.");
        status = "withdrawn";
        logAction = "document.withdrawn";
        desc = `Withdrew ${doc.documentNumber}`;
        event = doc.firstPublishedAt ? "withdrawn" : null;
        break;
      case "reinstate":
        if (doc.status !== "archived" && doc.status !== "withdrawn")
          throw new ServiceError("Only archived or withdrawn documents can be reinstated.");
        if (!doc.currentRevisionId) throw new ServiceError("This document has no approved revision. Publish a revision instead.");
        status = "published";
        logAction = "document.reinstated";
        desc = `Reinstated ${doc.documentNumber} (current revision unchanged)`;
        event = "restored";
        break;
    }
    await tx
      .update(d)
      .set({ status, statusChangedAt: now, statusReason: reason, updatedAt: now })
      .where(eq(d.id, doc.id));
    await logActivity(
      {
        userId: user.id,
        action: logAction,
        documentId: doc.id,
        entityType: "document",
        entityId: doc.id,
        description: reason ? `${desc}. Reason: ${reason}` : desc,
      },
      tx,
    );
    return event
      ? recordPublicationEvent(tx, { documentId: doc.id, revisionId: doc.currentRevisionId, type: event, userId: user.id })
      : null;
  });
  if (notificationId && notify) scheduleEmails(notificationId, user.id);
}

export async function revisionsForDocuments(documentIds: string[]) {
  if (!documentIds.length) return [];
  return db
    .select({ id: r.id, documentId: r.documentId, revisionNumber: r.revisionNumber, status: r.approvalStatus })
    .from(r)
    .where(inArray(r.documentId, documentIds))
    .orderBy(desc(r.sequence));
}
