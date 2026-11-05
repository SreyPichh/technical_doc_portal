import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { FileSearch } from "lucide-react";
import { requirePermission } from "@/server/auth/dal";
import { db, schema } from "@/server/db";
import { getCategoryTree, getDocumentTypes, getLanguages, getProductModels, portalCategoryCounts, searchDocuments } from "@/server/services/documents";
import { DocumentResults } from "@/components/documents/document-results";
import { FilterBar } from "@/components/documents/filter-bar";
import { ActiveFilters } from "@/components/documents/active-filters";
import { EmptyState, PageHeader, Pagination } from "@/components/ui/misc";
import { buildQuery, parseFilters } from "@/lib/filters";
import { cn } from "@/lib/utils";

async function findCategory(slug: string) {
  const [c] = await db
    .select()
    .from(schema.categories)
    .where(and(eq(schema.categories.slug, slug), isNull(schema.categories.parentId), eq(schema.categories.status, "active")));
  return c;
}

export async function generateMetadata({ params }: PageProps<"/portal/categories/[slug]">): Promise<Metadata> {
  const c = await findCategory((await params).slug);
  return c ? { title: c.name } : {};
}

export default async function CategoryPage({ params, searchParams }: PageProps<"/portal/categories/[slug]">) {
  const user = await requirePermission("portal.view");
  const { slug } = await params;
  const cat = await findCategory(slug);
  if (!cat) notFound();
  const sp = await searchParams;
  const f = parseFilters(sp);
  const [result, tree, types, languages, counts, models] = await Promise.all([
    searchDocuments(user, "portal", { ...f, categoryId: cat.id, pageSize: 20 }),
    getCategoryTree(),
    getDocumentTypes(),
    getLanguages(user, "portal"),
    portalCategoryCounts(user),
    getProductModels(user),
  ]);
  const node = tree.find((t) => t.id === cat.id)!;
  return (
    <div>
      <PageHeader
        breadcrumb={[{ href: "/portal/categories", label: "Product categories" }]}
        title={cat.name}
        description={cat.description}
      />
      {node.children.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2" aria-label="Product series">
          <Link
            href={`/portal/categories/${slug}`}
            className={cn(
              "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13px]",
              !f.subcategoryId ? "border-navy bg-navy text-white" : "border-border-strong bg-surface hover:bg-navy-50",
            )}
          >
            All series <span className="tabular opacity-70">{counts.get(cat.id) ?? 0}</span>
          </Link>
          {node.children.map((s) => (
            <Link
              key={s.id}
              href={`/portal/categories/${slug}?subcategory=${s.id}`}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13px]",
                f.subcategoryId === s.id ? "border-navy bg-navy text-white" : "border-border-strong bg-surface hover:bg-navy-50",
              )}
            >
              {s.name} <span className="tabular opacity-70">{counts.get(s.id) ?? 0}</span>
            </Link>
          ))}
        </div>
      )}
      <FilterBar
        key={JSON.stringify(sp)}
        values={{ ...f, categoryId: cat.id }}
        categories={tree}
        types={types}
        languages={languages}
        models={models}
        labelOptions={["NEW", "UPDATED", "CURRENT"]}
        hideCategory
      />
      <div className="mb-3 mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-sm text-muted" aria-live="polite">
          {result.total} document{result.total === 1 ? "" : "s"}
        </p>
        <ActiveFilters f={f} sp={sp} path={`/portal/categories/${slug}`} categories={tree} types={types} hideCategory />
      </div>
      {result.items.length ? (
        <DocumentResults items={result.items} view={f.view} q={f.q} hrefFor={(d) => `/portal/documents/${d.id}`} />
      ) : (
        <div className="rounded-lg border border-border bg-surface">
          <EmptyState icon={<FileSearch />} title={result.total === 0 && !f.q && !f.labels.length ? "No documents available yet" : "No documents match these filters"}>
            {counts.get(cat.id) ? "Try removing a filter." : "Technical information for this category will appear here once NSK publishes it."}
          </EmptyState>
        </div>
      )}
      <Pagination
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        hrefFor={(p) => `/portal/categories/${slug}${buildQuery(sp as Record<string, string>, { page: String(p) })}`}
      />
    </div>
  );
}
