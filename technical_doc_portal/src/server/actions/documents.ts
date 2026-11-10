"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertPermission, AuthError } from "@/server/auth/dal";
import {
  addRevisionFromUpload,
  changeDocumentStatus,
  correctPublishedRevision,
  createDocumentFromUpload,
  fromNewChoiceFields,
  publishRevision,
  rejectRevision,
  restoreRevision,
  ServiceError,
  updateDocumentMetadata,
  updateDraftRevision,
  type DocumentMetadataInput,
  type LifecycleAction,
} from "@/server/services/revisions";
import type { ActionState } from "./types";

const uuid = z.string().uuid();
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional()
    .transform((v) => v ?? null);

const metadataSchema = z.object({
  title: z.string().trim().min(3, "Enter the official document title.").max(300),
  documentNumber: z
    .string()
    .trim()
    .min(2, "Enter the document number.")
    .max(60)
    .regex(/^[A-Za-z0-9][A-Za-z0-9\-_./ ]*$/, "Use letters, numbers and - _ . / only."),
  description: optText(2000),
  // A category id, or "__new__" together with the name typed in newCategory.
  categoryId: z.union([uuid, z.literal("__new__")]),
  newCategory: z.string().trim().max(80).optional(),
  subcategoryId: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .pipe(z.union([uuid, z.literal("__new__")]).nullable()),
  newSubcategory: z.string().trim().max(80).optional(),
  productModels: z
    .string()
    .optional()
    .transform((v) =>
      (v ?? "")
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 100),
    ),
  // A type id, or "__new__" together with the name typed in newDocumentType.
  documentTypeId: z.union([uuid, z.literal("__new__")]),
  newDocumentType: z.string().trim().max(80).optional(),
  language: z.string().trim().min(2).max(40),
  source: z.string().trim().min(2).max(120),
  visibility: z.enum(["all_dealers", "regions"]),
  regionIds: z.array(uuid).default([]),
});

const revisionSchema = z.object({
  revisionNumber: z.string().trim().min(1, "Enter the revision number.").max(30),
  releaseDate: z
    .string()
    .optional()
    .transform((v) => v || null)
    .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()),
  revisionNotes: optText(2000),
});

function parseMetadata(fd: FormData): DocumentMetadataInput {
  const raw = { ...Object.fromEntries(fd), regionIds: fd.getAll("regionIds").map(String) };
  const r = metadataSchema.safeParse(raw);
  if (!r.success) {
    const issue = r.error.issues[0];
    const field = issue.path[0];
    throw new ServiceError(
      field === "categoryId"
        ? "Choose a category."
        : field === "documentTypeId"
          ? "Choose a document type."
          : field === "newDocumentType"
            ? "Enter a document type name (2–80 characters)."
            : field === "newCategory" || field === "newSubcategory"
              ? `Enter a ${field === "newCategory" ? "category" : "subcategory"} name (2–80 characters).`
              : issue.message,
    );
  }
  const { documentTypeId, newDocumentType, categoryId, newCategory, subcategoryId, newSubcategory, ...rest } = r.data;
  return { ...rest, ...fromNewChoiceFields({ documentTypeId, newDocumentType, categoryId, newCategory, subcategoryId, newSubcategory }) };
}


function parseRevision(fd: FormData) {
  const r = revisionSchema.safeParse(Object.fromEntries(fd));
  if (!r.success) throw new ServiceError(r.error.issues[0].message);
  return r.data;
}

function toState(e: unknown): ActionState {
  if (e instanceof ServiceError || e instanceof AuthError) return { error: e.message };
  // Unique / trigger violations surface as friendly messages.
  const msg = (e as { message?: string })?.message ?? "";
  if (/immutable|cannot be deleted/i.test(msg)) return { error: "Published revisions cannot be changed." };
  console.error(e);
  return { error: "Something went wrong. Please try again." };
}

function isRedirect(e: unknown) {
  return typeof e === "object" && e !== null && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_");
}

/* ---------------- Upload workflow ---------------- */

export async function createDocumentAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let target: string;
  try {
    const intent = String(fd.get("intent"));
    const user = await assertPermission(intent === "publish" ? "documents.publish" : "documents.upload");
    const uploadId = uuid.parse(fd.get("uploadId"));
    const res = await createDocumentFromUpload(
      {
        uploadId,
        meta: parseMetadata(fd),
        revision: parseRevision(fd),
        publish: intent === "publish",
        notify: fd.get("notify") === "on",
      },
      user,
    );
    target = `/admin/documents/${res.documentId}?created=${intent === "publish" ? "published" : "draft"}`;
  } catch (e) {
    if (isRedirect(e)) throw e;
    return toState(e);
  }
  revalidatePath("/admin", "layout");
  revalidatePath("/portal", "layout");
  redirect(target);
}

export async function addRevisionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let target: string;
  try {
    const intent = String(fd.get("intent"));
    const user = await assertPermission(intent === "publish" ? "documents.publish" : "documents.upload");
    const res = await addRevisionFromUpload(
      {
        documentId: uuid.parse(fd.get("documentId")),
        uploadId: uuid.parse(fd.get("uploadId")),
        revision: parseRevision(fd),
        publish: intent === "publish",
        notify: fd.get("notify") === "on",
      },
      user,
    );
    target = `/admin/documents/${res.documentId}?revision=${intent === "publish" ? "published" : "draft"}`;
  } catch (e) {
    if (isRedirect(e)) throw e;
    return toState(e);
  }
  revalidatePath("/admin", "layout");
  revalidatePath("/portal", "layout");
  redirect(target);
}

