import "server-only";
import { aliasedTable, and, asc, desc, eq, gte, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { db, schema, type Tx } from "@/server/db";
import { computeLabel, type DocLabel } from "@/lib/labels";
import { normalizeQuery, normalizeText } from "@/lib/text";
import type { SessionUser } from "@/server/auth/dal";
import { can } from "@/lib/permissions";
import { portalVisibilityCondition } from "./access";
import { getSettings, type PortalSettings } from "./settings";

const d = schema.documents;
const r = schema.documentRevisions;
const cat = aliasedTable(schema.categories, "cat");
// Subcategory name via scalar subquery (joining two aliases of one table breaks Drizzle's result typing).
const subName = sql<string | null>`(select s.name from categories s where s.id = ${schema.documents.subcategoryId})`;
const dt = schema.documentTypes;

export type DocumentListItem = {
  id: string;
  title: string;
  documentNumber: string;
  description: string | null;
  productModels: string[];
  language: string;
  kind: "uploaded_pdf" | "authored";
  status: "draft" | "published" | "archived" | "withdrawn";
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  subcategoryId: string | null;
  subcategoryName: string | null;
  documentTypeId: string;
  documentType: string;
  revisionNumber: string | null;
  revisionId: string | null;
  releaseDate: string | null;
  pageCount: number | null;
  fileSize: number | null;
  lastPublishedAt: Date | null;
  firstPublishedAt: Date | null;
  updatedAt: Date;
  label: DocLabel;
  pendingRevision: boolean;
  hasFile: boolean;
  snippet?: string | null;
};

export type SearchFilters = {
  q?: string;
  categoryId?: string;
  subcategoryId?: string;
  documentTypeId?: string;
  productModel?: string;
  language?: string;
  from?: string; // YYYY-MM-DD, applies to last publication date
  to?: string;
  labels?: DocLabel[];
  statuses?: ("draft" | "published" | "archived" | "withdrawn")[];
  sort?: "relevance" | "newest" | "oldest" | "title" | "number";
  page?: number;
  pageSize?: number;
};

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

function labelCondition(labels: DocLabel[], s: PortalSettings): SQL | undefined {
  const parts: SQL[] = [];
  const newCut = sql`now() - make_interval(days => ${s.newLabelDays})`;
  const updCut = sql`now() - make_interval(days => ${s.updatedLabelDays})`;
  const isNew = sql`(${d.status} = 'published' and ${d.lastPublishEvent} = 'new' and ${d.lastPublishedAt} >= ${newCut})`;
  const isUpd = sql`(${d.status} = 'published' and ${d.lastPublishEvent} = 'updated' and ${d.lastPublishedAt} >= ${updCut})`;
  for (const l of labels) {
    if (l === "NEW") parts.push(isNew);
    if (l === "UPDATED") parts.push(isUpd);
    if (l === "CURRENT") parts.push(sql`(${d.status} = 'published' and not ${isNew} and not ${isUpd})`);
    if (l === "ARCHIVED") parts.push(eq(d.status, "archived"));
    if (l === "WITHDRAWN") parts.push(eq(d.status, "withdrawn"));
    if (l === "DRAFT") parts.push(eq(d.status, "draft"));
  }
  return parts.length ? or(...parts) : undefined;
}

/**
 * Search & filter documents.
 *  - scope "portal": dealer-visible published documents only (enforced server-side),
 *  - scope "admin": all documents (caller must hold documents.view_all).
 */
export async function searchDocuments(
  user: SessionUser,
  scope: "portal" | "admin",
  f: SearchFilters,
): Promise<{ items: DocumentListItem[]; total: number; page: number; pageSize: number }> {
  const settings = await getSettings();
  const pageSize = Math.min(Math.max(f.pageSize ?? 20, 1), 100);
  const page = Math.max(f.page ?? 1, 1);
  const where: (SQL | undefined)[] = [];

  if (scope === "portal") where.push(portalVisibilityCondition(user));
  else if (f.statuses?.length) where.push(inArray(d.status, f.statuses));

  if (f.categoryId) where.push(or(eq(d.categoryId, f.categoryId), eq(d.subcategoryId, f.categoryId)));
  if (f.subcategoryId) where.push(eq(d.subcategoryId, f.subcategoryId));
  if (f.documentTypeId) where.push(eq(d.documentTypeId, f.documentTypeId));
  if (f.language) where.push(eq(d.language, f.language));
  if (f.productModel) where.push(sql`${f.productModel} = any(${d.productModels})`);
  if (f.from) where.push(gte(sql`coalesce(${d.lastPublishedAt}, ${d.createdAt})`, new Date(`${f.from}T00:00:00Z`)));
  if (f.to) where.push(lte(sql`coalesce(${d.lastPublishedAt}, ${d.createdAt})`, new Date(`${f.to}T23:59:59Z`)));
  if (f.labels?.length) where.push(labelCondition(f.labels, settings));

  const q = f.q ? normalizeQuery(f.q) : "";
  const terms = q.split(" ").filter(Boolean).slice(0, 8);
  let rank: SQL = sql`0`;
  let snippet: SQL = sql`null::text`;
  if (terms.length) {
    for (const t of terms) {
      const like = `%${escapeLike(t)}%`;
      where.push(sql`${d.searchText} ilike ${like}`);
    }
    const like0 = `%${escapeLike(q)}%`;
    rank = sql`(
      ts_rank(${d.searchVector}, plainto_tsquery('simple', ${q}))
      + case when lower(${d.documentNumber}) = lower(${q}) then 20 when ${d.documentNumber} ilike ${like0} then 10 else 0 end
      + case when ${d.title} ilike ${like0} then 5 else 0 end
      + case when array_to_string(${d.productModels}, ' ') ilike ${like0} then 5 else 0 end
    )`;
    const t0 = terms[0];
    snippet = sql`case when position(lower(${t0}) in lower(${d.searchText})) > 0 then
      substring(${d.searchText} from greatest(position(lower(${t0}) in lower(${d.searchText})) - 70, 1) for 180)
      else null end`;
  }

  const cond = and(...where.filter(Boolean));
  const sort = f.sort ?? (terms.length ? "relevance" : "newest");
  const orderBy =
    sort === "relevance"
      ? [desc(rank), desc(sql`coalesce(${d.lastPublishedAt}, ${d.updatedAt})`)]
      : sort === "oldest"
        ? [asc(sql`coalesce(${d.lastPublishedAt}, ${d.updatedAt})`)]
        : sort === "title"
          ? [asc(d.title)]
          : sort === "number"
            ? [asc(d.documentNumber)]
            : [desc(sql`coalesce(${d.lastPublishedAt}, ${d.updatedAt})`)];

  const [rows, countRows] = await Promise.all([
    baseSelect(snippet, scope)
      .where(cond)
      .orderBy(...orderBy)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ n: sql<number>`count(*)::int` }).from(d).where(cond),
  ]);

  return { items: rows.map((row) => toItem(row, settings)), total: countRows[0]?.n ?? 0, page, pageSize };
}

