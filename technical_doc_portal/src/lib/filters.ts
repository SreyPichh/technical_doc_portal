import type { DocLabel } from "./labels";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
const many = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? v.split(",") : []);
const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LABELS: DocLabel[] = ["NEW", "UPDATED", "CURRENT", "ARCHIVED", "WITHDRAWN", "DRAFT"];
const SORTS = ["relevance", "newest", "oldest", "title", "number"] as const;

export function parseFilters(sp: SP, opts: { allowStatusLabels?: boolean } = {}) {
  const allowed = opts.allowStatusLabels ? LABELS : (["NEW", "UPDATED", "CURRENT"] as DocLabel[]);
  const category = one(sp.category);
  const subcategory = one(sp.subcategory);
  const type = one(sp.type);
  const from = one(sp.from);
  const to = one(sp.to);
  const sort = one(sp.sort) as (typeof SORTS)[number] | undefined;
  return {
    q: one(sp.q)?.slice(0, 200),
    categoryId: category && UUID.test(category) ? category : undefined,
    subcategoryId: subcategory && UUID.test(subcategory) ? subcategory : undefined,
    documentTypeId: type && UUID.test(type) ? type : undefined,
    language: one(sp.lang)?.slice(0, 40),
    from: from && DATE.test(from) ? from : undefined,
    to: to && DATE.test(to) ? to : undefined,
    labels: many(sp.label).filter((l): l is DocLabel => allowed.includes(l as DocLabel)),
    sort: sort && SORTS.includes(sort) ? sort : undefined,
    page: Math.max(1, Number(one(sp.page)) || 1),
    view: one(sp.view) === "cards" ? ("cards" as const) : ("table" as const),
  };
}

export function buildQuery(base: Record<string, string | string[] | undefined>, patch: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...patch })) {
    if (v === undefined || v === "") continue;
    if (Array.isArray(v)) v.forEach((x) => p.append(k, x));
    else p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}
