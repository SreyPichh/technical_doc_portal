import type { Metadata } from "next";
import { sql } from "drizzle-orm";
import { requirePermission } from "@/server/auth/dal";
import { db, schema } from "@/server/db";
import { getCategoryTree } from "@/server/services/documents";
import { PageHeader } from "@/components/ui/misc";
import { CategoryManager } from "./category-manager";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesAdminPage() {
  await requirePermission("categories.manage");
  const [tree, counts] = await Promise.all([
    getCategoryTree({ includeInactive: true }),
    db
      .select({
        id: sql<string>`x.id`,
        n: sql<number>`count(*)::int`,
      })
      .from(sql`(select category_id as id from ${schema.documents} union all select subcategory_id from ${schema.documents} where subcategory_id is not null) x`)
      .groupBy(sql`x.id`),
  ]);
  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Categories"
        description="Organise the library by product line and series. Changes apply immediately — no code changes needed. Deactivated categories are hidden from dealer navigation; their documents stay searchable."
      />
      <CategoryManager tree={tree} counts={Object.fromEntries(counts.map((c) => [c.id, c.n]))} />
    </div>
  );
}
