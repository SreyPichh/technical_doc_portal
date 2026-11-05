import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { portalUpdates } from "@/server/services/documents";
import { Badge } from "@/components/ui/badge";
import { cn, fmtDate } from "@/lib/utils";

export type UpdateEvent = Awaited<ReturnType<typeof portalUpdates>>["rows"][number];

export const UPDATE_TYPES: Record<UpdateEvent["type"], { label: string; tone: "solidGreen" | "solidBlue" | "red" | "navy" | "neutral"; verb: string }> = {
  new: { label: "NEW", tone: "solidGreen", verb: "Published" },
  updated: { label: "UPDATED", tone: "solidBlue", verb: "Updated" },
  restored: { label: "REINSTATED", tone: "navy", verb: "Reinstated" },
  withdrawn: { label: "WITHDRAWN", tone: "red", verb: "Withdrawn" },
  archived: { label: "ARCHIVED", tone: "neutral", verb: "Archived" },
};

/**
 * One publication event. The whole row opens the document (except withdrawals,
 * which have no file to open any more).
 */
export function UpdateRow({ e, unread, showDate = true }: { e: UpdateEvent; unread?: boolean; showDate?: boolean }) {
  const t = UPDATE_TYPES[e.type];
  const openable = e.type !== "withdrawn" && e.type !== "archived";
  return (
    <div className={cn("relative flex items-start gap-3 px-4 py-3.5 sm:gap-4 sm:px-5", openable && "hover:bg-navy-50/50", unread && "bg-blue-50/50")}>
      <Badge tone={t.tone} className="mt-0.5 shrink-0 justify-center sm:w-[6.5rem]">
        {t.label}
      </Badge>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[13px] text-navy">
          {e.documentNumber}
          {unread && (
            <span className="ml-2 inline-flex items-center gap-1 align-middle font-sans text-[11px] font-semibold uppercase tracking-wide text-blue">
              <span className="size-1.5 rounded-full bg-blue" aria-hidden />
              Unread
            </span>
          )}
        </p>
        {openable ? (
          <Link
            href={`/portal/documents/${e.documentId}`}
            className="mt-0.5 block font-medium leading-snug after:absolute after:inset-0 after:content-[''] hover:text-navy hover:underline"
          >
            {e.docTitle}
          </Link>
        ) : (
          <p className="mt-0.5 font-medium leading-snug">{e.docTitle}</p>
        )}
        <p className="mt-0.5 text-[13px] text-muted">
          {e.categoryName}
          {e.revisionNumber ? (
            <>
              {" "}
              · Revision <span className="font-medium text-foreground tabular">{e.revisionNumber}</span>
            </>
          ) : null}
          {showDate && (
            <>
              {" "}
              · {t.verb} <span className="tabular">{fmtDate(e.createdAt)}</span>
            </>
          )}
          {e.type === "withdrawn" && e.statusReason ? ` · Reason: ${e.statusReason}` : ""}
        </p>
        {e.type === "withdrawn" && (
          <p className="mt-1 text-[13px] text-red">This document has been withdrawn. Do not use previously downloaded copies.</p>
        )}
      </div>
      {openable && <ChevronRight className="mt-1 size-4 shrink-0 text-subtle" aria-hidden />}
    </div>
  );
}
