import type { Metadata } from "next";
import { requirePermission } from "@/server/auth/dal";
import { getCategoryTree, getDocumentTypes, getLanguages, getRegions } from "@/server/services/documents";
import { pdfExportAvailable } from "@/server/services/authored";
import { Alert, PageHeader } from "@/components/ui/misc";
import { AuthoredForm } from "../authored-form";

export const metadata: Metadata = { title: "New authored document" };

export default async function NewAuthoredPage() {
  const user = await requirePermission("documents.author");
  const [tree, types, regions, languages] = await Promise.all([
    getCategoryTree({ includeInactive: true }),
    getDocumentTypes(),
    getRegions(),
    getLanguages(user, "admin"),
  ]);
  return (
    <div className="max-w-5xl">
      <PageHeader
        breadcrumb={[{ href: "/admin/documents", label: "Document management" }]}
        title="New authored document"
        description="Write technical information directly in the portal, with headings, tables, images and page breaks."
      />
      <Alert tone="info" className="mb-6">
        Use this for information written by your team. Official HQ documents should be uploaded as the original PDF, never retyped.
      </Alert>
      <AuthoredForm
        mode="create"
        pdfExport={pdfExportAvailable()}
        options={{
          categories: tree.map((c) => ({ id: c.id, name: c.name, status: c.status, children: c.children.map((s) => ({ id: s.id, name: s.name, status: s.status })) })),
          types: types.map((t) => ({ id: t.id, name: t.name })),
          regions: regions.map((r) => ({ id: r.id, name: r.name })),
          languages,
        }}
        revisionDefaults={{ revisionNumber: "R0" }}
      />
    </div>
  );
}
