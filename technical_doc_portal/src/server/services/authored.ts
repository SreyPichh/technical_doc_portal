import "server-only";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { and, eq, inArray, isNull, max } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { env } from "@/server/env";
import { newKey, storage } from "@/server/storage";
import type { SessionUser } from "@/server/auth/dal";
import { normalizeText } from "@/lib/text";
import { nskLogoSvg } from "@/lib/brand";
import { logActivity } from "./activity";
import { extractAuthoredText, renderAuthoredHtml } from "./authored-render";
import { resolveNewChoices, ServiceError, type DocumentMetadataInput, type RevisionInput } from "./revisions";

const d = schema.documents;
const r = schema.documentRevisions;

function assetIds(content: unknown): string[] {
  const ids = new Set<string>();
  JSON.stringify(content ?? null).replace(/\/api\/assets\/([0-9a-f-]{36})/gi, (_, id: string) => {
    ids.add(id);
    return "";
  });
  return [...ids];
}

function assertContent(content: unknown) {
  if (!content || typeof content !== "object" || (content as { type?: string }).type !== "doc")
    throw new ServiceError("The document content is invalid.");
  if (JSON.stringify(content).length > 2_000_000) throw new ServiceError("The document is too large (max ~2 MB of content).");
}

/** Creates an application-authored document with a first draft revision. */
export async function createAuthoredDocument(meta: DocumentMetadataInput, rev: RevisionInput, content: unknown, user: SessionUser) {
  assertContent(content);
  return db.transaction(async (tx) => {
    const dup = await tx.select({ id: d.id }).from(d).where(eq(d.documentNumber, meta.documentNumber));
    if (dup.length) throw new ServiceError(`Document number ${meta.documentNumber} already exists.`);
    const { regionIds, ...fields } = await resolveNewChoices(tx, meta, user);
    const [doc] = await tx.insert(d).values({ ...fields, kind: "authored", status: "draft", createdBy: user.id }).returning();
    if (meta.visibility === "regions" && regionIds.length)
      await tx.insert(schema.documentRegions).values(regionIds.map((regionId) => ({ documentId: doc.id, regionId })));
    const [revision] = await tx
      .insert(r)
      .values({
        documentId: doc.id,
        sequence: 1,
        ...rev,
        authoredContent: content,
        extractedText: normalizeText(extractAuthoredText(content)),
        textSource: "authored",
        uploadedBy: user.id,
      })
      .returning();
    const ids = assetIds(content);
    if (ids.length)
      await tx.update(schema.assets).set({ documentId: doc.id }).where(and(inArray(schema.assets.id, ids), isNull(schema.assets.documentId)));
    await logActivity(
      {
        userId: user.id,
        action: "document.created",
        documentId: doc.id,
        entityType: "document",
        entityId: doc.id,
        description: `Created authored document ${doc.documentNumber} “${doc.title}” (draft ${revision.revisionNumber})`,
      },
      tx,
    );
    return { documentId: doc.id, revisionId: revision.id };
  });
}

/**
 * Saves editor content. If a draft revision exists it is updated; otherwise a
 * new draft revision is created (published revisions are never modified).
 */
export async function saveAuthoredDraft(documentId: string, rev: RevisionInput, content: unknown, user: SessionUser) {
  assertContent(content);
  return db.transaction(async (tx) => {
    const [doc] = await tx.select().from(d).where(eq(d.id, documentId)).for("update");
    if (!doc || doc.kind !== "authored") throw new ServiceError("Authored document not found.");
    const [draft] = await tx.select().from(r).where(and(eq(r.documentId, doc.id), eq(r.approvalStatus, "draft")));
    const text = normalizeText(extractAuthoredText(content));
    const clash = await tx.select({ id: r.id }).from(r).where(and(eq(r.documentId, doc.id), eq(r.revisionNumber, rev.revisionNumber)));
    if (clash.some((c) => c.id !== draft?.id)) throw new ServiceError(`Revision ${rev.revisionNumber} already exists.`);
    let revisionId: string;
    if (draft) {
      await tx
        .update(r)
        .set({ ...rev, authoredContent: content, extractedText: text, fileKey: null, fileSize: null, sha256: null, pageCount: null })
        .where(eq(r.id, draft.id));
      revisionId = draft.id;
    } else {
      const [{ seq }] = await tx.select({ seq: max(r.sequence) }).from(r).where(eq(r.documentId, doc.id));
      const [created] = await tx
        .insert(r)
        .values({
          documentId: doc.id,
          sequence: (seq ?? 0) + 1,
          ...rev,
          authoredContent: content,
          extractedText: text,
          textSource: "authored",
          uploadedBy: user.id,
        })
        .returning();
      revisionId = created.id;
    }
    const ids = assetIds(content);
    if (ids.length)
      await tx.update(schema.assets).set({ documentId: doc.id }).where(and(inArray(schema.assets.id, ids), isNull(schema.assets.documentId)));
    await tx.update(d).set({ updatedAt: new Date() }).where(eq(d.id, doc.id));
    await logActivity(
      {
        userId: user.id,
        action: draft ? "revision.updated" : "revision.uploaded",
        documentId: doc.id,
        entityType: "revision",
        entityId: revisionId,
        description: draft
          ? `Edited content of draft ${rev.revisionNumber} of ${doc.documentNumber}`
          : `Created draft revision ${rev.revisionNumber} of ${doc.documentNumber} in the editor`,
      },
      tx,
    );
    return { documentId: doc.id, revisionId };
  });
}

