import { eq } from "drizzle-orm";
import { assertPermission } from "@/server/auth/dal";
import { db, schema } from "@/server/db";
import { contentDisposition, handleRouteError, jsonError, PRIVATE_FILE_HEADERS } from "@/server/http";
import { pdfExportAvailable, renderAuthoredPdf } from "@/server/services/authored";

export const runtime = "nodejs";

/** Export an authored revision (draft or published) to PDF for administrators. */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/authored/[revisionId]/pdf">) {
  try {
    await assertPermission("documents.author");
    const { revisionId } = await ctx.params;
    if (!/^[0-9a-f-]{36}$/i.test(revisionId)) return jsonError(404, "Not found.");
    if (!pdfExportAvailable()) return jsonError(501, "Server-side PDF export is not configured. Use Print → Save as PDF instead.");
    const [row] = await db
      .select({ n: schema.documents.documentNumber, rev: schema.documentRevisions.revisionNumber })
      .from(schema.documentRevisions)
      .innerJoin(schema.documents, eq(schema.documents.id, schema.documentRevisions.documentId))
      .where(eq(schema.documentRevisions.id, revisionId));
    if (!row) return jsonError(404, "Not found.");
    const pdf = await renderAuthoredPdf(revisionId);
    return new Response(new Uint8Array(pdf), {
      headers: {
        ...PRIVATE_FILE_HEADERS,
        "Content-Type": "application/pdf",
        "Content-Disposition": contentDisposition("attachment", `${row.n}-${row.rev}.pdf`),
      },
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
