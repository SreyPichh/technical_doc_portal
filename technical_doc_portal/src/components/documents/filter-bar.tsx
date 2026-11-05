"use client";

import { useRouter, usePathname } from "next/navigation";
import { useRef } from "react";
import { LayoutGrid, List, Search, X } from "lucide-react";
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
  labelOptions: string[];
  hideCategory?: boolean;
  extra?: Record<string, string>;
};

export function FilterBar({ values, categories, types, languages, labelOptions, hideCategory, extra }: FilterBarProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const submit = () => formRef.current?.requestSubmit();
  const subOptions = categories.find((c) => c.id === values.categoryId)?.children ?? [];
  const active =
    Boolean(values.q || values.categoryId || values.documentTypeId || values.language || values.from || values.to) ||
    values.labels.length > 0;

  return (
    <form
      ref={formRef}
      method="get"
      className="rounded-lg border border-border bg-surface p-3 shadow-xs"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const p = new URLSearchParams();
        for (const [k, v] of fd.entries()) if (typeof v === "string" && v) p.append(k, v);
        router.push(`${pathname}${p.size ? `?${p}` : ""}`);
      }}
    >
      {extra && Object.entries(extra).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <div className="flex flex-col gap-2 lg:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Search</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <Input
            name="q"
            defaultValue={values.q}
            placeholder="Search title, document no., product model, order code or text…"
            className="h-10 pl-9"
            data-testid="search-input"
          />
        </label>
        <Button type="submit" className="h-10">
          Search
        </Button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
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
        <Select
          name="subcategory"
          defaultValue={values.subcategoryId ?? ""}
          onChange={submit}
          aria-label="Product series"
          disabled={!subOptions.length}
        >
          <option value="">{subOptions.length ? "All series" : "Series (choose category)"}</option>
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
        <Select name="lang" defaultValue={values.language ?? ""} onChange={submit} aria-label="Language">
          <option value="">All languages</option>
          {languages.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-1.5 text-[12px] text-muted">
          <span className="shrink-0">From</span>
          <Input type="date" name="from" defaultValue={values.from} onChange={submit} className="h-9 px-2" aria-label="Published from" />
        </label>
        <label className="flex items-center gap-1.5 text-[12px] text-muted">
          <span className="shrink-0">To</span>
          <Input type="date" name="to" defaultValue={values.to} onChange={submit} className="h-9 px-2" aria-label="Published to" />
        </label>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <fieldset className="flex flex-wrap items-center gap-1.5">
          <legend className="sr-only">Status labels</legend>
          {labelOptions.map((l) => {
            const on = values.labels.includes(l);
            return (
              <label
                key={l}
                className={cn(
                  "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium select-none",
                  on ? "border-navy bg-navy text-white" : "border-border-strong text-muted hover:border-navy-100",
                )}
              >
                <input type="checkbox" name="label" value={l} defaultChecked={on} onChange={submit} className="sr-only" />
                {l}
              </label>
            );
          })}
        </fieldset>
        <div className="ml-auto flex items-center gap-2">
          <Select name="sort" defaultValue={values.sort ?? ""} onChange={submit} className="h-8 w-auto text-[13px]" aria-label="Sort">
            <option value="">{values.q ? "Most relevant" : "Newest first"}</option>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="number">Document number</option>
            <option value="title">Title A–Z</option>
          </Select>
          <input type="hidden" name="view" value={values.view === "cards" ? "cards" : ""} />
          <div className="hidden overflow-hidden rounded-md border border-border-strong md:flex">
            {(["table", "cards"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  const input = formRef.current?.elements.namedItem("view") as HTMLInputElement;
                  input.value = v === "cards" ? "cards" : "";
                  submit();
                }}
                className={cn("flex h-8 w-8 items-center justify-center cursor-pointer", values.view === v ? "bg-navy text-white" : "hover:bg-grey-50")}
                aria-label={v === "table" ? "Table view" : "Card view"}
                aria-pressed={values.view === v}
              >
                {v === "table" ? <List className="size-4" /> : <LayoutGrid className="size-4" />}
              </button>
            ))}
          </div>
          {active && (
            <Button type="button" variant="ghost" size="sm" onClick={() => router.push(pathname + (extra ? `?${new URLSearchParams(extra)}` : ""))}>
              <X /> Clear
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
