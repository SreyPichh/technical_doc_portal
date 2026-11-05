import type { Metadata } from "next";
import Link from "next/link";
import { Bell } from "lucide-react";
import { requirePermission } from "@/server/auth/dal";
import { portalUpdates } from "@/server/services/documents";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader, Pagination } from "@/components/ui/misc";
import { fmtDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Latest updates" };

const TYPE: Record<string, { label: string; tone: "solidGreen" | "solidBlue" | "red" | "navy" | "neutral" }> = {
  new: { label: "NEW", tone: "solidGreen" },
  updated: { label: "UPDATED", tone: "solidBlue" },
  restored: { label: "REINSTATED", tone: "navy" },
  withdrawn: { label: "WITHDRAWN", tone: "red" },
  archived: { label: "ARCHIVED", tone: "neutral" },
};

export default async function UpdatesPage({ searchParams }: PageProps<"/portal/updates">) {
  const user = await requirePermission("portal.view");
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const { rows, total, pageSize } = await portalUpdates(user, page);
  return (
    <div>
      <PageHeader title="Latest updates" description="Every publication event, newest first: new documents, new revisions and withdrawals." />
      {rows.length ? (
        <ol className="relative space-y-0 rounded-lg border border-border bg-surface">
          {rows.map((e, i) => {
            const day = fmtDate(e.createdAt);
            const header = i === 0 || day !== fmtDate(rows[i - 1].createdAt);
            const t = TYPE[e.type];
            return (
              <li key={e.id} className="border-b border-border last:border-0">
                {header && <p className="bg-grey-50 px-5 py-1.5 text-[12px] font-semibold tabular text-muted">{day}</p>}
                <div className="flex flex-wrap items-start gap-x-4 gap-y-1 px-5 py-3.5">
                  <Badge tone={t.tone} className="mt-0.5 w-24 justify-center">
                    {t.label}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-mono text-[12px] text-navy">{e.documentNumber}</span>{" "}
                      {e.type === "withdrawn" ? (
                        <span className="font-medium">{e.docTitle}</span>
                      ) : (
                        <Link href={`/portal/documents/${e.documentId}`} className="font-medium hover:underline">
                          {e.docTitle}
                        </Link>
                      )}
                    </p>
                    <p className="mt-0.5 text-[13px] text-muted">
                      {e.message} · {e.categoryName}
                      {e.type === "withdrawn" && e.statusReason ? ` · Reason: ${e.statusReason}` : ""}
                    </p>
                    {e.type === "withdrawn" && (
                      <p className="mt-1 text-[12px] text-red">This document has been withdrawn and is no longer available. Do not use previously downloaded copies.</p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="rounded-lg border border-border bg-surface">
          <EmptyState icon={<Bell />} title="No updates yet" />
        </div>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} hrefFor={(p) => `/portal/updates?page=${p}`} />
    </div>
  );
}
