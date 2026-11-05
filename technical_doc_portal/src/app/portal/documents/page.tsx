import type { Metadata } from "next";
import Link from "next/link";
import { FileSearch } from "lucide-react";
import { requirePermission, type SessionUser } from "@/server/auth/dal";
import { getCategoryTree, getDocumentTypes, getLanguages, getProductModels, searchDocuments } from "@/server/services/documents";
import { DocumentResults } from "@/components/documents/document-results";
import { FilterBar } from "@/components/documents/filter-bar";
import { ActiveFilters } from "@/components/documents/active-filters";
import { EmptyState, PageHeader, Pagination } from "@/components/ui/misc";
import { buildQuery, parseFilters } from "@/lib/filters";

export const metadata: Metadata = { title: "All documents" };

type SP = Awaited<PageProps<"/portal/documents">["searchParams"]>;
type Opt = { id: string; name: string; children?: Opt[] };

async function Results({ user, sp, tree, types }: { user: SessionUser; sp: SP; tree: Opt[]; types: Opt[] }) {
  const f = parseFilters(sp);
  const result = await searchDocuments(user, "portal", { ...f, pageSize: 20 });
  const first = (result.page - 1) * result.pageSize + 1;
  const last = first + result.items.length - 1;
  const filtered = Boolean(f.q || f.categoryId || f.subcategoryId || f.documentTypeId || f.productModel || f.language || f.from || f.to || f.labels.length);
  return (
    <div data-results>
      <div className="mb-3 mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-sm text-muted" aria-live="polite" data-testid="result-count">
          {result.total} document{result.total === 1 ? "" : "s"}
          {f.q ? ` matching “${f.q}”` : ""}
          {result.total > result.pageSize && (
            <span className="tabular">
              {" "}
              · showing {first}–{last}
            </span>
          )}
        </p>
        <ActiveFilters f={f} sp={sp} path="/portal/documents" categories={tree} types={types} />
      </div>
      {result.items.length ? (
        <DocumentResults
          items={result.items}
          view={f.view}
          q={f.q}
          hrefFor={(d) => `/portal/documents/${d.id}${f.q ? `?q=${encodeURIComponent(f.q)}` : ""}`}
        />
      ) : (
        <div className="rounded-lg border border-border bg-surface">
          <EmptyState icon={<FileSearch />} title={f.q ? `No documents match “${f.q}”` : "No documents match these filters"}>
            <span className="block">Check the spelling, try a document number (e.g. TEC-26-049), a product model or an order code, or remove a filter.</span>
            {filtered && (
              <Link href="/portal/documents" className="mt-3 inline-block font-medium text-blue hover:underline">
                Clear search and filters
              </Link>
            )}
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

export default async function PortalDocuments({ searchParams }: PageProps<"/portal/documents">) {
  const user = await requirePermission("portal.view");
  const sp = await searchParams;
  const f = parseFilters(sp);
  const [tree, types, languages, models] = await Promise.all([
    getCategoryTree(),
    getDocumentTypes(),
    getLanguages(user, "portal"),
    getProductModels(user),
  ]);
  return (
    <div>
      <PageHeader
        title="All documents"
        description="Search titles, document numbers, product models, order codes and the full text of every PDF."
      />
      <FilterBar
        key={JSON.stringify(sp)}
        values={f}
        categories={tree}
        types={types}
        languages={languages}
        models={models}
        labelOptions={["NEW", "UPDATED", "CURRENT"]}
      />
      <Results user={user} sp={sp} tree={tree} types={types} />
    </div>
  );
}
