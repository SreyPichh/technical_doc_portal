import { eq } from "drizzle-orm";
import { assertPermission } from "@/server/auth/dal";
import { db, schema } from "@/server/db";
import { contentDisposition, handleRouteError, jsonError, PRIVATE_FILE_HEADERS } from "@/server/http";
import { storage } from "@/server/storage";

export const runtime = "nodejs";

/** Preview of a staged (not yet saved) upload — only for its uploader. */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/uploads/[id]/file">) {
  try {
    const user = await assertPermission("documents.upload");
    const { id } = await ctx.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError(404, "Not found.");
    const [u] = await db.select().from(schema.uploads).where(eq(schema.uploads.id, id));
    if (!u || u.uploadedBy !== user.id) return jsonError(404, "Not found.");
    const { body, size } = await storage.stream(u.fileKey);
    return new Response(body, {
      headers: {
        ...PRIVATE_FILE_HEADERS,
        "Content-Type": "application/pdf",
        "Content-Length": String(size),
        "Content-Disposition": contentDisposition("inline", u.originalFilename),
      },
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
