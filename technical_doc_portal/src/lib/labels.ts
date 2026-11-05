export type DocLabel = "NEW" | "UPDATED" | "CURRENT" | "ARCHIVED" | "WITHDRAWN" | "DRAFT";

export type LabelSettings = { newLabelDays: number; updatedLabelDays: number };

/**
 * Labels are derived from publication events only — there is no field an
 * administrator can set to mark a document NEW. A document is NEW for
 * `newLabelDays` after its first publication and UPDATED for
 * `updatedLabelDays` after a later revision is published.
 */
export function computeLabel(
  doc: {
    status: "draft" | "published" | "archived" | "withdrawn";
    lastPublishEvent: "new" | "updated" | null;
    lastPublishedAt: Date | string | null;
  },
  settings: LabelSettings,
  now: Date = new Date(),
): DocLabel {
  if (doc.status === "archived") return "ARCHIVED";
  if (doc.status === "withdrawn") return "WITHDRAWN";
  if (doc.status === "draft") return "DRAFT";
  if (doc.lastPublishedAt && doc.lastPublishEvent) {
    const ageDays = (now.getTime() - new Date(doc.lastPublishedAt).getTime()) / 86_400_000;
    if (doc.lastPublishEvent === "new" && ageDays <= settings.newLabelDays) return "NEW";
    if (doc.lastPublishEvent === "updated" && ageDays <= settings.updatedLabelDays) return "UPDATED";
  }
  return "CURRENT";
}