/* ---------------- Metadata ---------------- */

export async function updateMetadataAction(documentId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("documents.edit_metadata");
    await updateDocumentMetadata(uuid.parse(documentId), parseMetadata(fd), user);
    revalidatePath("/admin", "layout");
    revalidatePath("/portal", "layout");
    return { ok: true, message: "Metadata saved." };
  } catch (e) {
    return toState(e);
  }
}

/* ---------------- Revisions ---------------- */

export async function publishRevisionAction(revisionId: string, notify: boolean): Promise<ActionState> {
  try {
    const user = await assertPermission("documents.publish");
    const id = uuid.parse(revisionId);
    // Authored documents: export to PDF first (when Chrome is configured) so dealers get a real PDF file.
    const { attachAuthoredPdf } = await import("@/server/services/authored");
    await attachAuthoredPdf(id).catch((e) => console.error("[authored pdf]", e));
    await publishRevision(id, user, notify);
    revalidatePath("/admin", "layout");
    revalidatePath("/portal", "layout");
    return { ok: true, message: "Revision published. Dealers now see it as the current version." };
  } catch (e) {
    return toState(e);
  }
}

export async function rejectRevisionAction(revisionId: string, reason: string): Promise<ActionState> {
  try {
    const user = await assertPermission("documents.publish");
    const why = reason.trim().slice(0, 500);
    if (!why) return { error: "Please give a reason." };
    await rejectRevision(uuid.parse(revisionId), why, user);
    revalidatePath("/admin", "layout");
    return { ok: true, message: "Draft revision rejected." };
  } catch (e) {
    return toState(e);
  }
}

export async function updateRevisionAction(revisionId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("documents.edit_metadata");
    await updateDraftRevision(uuid.parse(revisionId), parseRevision(fd), user);
    revalidatePath("/admin", "layout");
    return { ok: true, message: "Revision updated." };
  } catch (e) {
    return toState(e);
  }
}

export async function correctRevisionAction(revisionId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("revisions.correct");
    const reason = String(fd.get("reason") ?? "").trim();
    if (reason.length < 5) return { error: "Describe why the published record needs correcting." };
    await correctPublishedRevision(uuid.parse(revisionId), { ...parseRevision(fd), reason }, user);
    revalidatePath("/admin", "layout");
    revalidatePath("/portal", "layout");
    return { ok: true, message: "Published revision record corrected and logged." };
  } catch (e) {
    return toState(e);
  }
}

export async function restoreRevisionAction(revisionId: string, newRevisionNumber: string, reason: string): Promise<ActionState> {
  try {
    const user = await assertPermission("revisions.restore");
    const n = newRevisionNumber.trim().slice(0, 30);
    const why = reason.trim().slice(0, 500);
    if (!n) return { error: "Enter a revision number for the restored copy." };
    if (!why) return { error: "Please give a reason." };
    await restoreRevision(uuid.parse(revisionId), n, why, user);
    revalidatePath("/admin", "layout");
    return { ok: true, message: "Restored as a new draft revision. Review and publish it to make it current." };
  } catch (e) {
    return toState(e);
  }
}

/* ---------------- Lifecycle ---------------- */

export async function changeStatusAction(
  documentId: string,
  action: LifecycleAction,
  reason: string,
  notify: boolean,
): Promise<ActionState> {
  try {
    const perm = action === "unpublish" || action === "republish" ? "documents.publish" : "documents.archive";
    const user = await assertPermission(perm);
    if (!["unpublish", "republish", "archive", "withdraw", "reinstate"].includes(action)) return { error: "Unknown action." };
    await changeDocumentStatus(uuid.parse(documentId), action, reason.trim().slice(0, 500) || null, user, notify);
    revalidatePath("/admin", "layout");
    revalidatePath("/portal", "layout");
    const done = { unpublish: "unpublished", republish: "republished", archive: "archived", withdraw: "withdrawn", reinstate: "reinstated" }[action];
    return { ok: true, message: `Document ${done}.` };
  } catch (e) {
    return toState(e);
  }
}

export async function runOcrAction(revisionId: string): Promise<ActionState> {
  try {
    const user = await assertPermission("documents.edit_metadata");
    const id = uuid.parse(revisionId);
    const { db, schema } = await import("@/server/db");
    const { eq, and, ne } = await import("drizzle-orm");
    const updated = await db
      .update(schema.documentRevisions)
      .set({ ocrStatus: "running" })
      .where(and(eq(schema.documentRevisions.id, id), ne(schema.documentRevisions.ocrStatus, "running")))
      .returning({ id: schema.documentRevisions.id });
    if (!updated.length) return { error: "OCR is already running for this revision." };
    const { after } = await import("next/server");
    const { runOcrJob } = await import("@/server/services/ocr");
    after(() => runOcrJob(id, user.id));
    revalidatePath("/admin", "layout");
    return { ok: true, message: "OCR started. This can take a minute — refresh the page to see the result." };
  } catch (e) {
    return toState(e);
  }
}