function baseSelect(snippet: SQL = sql`null::text`, scope: "portal" | "admin" = "admin") {
  return db
    .select({
      doc: d,
      categoryName: cat.name,
      categorySlug: cat.slug,
      subcategoryName: subName,
      documentType: dt.name,
      revisionNumber: r.revisionNumber,
      releaseDate: r.releaseDate,
      pageCount: r.pageCount,
      fileSize: r.fileSize,
      hasFile: sql<boolean>`(${r.fileKey} is not null)`,
      snippet: snippet.mapWith(String),
      pendingRevision:
        scope === "admin"
          ? sql<boolean>`exists (select 1 from ${r} pr where pr.document_id = ${d.id} and pr.approval_status = 'draft')`
          : sql<boolean>`false`,
    })
    .from(d)
    .innerJoin(cat, eq(cat.id, d.categoryId))
    .innerJoin(dt, eq(dt.id, d.documentTypeId))
    .leftJoin(r, eq(r.id, d.currentRevisionId))
    .$dynamic();
}

type Row = Awaited<ReturnType<typeof baseSelect>>[number];

function toItem(row: Row, settings: PortalSettings): DocumentListItem {
  const doc = row.doc;
  return {
    id: doc.id,
    title: doc.title,
    documentNumber: doc.documentNumber,
    description: doc.description,
    productModels: doc.productModels,
    language: doc.language,
    kind: doc.kind,
    status: doc.status,
    categoryId: doc.categoryId,
    categoryName: row.categoryName,
    categorySlug: row.categorySlug,
    subcategoryId: doc.subcategoryId,
    subcategoryName: row.subcategoryName,
    documentTypeId: doc.documentTypeId,
    documentType: row.documentType,
    revisionNumber: row.revisionNumber,
    revisionId: doc.currentRevisionId,
    releaseDate: row.releaseDate,
    pageCount: row.pageCount,
    fileSize: row.fileSize,
    lastPublishedAt: doc.lastPublishedAt,
    firstPublishedAt: doc.firstPublishedAt,
    updatedAt: doc.updatedAt,
    label: computeLabel(doc, settings),
    pendingRevision: Boolean(row.pendingRevision),
    hasFile: Boolean(row.hasFile),
    snippet: row.snippet && row.snippet !== "null" ? row.snippet.replace(/\f/g, " ") : null,
  };
}

