import type { Metadata } from "next";
import { FileSearch } from "lucide-react";
import { requirePermission } from "@/server/auth/dal";
import { getCategoryTree, getDocumentTypes, getLanguages, searchDocuments } from "@/server/services/documents";
import { DocumentResults } from "@/components/documents/document-results";
import { FilterBar } from "@/components/documents/filter-bar";
import { EmptyState, PageHeader, Pagination } from "@/components/ui/misc";
import { buildQuery, parseFilters } from "@/lib/filters";

export const metadata: Metadata = { title: "All documents" };

export default async function PortalDocuments({ searchParams }: PageProps<"/portal/documents">) {
  const user = await requirePermission("portal.view");
  const sp = await searchParams;
  const f = parseFilters(sp);
  const [result, tree, types, languages] = await Promise.all([
    searchDocuments(user, "portal", { ...f, pageSize: 20 }),
    getCategoryTree(),
    getDocumentTypes(),
    getLanguages(user, "portal"),
  ]);
  return (
    <div>
      <PageHeader
        title="All documents"
        description="Search across titles, document numbers, product models, order codes and the full text of each PDF."
      />
      <FilterBar
        key={JSON.stringify(sp)}
        values={{ ...f, labels: f.labels }}
        categories={tree}
        types={types}
        languages={languages}
        labelOptions={["NEW", "UPDATED", "CURRENT"]}
      />
      <p className="mb-3 mt-5 text-sm text-muted" aria-live="polite" data-testid="result-count">
        {result.total} document{result.total === 1 ? "" : "s"}
        {f.q ? ` matching “${f.q}”` : ""}
      </p>
      {result.items.length ? (
        <DocumentResults
          items={result.items}
          view={f.view}
          q={f.q}
          hrefFor={(d) => `/portal/documents/${d.id}${f.q ? `?q=${encodeURIComponent(f.q)}` : ""}`}
        />
      ) : (
        <div className="rounded-lg border border-border bg-surface">
          <EmptyState icon={<FileSearch />} title="No documents found">
            Try a document number (e.g. TEC-26-049), a model name or an order code, or clear some filters.
          </EmptyState>
        </div>
      )}
      <Pagination
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        hrefFor={(p) => `/portal/documents${buildQuery(sp as Record<string, string>, { page: String(p) })}`}
      />
    </div>
  );
}
