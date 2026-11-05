import type { Metadata } from "next";
import Link from "next/link";
import { Bell } from "lucide-react";
import { requirePermission } from "@/server/auth/dal";
import { portalUpdates, type UpdateType } from "@/server/services/documents";
import { unreadSince } from "@/server/services/portal-notifications";
import { UpdateRow } from "@/components/documents/update-list";
import { EmptyState, PageHeader, Pagination } from "@/components/ui/misc";
import { cn, fmtDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Latest updates" };

const TABS: { type?: UpdateType; label: string }[] = [
  { label: "All updates" },
  { type: "new", label: "New documents" },
  { type: "updated", label: "Updated revisions" },
  { type: "withdrawn", label: "Withdrawn" },
];

export default async function UpdatesPage({ searchParams }: PageProps<"/portal/updates">) {
  const user = await requirePermission("portal.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const type = TABS.find((t) => t.type && t.type === sp.type)?.type;
  const [{ rows, total, pageSize }, since] = await Promise.all([portalUpdates(user, page, 25, type), unreadSince(user)]);
  const unread = rows.filter((e) => e.createdAt > since).length;
  const href = (t?: UpdateType, p?: number) => {
    const q = new URLSearchParams();
    if (t) q.set("type", t);
    if (p && p > 1) q.set("page", String(p));
    return `/portal/updates${q.size ? `?${q}` : ""}`;
  };

  return (
    <div>
      <PageHeader
        title="Latest updates"
        description="What's new in the portal, newest first: new documents, new revisions and withdrawals."
      />
      <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-border" aria-label="Update type">
        {TABS.map((t) => {
          const on = t.type === type;
          return (
            <Link
              key={t.label}
              href={href(t.type)}
              aria-current={on ? "page" : undefined}
              className={cn(
                "-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors",
                on ? "border-navy font-semibold text-navy" : "border-transparent text-muted hover:border-navy-100 hover:text-navy",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      {unread > 0 && (
        <p className="mb-3 text-sm text-muted">
          <span className="font-semibold text-blue">{unread} unread</span> since you last opened your notifications.
        </p>
      )}
      {rows.length ? (
        <ol className="overflow-hidden rounded-lg border border-border bg-surface">
          {rows.map((e, i) => {
            const day = fmtDate(e.createdAt);
            const header = i === 0 || day !== fmtDate(rows[i - 1].createdAt);
            return (
              <li key={e.id} className="border-b border-border last:border-0">
                {header && (
                  <p className="border-b border-border bg-grey-50 px-5 py-1.5 text-[13px] font-semibold tabular text-muted">
                    <time dateTime={e.createdAt.toISOString()}>{day}</time>
                  </p>
                )}
                <UpdateRow e={e} unread={e.createdAt > since} showDate={false} />
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="rounded-lg border border-border bg-surface">
          <EmptyState icon={<Bell />} title={type ? "Nothing here yet" : "No updates yet"}>
            New documents and revisions appear here as soon as NSK publishes them.
          </EmptyState>
        </div>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} hrefFor={(p) => href(type, p)} />
    </div>
  );
}
