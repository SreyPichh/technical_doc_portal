import Link from "next/link";
import { Download, Eye } from "lucide-react";
import type { DocumentListItem } from "@/server/services/documents";
import { DocLabelBadge } from "@/components/ui/badge";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { fmtDate } from "@/lib/utils";
import { DocumentCard } from "./document-card";

function Snippet({ text, q }: { text?: string | null; q?: string }) {
  if (!text || !q) return null;
  const term = q.split(/\s+/)[0];
  const i = text.toLowerCase().indexOf(term.toLowerCase());
  const clean = (s: string) => s.replace(/\s+/g, " ");
  return (
    <p className="mt-1 line-clamp-2 text-[12px] text-muted">
      …{i >= 0 ? clean(text.slice(0, i)) : clean(text)}
      {i >= 0 && <mark className="rounded bg-[#fff1b8] px-0.5 text-foreground">{text.slice(i, i + term.length)}</mark>}
      {i >= 0 && clean(text.slice(i + term.length))}…
    </p>
  );
}

/** Responsive list: table on desktop, cards on small screens (or when cards view chosen). */
export function DocumentResults({
  items,
  hrefFor,
  view = "table",
  q,
}: {
  items: DocumentListItem[];
  hrefFor: (d: DocumentListItem) => string;
  view?: "table" | "cards";
  q?: string;
}) {
  const cards = (
    <div className={`grid gap-4 sm:grid-cols-2 xl:grid-cols-3 ${view === "table" ? "md:hidden" : ""}`}>
      {items.map((d) => (
        <DocumentCard key={d.id} doc={d} href={hrefFor(d)} />
      ))}
    </div>
  );
  if (view === "cards") return cards;
  return (
    <>
      {cards}
      <div className="hidden overflow-hidden rounded-lg border border-border bg-surface md:block">
        <Table>
          <THead>
            <tr>
              <TH>Document</TH>
              <TH>Category</TH>
              <TH>Revision</TH>
              <TH>Published</TH>
              <TH>Status</TH>
              <TH className="text-right">Actions</TH>
            </tr>
          </THead>
          <tbody>
            {items.map((d) => (
              <TR key={d.id} data-testid="document-row">
                <TD className="max-w-[28rem]">
                  <span className="font-mono text-[12px] text-navy">{d.documentNumber}</span>
                  <Link href={hrefFor(d)} className="block font-medium leading-snug hover:text-navy hover:underline">
                    {d.title}
                  </Link>
                  {d.productModels.length > 0 && (
                    <p className="mt-0.5 truncate text-[12px] text-subtle">{d.productModels.join(" · ")}</p>
                  )}
                  <Snippet text={d.snippet} q={q} />
                </TD>
                <TD className="text-[13px] text-muted">
                  {d.categoryName}
                  {d.subcategoryName && <span className="block text-[12px] text-subtle">{d.subcategoryName}</span>}
                </TD>
                <TD className="tabular font-medium">{d.revisionNumber ?? "—"}</TD>
                <TD className="tabular text-[13px] whitespace-nowrap">{fmtDate(d.lastPublishedAt)}</TD>
                <TD>
                  <DocLabelBadge label={d.label} />
                </TD>
                <TD>
                  <div className="flex justify-end gap-1">
                    <Link href={hrefFor(d)} className="inline-flex size-8 items-center justify-center rounded-md hover:bg-navy-50 text-navy" title="Preview" aria-label={`Preview ${d.documentNumber}`}>
                      <Eye className="size-4" />
                    </Link>
                    {d.revisionId && d.hasFile && (
                      <a
                        href={`/api/files/revisions/${d.revisionId}?download=1`}
                        className="inline-flex size-8 items-center justify-center rounded-md hover:bg-navy-50 text-navy"
                        title="Download PDF"
                        aria-label={`Download ${d.documentNumber}`}
                      >
                        <Download className="size-4" />
                      </a>
                    )}
                  </div>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </div>
    </>
  );
}
