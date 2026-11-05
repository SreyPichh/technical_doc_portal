import Link from "next/link";
import { Download, Eye, FileText } from "lucide-react";
import type { DocumentListItem } from "@/server/services/documents";
import { DocLabelBadge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/utils";

export function DocumentCard({ doc, href }: { doc: DocumentListItem; href: string }) {
  const downloadable = doc.revisionId && doc.hasFile;
  return (
    <article className="group flex h-full flex-col rounded-lg border border-border bg-surface p-4 shadow-xs transition-colors hover:border-navy-100" data-testid="document-card">
      <div className="flex items-start justify-between gap-3">
        <span className="font-mono text-[12px] font-medium text-navy">{doc.documentNumber}</span>
        <DocLabelBadge label={doc.label} />
      </div>
      <h3 className="mt-2 line-clamp-2 text-[15px] font-semibold leading-snug">
        <Link href={href} className="hover:text-navy hover:underline">
          {doc.title}
        </Link>
      </h3>
      <p className="mt-1 text-[13px] text-muted">
        {doc.categoryName}
        {doc.subcategoryName ? ` › ${doc.subcategoryName}` : ""}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
        <dt className="text-subtle">Revision</dt>
        <dd className="font-medium tabular">{doc.revisionNumber ?? "—"}</dd>
        <dt className="text-subtle">Published</dt>
        <dd className="tabular">{fmtDate(doc.lastPublishedAt)}</dd>
      </dl>
      <div className="mt-auto flex gap-2 pt-4">
        <Link
          href={href}
          className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md bg-navy-50 text-[13px] font-medium text-navy hover:bg-navy-100"
        >
          {doc.kind === "authored" ? <FileText className="size-4" /> : <Eye className="size-4" />} Preview
        </Link>
        {downloadable && (
          <a
            href={`/api/files/revisions/${doc.revisionId}?download=1`}
            className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-border-strong text-[13px] font-medium hover:bg-grey-50"
            data-testid="card-download"
          >
            <Download className="size-4" /> Download
          </a>
        )}
      </div>
    </article>
  );
}
