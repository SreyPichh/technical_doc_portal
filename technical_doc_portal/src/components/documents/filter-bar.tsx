"use client";

import { useRouter, usePathname } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { LayoutGrid, List, LoaderCircle, Search, SlidersHorizontal, X } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Opt = { id: string; name: string };
export type FilterBarProps = {
  values: {
    q?: string;
    categoryId?: string;
    subcategoryId?: string;
    documentTypeId?: string;
    productModel?: string;
    language?: string;
    from?: string;
    to?: string;
    labels: string[];
    sort?: string;
    view: "table" | "cards";
  };
  categories: (Opt & { children: Opt[] })[];
  types: Opt[];
  languages: string[];
  /** Product models to offer as a filter (omit to hide the filter). */
  models?: string[];
  labelOptions: string[];
  hideCategory?: boolean;
  extra?: Record<string, string>;
};

const LABEL_HINTS: Record<string, string> = {
  NEW: "Newly published",
  UPDATED: "New revision",
  CURRENT: "Latest approved version",
};

export function FilterBar({ values, categories, types, languages, models, labelOptions, hideCategory, extra }: FilterBarProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const submit = () => formRef.current?.requestSubmit();
  const subOptions = categories.find((c) => c.id === values.categoryId)?.children ?? [];
  const filterCount = [
    !hideCategory && values.categoryId,
    values.subcategoryId,
    values.documentTypeId,
    values.productModel,
    values.language,
    values.from,
    values.to,
  ].filter(Boolean).length;
  const active = Boolean(values.q) || filterCount > 0 || values.labels.length > 0;
  const [showFilters, setShowFilters] = useState(filterCount > 0);
  const [pending, startTransition] = useTransition();
  const go = (url: string) => startTransition(() => router.push(url));
  const clearAll = () => go(pathname + (extra ? `?${new URLSearchParams(extra)}` : ""));

  return (
    <form
      ref={formRef}
      method="get"
      className="group/filters rounded-lg border border-border bg-surface p-3 shadow-xs sm:p-4"
      data-pending={pending || undefined}
      aria-busy={pending}
      role="search"
      aria-label="Search and filter documents"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const p = new URLSearchParams();
        for (const [k, v] of fd.entries()) if (typeof v === "string" && v) p.append(k, v);
        go(`${pathname}${p.size ? `?${p}` : ""}`);
      }}
    >
      {extra && Object.entries(extra).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <div className="flex gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search documents</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
          <Input
            name="q"
            type="search"
            enterKeyHint="search"
            defaultValue={values.q}
            placeholder="Document no., title, product model, order code or keyword"
            className="h-11 pl-9 text-[15px]"
            data-testid="search-input"
          />
        </label>
        <Button type="submit" className="h-11 px-5">
          <Search className="sm:hidden" aria-hidden />
          <span className="sr-only sm:not-sr-only">Search</span>
        </Button>
      </div>

      <button
        type="button"
        onClick={() => setShowFilters((v) => !v)}
        aria-expanded={showFilters}
        aria-controls="filter-fields"
        className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-md border border-border-strong text-sm font-medium cursor-pointer hover:bg-grey-50 md:hidden"
      >
        <SlidersHorizontal className="size-4" aria-hidden />
        {showFilters ? "Hide filters" : "Show filters"}
        {filterCount > 0 && <span className="rounded-full bg-navy px-1.5 text-[11px] leading-[18px] text-white tabular">{filterCount}</span>}
      </button>

      <div id="filter-fields" className={cn("mt-3 grid-cols-1 gap-2 sm:grid-cols-2 md:grid md:grid-cols-3 xl:grid-cols-4", showFilters ? "grid" : "hidden")}>
        {!hideCategory && (
          <Select name="category" defaultValue={values.categoryId ?? ""} onChange={submit} aria-label="Product category" data-testid="filter-category">
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        )}
        <Select name="subcategory" defaultValue={values.subcategoryId ?? ""} onChange={submit} aria-label="Product series" disabled={!subOptions.length}>
          <option value="">{subOptions.length ? "All series" : hideCategory ? "No series" : "Series (choose a category first)"}</option>
          {subOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select name="type" defaultValue={values.documentTypeId ?? ""} onChange={submit} aria-label="Document type">
          <option value="">All document types</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
        {models && models.length > 0 && (
          <Select name="model" defaultValue={values.productModel ?? ""} onChange={submit} aria-label="Product model" data-testid="filter-model">
            <option value="">All product models</option>
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        )}
        <Select name="lang" defaultValue={values.language ?? ""} onChange={submit} aria-label="Language">
          <option value="">All languages</option>
          {languages.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-[13px] text-muted">
          <span className="w-10 shrink-0">From</span>
          <Input type="date" name="from" defaultValue={values.from} onChange={submit} className="h-10 px-2" aria-label="Published from" />
        </label>
        <label className="flex items-center gap-2 text-[13px] text-muted">
          <span className="w-10 shrink-0">To</span>
          <Input type="date" name="to" defaultValue={values.to} onChange={submit} className="h-10 px-2" aria-label="Published to" />
        </label>
      </div>

      {/* Bottom row. Phones: status, then sort + layout on their own full-width row, labels aligned.
          md and up: status on the left, sort / layout / clear on the right of one row. */}
      <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3 md:flex-row md:items-center md:justify-between">
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="sr-only">Status</legend>
          <span className="w-16 shrink-0 text-[13px] text-muted md:w-auto" aria-hidden>
            Status
          </span>
          {labelOptions.map((l) => {
            const on = values.labels.includes(l);
            return (
              <label
                key={l}
                title={LABEL_HINTS[l]}
                className={cn(
                  "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold tracking-wide select-none pointer-coarse:min-h-10 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                  on ? "border-navy bg-navy text-white" : "border-border-strong text-muted hover:border-navy-100 hover:text-navy",
                )}
              >
                <input type="checkbox" name="label" value={l} defaultChecked={on} onChange={submit} className="sr-only" />
                {on && <X className="size-3" aria-hidden />}
                {l}
              </label>
            );
          })}
        </fieldset>

        <div className="flex items-center gap-2">
          {pending && (
            <span className="mr-2 hidden items-center gap-1.5 text-[13px] text-muted md:flex" role="status">
              <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden /> Updating results…
            </span>
          )}
          <label className="flex min-w-0 flex-1 items-center gap-2 md:flex-none">
            <span className="w-16 shrink-0 text-[13px] text-muted md:w-auto">Sort by</span>
            <Select
              name="sort"
              defaultValue={values.sort ?? ""}
              onChange={submit}
              className="h-10 min-w-0 flex-1 text-[13px] md:h-9 md:w-44 md:flex-none"
            >
              <option value="">{values.q ? "Most relevant" : "Newest first"}</option>
              {values.q && <option value="newest">Newest first</option>}
              <option value="oldest">Oldest first</option>
              <option value="title">Title A–Z</option>
              <option value="number">Document number</option>
            </Select>
          </label>
          <input type="hidden" name="view" value={values.view === "cards" ? "cards" : ""} />
          <div className="flex shrink-0 overflow-hidden rounded-md border border-border-strong" role="group" aria-label="Result layout">
            {(["table", "cards"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  const input = formRef.current?.elements.namedItem("view") as HTMLInputElement;
                  input.value = v === "cards" ? "cards" : "";
                  submit();
                }}
                className={cn(
                  "flex size-10 items-center justify-center cursor-pointer focus-visible:outline-offset-[-2px] md:size-9",
                  values.view === v ? "bg-navy text-white" : "hover:bg-grey-50",
                )}
                aria-label={v === "table" ? "List view" : "Card view"}
                title={v === "table" ? "List view" : "Card view"}
                aria-pressed={values.view === v}
              >
                {v === "table" ? <List className="size-4" /> : <LayoutGrid className="size-4" />}
              </button>
            ))}
          </div>
          {active && (
            <Button type="button" variant="ghost" size="sm" className="hidden h-9 md:inline-flex" onClick={clearAll}>
              <X /> Clear all
            </Button>
          )}
        </div>

        {(pending || active) && (
          <div className="flex min-h-6 items-center justify-between gap-3 md:hidden">
            {pending ? (
              <span className="flex items-center gap-1.5 text-[13px] text-muted" role="status">
                <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden /> Updating results…
              </span>
            ) : (
              <span />
            )}
            {active && (
              <Button type="button" variant="ghost" size="sm" className="h-10" onClick={clearAll}>
                <X /> Clear all
              </Button>
            )}
          </div>
        )}
      </div>
    </form>
  );
}
