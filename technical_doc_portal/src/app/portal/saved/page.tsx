import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Bookmark, Download } from "lucide-react";
import { requirePermission } from "@/server/auth/dal";
import { db, schema } from "@/server/db";
import { portalVisibilityCondition } from "@/server/services/access";
import { searchDocuments } from "@/server/services/documents";
import { DocumentCard } from "@/components/documents/document-card";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { fmtDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Downloads & saved documents" };

export default async function SavedPage() {
  const user = await requirePermission("portal.view");
  const savedIds = (
    await db
      .select({ id: schema.savedDocuments.documentId })
      .from(schema.savedDocuments)
      .innerJoin(schema.documents, eq(schema.documents.id, schema.savedDocuments.documentId))
      .where(and(eq(schema.savedDocuments.userId, user.id), portalVisibilityCondition(user)))
      .orderBy(desc(schema.savedDocuments.createdAt))
  ).map((r) => r.id);
  const saved = savedIds.length
    ? (await searchDocuments(user, "portal", { pageSize: 100 })).items.filter((d) => savedIds.includes(d.id))
    : [];

  const history = await db
    .select({
      at: schema.downloads.createdAt,
      documentId: schema.documents.id,
      number: schema.documents.documentNumber,
      title: schema.documents.title,
      downloadedRev: schema.documentRevisions.revisionNumber,
      downloadedRevId: schema.documentRevisions.id,
      currentRevId: schema.documents.currentRevisionId,
      status: schema.documents.status,
    })
    .from(schema.downloads)
    .innerJoin(schema.documents, eq(schema.documents.id, schema.downloads.documentId))
    .innerJoin(schema.documentRevisions, eq(schema.documentRevisions.id, schema.downloads.revisionId))
    .where(eq(schema.downloads.userId, user.id))
    .orderBy(desc(schema.downloads.createdAt))
    .limit(50);
  const visibleIds = new Set(
    history.length
      ? (
          await db
            .select({ id: schema.documents.id })
            .from(schema.documents)
            .where(and(inArray(schema.documents.id, [...new Set(history.map((h) => h.documentId))]), portalVisibilityCondition(user)))
        ).map((r) => r.id)
      : [],
  );

  return (
    <div className="space-y-8">
      <PageHeader title="Downloads / saved documents" description="Documents you have bookmarked, and your recent downloads." />
      <section>
        <h2 className="mb-3 text-lg font-semibold">Saved documents</h2>
        {saved.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {saved.map((d) => (
              <DocumentCard key={d.id} doc={d} href={`/portal/documents/${d.id}`} />
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState icon={<Bookmark />} title="No saved documents">
              Use the Save button on a document to keep it here for quick access.
            </EmptyState>
          </Card>
        )}
      </section>
      <Card>
        <CardHeader title="Download history" description="If a newer revision has been published since your download, it is flagged below." />
        {history.length ? (
          <Table>
            <THead>
              <tr>
                <TH>Document</TH>
                <TH>Revision downloaded</TH>
                <TH>Downloaded</TH>
                <TH>Status</TH>
              </tr>
            </THead>
            <tbody>
              {history.map((h, i) => {
                const visible = visibleIds.has(h.documentId);
                const outdated = h.downloadedRevId !== h.currentRevId;
                return (
                  <TR key={i}>
                    <TD>
                      <span className="font-mono text-[12px] text-navy">{h.number}</span>
                      {visible ? (
                        <Link href={`/portal/documents/${h.documentId}`} className="block font-medium hover:underline">
                          {h.title}
                        </Link>
                      ) : (
                        <span className="block font-medium">{h.title}</span>
                      )}
                    </TD>
                    <TD className="tabular">{h.downloadedRev}</TD>
                    <TD className="tabular text-[13px] text-muted">{fmtDateTime(h.at)}</TD>
                    <TD>
                      {!visible ? (
                        <Badge tone="red">{h.status === "withdrawn" ? "Withdrawn" : "No longer available"}</Badge>
                      ) : outdated ? (
                        <Link href={`/portal/documents/${h.documentId}`} className="inline-flex items-center gap-1.5">
                          <Badge tone="solidBlue">Newer revision available</Badge>
                        </Link>
                      ) : (
                        <Badge tone="green">Current</Badge>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={<Download />} title="No downloads yet" className="py-8" />
        )}
      </Card>
    </div>
  );
}
