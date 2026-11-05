import Link from "next/link";
import { Download, Eye, FileText } from "lucide-react";
import type { DocumentListItem } from "@/server/services/documents";
import { DocLabelBadge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/utils";
import { formatBytes } from "@/lib/text";

/** "PDF · 5 pages · 550 KB" — or "Web document" for portal-authored documents without a PDF. */
export function formatSummary(doc: Pick<DocumentListItem, "hasFile" | "pageCount" | "fileSize" | "kind">) {
  if (!doc.hasFile) return doc.kind === "authored" ? "Web document" : "No file";
  return ["PDF", doc.pageCount ? `${doc.pageCount} page${doc.pageCount === 1 ? "" : "s"}` : null, doc.fileSize ? formatBytes(doc.fileSize) : null]
    .filter(Boolean)
    .join(" · ");
}

export function categoryPath(doc: Pick<DocumentListItem, "categoryName" | "subcategoryName">) {
  return doc.subcategoryName ? `${doc.categoryName} › ${doc.subcategoryName}` : doc.categoryName;
}

/** Download link for the current revision, or nothing when the document has no file. */
export function DownloadAction({ doc, className, children }: { doc: DocumentListItem; className: string; children: React.ReactNode }) {
  if (!doc.revisionId || !doc.hasFile) return null;
  return (
    <a
      href={`/api/files/revisions/${doc.revisionId}?download=1`}
      className={className}
      data-testid="card-download"
      aria-label={`Download PDF of ${doc.documentNumber}`}
    >
      {children}
    </a>
  );
}

const actionBase =
  "inline-flex h-11 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors sm:h-9 [&_svg]:size-4 [&_svg]:shrink-0";
export const previewClass = `${actionBase} bg-navy text-white hover:bg-navy-hover`;
export const downloadClass = `${actionBase} border border-border-strong bg-surface text-foreground hover:border-navy-100 hover:bg-navy-50`;

export function DocumentCard({ doc, href }: { doc: DocumentListItem; href: string }) {
  return (
    <article
      className="group flex h-full flex-col rounded-lg border border-border bg-surface shadow-xs transition-[border-color,box-shadow] hover:border-navy-100 hover:shadow-sm"
      data-testid="document-card"
    >
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[13px] font-medium text-navy">{doc.documentNumber}</span>
          <DocLabelBadge label={doc.label} />
        </div>
        <h3 className="mt-1.5 line-clamp-2 min-h-[2.75em] text-[15px] font-semibold leading-snug">
          <Link href={href} className="hover:text-navy hover:underline">
            {doc.title}
          </Link>
        </h3>
        <p className="mt-1 truncate text-[13px] text-muted" title={categoryPath(doc)}>
          {categoryPath(doc)}
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border pt-3 text-[13px]">
          <div className="min-w-0">
            <dt className="text-[12px] text-subtle">Revision</dt>
            <dd className="font-semibold tabular">{doc.revisionNumber ?? "—"}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[12px] text-subtle">Published</dt>
            <dd className="tabular">{fmtDate(doc.lastPublishedAt)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[12px] text-subtle">Type</dt>
            <dd className="truncate" title={doc.documentType}>
              {doc.documentType}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[12px] text-subtle">Language</dt>
            <dd className="truncate">{doc.language}</dd>
          </div>
        </dl>
        <p className="mt-3 flex items-center gap-1.5 text-[13px] text-muted">
          <FileText className="size-4 shrink-0 text-subtle" aria-hidden />
          <span className="truncate">{formatSummary(doc)}</span>
        </p>
      </div>
      <div className="flex gap-2 border-t border-border p-3">
        <Link href={href} className={`${previewClass} flex-1`}>
          <Eye aria-hidden /> Preview
        </Link>
        <DownloadAction doc={doc} className={`${downloadClass} flex-1`}>
          <Download aria-hidden /> Download PDF
        </DownloadAction>
      </div>
    </article>
  );
}
