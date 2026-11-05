import Link from "next/link";
import { Download, Eye } from "lucide-react";
import type { DocumentListItem } from "@/server/services/documents";
import { DocLabelBadge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/utils";
import { categoryPath, DocumentCard, DownloadAction, downloadClass, formatSummary, previewClass } from "./document-card";

function Snippet({ text, q }: { text?: string | null; q?: string }) {
  if (!text || !q) return null;
  const term = q.split(/\s+/)[0];
  const i = text.toLowerCase().indexOf(term.toLowerCase());
  const clean = (s: string) => s.replace(/\s+/g, " ");
  return (
    <div className="mt-2 rounded bg-grey-50 px-2.5 py-1.5 text-[13px] text-muted">
      <p className="line-clamp-2">
      <span className="sr-only">Matching text: </span>…{i >= 0 ? clean(text.slice(0, i)) : clean(text)}
      {i >= 0 && <mark className="rounded-sm bg-[#fff1b8] text-foreground">{text.slice(i, i + term.length)}</mark>}
      {i >= 0 && clean(text.slice(i + term.length))}…
      </p>
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-subtle">{label}</dt>
      <dd className="tabular text-foreground">{children}</dd>
    </div>
  );
}

/** One search result: a full-width card row (stacks on small screens). */
function DocumentRow({ d, href, q }: { d: DocumentListItem; href: string; q?: string }) {
  return (
    <article
      className="grid gap-4 rounded-lg border border-border bg-surface p-4 shadow-xs transition-[border-color,box-shadow] hover:border-navy-100 hover:shadow-sm sm:p-5 md:grid-cols-[minmax(0,1fr)_10rem] md:items-start"
      data-testid="document-row"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-mono text-[13px] font-medium text-navy">{d.documentNumber}</span>
          <DocLabelBadge label={d.label} />
        </div>
        <h3 className="mt-1 text-base font-semibold leading-snug">
          <Link href={href} className="hover:text-navy hover:underline">
            {d.title}
          </Link>
        </h3>
        <p className="mt-0.5 text-[13px] text-muted">
          {categoryPath(d)} · {d.documentType}
        </p>
        {d.productModels.length > 0 && (
          <p className="mt-1 line-clamp-1 text-[13px] text-muted">
            <span className="text-subtle">Models: </span>
            {d.productModels.join(", ")}
          </p>
        )}
        <Snippet text={d.snippet} q={q} />
        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
          <Meta label="Revision">
            <span className="font-semibold">{d.revisionNumber ?? "—"}</span>
          </Meta>
          <Meta label="Published">{fmtDate(d.lastPublishedAt)}</Meta>
          <Meta label="File">{formatSummary(d)}</Meta>
          <Meta label="Language">{d.language}</Meta>
        </dl>
      </div>
      <div className="flex gap-2 md:flex-col">
        <Link href={href} className={`${previewClass} flex-1 md:flex-none`} aria-label={`Preview ${d.documentNumber}`}>
          <Eye aria-hidden /> Preview
        </Link>
        <DownloadAction doc={d} className={`${downloadClass} flex-1 md:flex-none`}>
          <Download aria-hidden /> Download PDF
        </DownloadAction>
      </div>
    </article>
  );
}

/** Search results as full-width rows (default) or a grid of cards. */
export function DocumentResults({
  items,
  hrefFor,
  view = "table",
  q,
}: {
  items: DocumentListItem[];
  hrefFor: (d: DocumentListItem) => string;
  /** "table" is the row list (kept as the URL value for compatibility). */
  view?: "table" | "cards";
  q?: string;
}) {
  if (view === "cards")
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((d) => (
          <DocumentCard key={d.id} doc={d} href={hrefFor(d)} />
        ))}
      </div>
    );
  return (
    <div className="grid gap-3">
      {items.map((d) => (
        <DocumentRow key={d.id} d={d} href={hrefFor(d)} q={q} />
      ))}
    </div>
  );
}
