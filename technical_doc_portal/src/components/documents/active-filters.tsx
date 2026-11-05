import Link from "next/link";
import { X } from "lucide-react";
import type { parseFilters } from "@/lib/filters";
import { fmtDate } from "@/lib/utils";

type SP = Record<string, string | string[] | undefined>;
type Opt = { id: string; name: string; children?: Opt[] };

/** Removable chips for every filter currently applied, so dealers can see and undo them at a glance. */
export function ActiveFilters({
  f,
  sp,
  path,
  categories,
  types,
  hideCategory,
}: {
  f: ReturnType<typeof parseFilters>;
  sp: SP;
  path: string;
  categories: Opt[];
  types: Opt[];
  hideCategory?: boolean;
}) {
  const without = (key: string, value?: string) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (k === "page" || v === undefined) continue;
      for (const x of Array.isArray(v) ? v : [v]) {
        if (k === key && (value === undefined || x === value)) continue;
        // Removing a category also removes its series.
        if (key === "category" && k === "subcategory") continue;
        if (x) p.append(k, x);
      }
    }
    return `${path}${p.size ? `?${p}` : ""}`;
  };
  const allSubs = categories.flatMap((c) => c.children ?? []);
  const chips: { key: string; label: string; href: string }[] = [];
  if (f.q) chips.push({ key: "q", label: `“${f.q}”`, href: without("q") });
  if (f.categoryId && !hideCategory)
    chips.push({ key: "category", label: categories.find((c) => c.id === f.categoryId)?.name ?? "Category", href: without("category") });
  if (f.subcategoryId)
    chips.push({ key: "subcategory", label: allSubs.find((c) => c.id === f.subcategoryId)?.name ?? "Series", href: without("subcategory") });
  if (f.documentTypeId) chips.push({ key: "type", label: types.find((t) => t.id === f.documentTypeId)?.name ?? "Type", href: without("type") });
  if (f.productModel) chips.push({ key: "model", label: `Model ${f.productModel}`, href: without("model") });
  if (f.language) chips.push({ key: "lang", label: f.language, href: without("lang") });
  if (f.from) chips.push({ key: "from", label: `From ${fmtDate(f.from)}`, href: without("from") });
  if (f.to) chips.push({ key: "to", label: `To ${fmtDate(f.to)}`, href: without("to") });
  for (const l of f.labels) chips.push({ key: `label-${l}`, label: l, href: without("label", l) });
  if (!chips.length) return null;

  return (
    <ul className="flex flex-wrap items-center gap-1.5" aria-label="Active filters">
      {chips.map((c) => (
        <li key={c.key}>
          <Link
            href={c.href}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-navy-100 bg-navy-50 py-1 pl-3 pr-2 text-[13px] text-navy hover:border-navy hover:bg-navy-100"
            aria-label={`Remove filter: ${c.label}`}
          >
            {c.label}
            <X className="size-3.5" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
