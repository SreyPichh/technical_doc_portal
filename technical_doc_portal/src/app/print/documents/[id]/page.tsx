import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { requirePermission } from "@/server/auth/dal";
import { db, schema } from "@/server/db";
import { can } from "@/lib/permissions";
import { portalVisibilityCondition } from "@/server/services/access";
import { renderAuthoredHtml } from "@/server/services/authored-render";
import { fmtDate } from "@/lib/utils";
import { PrintTrigger } from "./print-trigger";
import { NskLogo } from "@/components/shell/nsk-logo";

/** Print-optimised view of an authored document (Print → Save as PDF). */
export default async function PrintPage({ params, searchParams }: PageProps<"/print/documents/[id]">) {
  const user = await requirePermission("portal.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sp = await searchParams;
  const staff = can(user.role, "documents.view_all");
  const d = schema.documents;
  const [doc] = await db
    .select()
    .from(d)
    .where(staff ? eq(d.id, id) : and(eq(d.id, id), portalVisibilityCondition(user)));
  if (!doc || doc.kind !== "authored") notFound();
  const revId = staff && typeof sp.rev === "string" ? sp.rev : doc.currentRevisionId;
  if (!revId) notFound();
  const [rev] = await db
    .select()
    .from(schema.documentRevisions)
    .where(and(eq(schema.documentRevisions.id, revId), eq(schema.documentRevisions.documentId, doc.id)));
  if (!rev) notFound();
  const html = renderAuthoredHtml(rev.authoredContent) ?? "";
  return (
    <div className="min-h-dvh bg-white">
      <PrintTrigger />
      <div className="mx-auto max-w-[190mm] px-4 py-6 print:p-0">
        <div className="flex items-center justify-between bg-navy px-4 py-2.5 text-white [print-color-adjust:exact]">
          <NskLogo className="h-7 text-white" />
          <span className="tracking-wide">Technical Information</span>
        </div>
        <p className="mt-3 text-right text-[12px] text-muted">
          Document No. {doc.documentNumber} · Revision {rev.revisionNumber}
          {rev.releaseDate ? ` · ${fmtDate(rev.releaseDate)}` : ""}
        </p>
        <h1 className="mt-4 text-center text-2xl font-semibold underline">{doc.title}</h1>
        <article className="doc-prose mt-6" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}