/** Full HTML page used for both printing and server-side PDF export. */
export function authoredPrintHtml(opts: { title: string; number: string; revision: string; date: string | null; body: string }) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(opts.number)} ${esc(opts.title)}</title>
<style>
@page{size:A4;margin:22mm 16mm 18mm}
body{font-family:Inter,Arial,Helvetica,sans-serif;color:#1b2433;font-size:10.5pt;line-height:1.55;margin:0}
.hdr{background:#132c5b;color:#fff;padding:10px 16px;display:flex;justify-content:space-between;align-items:center}
.hdr span{font-size:12pt;letter-spacing:.04em}
.meta{text-align:right;font-size:9pt;color:#5d6b82;margin:10px 0 18px}
h1{font-size:17pt;margin:.6em 0 .4em;text-align:center;text-decoration:underline}h2{font-size:13pt;margin:1.2em 0 .4em;border-bottom:1px solid #dfe4ec;padding-bottom:2px}h3{font-size:11pt;margin:1em 0 .3em}
p{margin:.45em 0}ul,ol{padding-left:1.4em}a{color:#1f5fbf}
table{border-collapse:collapse;width:100%;margin:.8em 0;font-size:9.5pt;break-inside:avoid}th,td{border:1px solid #6b778a;padding:3px 6px;vertical-align:top}th{background:#eef2fa;text-align:left}td p,th p{margin:0}
figure{margin:1em 0;display:flex;flex-direction:column;break-inside:avoid}figure[data-align=center]{align-items:center}figure[data-align=right]{align-items:flex-end}
figure img{max-width:100%;height:auto}figcaption{font-size:9pt;color:#5d6b82;margin-top:4px}
hr[data-page-break]{break-after:page;border:0;margin:0}
.sample{border:1px solid #c8102e;color:#c8102e;padding:4px 8px;font-size:9pt;margin-bottom:10px;display:inline-block}
</style></head><body>
<div class="hdr">${nskLogoSvg({ height: 26 })}<span>Technical Information</span></div>
<div class="meta">Document No. ${esc(opts.number)} · Revision ${esc(opts.revision)}${opts.date ? ` · ${esc(opts.date)}` : ""}</div>
<h1>${esc(opts.title)}</h1>
${opts.body}
</body></html>`;
}

/** Inline /api/assets images as data URIs so a headless browser can render them without a session. */
async function inlineAssets(html: string) {
  const ids = [...new Set([...html.matchAll(/\/api\/assets\/([0-9a-f-]{36})/gi)].map((m) => m[1]))];
  if (!ids.length) return html;
  const rows = await db.select().from(schema.assets).where(inArray(schema.assets.id, ids));
  for (const a of rows) {
    const buf = await storage.get(a.fileKey);
    html = html.replaceAll(`/api/assets/${a.id}`, `data:${a.mimeType};base64,${buf.toString("base64")}`);
  }
  return html;
}

export function pdfExportAvailable() {
  return Boolean(env.CHROME_EXECUTABLE_PATH && existsSync(env.CHROME_EXECUTABLE_PATH));
}

export async function renderAuthoredPdf(revisionId: string): Promise<Buffer> {
  if (!pdfExportAvailable()) throw new ServiceError("Server-side PDF export is not configured (CHROME_EXECUTABLE_PATH).");
  const [row] = await db
    .select({ rev: r, doc: d })
    .from(r)
    .innerJoin(d, eq(d.id, r.documentId))
    .where(eq(r.id, revisionId));
  if (!row) throw new ServiceError("Revision not found.");
  const body = renderAuthoredHtml(row.rev.authoredContent) ?? "";
  const html = await inlineAssets(
    authoredPrintHtml({
      title: row.doc.title,
      number: row.doc.documentNumber,
      revision: row.rev.revisionNumber,
      date: row.rev.releaseDate,
      body,
    }),
  );
  const puppeteer = await import("puppeteer-core");
  const browser = await puppeteer.launch({
    executablePath: env.CHROME_EXECUTABLE_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    // No network access: everything needed is inline.
    await page.setRequestInterception(true);
    page.on("request", (req) => (req.url().startsWith("data:") ? req.continue() : req.abort()));
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `<div style="font-size:8px;width:100%;padding:0 16mm;color:#8a96a8;display:flex;justify-content:space-between"><span>${row.doc.documentNumber} ${row.rev.revisionNumber}</span><span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
      margin: { top: "16mm", bottom: "18mm", left: "0", right: "0" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

/**
 * Before an authored draft is published, export it to PDF (if Chrome is
 * configured) and attach the file to the revision, so dealers download a
 * real PDF. Without Chrome the document is still published and dealers can
 * print it from the browser.
 */
export async function attachAuthoredPdf(revisionId: string) {
  const [rev] = await db.select().from(r).where(eq(r.id, revisionId));
  if (!rev || rev.approvalStatus !== "draft" || !rev.authoredContent || rev.fileKey) return;
  if (!pdfExportAvailable()) return;
  const pdf = await renderAuthoredPdf(revisionId);
  const { analyzePdf } = await import("@/server/pdf/analyze");
  const a = await analyzePdf(pdf);
  const key = newKey("revisions", "pdf");
  await storage.put(key, pdf, "application/pdf");
  const [doc] = await db.select({ n: d.documentNumber }).from(d).where(eq(d.id, rev.documentId));
  await db
    .update(r)
    .set({
      fileKey: key,
      fileSize: pdf.length,
      sha256: createHash("sha256").update(pdf).digest("hex"),
      pageCount: a.pageCount,
      mimeType: "application/pdf",
      originalFilename: `${doc.n}-${rev.revisionNumber}.pdf`,
    })
    .where(eq(r.id, rev.id));
}
