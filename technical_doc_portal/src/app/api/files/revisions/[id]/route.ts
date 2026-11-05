import { getCurrentUser } from "@/server/auth/dal";
import { db, schema } from "@/server/db";
import { contentDisposition, handleRouteError, jsonError, PRIVATE_FILE_HEADERS } from "@/server/http";
import { getAccessibleRevision } from "@/server/services/access";
import { storage } from "@/server/storage";

export const runtime = "nodejs";

/**
 * The ONLY way to obtain a document file. Every request is authenticated and
 * authorised against the database: dealers can fetch only the current
 * published revision of a document visible to them; staff can fetch any
 * revision. Storage keys are never exposed, so URLs cannot be guessed.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/files/revisions/[id]">) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError(401, "Please sign in.");
    if (user.mustChangePassword) return jsonError(403, "Please change your password first.");
    const { id } = await ctx.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError(404, "Not found.");
    const row = await getAccessibleRevision(user, id);
    const fileKey = row?.revision.fileKey;
    if (!row || !fileKey) return jsonError(404, "Document not found or not available to your account.");

    const download = new URL(req.url).searchParams.get("download") === "1";
    const { document: doc, revision: rev } = row;
    const filename = rev.originalFilename?.toLowerCase().endsWith(".pdf")
      ? rev.originalFilename
      : `${doc.documentNumber}-${rev.revisionNumber}.pdf`;

    if (download) {
      await db.insert(schema.downloads).values({ userId: user.id, documentId: doc.id, revisionId: rev.id });
    }
    const { body, size } = await storage.stream(fileKey);
    return new Response(body, {
      headers: {
        ...PRIVATE_FILE_HEADERS,
        "Content-Type": "application/pdf",
        "Content-Length": String(size),
        "Content-Disposition": contentDisposition(download ? "attachment" : "inline", filename),
        ...(rev.sha256 ? { ETag: `"${rev.sha256}"`, "X-Content-SHA256": rev.sha256 } : {}),
      },
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
