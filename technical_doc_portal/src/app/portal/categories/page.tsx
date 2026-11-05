import type { Metadata } from "next";
import { requirePermission } from "@/server/auth/dal";
import { getCategoryTree, portalCategoryCounts } from "@/server/services/documents";
import { CategoryCard } from "@/components/documents/category-card";
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
          <CategoryCard key={c.id} category={c} counts={counts} variant="full" />
        ))}
      </div>
    </div>
  );
}