/** Recently published/updated documents visible to this user in the portal. */
export async function latestPortalDocuments(user: SessionUser, limit = 6, event?: "new" | "updated") {
  const settings = await getSettings();
  const where = [portalVisibilityCondition(user)];
  if (event) where.push(eq(d.lastPublishEvent, event));
  const rows = await baseSelect(undefined, "portal")
    .where(and(...where))
    .orderBy(desc(d.lastPublishedAt))
    .limit(limit);
  return rows.map((row) => toItem(row, settings));
}

export async function getPortalDocument(user: SessionUser, id: string) {
  const settings = await getSettings();
  const rows = await baseSelect(undefined, "portal")
    .where(and(eq(d.id, id), portalVisibilityCondition(user)))
    .limit(1);
  if (!rows[0]) return null;
  const item = toItem(rows[0], settings);
  const rev = item.revisionId
    ? await db.query.documentRevisions.findFirst({ where: eq(r.id, item.revisionId) })
    : null;
  return { ...item, source: rows[0].doc.source, revision: rev ?? null };
}

export async function getAdminDocument(id: string) {
  const settings = await getSettings();
  const rows = await baseSelect(undefined, "admin").where(eq(d.id, id)).limit(1);
  if (!rows[0]) return null;
  const doc = rows[0].doc;
  const revisions = await db.query.documentRevisions.findMany({
    where: eq(r.documentId, id),
    orderBy: desc(r.sequence),
    columns: { extractedText: false, authoredContent: false },
    with: {
      uploader: { columns: { fullName: true, email: true } },
      approver: { columns: { fullName: true } },
    },
  });
  const regionRows = await db
    .select({ id: schema.regions.id, name: schema.regions.name })
    .from(schema.documentRegions)
    .innerJoin(schema.regions, eq(schema.regions.id, schema.documentRegions.regionId))
    .where(eq(schema.documentRegions.documentId, id));
  return { ...toItem(rows[0], settings), doc, revisions, regions: regionRows };
}

/**
 * Rebuilds the denormalised search text from metadata + the CURRENT PUBLISHED
 * revision's extracted text. Draft revision text is deliberately excluded so
 * unpublished content can never surface in dealer search results.
 */
export async function rebuildSearchText(tx: Tx, documentId: string) {
  const [row] = await tx
    .select({
      doc: d,
      categoryName: cat.name,
      subcategoryName: subName,
      documentType: dt.name,
      revisionNumber: r.revisionNumber,
      extractedText: r.extractedText,
    })
    .from(d)
    .innerJoin(cat, eq(cat.id, d.categoryId))
    .innerJoin(dt, eq(dt.id, d.documentTypeId))
    .leftJoin(r, eq(r.id, d.currentRevisionId))
    .where(eq(d.id, documentId));
  if (!row) return;
  const doc = row.doc;
  const parts = [
    doc.title,
    doc.documentNumber,
    doc.documentNumber.replace(/[-\s]/g, ""),
    row.revisionNumber ?? "",
    doc.productModels.join(" "),
    row.categoryName,
    row.subcategoryName ?? "",
    row.documentType,
    doc.language,
    doc.source,
    doc.description ?? "",
    row.extractedText ?? "",
  ];
  const searchText = normalizeText(parts.filter(Boolean).join("\n")).slice(0, 500_000);
  await tx.update(d).set({ searchText }).where(eq(d.id, documentId));
}

