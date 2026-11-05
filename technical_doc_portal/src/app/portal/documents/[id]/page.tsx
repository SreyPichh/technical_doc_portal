import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { Download, Printer } from "lucide-react";
import { requirePermission } from "@/server/auth/dal";
import { db, schema } from "@/server/db";
import { getPortalDocument } from "@/server/services/documents";
import { renderAuthoredHtml } from "@/server/services/authored-render";
import { PdfViewer } from "@/components/pdf/pdf-viewer";
import { SaveButton } from "@/components/documents/save-button";
import { DocLabelBadge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DefinitionList, PageHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { fmtDate } from "@/lib/utils";
import { formatBytes } from "@/lib/text";

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
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
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
            <CardHeader title="Document information" />
            <CardBody>
              <DefinitionList
                items={[
                  ["Document No.", <span key="n" className="font-mono">{doc.documentNumber}</span>],
                  ["Revision", <span key="r" className="font-medium">{rev.revisionNumber} <span className="text-muted font-normal">(current)</span></span>],
                  ["Release date", fmtDate(rev.releaseDate)],
                  ["Published", fmtDate(doc.lastPublishedAt)],
                  ["Category", doc.subcategoryName ? `${doc.categoryName} › ${doc.subcategoryName}` : doc.categoryName],
                  ["Type", doc.documentType],
                  ["Language", doc.language],
                  ["Source", doc.source],
                  ...(doc.productModels.length ? [["Products", doc.productModels.join(", ")] as [string, string]] : []),
                  ...(rev.pageCount ? [["Pages", String(rev.pageCount)] as [string, string]] : []),
                  ...(rev.fileSize ? [["File size", formatBytes(rev.fileSize)] as [string, string]] : []),
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
          <p className="px-1 text-xs leading-relaxed text-subtle">
            {doc.kind === "uploaded_pdf"
              ? "This is the original document issued by NSK HQ, provided unchanged. Always refer to the portal for the latest approved revision."
              : "This document was authored in the NSK portal."}
          </p>
        </aside>
      </div>
    </div>
  );
}
