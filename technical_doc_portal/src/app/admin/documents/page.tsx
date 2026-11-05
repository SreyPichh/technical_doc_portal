import type { Metadata } from "next";
import Link from "next/link";
import { FilePlus2, FileSearch } from "lucide-react";
import { requirePermission } from "@/server/auth/dal";
import { getCategoryTree, getDocumentTypes, getLanguages, searchDocuments } from "@/server/services/documents";
import { FilterBar } from "@/components/documents/filter-bar";
import { AdminDocumentTable } from "@/components/admin/document-table";
import { DocumentCard } from "@/components/documents/document-card";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, Pagination } from "@/components/ui/misc";
import { buildQuery, parseFilters } from "@/lib/filters";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Document management" };

export default async function AdminDocuments({ searchParams }: PageProps<"/admin/documents">) {
  const user = await requirePermission("documents.view_all");
  const sp = await searchParams;
  const f = parseFilters(sp, { allowStatusLabels: true });
  const [result, tree, types, languages] = await Promise.all([
    searchDocuments(user, "admin", { ...f, pageSize: 25 }),
    getCategoryTree({ includeInactive: true }),
    getDocumentTypes({ includeInactive: true }),
    getLanguages(user, "admin"),
  ]);
  return (
    <div>
      <PageHeader
        title="Document management"
        description="All documents in the library, including drafts, archived and withdrawn documents."
        actions={
          can(user.role, "documents.upload") && (
            <>
              <Button asChild variant="secondary">
                <Link href="/admin/authored/new">New authored document</Link>
              </Button>
              <Button asChild>
                <Link href="/admin/upload">
                  <FilePlus2 /> Upload document
                </Link>
              </Button>
            </>
          )
        }
      />
      <FilterBar
        key={JSON.stringify(sp)}
        values={f}
        categories={tree}
        types={types}
        languages={languages}
        labelOptions={["DRAFT", "NEW", "UPDATED", "CURRENT", "ARCHIVED", "WITHDRAWN"]}
      />
      <p className="mb-3 mt-5 text-sm text-muted">
        {result.total} document{result.total === 1 ? "" : "s"}
      </p>
      {!result.items.length ? (
        <div className="rounded-lg border border-border bg-surface">
          <EmptyState icon={<FileSearch />} title="No documents match these filters" />
        </div>
      ) : f.view === "cards" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {result.items.map((d) => (
            <DocumentCard key={d.id} doc={d} href={`/admin/documents/${d.id}`} />
          ))}
        </div>
      ) : (
        <AdminDocumentTable
          items={result.items}
          perms={{
            edit: can(user.role, "documents.edit_metadata"),
            upload: can(user.role, "documents.upload"),
            archive: can(user.role, "documents.archive"),
          }}
        />
      )}
      <Pagination
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        hrefFor={(p) => `/admin/documents${buildQuery(sp as Record<string, string>, { page: String(p) })}`}
      />
    </div>
  );
}