export async function rebuildSearchTextForCategory(tx: Tx, categoryId: string) {
  const ids = await tx
    .select({ id: d.id })
    .from(d)
    .where(or(eq(d.categoryId, categoryId), eq(d.subcategoryId, categoryId)));
  for (const { id } of ids) await rebuildSearchText(tx, id);
}

/* ------------------------------------------------------------------ */
/* Lookups                                                             */
/* ------------------------------------------------------------------ */

export async function getCategoryTree(opts: { includeInactive?: boolean } = {}) {
  const rows = await db
    .select()
    .from(schema.categories)
    .where(opts.includeInactive ? undefined : eq(schema.categories.status, "active"))
    .orderBy(asc(schema.categories.displayOrder), asc(schema.categories.name));
  const parents = rows.filter((c) => !c.parentId);
  return parents.map((p) => ({ ...p, children: rows.filter((c) => c.parentId === p.id) }));
}
export type CategoryNode = Awaited<ReturnType<typeof getCategoryTree>>[number];

export async function getDocumentTypes(opts: { includeInactive?: boolean } = {}) {
  return db
    .select()
    .from(dt)
    .where(opts.includeInactive ? undefined : eq(dt.active, true))
    .orderBy(asc(dt.displayOrder), asc(dt.name));
}

export async function getRegions() {
  return db.select().from(schema.regions).orderBy(asc(schema.regions.name));
}

export async function getLanguages(user: SessionUser, scope: "portal" | "admin") {
  const rows = await db
    .selectDistinct({ language: d.language })
    .from(d)
    .where(scope === "portal" ? portalVisibilityCondition(user) : undefined)
    .orderBy(asc(d.language));
  return rows.map((x) => x.language);
}

/** Headline numbers for the dealer dashboard (portal-visible documents only). */
export async function portalStats(user: SessionUser) {
  const settings = await getSettings();
  const visible = portalVisibilityCondition(user);
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      newCount: sql<number>`(count(*) filter (where ${labelCondition(["NEW"], settings)!}))::int`,
      updatedCount: sql<number>`(count(*) filter (where ${labelCondition(["UPDATED"], settings)!}))::int`,
    })
    .from(d)
    .where(visible);
  return { ...row, newLabelDays: settings.newLabelDays, updatedLabelDays: settings.updatedLabelDays };
}

/** Distinct product models across the documents this user can see (for the model filter). */
export async function getProductModels(user: SessionUser, scope: "portal" | "admin" = "portal") {
  const rows = await db
    .selectDistinct({ model: sql<string>`unnest(${d.productModels})` })
    .from(d)
    .where(scope === "portal" ? portalVisibilityCondition(user) : undefined);
  return rows.map((x) => x.model).filter(Boolean).sort((a, b) => a.localeCompare(b));
}

/** Document counts per top-level category (including subcategories), portal-visible only. */
export async function portalCategoryCounts(user: SessionUser) {
  const rows = await db
    .select({ categoryId: d.categoryId, subcategoryId: d.subcategoryId, n: sql<number>`count(*)::int` })
    .from(d)
    .where(portalVisibilityCondition(user))
    .groupBy(d.categoryId, d.subcategoryId);
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.categoryId, (counts.get(row.categoryId) ?? 0) + row.n);
    if (row.subcategoryId) counts.set(row.subcategoryId, (counts.get(row.subcategoryId) ?? 0) + row.n);
  }
  return counts;
}

