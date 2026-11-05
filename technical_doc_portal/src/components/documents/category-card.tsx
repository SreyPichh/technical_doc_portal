import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Category = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  children: { id: string; name: string }[];
};

export function countLabel(n: number) {
  return n ? `${n} document${n === 1 ? "" : "s"}` : "No documents available yet.";
}

/**
 * A product category. The whole card opens the category (the title link is
 * stretched over it); on the categories page each series is also its own link.
 */
export function CategoryCard({
  category: c,
  counts,
  variant = "compact",
}: {
  category: Category;
  counts: Map<string, number>;
  variant?: "compact" | "full";
}) {
  const n = counts.get(c.id) ?? 0;
  const href = `/portal/categories/${c.slug}`;
  const seriesPreview = c.children.slice(0, 3).map((s) => s.name);
  const more = c.children.length - seriesPreview.length;

  return (
    <article
      className={cn(
        "group/card relative flex h-full flex-col rounded-lg border border-border bg-surface shadow-xs",
        "transition-[transform,box-shadow,border-color,background-color] duration-150 motion-reduce:transition-none",
        "hover:-translate-y-0.5 hover:border-navy/40 hover:bg-navy-50/40 hover:shadow-md motion-reduce:hover:translate-y-0",
        "has-[a[data-card-link]:focus-visible]:outline-2 has-[a[data-card-link]:focus-visible]:outline-offset-2 has-[a[data-card-link]:focus-visible]:outline-ring",
      )}
    >
      <div className={cn("flex flex-1 flex-col", variant === "compact" ? "p-4" : "p-5")}>
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold leading-snug transition-colors group-hover/card:text-navy">
            <Link
              href={href}
              data-card-link
              className="outline-none after:absolute after:inset-0 after:rounded-lg after:content-['']"
              aria-label={`${c.name}, ${countLabel(n)}`}
            >
              {c.name}
            </Link>
          </h3>
          <ArrowRight
            className="mt-0.5 size-4 shrink-0 text-subtle transition-[transform,color] group-hover/card:translate-x-0.5 group-hover/card:text-navy motion-reduce:group-hover/card:translate-x-0"
            aria-hidden
          />
        </div>
        {variant === "full" && c.description && <p className="mt-1 text-[13px] text-muted">{c.description}</p>}
        <p className={cn("mt-1 text-[13px] tabular", n ? "font-medium text-muted" : "text-subtle")}>{countLabel(n)}</p>
        {variant === "compact" && seriesPreview.length > 0 && (
          <p className="mt-auto line-clamp-2 pt-3 text-[12px] text-subtle">
            {seriesPreview.join(" · ")}
            {more > 0 ? ` · +${more} more` : ""}
          </p>
        )}
      </div>
      {variant === "full" && c.children.length > 0 && (
        <ul className="relative z-10 flex flex-wrap gap-1.5 border-t border-border px-5 py-3" aria-label={`${c.name} series`}>
          {c.children.map((s) => (
            <li key={s.id}>
              <Link
                href={`${href}?subcategory=${s.id}`}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-[13px] hover:border-navy hover:text-navy"
              >
                {s.name}
                <span className="tabular text-subtle">{counts.get(s.id) ?? 0}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
