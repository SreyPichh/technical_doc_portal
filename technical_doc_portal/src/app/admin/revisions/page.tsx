import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { requirePermission } from "@/server/auth/dal";
import { db, schema } from "@/server/db";
import { RevisionStatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, Pagination } from "@/components/ui/misc";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { cn, fmtDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Revision history" };

const STATUSES = ["draft", "published", "superseded", "rejected"] as const;

export default async function RevisionsPage({ searchParams }: PageProps<"/admin/revisions">) {
  await requirePermission("documents.view_all");
  const sp = await searchParams;
  const status = STATUSES.find((s) => s === sp.status);
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = 30;
  const r = schema.documentRevisions;
  const d = schema.documents;
  const uploader = alias(schema.users, "uploader");
  const where: SQL[] = [];
  if (status) where.push(eq(r.approvalStatus, status));
  if (q) where.push(sql`(${d.documentNumber} ilike ${`%${q}%`} or ${d.title} ilike ${`%${q}%`})`);
  const cond = where.length ? and(...where) : undefined;
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: r.id,
        rev: r.revisionNumber,
        releaseDate: r.releaseDate,
        status: r.approvalStatus,
        uploadedAt: r.uploadedAt,
        publishedAt: r.publishedAt,
        notes: r.revisionNotes,
        documentId: d.id,
        number: d.documentNumber,
        title: d.title,
        uploader: uploader.fullName,
      })
      .from(r)
      .innerJoin(d, eq(d.id, r.documentId))
      .leftJoin(uploader, eq(uploader.id, r.uploadedBy))
      .where(cond)
      .orderBy(desc(r.uploadedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: sql<number>`count(*)::int` }).from(r).innerJoin(d, eq(d.id, r.documentId)).where(cond),
  ]);
  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { status, q: q || undefined, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/admin/revisions${p.size ? `?${p}` : ""}`;
  };
  return (
    <div>
      <PageHeader title="Revision history" description="Every revision of every document, newest first. Published revisions are immutable." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[undefined, ...STATUSES].map((s) => (
          <Link
            key={s ?? "all"}
            href={href({ status: s, page: undefined })}
            className={cn(
              "rounded-full border px-3 py-1 text-[13px]",
              status === s ? "border-navy bg-navy text-white" : "border-border-strong bg-surface hover:bg-navy-50",
            )}
          >
            {s ? { draft: "Awaiting review", published: "Current", superseded: "Previous", rejected: "Rejected" }[s] : "All"}
          </Link>
        ))}
        <form className="ml-auto" action="/admin/revisions">
          {status && <input type="hidden" name="status" value={status} />}
          <input name="q" defaultValue={q} placeholder="Filter by document…" className="h-8 rounded-md border border-border-strong bg-surface px-3 text-sm" />
        </form>
      </div>
      <Card>
        {rows.length ? (
          <Table>
            <THead>
              <tr>
                <TH>Document</TH>
                <TH>Revision</TH>
                <TH>Release date</TH>
                <TH>Upload date</TH>
                <TH>Uploaded by</TH>
                <TH>Published</TH>
                <TH>Status</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((x) => (
                <TR key={x.id}>
                  <TD>
                    <span className="font-mono text-[12px] text-navy">{x.number}</span>
                    <Link href={`/admin/documents/${x.documentId}?tab=revisions`} className="block font-medium hover:underline">
                      {x.title}
                    </Link>
                  </TD>
                  <TD className="font-mono font-medium">
                    <Link href={`/admin/documents/${x.documentId}?rev=${x.id}`} className="hover:underline">
                      {x.rev}
                    </Link>
                  </TD>
                  <TD className="tabular">{fmtDate(x.releaseDate)}</TD>
                  <TD className="tabular">{fmtDate(x.uploadedAt)}</TD>
                  <TD className="text-[13px]">{x.uploader ?? "—"}</TD>
                  <TD className="tabular">{fmtDate(x.publishedAt)}</TD>
                  <TD>
                    <RevisionStatusBadge status={x.status} />
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="No revisions found" />
        )}
      </Card>
      <Pagination page={page} pageSize={pageSize} total={total} hrefFor={(p) => href({ page: String(p) })} />
    </div>
  );
}
