import type { Metadata } from "next";
import { desc, eq, sql } from "drizzle-orm";
import { requirePermission } from "@/server/auth/dal";
import { db, schema } from "@/server/db";
import { env } from "@/server/env";
import { getCategoryTree, getDocumentTypes, getLanguages, getRegions } from "@/server/services/documents";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/misc";
import { UploadWizard } from "./upload-wizard";

export const metadata: Metadata = { title: "Upload documents" };

export default async function UploadPage({ searchParams }: PageProps<"/admin/upload">) {
  const user = await requirePermission("documents.upload");
  const sp = await searchParams;
  const d = schema.documents;
  const r = schema.documentRevisions;
  const [tree, types, regions, languages, docs] = await Promise.all([
    getCategoryTree({ includeInactive: true }),
    getDocumentTypes(),
    getRegions(),
    getLanguages(user, "admin"),
    db
      .select({
        id: d.id,
        number: d.documentNumber,
        title: d.title,
        status: d.status,
        revisionNumber: r.revisionNumber,
        releaseDate: r.releaseDate,
        pageCount: r.pageCount,
        fileSize: r.fileSize,
        filename: r.originalFilename,
        pending: sql<boolean>`exists (select 1 from document_revisions p where p.document_id = ${d.id} and p.approval_status = 'draft')`,
        latestRevision: sql<string | null>`(select p.revision_number from document_revisions p where p.document_id = ${d.id} order by p.sequence desc limit 1)`,
      })
      .from(d)
      .leftJoin(r, eq(r.id, d.currentRevisionId))
      .where(eq(d.kind, "uploaded_pdf"))
      .orderBy(desc(d.updatedAt)),
  ]);
  const mode = sp.mode === "revision" || typeof sp.document === "string" ? "revision" : "new";
  return (
    <div>
      <PageHeader
        title="Upload documents"
        description="Upload an official HQ PDF as a new document, or as a newer revision of an existing document. Nothing is visible to dealers until it is published."
      />
      <UploadWizard
        initialMode={mode}
        initialDocumentId={typeof sp.document === "string" ? sp.document : undefined}
        maxMb={env.MAX_UPLOAD_MB}
        canPublish={can(user.role, "documents.publish")}
        options={{
          categories: tree.map((c) => ({ id: c.id, name: c.name, status: c.status, children: c.children.map((s) => ({ id: s.id, name: s.name, status: s.status })) })),
          types: types.map((t) => ({ id: t.id, name: t.name })),
          regions: regions.map((r) => ({ id: r.id, name: r.name })),
          languages,
        }}
        documents={docs.map((x) => ({ ...x, pending: Boolean(x.pending) }))}
      />
    </div>
  );
}
