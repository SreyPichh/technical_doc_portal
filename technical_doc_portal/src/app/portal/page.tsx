import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { requirePermission } from "@/server/auth/dal";
import { getCategoryTree, latestPortalDocuments, portalCategoryCounts } from "@/server/services/documents";
import { getSettings } from "@/server/services/settings";
import { DocumentCard } from "@/components/documents/document-card";
import { CategoryIcon } from "@/components/documents/category-icon";
import { DocLabelBadge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { fmtDate } from "@/lib/utils";

export default async function PortalDashboard() {
  const user = await requirePermission("portal.view");
  const [tree, counts, latest, updated, settings] = await Promise.all([
    getCategoryTree(),
    portalCategoryCounts(user),
    latestPortalDocuments(user, 6),
    latestPortalDocuments(user, 6, "updated"),
    getSettings(),
  ]);
  const newCount = latest.filter((d) => d.label === "NEW").length;
  const updCount = latest.filter((d) => d.label === "UPDATED").length;

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
        <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.4fr_1fr] lg:items-center">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-red">Welcome, {user.fullName}</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-[28px]">Welcome to NSK Technical Information Portal</h1>
            <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">
              The official source for NSK technical information issued by Head Quarters. Documents here are always the
              latest approved revision — preview them in your browser or download the original PDF.
            </p>
            <form action="/portal/documents" className="mt-5 flex max-w-xl gap-2" role="search">
              <label className="relative flex-1">
                <span className="sr-only">Search technical information</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
                <input
                  name="q"
                  placeholder="e.g. TEC-26-049, Z-SG45L, U1020050"
                  className="h-11 w-full rounded-md border border-border-strong bg-surface pl-9 pr-3 text-sm focus:border-ring focus:outline-none focus:ring-3 focus:ring-ring/15"
                />
              </label>
              <button className="h-11 rounded-md bg-navy px-5 text-sm font-medium text-white hover:bg-navy-hover cursor-pointer">Search</button>
            </form>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Link href="/portal/documents?label=NEW" className="rounded-lg border border-border bg-green-50/60 p-4 hover:border-green/30">
              <DocLabelBadge label="NEW" />
              <p className="mt-2 text-2xl font-semibold tabular">{newCount}</p>
              <p className="text-[12px] text-muted">first published in the last {settings.newLabelDays} days</p>
            </Link>
            <Link href="/portal/documents?label=UPDATED" className="rounded-lg border border-border bg-blue-50/60 p-4 hover:border-blue/30">
              <DocLabelBadge label="UPDATED" />
              <p className="mt-2 text-2xl font-semibold tabular">{updCount}</p>
              <p className="text-[12px] text-muted">new revisions in the last {settings.updatedLabelDays} days</p>
            </Link>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-lg font-semibold">Product categories</h2>
          <Link href="/portal/categories" className="text-sm font-medium text-blue hover:underline">
            All categories
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          {tree.map((c) => (
            <Link
              key={c.id}
              href={`/portal/categories/${c.slug}`}
              className="group flex flex-col rounded-lg border border-border bg-surface p-4 shadow-xs transition-colors hover:border-navy-100 hover:bg-navy-50/40"
            >
              <span className="w-fit rounded-md bg-navy-50 p-2 text-navy group-hover:bg-navy group-hover:text-white">
                <CategoryIcon icon={c.icon} className="size-5" />
              </span>
              <span className="mt-3 text-[13px] font-semibold leading-snug">{c.name}</span>
              <span className="mt-auto pt-1 text-[12px] text-muted tabular">
                {counts.get(c.id) ?? 0} document{(counts.get(c.id) ?? 0) === 1 ? "" : "s"}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-lg font-semibold">Latest technical information</h2>
          <Link href="/portal/documents" className="inline-flex items-center gap-1 text-sm font-medium text-blue hover:underline">
            View all <ArrowRight className="size-4" />
          </Link>
        </div>
        {latest.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {latest.map((d) => (
              <DocumentCard key={d.id} doc={d} href={`/portal/documents/${d.id}`} />
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState title="No documents yet">Technical information will appear here once it is published.</EmptyState>
          </Card>
        )}
      </section>

      <Card>
        <CardHeader
          title="Recently updated"
          description="Documents that received a new revision"
          action={
            <Link href="/portal/updates" className="text-sm font-medium text-blue hover:underline">
              Latest updates
            </Link>
          }
        />
        {updated.length ? (
          <ul className="divide-y divide-border">
            {updated.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="font-mono text-[12px] text-navy">{d.documentNumber}</span>
                <Link href={`/portal/documents/${d.id}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
                  {d.title}
                </Link>
                <span className="text-[13px] tabular text-muted">Rev. {d.revisionNumber}</span>
                <span className="text-[13px] tabular text-muted">{fmtDate(d.lastPublishedAt)}</span>
                <DocLabelBadge label={d.label} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No revisions published yet" className="py-8">
            When HQ issues a new revision of a document, it will be listed here.
          </EmptyState>
        )}
      </Card>
    </div>
  );
}
