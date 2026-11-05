"use server";

import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/server/db";
import { assertPermission, AuthError } from "@/server/auth/dal";
import { logActivity } from "@/server/services/activity";
import { rebuildSearchTextForCategory } from "@/server/services/documents";
import { slugify } from "@/lib/text";
import type { ActionState } from "./types";

const c = schema.categories;
const ICONS = ["wind", "drill", "smile", "waves", "syringe", "flask", "info", "folder"] as const;

const schemaIn = z.object({
  name: z.string().trim().min(2, "Enter a name.").max(80),
  description: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((v) => v || null),
  icon: z.enum(ICONS).optional().nullable(),
  parentId: z
    .string()
    .optional()
    .transform((v) => v || null)
    .pipe(z.string().uuid().nullable()),
});

function fail(e: unknown): ActionState {
  if (e instanceof AuthError) return { error: e.message };
  const msg = (e as { message?: string; code?: string })?.message ?? "";
  if (/categories_parent_name_idx|duplicate key/.test(msg) || (e as { cause?: { code?: string } })?.cause?.code === "23505")
    return { error: "A category with this name already exists at this level." };
  console.error(e);
  return { error: "Could not save the category." };
}

async function uniqueSlug(base: string) {
  let slug = base;
  for (let i = 2; ; i++) {
    const rows = await db.select({ id: c.id }).from(c).where(eq(c.slug, slug));
    if (!rows.length) return slug;
    slug = `${base}-${i}`;
  }
}

function refresh() {
  revalidatePath("/admin", "layout");
  revalidatePath("/portal", "layout");
}

export async function createCategoryAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("categories.manage");
    const r = schemaIn.safeParse(Object.fromEntries(fd));
    if (!r.success) return { error: r.error.issues[0].message };
    let parentName = "";
    if (r.data.parentId) {
      const [p] = await db.select().from(c).where(eq(c.id, r.data.parentId));
      if (!p || p.parentId) return { error: "Subcategories can only be added to a main category." };
      parentName = p.name;
    }
    const [{ next }] = await db
      .select({ next: sql<number>`coalesce(max(${c.displayOrder}), -1)::int + 1` })
      .from(c)
      .where(r.data.parentId ? eq(c.parentId, r.data.parentId) : isNull(c.parentId));
    const slug = await uniqueSlug(slugify(parentName ? `${parentName}-${r.data.name}` : r.data.name));
    const [row] = await db
      .insert(c)
      .values({ ...r.data, icon: r.data.parentId ? null : (r.data.icon ?? "folder"), slug, displayOrder: next })
      .returning();
    await logActivity({
      userId: user.id,
      action: "category.created",
      entityType: "category",
      entityId: row.id,
      description: parentName ? `Created subcategory “${row.name}” under “${parentName}”` : `Created category “${row.name}”`,
    });
    refresh();
    return { ok: true, message: "Category created." };
  } catch (e) {
    return fail(e);
  }
}

export async function updateCategoryAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("categories.manage");
    const r = schemaIn.omit({ parentId: true }).safeParse(Object.fromEntries(fd));
    if (!r.success) return { error: r.error.issues[0].message };
    const [before] = await db.select().from(c).where(eq(c.id, id));
    if (!before) return { error: "Category not found." };
    await db.transaction(async (tx) => {
      await tx
        .update(c)
        .set({ name: r.data.name, description: r.data.description, icon: before.parentId ? null : (r.data.icon ?? before.icon), updatedAt: new Date() })
        .where(eq(c.id, id));
      if (before.name !== r.data.name) await rebuildSearchTextForCategory(tx, id);
      await logActivity(
        {
          userId: user.id,
          action: "category.updated",
          entityType: "category",
          entityId: id,
          description:
            before.name !== r.data.name ? `Renamed category “${before.name}” to “${r.data.name}”` : `Edited category “${r.data.name}”`,
        },
        tx,
      );
    });
    refresh();
    return { ok: true, message: "Category saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function moveCategoryAction(id: string, direction: "up" | "down"): Promise<ActionState> {
  try {
    const user = await assertPermission("categories.manage");
    const [cat] = await db.select().from(c).where(eq(c.id, id));
    if (!cat) return { error: "Category not found." };
    const siblings = await db
      .select()
      .from(c)
      .where(cat.parentId ? eq(c.parentId, cat.parentId) : isNull(c.parentId))
      .orderBy(asc(c.displayOrder), asc(c.name));
    const i = siblings.findIndex((s) => s.id === id);
    const j = direction === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= siblings.length) return { ok: true };
    [siblings[i], siblings[j]] = [siblings[j], siblings[i]];
    await db.transaction(async (tx) => {
      for (const [k, s] of siblings.entries()) await tx.update(c).set({ displayOrder: k }).where(eq(c.id, s.id));
      await logActivity(
        { userId: user.id, action: "category.reordered", entityType: "category", entityId: id, description: `Moved category “${cat.name}” ${direction}` },
        tx,
      );
    });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setCategoryStatusAction(id: string, status: "active" | "inactive"): Promise<ActionState> {
  try {
    const user = await assertPermission("categories.manage");
    const [cat] = await db.select().from(c).where(eq(c.id, id));
    if (!cat) return { error: "Category not found." };
    await db.transaction(async (tx) => {
      await tx.update(c).set({ status, updatedAt: new Date() }).where(eq(c.id, id));
      if (!cat.parentId) await tx.update(c).set({ status, updatedAt: new Date() }).where(and(eq(c.parentId, id)));
      await logActivity(
        {
          userId: user.id,
          action: "category.status_changed",
          entityType: "category",
          entityId: id,
          description: `${status === "active" ? "Activated" : "Deactivated"} category “${cat.name}”${!cat.parentId ? " and its subcategories" : ""}`,
        },
        tx,
      );
    });
    refresh();
    return { ok: true, message: status === "active" ? "Category activated." : "Category deactivated." };
  } catch (e) {
    return fail(e);
  }
}
