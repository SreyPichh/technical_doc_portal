import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, Bell, FileText, Search } from "lucide-react";
import { requirePermission, type SessionUser } from "@/server/auth/dal";
import {
  getCategoryTree,
  latestPortalDocuments,
  portalCategoryCounts,
  portalStats,
  portalUpdates,
} from "@/server/services/documents";
import { unreadSince } from "@/server/services/portal-notifications";
import { DocumentCard } from "@/components/documents/document-card";
import { CategoryCard } from "@/components/documents/category-card";
import { UpdateRow } from "@/components/documents/update-list";
import { DocLabelBadge } from "@/components/ui/badge";
import { DocumentCardSkeleton, LoadingRegion } from "@/components/documents/skeletons";
import { EmptyState } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

function SectionHeader({ id, title, href, linkLabel }: { id: string; title: string; href: string; linkLabel: string }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      <Link
        href={href}
        className="inline-flex min-h-9 shrink-0 items-center gap-1 whitespace-nowrap text-sm font-medium text-blue hover:underline"
      >
        {linkLabel} <ArrowRight className="size-4" aria-hidden />
      </Link>
    </div>
  );
}

function Stat({
  href,
  value,
  label,
  hint,
  badge,
  tone,
}: {
  href: string;
  value: number;
  label: string;
  hint: string;
  badge?: React.ReactNode;
  tone: "navy" | "green" | "blue";
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex flex-col rounded-lg border p-3 transition-colors sm:p-4",
        tone === "navy" && "border-border bg-surface hover:border-navy-100 hover:bg-navy-50/60",
        tone === "green" && "border-green/15 bg-green-50/70 hover:border-green/35",
        tone === "blue" && "border-blue/15 bg-blue-50/70 hover:border-blue/35",
      )}
    >
      <span className="flex h-5 items-center">
        {badge ?? <span className="text-[12px] font-semibold uppercase tracking-wide text-muted">{label}</span>}
      </span>
      <span className="mt-1.5 text-2xl font-semibold leading-none tabular sm:text-[28px]">{value}</span>
      <span className="mt-1.5 text-[12px] leading-snug text-muted sm:text-[13px]">{hint}</span>
    </Link>
  );
}

async function LatestDocuments({ user }: { user: SessionUser }) {
  const latest = await latestPortalDocuments(user, 6);
  return (
    <>
      {latest.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {latest.map((d) => (
            <DocumentCard key={d.id} doc={d} href={`/portal/documents/${d.id}`} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-surface">
          <EmptyState icon={<FileText />} title="No documents yet">
            Technical information will appear here once NSK publishes it.
          </EmptyState>
        </div>
      )}
    </>
  );
}

async function RecentUpdates({ user }: { user: SessionUser }) {
  const [updates, since] = await Promise.all([portalUpdates(user, 1, 6), unreadSince(user)]);
  return (
    <>
      {updates.rows.length ? (
        <ol className="overflow-hidden rounded-lg border border-border bg-surface" data-testid="recent-updates">
          {updates.rows.map((e) => (
            <li key={e.id} className="border-b border-border last:border-0">
              <UpdateRow e={e} unread={e.createdAt > since} />
            </li>
          ))}
        </ol>
      ) : (
        <div className="rounded-lg border border-border bg-surface">
          <EmptyState icon={<Bell />} title="No updates yet">
            New documents and revisions are listed here as soon as they are published.
          </EmptyState>
        </div>
      )}
    </>
  );
}

export default async function PortalDashboard() {
  const user = await requirePermission("portal.view");
  const [tree, counts, stats] = await Promise.all([getCategoryTree(), portalCategoryCounts(user), portalStats(user)]);

  return (
    <div className="space-y-10">
      <section aria-labelledby="welcome" className="rounded-xl border border-border bg-surface p-5 shadow-xs sm:p-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-center">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-red">Welcome, {user.fullName}</p>
            <h1 id="welcome" className="mt-1.5 text-2xl font-semibold tracking-tight text-balance sm:text-[26px]">
              Find the technical information you need.
            </h1>
            <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-muted">
              Access the latest approved NSK technical documents, product specifications and updates in one place.
            </p>
            <form action="/portal/documents" className="mt-4 flex gap-2" role="search" aria-label="Search technical information">
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">Search by document number, title, product model, order code or keyword</span>
                <Search
                  className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-subtle"
                  aria-hidden
                />
                <input
                  name="q"
                  type="search"
                  enterKeyHint="search"
                  placeholder="Document no., title, model, order code or keyword"
                  className="h-12 w-full rounded-md border border-border-strong bg-surface pl-11 pr-3 text-[15px] placeholder:text-subtle hover:border-navy-100 focus:border-ring focus:outline-none focus:ring-3 focus:ring-ring/15"
                />
              </label>
              <button className="inline-flex h-12 items-center gap-2 rounded-md bg-navy px-4 text-sm font-medium text-white hover:bg-navy-hover cursor-pointer sm:px-6">
                <Search className="size-4 sm:hidden" aria-hidden />
                <span className="sr-only sm:not-sr-only">Search</span>
              </button>
            </form>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <Stat href="/portal/documents" value={stats.total} label="Published" hint="documents available to you" tone="navy" />
            <Stat
              href="/portal/documents?label=NEW"
              value={stats.newCount}
              label="New"
              badge={<DocLabelBadge label="NEW" />}
              hint={`first published in the last ${stats.newLabelDays} days`}
              tone="green"
            />
            <Stat
              href="/portal/documents?label=UPDATED"
              value={stats.updatedCount}
              label="Updated"
              badge={<DocLabelBadge label="UPDATED" />}
              hint={`new revisions in the last ${stats.updatedLabelDays} days`}
              tone="blue"
            />
          </div>
        </div>
      </section>

      <section aria-labelledby="categories">
        <SectionHeader id="categories" title="Product categories" href="/portal/categories" linkLabel="All categories" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {tree.map((c) => (
            <CategoryCard key={c.id} category={c} counts={counts} />
          ))}
        </div>
      </section>

      <section aria-labelledby="latest">
        <SectionHeader id="latest" title="Latest technical information" href="/portal/documents" linkLabel="View all documents" />
        <Suspense
          fallback={
            <LoadingRegion label="Loading latest documents…">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 3 }, (_, i) => (
                  <DocumentCardSkeleton key={i} />
                ))}
              </div>
            </LoadingRegion>
          }
        >
          <LatestDocuments user={user} />
        </Suspense>
      </section>

      <section aria-labelledby="recent">
        <SectionHeader id="recent" title="Recent updates" href="/portal/updates" linkLabel="View all updates" />
        <Suspense
          fallback={
            <LoadingRegion label="Loading recent updates…">
              <div className="h-64 rounded-lg border border-border bg-surface motion-safe:animate-pulse" aria-hidden />
            </LoadingRegion>
          }
        >
          <RecentUpdates user={user} />
        </Suspense>
      </section>
    </div>
  );
}
