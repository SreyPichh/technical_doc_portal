import "server-only";
import { and, eq, or, sql } from "drizzle-orm";
import { db, schema, type Tx } from "@/server/db";
import { env } from "@/server/env";
import { getSettings } from "./settings";
import { logActivity } from "./activity";

type EventType = "new" | "updated" | "withdrawn" | "archived" | "restored";

/** Records a publication event (shown in Latest Updates). Call inside the publishing transaction. */
export async function recordPublicationEvent(
  tx: Tx,
  e: { documentId: string; revisionId?: string | null; type: EventType; userId: string },
) {
  const [doc] = await tx
    .select({ title: schema.documents.title, number: schema.documents.documentNumber })
    .from(schema.documents)
    .where(eq(schema.documents.id, e.documentId));
  const rev = e.revisionId
    ? (
        await tx
          .select({ n: schema.documentRevisions.revisionNumber })
          .from(schema.documentRevisions)
          .where(eq(schema.documentRevisions.id, e.revisionId))
      )[0]
    : undefined;
  const verb = {
    new: "New technical information published",
    updated: "Technical information updated",
    withdrawn: "Technical information withdrawn",
    archived: "Technical information archived",
    restored: "Technical information reinstated",
  }[e.type];
  const [n] = await tx
    .insert(schema.notifications)
    .values({
      documentId: e.documentId,
      revisionId: e.revisionId ?? null,
      type: e.type,
      title: `${doc.number} — ${doc.title}`,
      message: rev ? `${verb} (Revision ${rev.n}).` : `${verb}.`,
      createdBy: e.userId,
    })
    .returning({ id: schema.notifications.id });
  return n.id;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * Sends the e-mail for a notification to every active dealer who can see the
 * document and has not opted out. Runs after the response (via `after()`), and
 * records the outcome on the notification. PDFs are never attached — the
 * e-mail links to the portal, so dealers always get the current approved file.
 */
export async function sendNotificationEmails(notificationId: string, actorId: string) {
  const settings = await getSettings();
  const [n] = await db
    .select({
      n: schema.notifications,
      doc: schema.documents,
      categoryName: schema.categories.name,
      revisionNumber: schema.documentRevisions.revisionNumber,
    })
    .from(schema.notifications)
    .innerJoin(schema.documents, eq(schema.documents.id, schema.notifications.documentId))
    .innerJoin(schema.categories, eq(schema.categories.id, schema.documents.categoryId))
    .leftJoin(schema.documentRevisions, eq(schema.documentRevisions.id, schema.notifications.revisionId))
    .where(eq(schema.notifications.id, notificationId));
  if (!n) return;

  const typeEnabled =
    (n.n.type === "new" && settings.notifyOnNew) ||
    ((n.n.type === "updated" || n.n.type === "restored") && settings.notifyOnUpdate) ||
    (n.n.type === "withdrawn" && settings.notifyOnWithdrawal);
  const setStatus = (emailStatus: typeof schema.notifications.$inferInsert.emailStatus, extra = {}) =>
    db.update(schema.notifications).set({ emailStatus, ...extra }).where(eq(schema.notifications.id, notificationId));

  if (!settings.emailNotificationsEnabled || !typeEnabled) return setStatus("disabled");
  if (!env.emailConfigured) return setStatus("not_configured");

  const regionFilter =
    n.doc.visibility === "all_dealers"
      ? undefined
      : sql`${schema.users.regionId} in (select region_id from ${schema.documentRegions} where document_id = ${n.doc.id})`;
  const recipients = await db
    .select({ email: schema.users.email, name: schema.users.fullName })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.status, "active"),
        eq(schema.users.emailNotifications, true),
        or(eq(schema.users.role, "dealer"), eq(schema.users.role, "dealer_manager")),
        regionFilter,
      ),
    );
  if (!recipients.length) return setStatus("sent", { emailRecipients: 0 });
  await setStatus("pending");

  const link = `${env.APP_URL.replace(/\/$/, "")}/portal/documents/${n.doc.id}`;
  const date = (n.doc.lastPublishedAt ?? new Date()).toISOString().slice(0, 10);
  const subject = `[NSK Technical Information] ${n.n.type === "new" ? "NEW" : n.n.type === "withdrawn" ? "WITHDRAWN" : "UPDATED"}: ${n.doc.documentNumber} ${n.doc.title}`;
  const rows: [string, string][] = [
    ["Document", n.doc.title],
    ["Document No.", n.doc.documentNumber],
    ["Category", n.categoryName],
    ["Revision", n.revisionNumber ?? "—"],
    ["Date", date],
  ];
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:560px">
  <div style="background:#14275a;color:#fff;padding:14px 20px;font-weight:bold;letter-spacing:.5px">NSK Technical Information Portal</div>
  <div style="padding:20px;border:1px solid #e5e7eb;border-top:0">
  <p style="margin:0 0 14px">${escapeHtml(n.n.message)}</p>
  <table style="border-collapse:collapse;font-size:14px;width:100%">${rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 10px;background:#f3f4f6;width:130px;border:1px solid #e5e7eb">${k}</td><td style="padding:6px 10px;border:1px solid #e5e7eb">${escapeHtml(v)}</td></tr>`,
    )
    .join("")}</table>
  <p style="margin:20px 0"><a href="${link}" style="background:#14275a;color:#fff;padding:10px 18px;text-decoration:none;border-radius:4px">Open in the portal</a></p>
  <p style="font-size:12px;color:#6b7280;margin:0">Always use the latest approved version from the portal. Sign-in required. You can turn these e-mails off under My Account.</p>
  </div></div>`;
  const text = `${n.n.message}\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\nOpen in the portal: ${link}`;

  let sent = 0;
  let error: string | null = null;
  for (let i = 0; i < recipients.length; i += 100) {
    const batch = recipients.slice(i, i + 100).map((rcpt) => ({
      from: env.EMAIL_FROM!,
      to: [rcpt.email],
      subject,
      html,
      text,
    }));
    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(batch),
      });
      if (!res.ok) error = `Resend ${res.status}: ${(await res.text()).slice(0, 300)}`;
      else sent += batch.length;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  await setStatus(error ? (sent ? "partial" : "failed") : "sent", { emailRecipients: sent, emailError: error });
  await logActivity({
    userId: actorId,
    action: "notification.email",
    documentId: n.doc.id,
    description: error
      ? `E-mail notification for ${n.doc.documentNumber}: ${sent}/${recipients.length} sent (${error})`
      : `E-mail notification for ${n.doc.documentNumber} sent to ${sent} dealer(s)`,
  });
}
