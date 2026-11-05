import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumb?: { href: string; label: string }[];
}) {
  return (
    <div className="mb-6">
      {breadcrumb && (
        <nav className="mb-2 flex flex-wrap items-center gap-1 text-[13px] text-muted" aria-label="Breadcrumb">
          {breadcrumb.map((b, i) => (
            <React.Fragment key={b.href}>
              {i > 0 && <span className="text-subtle">/</span>}
              <Link href={b.href} className="hover:text-navy hover:underline">
                {b.label}
              </Link>
            </React.Fragment>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted max-w-3xl">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      {icon && <div className="mb-3 rounded-full bg-navy-50 p-3 text-navy [&_svg]:size-6">{icon}</div>}
      <p className="font-medium text-foreground">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const t = {
    info: "border-blue/25 bg-blue-50 text-[#173f7a]",
    warning: "border-amber/30 bg-amber-50 text-[#6b3d05]",
    danger: "border-red/25 bg-red-50 text-[#8a0b20]",
    success: "border-green/25 bg-green-50 text-[#0b5a40]",
  }[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-md border px-4 py-3 text-sm", t, className)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cn(title && "mt-0.5")}>{children}</div>}
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  hrefFor,
}: {
  page: number;
  pageSize: number;
  total: number;
  hrefFor: (page: number) => string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const cls =
    "inline-flex h-8 items-center gap-1 rounded-md border border-border-strong bg-surface px-3 text-[13px] hover:bg-grey-50";
  return (
    <div className="flex items-center justify-between gap-4 pt-4 text-[13px] text-muted">
      <span className="tabular">
        {from}–{to} of {total}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link className={cls} href={hrefFor(page - 1)}>
            <ChevronLeft className="size-4" /> Previous
          </Link>
        ) : null}
        {page < pages ? (
          <Link className={cls} href={hrefFor(page + 1)}>
            Next <ChevronRight className="size-4" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  href,
  accent,
}: {
  label: string;
  value: number | string;
  hint?: string;
  href?: string;
  accent?: "green" | "blue" | "red" | "amber";
}) {
  const bar = { green: "bg-green", blue: "bg-blue", red: "bg-red", amber: "bg-amber" }[accent ?? "green"];
  const inner = (
    <div className="relative h-full rounded-lg border border-border bg-surface px-4 py-3.5 shadow-xs transition-colors hover:border-navy-100">
      {accent && <span className={cn("absolute left-0 top-3 bottom-3 w-[3px] rounded-r", bar)} />}
      <p className="text-[12px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular text-foreground">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-subtle">{hint}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function DefinitionList({ items, className }: { items: [string, React.ReactNode][]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-[minmax(110px,auto)_1fr] gap-x-4 gap-y-2.5 text-sm", className)}>
      {items.map(([k, v]) => (
        <React.Fragment key={k}>
          <dt className="text-muted">{k}</dt>
          <dd className="min-w-0 break-words text-foreground">{v}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}
