import "server-only";
import { cache } from "react";
import { db, schema } from "@/server/db";
import { z } from "zod";

export const settingsSchema = z.object({
  newLabelDays: z.coerce.number().int().min(1).max(365),
  updatedLabelDays: z.coerce.number().int().min(1).max(365),
  emailNotificationsEnabled: z.boolean(),
  notifyOnNew: z.boolean(),
  notifyOnUpdate: z.boolean(),
  notifyOnWithdrawal: z.boolean(),
});
export type PortalSettings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: PortalSettings = {
  newLabelDays: 30,
  updatedLabelDays: 30,
  emailNotificationsEnabled: false,
  notifyOnNew: true,
  notifyOnUpdate: true,
  notifyOnWithdrawal: true,
};

export const getSettings = cache(async (): Promise<PortalSettings> => {
  const rows = await db.select().from(schema.settings);
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) if (r.key in DEFAULT_SETTINGS) merged[r.key] = r.value;
  const parsed = settingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
});

export async function saveSettings(values: PortalSettings, userId: string) {
  const now = new Date();
  await db.transaction(async (tx) => {
    for (const [key, value] of Object.entries(values)) {
      await tx
        .insert(schema.settings)
        .values({ key, value, updatedBy: userId, updatedAt: now })
        .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedBy: userId, updatedAt: now } });
    }
  });
}
