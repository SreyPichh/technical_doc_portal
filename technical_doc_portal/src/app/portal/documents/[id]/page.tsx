import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import { Download, Printer } from "lucide-react";
import { requirePermission } from "@/server/auth/dal";
import { db, schema } from "@/server/db";
import { getPortalDocument } from "@/server/services/documents";
import { recordDocumentView } from "@/server/services/document-views";
import { renderAuthoredHtml } from "@/server/services/authored-render";
import { PdfViewer } from "@/components/pdf/pdf-viewer";
import { SaveButton } from "@/components/documents/save-button";
import { DocLabelBadge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DefinitionList, PageHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { fmtDate } from "@/lib/utils";
import { formatBytes } from "@/lib/text";
import { formatSummary } from "@/components/documents/document-card";
import { CategoryLinks, TypeLink } from "@/components/documents/filter-links";

const UUID = /^[0-9a-f-]{36}$/i;

export async function generateMetadata({ params }: PageProps<"/portal/documents/[id]">): Promise<Metadata> {
  const { id } = await params;
  if (!UUID.test(id)) return {};
  const user = await requirePermission("portal.view");
  const doc = await getPortalDocument(user, id);
  return doc ? { title: `${doc.documentNumber} ${doc.title}` } : {};
}

export default async function PortalDocumentPage({ params, searchParams }: PageProps<"/portal/documents/[id]">) {
  const user = await requirePermission("portal.view");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const doc = await getPortalDocument(user, id);
  if (!doc || !doc.revision) notFound();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const saved = await db
    .select()
    .from(schema.savedDocuments)
    .where(and(eq(schema.savedDocuments.userId, user.id), eq(schema.savedDocuments.documentId, doc.id)));
  const rev = doc.revision;
  // Counted after the page is sent, so it never slows the page down.
  after(() => recordDocumentView(user, doc.id, rev.id).catch((e) => console.error("Could not record document view", e)));
  const fileUrl = `/api/files/revisions/${rev.id}`;
  const authoredHtml = doc.kind === "authored" ? renderAuthoredHtml(rev.authoredContent) : null;

  return (
    <div>
      <PageHeader
        breadcrumb={[
          { href: "/portal/documents", label: "All documents" },
          { href: `/portal/categories/${doc.categorySlug}`, label: doc.categoryName },
        ]}
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{doc.title}</span>
            <DocLabelBadge label={doc.label} className="text-[12px]" />
          </span>
        }
        description={
          <span className="font-mono text-[13px] text-navy">
            {doc.documentNumber} · Revision {rev.revisionNumber}
          </span>
        }
        actions={
          <>
            <SaveButton documentId={doc.id} initial={saved.length > 0} />
            {rev.fileKey && (
              <Button asChild>
                <a href={`${fileUrl}?download=1`} data-testid="download-pdf">
                  <Download /> Download PDF
                </a>
              </Button>
            )}
            {!rev.fileKey && authoredHtml && (
              <Button asChild variant="secondary">
                <a href={`/print/documents/${doc.id}`} target="_blank" rel="noopener">
                  <Printer /> Print / Save as PDF
                </a>
              </Button>
            )}
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          {rev.fileKey ? (
            <PdfViewer
              fileUrl={fileUrl}
              downloadUrl={`${fileUrl}?download=1`}
              title={`${doc.documentNumber} — ${doc.title}`}
              subtitle={`Revision ${rev.revisionNumber} · ${fmtDate(rev.releaseDate)}`}
              initialQuery={q}
            />
          ) : authoredHtml ? (
            <Card>
              <CardBody className="px-6 py-8 sm:px-10">
                <article className="doc-prose mx-auto max-w-3xl" dangerouslySetInnerHTML={{ __html: authoredHtml }} />
              </CardBody>
            </Card>
          ) : null}
        </div>
        <aside className="space-y-4">
          <Card>
            <CardHeader title="Revision" />
            <CardBody className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-2xl font-semibold tabular">{rev.revisionNumber}</span>
                <DocLabelBadge label={doc.label} />
              </div>
              <DefinitionList
                items={[
                  ["Release date", fmtDate(rev.releaseDate)],
                  ["First published", fmtDate(doc.firstPublishedAt)],
                  ...(doc.lastPublishedAt && doc.firstPublishedAt && doc.lastPublishedAt.getTime() !== doc.firstPublishedAt.getTime()
                    ? [["Last updated", fmtDate(doc.lastPublishedAt)] as [string, string]]
                    : []),
                ]}
              />
              {rev.fileKey ? (
                <Button asChild className="h-11 w-full">
                  <a href={`${fileUrl}?download=1`} data-testid="sidebar-download">
                    <Download /> Download PDF
                    {rev.fileSize ? <span className="font-normal opacity-80">({formatBytes(rev.fileSize)})</span> : null}
                  </a>
                </Button>
              ) : authoredHtml ? (
                <Button asChild variant="secondary" className="h-11 w-full">
                  <a href={`/print/documents/${doc.id}`} target="_blank" rel="noopener">
                    <Printer /> Print / Save as PDF
                  </a>
                </Button>
              ) : null}
              <p className="text-[13px] leading-relaxed text-muted">
                This is the latest approved revision. The portal always shows the current version; earlier revisions are kept in NSK&apos;s records.
              </p>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Document information" />
            <CardBody>
              <DefinitionList
                items={[
                  ["Document No.", <span key="n" className="font-mono">{doc.documentNumber}</span>],
                  ["Category", <CategoryLinks key="c" doc={doc} listPath="/portal/documents" />],
                  ["Type", <TypeLink key="t" doc={doc} listPath="/portal/documents" />],
                  ...(doc.productModels.length ? [["Product models", doc.productModels.join(", ")] as [string, string]] : []),
                  ["Language", doc.language],
                  ["Source", doc.source],
                  ["Format", formatSummary(doc)],
                ]}
              />
            </CardBody>
          </Card>
          {doc.description && (
            <Card>
              <CardHeader title="Summary" />
              <CardBody className="text-sm leading-relaxed text-muted">{doc.description}</CardBody>
            </Card>
          )}
          <p className="px-1 text-[13px] leading-relaxed text-muted">
            {doc.kind === "uploaded_pdf"
              ? "This is the original document issued by NSK HQ, provided unchanged."
              : "This document was written in the NSK portal."}
          </p>
        </aside>
      </div>
    </div>
  );
}