export async function adminStats() {
  const settings = await getSettings();
  const [docStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      published: sql<number>`count(*) filter (where ${d.status} = 'published')::int`,
      drafts: sql<number>`count(*) filter (where ${d.status} = 'draft')::int`,
      archived: sql<number>`count(*) filter (where ${d.status} = 'archived')::int`,
      withdrawn: sql<number>`count(*) filter (where ${d.status} = 'withdrawn')::int`,
      newDocs: sql<number>`count(*) filter (where ${d.status} = 'published' and ${d.lastPublishEvent} = 'new' and ${d.lastPublishedAt} >= now() - make_interval(days => ${settings.newLabelDays}))::int`,
      updatedDocs: sql<number>`count(*) filter (where ${d.status} = 'published' and ${d.lastPublishEvent} = 'updated' and ${d.lastPublishedAt} >= now() - make_interval(days => ${settings.updatedLabelDays}))::int`,
    })
    .from(d);
  const [dealerStats] = await db
    .select({
      dealers: sql<number>`count(*) filter (where ${schema.users.role} = 'dealer')::int`,
      activeDealers: sql<number>`count(*) filter (where ${schema.users.role} = 'dealer' and ${schema.users.status} = 'active')::int`,
    })
    .from(schema.users);
  const [pending] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(r)
    .where(eq(r.approvalStatus, "draft"));
  const [dl] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.downloads)
    .where(gte(schema.downloads.createdAt, sql`now() - interval '30 days'`));
  return { ...docStats, ...dealerStats, pendingRevisions: pending.n, downloads30d: dl.n };
}

/** Number of draft documents/revisions waiting for approval (sidebar badge). */
export async function pendingApprovalCount() {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(r)
    .where(eq(r.approvalStatus, "draft"));
  return row?.n ?? 0;
}

export async function pendingRevisions(limit = 10) {
  return db
    .select({
      revisionId: r.id,
      revisionNumber: r.revisionNumber,
      uploadedAt: r.uploadedAt,
      documentId: d.id,
      title: d.title,
      documentNumber: d.documentNumber,
      isFirst: isNull(d.currentRevisionId).mapWith(Boolean),
      uploader: schema.users.fullName,
    })
    .from(r)
    .innerJoin(d, eq(d.id, r.documentId))
    .leftJoin(schema.users, eq(schema.users.id, r.uploadedBy))
    .where(eq(r.approvalStatus, "draft"))
    .orderBy(desc(r.uploadedAt))
    .limit(limit);
}

/** Publication events visible to this user (Latest Updates). Withdrawal notices are shown without file access. */
export type UpdateType = "new" | "updated" | "withdrawn";

export async function portalUpdates(user: SessionUser, page = 1, pageSize = 25, type?: UpdateType) {
  const n = schema.notifications;
  const visible = portalVisibilityCondition(user);
  // Withdrawal notices remain visible to dealers who could see the document before (same region rules).
  const withdrawnVisible = and(
    eq(n.type, "withdrawn"),
    eq(d.status, "withdrawn"),
    can(user.role, "documents.view_all")
      ? undefined
      : user.regionId
        ? or(
            eq(d.visibility, "all_dealers"),
            sql`exists (select 1 from ${schema.documentRegions} dr where dr.document_id = ${d.id} and dr.region_id = ${user.regionId})`,
          )
        : eq(d.visibility, "all_dealers"),
  );
  const typeFilter =
    type === "new" ? eq(n.type, "new") : type === "updated" ? inArray(n.type, ["updated", "restored"]) : type === "withdrawn" ? eq(n.type, "withdrawn") : undefined;
  const cond = and(or(and(visible, inArray(n.type, ["new", "updated", "restored"])), withdrawnVisible), typeFilter);
  const rows = await db
    .select({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      createdAt: n.createdAt,
      documentId: d.id,
      documentNumber: d.documentNumber,
      docTitle: d.title,
      status: d.status,
      categoryName: cat.name,
      revisionNumber: r.revisionNumber,
      statusReason: d.statusReason,
    })
    .from(n)
    .innerJoin(d, eq(d.id, n.documentId))
    .innerJoin(cat, eq(cat.id, d.categoryId))
    .leftJoin(r, eq(r.id, n.revisionId))
    .where(cond)
    .orderBy(desc(n.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(n)
    .innerJoin(d, eq(d.id, n.documentId))
    .where(cond);
  return { rows, total, page, pageSize };
}
