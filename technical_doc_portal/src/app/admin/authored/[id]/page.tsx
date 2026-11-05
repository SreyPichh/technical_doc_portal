import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { requirePermission } from "@/server/auth/dal";
import { db, schema } from "@/server/db";
import { pdfExportAvailable } from "@/server/services/authored";
import { nextRevisionLabel } from "@/lib/text";
import { Alert, PageHeader } from "@/components/ui/misc";
import { AuthoredForm } from "../authored-form";

export const metadata: Metadata = { title: "Edit authored document" };

export default async function EditAuthoredPage({ params, searchParams }: PageProps<"/admin/authored/[id]">) {
  await requirePermission("documents.author");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, id));
  if (!doc || doc.kind !== "authored") notFound();
  const r = schema.documentRevisions;
  const [draft] = await db.select().from(r).where(and(eq(r.documentId, id), eq(r.approvalStatus, "draft")));
  const [latest] = await db.select().from(r).where(eq(r.documentId, id)).orderBy(desc(r.sequence)).limit(1);
  const base = draft ?? latest;
  const saved = (await searchParams).saved === "1";
  return (
    <div className="max-w-5xl">
      <PageHeader
        breadcrumb={[
          { href: "/admin/documents", label: "Document management" },
          { href: `/admin/documents/${id}`, label: doc.documentNumber },
        ]}
        title={`Edit: ${doc.title}`}
        description={draft ? `Editing draft revision ${draft.revisionNumber}` : `Changes will be saved as a new draft revision (current: ${latest?.revisionNumber ?? "—"})`}
      />
      {saved && (
        <Alert tone="success" className="mb-4">
          Draft saved. Continue editing, or open the document page to review and publish it.
        </Alert>
      )}
      <AuthoredForm
        mode="edit"
        documentId={id}
        initialContent={base?.authoredContent ?? undefined}
        draftRevisionId={draft?.id}
        pdfExport={pdfExportAvailable()}
        revisionDefaults={
          draft
            ? { revisionNumber: draft.revisionNumber, releaseDate: draft.releaseDate, revisionNotes: draft.revisionNotes }
            : { revisionNumber: nextRevisionLabel(latest?.revisionNumber) }
        }
      />
    </div>
  );
}
