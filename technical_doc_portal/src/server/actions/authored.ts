"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertPermission, AuthError } from "@/server/auth/dal";
import { createAuthoredDocument, saveAuthoredDraft } from "@/server/services/authored";
import { ServiceError } from "@/server/services/revisions";
import type { ActionState } from "./types";

const metaSchema = z.object({
  title: z.string().trim().min(3).max(300),
  documentNumber: z.string().trim().min(2).max(60),
  description: z.string().trim().max(2000).optional().transform((v) => v || null),
  categoryId: z.string().uuid({ message: "Choose a category." }),
  subcategoryId: z.string().optional().transform((v) => v || null).pipe(z.string().uuid().nullable()),
  productModels: z.string().optional().transform((v) => (v ?? "").split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)),
  documentTypeId: z.string().uuid({ message: "Choose a document type." }),
  language: z.string().trim().min(2).max(40),
  source: z.string().trim().min(2).max(120),
  visibility: z.enum(["all_dealers", "regions"]),
});
const revSchema = z.object({
  revisionNumber: z.string().trim().min(1, "Enter the revision number.").max(30),
  releaseDate: z.string().optional().transform((v) => v || null).pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()),
  revisionNotes: z.string().trim().max(2000).optional().transform((v) => v || null),
});

function parseContent(fd: FormData) {
  try {
    return JSON.parse(String(fd.get("content") ?? "null"));
  } catch {
    throw new ServiceError("The document content could not be read.");
  }
}

function toState(e: unknown): ActionState {
  if (e instanceof ServiceError || e instanceof AuthError) return { error: e.message };
  console.error(e);
  return { error: "Could not save the document." };
}

export async function createAuthoredAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let target: string;
  try {
    const user = await assertPermission("documents.author");
    const m = metaSchema.safeParse(Object.fromEntries(fd));
    if (!m.success) return { error: m.error.issues[0].message };
    const rv = revSchema.safeParse(Object.fromEntries(fd));
    if (!rv.success) return { error: rv.error.issues[0].message };
    const regionIds = fd.getAll("regionIds").map(String).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
    const res = await createAuthoredDocument({ ...m.data, regionIds }, rv.data, parseContent(fd), user);
    target = `/admin/authored/${res.documentId}?saved=1`;
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/admin", "layout");
  redirect(target);
}

export async function saveAuthoredAction(documentId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("documents.author");
    const rv = revSchema.safeParse(Object.fromEntries(fd));
    if (!rv.success) return { error: rv.error.issues[0].message };
    await saveAuthoredDraft(z.string().uuid().parse(documentId), rv.data, parseContent(fd), user);
    revalidatePath("/admin", "layout");
    return { ok: true, message: "Draft saved. Publish it from the document page when ready." };
  } catch (e) {
    return toState(e);
  }
}
