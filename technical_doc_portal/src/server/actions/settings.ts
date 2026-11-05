"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/server/db";
import { assertPermission, AuthError } from "@/server/auth/dal";
import { logActivity } from "@/server/services/activity";
import { getSettings, saveSettings, settingsSchema } from "@/server/services/settings";
import type { ActionState } from "./types";

function fail(e: unknown): ActionState {
  if (e instanceof AuthError) return { error: e.message };
  const code = (e as { cause?: { code?: string } })?.cause?.code;
  if (code === "23505") return { error: "That name is already in use." };
  console.error(e);
  return { error: "Could not save." };
}

export async function saveSettingsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("settings.manage");
    const before = await getSettings();
    const r = settingsSchema.safeParse({
      newLabelDays: fd.get("newLabelDays"),
      updatedLabelDays: fd.get("updatedLabelDays"),
      emailNotificationsEnabled: fd.get("emailNotificationsEnabled") === "on",
      notifyOnNew: fd.get("notifyOnNew") === "on",
      notifyOnUpdate: fd.get("notifyOnUpdate") === "on",
      notifyOnWithdrawal: fd.get("notifyOnWithdrawal") === "on",
    });
    if (!r.success) return { error: "Label durations must be between 1 and 365 days." };
    await saveSettings(r.data, user.id);
    const changed = (Object.keys(r.data) as (keyof typeof r.data)[]).filter((k) => before[k] !== r.data[k]);
    await logActivity({
      userId: user.id,
      action: "settings.updated",
      description: changed.length ? `Updated settings: ${changed.map((k) => `${k} ${before[k]} → ${r.data[k]}`).join(", ")}` : "Saved settings (no changes)",
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "Settings saved." };
  } catch (e) {
    return fail(e);
  }
}

const name = z.string().trim().min(2).max(80);

export async function saveDocumentTypeAction(id: string | null, rawName: string, active = true): Promise<ActionState> {
  try {
    const user = await assertPermission("settings.manage");
    const n = name.safeParse(rawName);
    if (!n.success) return { error: "Enter a name (2–80 characters)." };
    if (id) await db.update(schema.documentTypes).set({ name: n.data, active }).where(eq(schema.documentTypes.id, id));
    else await db.insert(schema.documentTypes).values({ name: n.data, displayOrder: 100 });
    await logActivity({
      userId: user.id,
      action: "document_type.changed",
      description: id ? `Updated document type “${n.data}”${active ? "" : " (inactive)"}` : `Added document type “${n.data}”`,
    });
    revalidatePath("/admin", "layout");
    return { ok: true, message: "Saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function saveRegionAction(id: string | null, rawName: string, rawCode: string): Promise<ActionState> {
  try {
    const user = await assertPermission("settings.manage");
    const n = name.safeParse(rawName);
    const code = rawCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 12);
    if (!n.success || !code) return { error: "Enter a region name and a short code." };
    if (id) await db.update(schema.regions).set({ name: n.data, code }).where(eq(schema.regions.id, id));
    else await db.insert(schema.regions).values({ name: n.data, code });
    await logActivity({ userId: user.id, action: "region.changed", description: `${id ? "Updated" : "Added"} region “${n.data}” (${code})` });
    revalidatePath("/admin", "layout");
    return { ok: true, message: "Saved." };
  } catch (e) {
    return fail(e);
  }
}
