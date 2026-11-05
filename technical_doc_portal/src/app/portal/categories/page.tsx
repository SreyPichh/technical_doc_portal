import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/server/auth/dal";
import { getCategoryTree, portalCategoryCounts } from "@/server/services/documents";
import { CategoryIcon } from "@/components/documents/category-icon";
import { PageHeader } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Product categories" };

export default async function CategoriesPage() {
  const user = await requirePermission("portal.view");
  const [tree, counts] = await Promise.all([getCategoryTree(), portalCategoryCounts(user)]);
  return (
    <div>
      <PageHeader title="Product categories" description="Browse technical information by product line and series." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {tree.map((c) => (
          <section key={c.id} className="flex flex-col rounded-lg border border-border bg-surface shadow-xs">
            <Link href={`/portal/categories/${c.slug}`} className="group flex items-start gap-3 p-5">
              <span className="rounded-md bg-navy-50 p-2.5 text-navy group-hover:bg-navy group-hover:text-white">
                <CategoryIcon icon={c.icon} className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold group-hover:text-navy group-hover:underline">{c.name}</span>
                {c.description && <span className="mt-0.5 block text-[13px] text-muted">{c.description}</span>}
                <span className="mt-1 block text-[12px] tabular text-subtle">{counts.get(c.id) ?? 0} documents</span>
              </span>
            </Link>
            {c.children.length > 0 && (
              <ul className="mt-auto flex flex-wrap gap-1.5 border-t border-border px-5 py-3">
                {c.children.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/portal/categories/${c.slug}?subcategory=${s.id}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[12px] hover:border-navy-100 hover:bg-navy-50"
                    >
                      {s.name}
                      <span className="tabular text-subtle">{counts.get(s.id) ?? 0}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
